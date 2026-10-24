import { useMemo, useState } from 'react';
import api from './api';
import { useAuth } from '../../Context/AuthContext';
import { getMonthShare } from './drishtiData';

const TERMINAL_STATUSES = ['Disconnected'];

// A live connection in one of these statuses has a change (upgrade, downgrade,
// shifting, IP addition, rate revision) waiting to be activated.
const PENDING_CHANGE_STATUSES = ['Pending', 'Approved', 'Generation'];

const TERMINATING_HISTORY_ACTIONS = [
  'TERMINATED',
];

const PRICE_CONFIRMING_ACTIONS = [
  'ACTIVATED',
  'RATE_REVISION_APPROVED',
  'UPGRADE',
  'DOWNGRADE',
  'EXTENDED',
  'RETAINED',
];

const isConnectionTrulyLive = (conn) => {
  if (TERMINAL_STATUSES.includes(conn.status)) return false;
  if (conn.status === 'Active' || conn.status === 'Notice Period') return true;

  const history = conn.history || [];
  let lastActivatedIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'ACTIVATED') {
      lastActivatedIdx = i;
      break;
    }
  }
  if (lastActivatedIdx === -1) return false;

  const terminatedSinceActivation = history
    .slice(lastActivatedIdx + 1)
    .some((h) => TERMINATING_HISTORY_ACTIONS.includes(h.action));

  return !terminatedSinceActivation;
};

// While a change is pending, the upgrade/downgrade *request* entry already carries the
// new values, so it must not count. Prices come from the last activated state until the
// change is activated (activation pushes a fresh ACTIVATED entry with the new values).
const PENDING_SAFE_CONFIRMING_ACTIONS = PRICE_CONFIRMING_ACTIONS.filter(
  (a) => a !== 'UPGRADE' && a !== 'DOWNGRADE'
);

const getTrueCommercials = (conn) => {
  const history = conn.history || [];
  const hasPendingChange = PENDING_CHANGE_STATUSES.includes(conn.status);
  const confirmingActions = hasPendingChange ? PENDING_SAFE_CONFIRMING_ACTIONS : PRICE_CONFIRMING_ACTIONS;

  let lastConfirmed = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (confirmingActions.includes(h.action) && h.commercials) {
      lastConfirmed = h;
      break;
    }
  }

  // Airtel cost: requesting a change resets the live value to 0 until it is re-entered,
  // so during a pending change use the cost saved with the last activated state.
  // (history.providerCost is only sent to admins.)
  const providerCostMrc = hasPendingChange
    ? Number(lastConfirmed?.providerCost?.mrc || 0)
    : Number(conn.providerCost?.mrc || 0);

  if (lastConfirmed) {
    return {
      mrc: Number(lastConfirmed.commercials?.mrc || 0),
      ipsCost: Number(lastConfirmed.ips?.cost || 0),
      bandwidth: Number(lastConfirmed.bandwidth || 0),
      providerCostMrc,
    };
  }

  return {
    mrc: Number(conn.commercials?.mrc || 0),
    ipsCost: Number(conn.ips?.cost || 0),
    bandwidth: Number(conn.bandwidth || 0),
    providerCostMrc,
  };
};

// Revenue a live connection earns in the current calendar month
// (full MRC + IPs, reduced for connections terminating this month).
const getMonthRevenue = (conn, now) => {
  const { mrc, ipsCost } = getTrueCommercials(conn);
  return (mrc + ipsCost) * getMonthShare(conn, now);
};

const isCountableCustomer = (c) => c.isActive !== false;

const isCountableConnection = (conn, customersById) => {
  if (conn.status === 'Deleted') return false;
  if (customersById) {
    const customerId = conn.customer?._id || conn.customer;
    const customer = customerId ? customersById.get(String(customerId)) : null;
    if (customerId && (!customer || customer.isActive === false)) return false;
  }
  return true;
};

