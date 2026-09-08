import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Plus } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../../../Context/AuthContext';
import targetService, { getWeekStartISO } from '../../../Services/targetService';
import { formatBandwidth } from '../../Utils/formatters';
import SetTargetModal from '../SetTargetModal';

const GRAINS = ['daily', 'weekly', 'monthly', 'yearly'];
const PERIOD_COUNT = { daily: 14, weekly: 8, monthly: 6, yearly: 4 };

const monthLabel = (date) => date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(' ', " '");
const dayLabel = (date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const weekLabel = (mondayISO) => `Wk ${new Date(mondayISO).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

const endOfDay = (d) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };

// Builds the list of periods to plot, ending "today", oldest first
const buildPeriods = (grain) => {
  const count = PERIOD_COUNT[grain];
  const periods = [];
  const now = new Date();

  if (grain === 'daily') {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now); start.setDate(now.getDate() - i); start.setHours(0, 0, 0, 0);
      periods.push({ key: start.toISOString().slice(0, 10), label: dayLabel(start), start, end: endOfDay(start) });
    }
  } else if (grain === 'weekly') {
    const thisMonday = new Date(getWeekStartISO(now));
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(thisMonday); start.setDate(thisMonday.getDate() - i * 7);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const key = start.toISOString().slice(0, 10);
      periods.push({ key, label: weekLabel(key), start, end: endOfDay(end) });
    }
  } else if (grain === 'monthly') {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      periods.push({ key: `${start.getFullYear()}-${start.getMonth()}`, label: monthLabel(start), start, end: endOfDay(end) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const y = now.getFullYear() - i;
      periods.push({ key: String(y), label: String(y), start: new Date(y, 0, 1), end: endOfDay(new Date(y, 11, 31)) });
    }
  }
  return periods;
};

// Resolves the bandwidth target for one period out of an employee's { weekStartISO: mbps } map
const getTargetForPeriod = (weeklyTargetsMap, grain, period) => {
  const map = weeklyTargetsMap || {};
  if (grain === 'weekly') return Number(map[period.key]) || 0;
  if (grain === 'daily') return (Number(map[getWeekStartISO(period.start)]) || 0) / 7;

  // monthly / yearly: sum every week whose Monday falls inside the period
  let total = 0;
  Object.entries(map).forEach(([weekStartISO, mbps]) => {
    const monday = new Date(weekStartISO);
    if (monday >= period.start && monday <= period.end) total += Number(mbps) || 0;
  });
  return total;
};

const SalesVsTargetChart = ({ events = [], employees = [] }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const selfId = user ? String(user._id || user.id) : null;

  const [grain, setGrain] = useState('monthly');
  const [viewEmployeeId, setViewEmployeeId] = useState('all'); // 'all' = team summary
  const [showModal, setShowModal] = useState(false);
  const [allTargets, setAllTargets] = useState({});

  const effectiveEmployeeId = isAdmin ? viewEmployeeId : selfId;

  const loadTargets = () => targetService.getAllTargets().then(setAllTargets);

  useEffect(() => {
    loadTargets();
    window.addEventListener('fab5-targets-updated', loadTargets);
    return () => window.removeEventListener('fab5-targets-updated', loadTargets);
  }, []);

  const chartData = useMemo(() => {
    const periods = buildPeriods(grain);

    const relevantEvents = effectiveEmployeeId && effectiveEmployeeId !== 'all'
      ? events.filter((e) => e.employeeId === effectiveEmployeeId)
      : events;

    const targetEmployeeIds = effectiveEmployeeId && effectiveEmployeeId !== 'all'
      ? [effectiveEmployeeId]
      : employees.map((e) => e.id);

    return periods.map((p) => {
      const actual = relevantEvents
        .filter((e) => e.date >= p.start && e.date <= p.end)
        .reduce((sum, e) => sum + e.bandwidth, 0);

      const target = targetEmployeeIds.reduce(
        (sum, empId) => sum + getTargetForPeriod(allTargets[empId], grain, p), 0
      );

      return { period: p.label, Target: Math.round(target), Actual: Math.round(actual) };
    });
  }, [grain, effectiveEmployeeId, events, employees, allTargets]);

  const hasAnyTarget = chartData.some((d) => d.Target > 0);

  return (
    <div className="xl:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={22} className="text-indigo-600" />
            Sales vs Target
          </h3>
          <p className="text-sm text-slate-500 mt-1">Bandwidth sold (Mbps) against the weekly target.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && employees.length > 0 && (
            <select
              value={viewEmployeeId}
              onChange={(e) => setViewEmployeeId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Employees (Summary)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
              ))}
            </select>
          )}

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            {GRAINS.map((g) => (
              <button
                key={g}
                onClick={() => setGrain(g)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${grain === g ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {g}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg border border-indigo-100"
            >
              <Plus size={16} /> Set Target
            </button>
          )}
        </div>
      </div>

      {!hasAnyTarget && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          No targets set for this range yet.{isAdmin ? ' Use "Set Target" to add one.' : ' Ask your admin to set a weekly target.'}
        </div>
      )}

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={60} />
            <RechartsTooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value, name) => [formatBandwidth(value), name]}
            />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '16px' }} />
            <Bar dataKey="Target" name="Target" fill="#cbd5e1" radius={[6, 6, 0, 0]} barSize={22} />
            <Bar dataKey="Actual" name="Actual" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showModal && (
        <SetTargetModal employees={employees} onClose={() => setShowModal(false)} onSaved={loadTargets} />
      )}
    </div>
  );
};

export default SalesVsTargetChart;
