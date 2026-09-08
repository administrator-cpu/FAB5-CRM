import api from './api';

// Returns the ISO date (YYYY-MM-DD) of the Monday of the week containing `date`
export const getWeekStartISO = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const notifyUpdated = () => {
  try { window.dispatchEvent(new Event('fab5-targets-updated')); } catch {}
};

const targetService = {
  // { [employeeId]: { [weekStartISO]: targetMbps } }
  getAllTargets: async () => {
    const { data } = await api.get('/sales-targets');
    return data?.data || {};
  },

  // { [weekStartISO]: targetMbps } for one employee
  getEmployeeTargets: async (employeeId) => {
    const { data } = await api.get(`/sales-targets/${employeeId}`);
    return data?.data || {};
  },

  setWeeklyTarget: async ({ employeeId, weekStart, targetMbps }) => {
    const { data } = await api.put('/sales-targets', { employeeId, weekStart, targetMbps });
    notifyUpdated();
    return data;
  },

  deleteWeeklyTarget: async ({ employeeId, weekStart }) => {
    const { data } = await api.delete('/sales-targets', { data: { employeeId, weekStart } });
    notifyUpdated();
    return data;
  },
};

export default targetService;