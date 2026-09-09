import api from './api';

export const getMonthStartISO = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

export const resolveMonthlyTarget = (monthlyTargetsMap, monthStartISO) => {
  const map = monthlyTargetsMap || {};
  if (map[monthStartISO] != null) return Number(map[monthStartISO]) || 0;

  const target = new Date(monthStartISO);
  let best = null;
  let bestDate = null;
  Object.entries(map).forEach(([iso, mbps]) => {
    const d = new Date(iso);
    if (d < target && (!bestDate || d > bestDate)) {
      bestDate = d;
      best = mbps;
    }
  });
  return best != null ? Number(best) || 0 : 0;
};

const notifyUpdated = () => {
  try { window.dispatchEvent(new Event('fab5-targets-updated')); } catch {}
};

const targetService = {
  // { [employeeId]: { [monthStartISO]: targetMbps } }
  // Admin gets every employee; a non-admin gets only their own bucket.
  getAllTargets: async () => {
    const { data } = await api.get('/sales-targets');
    return data?.data || {};
  },

  // { [monthStartISO]: targetMbps } for one employee
  getEmployeeTargets: async (employeeId) => {
    const { data } = await api.get(`/sales-targets/${employeeId}`);
    return data?.data || {};
  },

  setMonthlyTarget: async ({ employeeId, monthStart, targetMbps }) => {
    const { data } = await api.put('/sales-targets', { employeeId, monthStart, targetMbps });
    notifyUpdated();
    return data;
  },

  deleteMonthlyTarget: async ({ employeeId, monthStart }) => {
    const { data } = await api.delete('/sales-targets', { data: { employeeId, monthStart } });
    notifyUpdated();
    return data;
  },
};

export default targetService;