export const useDashboardAnalytics = ({ allData, pmData, isProjectManager, timeRange, collectionsData }) => {
  const [overview, setOverview] = useState(null);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const summary = useMemo(() => {
    if (isProjectManager && !pmData) return null;
    if (!isProjectManager && (!allData || !allData.connections)) return null;

    const allCustomers = isProjectManager ? [] : (allData.customers || []);
    const allConnections = isProjectManager ? pmData : (allData.connections || []);

    const customersById = new Map(allCustomers.map((c) => [String(c._id), c]));

    const customers = allCustomers.filter(isCountableCustomer);
    const activeCustomers = customers.length;
    const inactiveCustomers = 0;

    const typeCounts = {
      enterprise: customers.filter(c => c.customerType === 'Enterprise').length,
      isp: customers.filter(c => c.customerType === 'ISP').length,
      operator: customers.filter(c => c.customerType === 'Operator').length,
      government: customers.filter(c => c.customerType === 'Government').length,
      other: customers.filter(c => !['Enterprise', 'ISP', 'Operator', 'Government'].includes(c.customerType)).length,
    };

    const connections = allConnections.filter((c) => isCountableConnection(c, customersById));

    const activeConns = connections.filter(c => c.status === 'Active').length;
    const pendingConns = connections.filter(c => ['Pending', 'Approved', 'Generation'].includes(c.status)).length;
    const noticeConns = connections.filter(c => c.status === 'Notice Period').length;
    const churnedConns = connections.filter(c => ['Disconnected'].includes(c.status)).length;

    const liveConnections = connections.filter(isConnectionTrulyLive);
    const now = new Date();

    // This month's revenue: connections terminating this month count only the days they run.
    const totalLiveRevenue = liveConnections.reduce((acc, curr) => acc + getMonthRevenue(curr, now), 0);

    // Bandwidth is not reduced: the line stays up until the termination date.
    const totalBandwidth = liveConnections.reduce((acc, curr) => {
      const { bandwidth } = getTrueCommercials(curr);
      return acc + bandwidth;
    }, 0);

    // Per-Mbps rates use full monthly prices. Reducing price and cost for a short month
    // would not change what one Mbps costs, so rates are not prorated.
    // Selling rate: MRC only (IP charges excluded) to match the per-circuit "Rate per MB",
    // and only circuits with a price, so ₹0 circuits (trials, missing data) don't drag it down.
    let sellingMrcTotal = 0;
    let sellingBandwidth = 0;
    // Airtel cost: only circuits with a cost on record, so missing costs don't drag it down.
    let providerCostTotal = 0;
    let providerCostBandwidth = 0;
    let providerCostMrcTotal = 0;
    let providerCostCircuits = 0;
    // Airtel bill for this month, reduced like revenue for connections terminating this month.
    let providerCostThisMonth = 0;

    liveConnections.forEach((conn) => {
      const { bandwidth, mrc, providerCostMrc } = getTrueCommercials(conn);
      if (bandwidth <= 0) return;

      if (mrc > 0) {
        sellingMrcTotal += mrc;
        sellingBandwidth += bandwidth;
      }

      if (providerCostMrc > 0) {
        providerCostTotal += providerCostMrc;
        providerCostBandwidth += bandwidth;
        providerCostMrcTotal += mrc;
        providerCostCircuits += 1;
        providerCostThisMonth += providerCostMrc * getMonthShare(conn, now);
      }
    });

    const sellingRatePerMb = sellingBandwidth > 0 ? sellingMrcTotal / sellingBandwidth : 0;
    const costPerMb = providerCostBandwidth > 0 ? providerCostTotal / providerCostBandwidth : 0;
    // Margin compares like with like: selling rate on the same circuits that have a cost.
    const matchedSellingRate = providerCostBandwidth > 0 ? providerCostMrcTotal / providerCostBandwidth : 0;
    const marginPerMb = providerCostBandwidth > 0 ? matchedSellingRate - costPerMb : 0;

    return {
      customers: { total: activeCustomers, active: activeCustomers, inactive: inactiveCustomers, ...typeCounts },
      connections: { total: connections.length, active: activeConns, pending: pendingConns, notice: noticeConns, churned: churnedConns },
      revenue: {
        totalLiveRevenue,
        totalBandwidth,
        sellingRatePerMb,
        costPerMb,
        marginPerMb,
        providerCostThisMonth,
        costCoverage: { circuits: providerCostCircuits, total: liveConnections.length },
      }
    };
  }, [allData, pmData, isProjectManager]);

  let cancelled = false;

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = {};
      if (user?.role === 'employee') {
        queryParams.isEmployee = true;
        queryParams.employeeName = user.name;
        queryParams.employeeEmail = user.email;
      }

      const { data } = await api.get('/reports', { params: queryParams });

      if (!cancelled) setOverview(data?.data || null);
    } catch (err) {
      if (!cancelled) setError('Could not load collections data.');
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  const growthAnalytics = useMemo(() => {
    if (!overview || !overview.collectionsGrowth) {
      return { data: [], salesPersons: [] };
    }

    const rawData = overview.collectionsGrowth.data || [];
    const employees = overview.collectionsGrowth.employees || [];

    if (timeRange === 'year') {
      const yearMap = new Map();

      rawData.forEach(row => {
        const parts = row.time.split(' ');
        const yearLabel = parts.length === 2 ? `20${parts[1]}` : row.time;

        if (!yearMap.has(yearLabel)) {
          const initialData = { time: yearLabel, Global: 0 };
          employees.forEach(emp => { initialData[emp] = 0; });
          yearMap.set(yearLabel, initialData);
        }

        const yearGroup = yearMap.get(yearLabel);
        yearGroup.Global += (row.Global || 0);

        employees.forEach(emp => {
          yearGroup[emp] += (row[emp] || 0);
        });
      });

      return {
        data: Array.from(yearMap.values()),
        salesPersons: employees
      };
    }

    return {
      data: rawData,
      salesPersons: employees
    };
  }, [overview, timeRange]);

  const geoAnalytics = useMemo(() => {
    if (isProjectManager || !allData?.connections || !allData?.customers) return [];
    const stateRevenue = {};
    const now = new Date();
    const customersById = new Map(allData.customers.map((c) => [String(c._id), c]));

    allData.connections
      .filter((c) => isCountableConnection(c, customersById))
      .filter(isConnectionTrulyLive)
      .forEach(conn => {
        const customerId = conn.customer?._id || conn.customer;
        const associatedCustomer = customersById.get(String(customerId));
        const rawState = associatedCustomer?.billingProfile?.[0]?.address?.state;

        if (rawState) {
          const state = rawState.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          stateRevenue[state] = (stateRevenue[state] || 0) + getMonthRevenue(conn, now);
        }
      });

    return Object.keys(stateRevenue).map(key => ({ state: key, revenue: stateRevenue[key] })).sort((a, b) => b.revenue - a.revenue);
  }, [allData, isProjectManager]);

  const whaleAnalytics = useMemo(() => {
    if (isProjectManager || !allData?.connections) return [];
    const customerTotals = {};
    const now = new Date();
    const customersById = new Map((allData.customers || []).map((c) => [String(c._id), c]));

    allData.connections
      .filter((c) => isCountableConnection(c, customersById))
      .filter(isConnectionTrulyLive)
      .forEach(conn => {
        const custName = conn.customer?.name || 'Unknown Customer';
        const circuitRevenue = getMonthRevenue(conn, now);

        if (!customerTotals[custName]) customerTotals[custName] = { name: custName, totalRevenue: 0, circuitCount: 0 };
        customerTotals[custName].totalRevenue += circuitRevenue;
        customerTotals[custName].circuitCount += 1;
      });

    return Object.values(customerTotals).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }, [allData, isProjectManager]);

  const atRiskAnalytics = useMemo(() => {
    const allConnections = isProjectManager ? pmData : (allData?.connections || []);
    const customersById = new Map((allData?.customers || []).map((c) => [String(c._id), c]));
    const connections = (allConnections || []).filter((c) => isCountableConnection(c, customersById));
    const noticeConnections = connections.filter(c => c.status === 'Notice Period');
    let totalRiskMRR = 0;

    const mappedConnections = noticeConnections.map(conn => {
      const { mrc, ipsCost, bandwidth } = getTrueCommercials(conn);
      const revenue = mrc + ipsCost;
      totalRiskMRR += revenue;

      return {
        id: conn._id,
        customerName: conn.customer?.name || 'Unknown Customer',
        circuitId: conn.fabCircuitId || 'N/A',
        revenue,
        bandwidth: bandwidth || 'N/A',
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return { connections: mappedConnections, totalRiskMRR };
  }, [allData, pmData, isProjectManager]);

// const churnAnalytics = useMemo(() => {
//   const allConnections = isProjectManager ? pmData : (allData?.connections || []);
//   const customersById = new Map((allData?.customers || []).map((c) => [String(c._id), c]));
//   const connections = (allConnections || []).filter((c) => isCountableConnection(c, customersById));

//   const monthlyData = new Map();
//   const cutoffDate = new Date('2026-04-01T00:00:00Z');

//   connections.forEach((conn) => {
//     const { mrc, ipsCost } = getTrueCommercials(conn);
//     const currentTrueRevenue = mrc + ipsCost; // Used for BOTH activation and churn revenue

//     // Helper to apply values to the monthly map (defined before use)
//     const processEvent = (date, isActivation) => {
//       if (!date || date < cutoffDate) return;

//       const monthKey = date
//         .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
//         .replace(' ', " '");

//       if (!monthlyData.has(monthKey)) {
//         monthlyData.set(monthKey, {
//           month: monthKey,
//           rawDate: new Date(date.getFullYear(), date.getMonth(), 1),
//           Activated: 0,
//           Churned: 0,
//           Revenue: 0,
//           ChurnMRR: 0,
//         });
//       }

//       const monthGroup = monthlyData.get(monthKey);

//       if (isActivation) {
//         monthGroup.Activated += 1;
//         monthGroup.Revenue += currentTrueRevenue;
//       } else {
//         monthGroup.Churned += 1;
//         monthGroup.ChurnMRR += currentTrueRevenue;
//       }
//     };

//     // 1. Collect every activation and termination date from history
//     const activationDates = [];
//     const terminationDates = [];

//     (conn.history || []).forEach((event) => {
//       if (!event.date) return;
//       const eventDate = new Date(event.date);
//       if (isNaN(eventDate.getTime())) return;

//       if (event.action === 'ACTIVATED') {
//         activationDates.push(eventDate);
//       } else if (TERMINATING_HISTORY_ACTIONS.includes(event.action)) {
//         terminationDates.push(eventDate);
//       }
//     });

//     // 2. Process every event
//     activationDates.forEach((d) => processEvent(d, true));
//     terminationDates.forEach((d) => processEvent(d, false));
//   });

//   return Array.from(monthlyData.values())
//     .sort((a, b) => a.rawDate - b.rawDate)
//     .filter((r) => r.Revenue !== 0 || r.ChurnMRR !== 0 || r.Activated !== 0 || r.Churned !== 0);
// }, [allData, pmData, isProjectManager]);

const churnAnalytics = useMemo(() => {
  const allConnections = isProjectManager ? pmData : (allData?.connections || []);
  const customersById = new Map((allData?.customers || []).map((c) => [String(c._id), c]));
  const connections = (allConnections || []).filter((c) => isCountableConnection(c, customersById));

  const monthlyData = new Map();
  const cutoffDate = new Date('2026-04-01T00:00:00Z');

  const getMonthGroup = (date) => {
    const monthKey = date
      .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      .replace(' ', " '");

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {
        month: monthKey,
        rawDate: new Date(date.getFullYear(), date.getMonth(), 1),
        Activated: 0,   // new activations + upgrades
        Upgraded: 0,    // subset of Activated that were upgrades
        Churned: 0,
        Revenue: 0,     // MRR from new activations + MRR added by upgrades
        ChurnMRR: 0,
      });
    }
    return monthlyData.get(monthKey);
  };

  // Revenue stored on a single history entry
  const entryRevenue = (h) =>
    Number(h.commercials?.mrc || 0) + Number(h.ips?.cost || 0);

  connections.forEach((conn) => {
    const { mrc, ipsCost } = getTrueCommercials(conn);
    const currentTrueRevenue = mrc + ipsCost; // used for churn

    let seenFirstActivation = false;
    let prevRevenue = 0; // last confirmed price as we walk the history

    (conn.history || []).forEach((event) => {
      if (!event.date) return;
      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime())) return;

      const hasPrice =
        PRICE_CONFIRMING_ACTIONS.includes(event.action) && event.commercials;
      const revenueAtEvent = hasPrice ? entryRevenue(event) : prevRevenue;

      if (eventDate >= cutoffDate) {
        // New activation: first ACTIVATED only, full MRR
        if (event.action === 'ACTIVATED' && !seenFirstActivation) {
          const g = getMonthGroup(eventDate);
          g.Activated += 1;
          g.Revenue += revenueAtEvent;
        }

        // Upgrade: count it, and add only the MRR increase
        else if (event.action === 'UPGRADE') {
          const g = getMonthGroup(eventDate);
          g.Activated += 1;
          g.Upgraded += 1;
          g.Revenue += Math.max(0, revenueAtEvent - prevRevenue);
        }

        // Termination (unchanged behavior: every TERMINATED counts as churn)
        else if (TERMINATING_HISTORY_ACTIONS.includes(event.action)) {
          const g = getMonthGroup(eventDate);
          g.Churned += 1;
          g.ChurnMRR += currentTrueRevenue;
        }
      }

      if (event.action === 'ACTIVATED') seenFirstActivation = true;
      if (hasPrice) prevRevenue = revenueAtEvent;
    });
  });

  return Array.from(monthlyData.values())
    .sort((a, b) => a.rawDate - b.rawDate)
    .filter((r) => r.Revenue !== 0 || r.ChurnMRR !== 0 || r.Activated !== 0 || r.Churned !== 0);
}, [allData, pmData, isProjectManager]);

  const productAnalytics = useMemo(() => {
    if (isProjectManager || !allData?.connections) return [];

    const productTotals = {};
    const now = new Date();
    const customersById = new Map((allData.customers || []).map((c) => [String(c._id), c]));

    allData.connections
      .filter((c) => isCountableConnection(c, customersById))
      .filter(isConnectionTrulyLive)
      .forEach(conn => {
        const serviceType = conn.serviceType || 'Unspecified';
        const revenue = getMonthRevenue(conn, now);

        if (!productTotals[serviceType]) {
          productTotals[serviceType] = 0;
        }
        productTotals[serviceType] += revenue;
      });

    const sortedData = Object.entries(productTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sortedData.length > 6) {
      const top5 = sortedData.slice(0, 5);
      const othersValue = sortedData.slice(5).reduce((sum, item) => sum + item.value, 0);
      top5.push({ name: 'Others', value: othersValue });
      return top5;
    }

    return sortedData;
  }, [allData, isProjectManager]);

  // Bandwidth "sold" events (used to drive the Sales vs Target chart) — one
  // entry per connection at its first ACTIVATED date, tagged with the
  // employee (createdBy) who booked it.
  const salesTargetAnalytics = useMemo(() => {
    const allConnections = isProjectManager ? pmData : (allData?.connections || []);
    const customersById = new Map((allData?.customers || []).map((c) => [String(c._id), c]));
    const connections = (allConnections || []).filter((c) => isCountableConnection(c, customersById));

    // A "sale" is counted the moment the connection is created — not when
    // (or whether) it's later activated — and regardless of its current
    // status (active, notice period, disconnected, ...). This is the sales
    // team's booking credit, deliberately independent of live infra state.
    const events = [];
    connections.forEach((conn) => {
      if (!conn.createdAt) return;
      const date = new Date(conn.createdAt);
      if (isNaN(date.getTime())) return;

      const { bandwidth } = getTrueCommercials(conn);
      if (!bandwidth) return;

      const createdBy = conn.createdBy;
      events.push({
        date,
        bandwidth: Number(bandwidth) || 0,
        employeeId: createdBy?._id ? String(createdBy._id) : (createdBy ? String(createdBy) : 'unknown'),
        employeeName: createdBy?.name || 'Unassigned',
      });
    });

    // Employee roster for the "by employee" view / target-setting modal.
    // Admins get the full roster (active employees/admins only — a
    // deactivated user shouldn't be assignable a new target); everyone
    // else only sees themselves.
    let employees = [];
    if (allData?.users) {
      employees = allData.users
        .filter((u) => (u.role === 'employee' || u.role === 'admin') && u.isActive !== false)
        .map((u) => ({ id: String(u._id || u.id), name: u.name, email: u.email }));
    } else if (user) {
      employees = [{ id: String(user._id || user.id), name: user.name, email: user.email }];
    }

    return { events, employees };
  }, [allData, pmData, isProjectManager, user]);

  return {
    summary,
    growthAnalytics,
    cancelled,
    geoAnalytics,
    whaleAnalytics,
    atRiskAnalytics,
    churnAnalytics,
    productAnalytics,
    salesTargetAnalytics,
    fetchOverview,
    overview,
    setOverview,
    loading,
    setLoading,
    error,
    setError
  };
};