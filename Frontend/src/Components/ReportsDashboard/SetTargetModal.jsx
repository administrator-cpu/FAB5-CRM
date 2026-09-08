import React, { useEffect, useState } from 'react';
import { X, Target, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import targetService, { getMonthStartISO } from '../../Services/targetService';

const formatMonthLabel = (monthStartISO) =>
  new Date(monthStartISO).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const SetTargetModal = ({ employees = [], onClose, onSaved }) => {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [monthStart, setMonthStart] = useState(getMonthStartISO());
  const [targetMbps, setTargetMbps] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState({});

  useEffect(() => {
    if (!employeeId) return;
    targetService.getEmployeeTargets(employeeId).then((data) => {
      setExisting(data || {});
      setTargetMbps(data?.[monthStart] ?? '');
    });
  }, [employeeId, monthStart]);

  const handleSave = async () => {
    if (!employeeId) return toast.error('Select an employee first.');
    if (targetMbps === '' || isNaN(Number(targetMbps)) || Number(targetMbps) < 0) {
      return toast.error('Enter a valid target (Mbps).');
    }
    setSaving(true);
    try {
      await targetService.setMonthlyTarget({ employeeId, monthStart, targetMbps });
      toast.success('Monthly target saved.');
      onSaved?.();
      onClose();
    } catch {
      toast.error('Could not save target.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Target size={20} className="text-indigo-600" /> Set Monthly Target
            </h3>
            <p className="text-sm text-slate-500 mt-1">Bandwidth (Mbps) target for the selected employee &amp; month.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {employees.length === 0 && <option value="">No employees found</option>}
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
            <input
              type="month"
              value={monthStart.slice(0, 7)}
              onChange={(e) => setMonthStart(getMonthStartISO(`${e.target.value}-01`))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-1">Applies to {formatMonthLabel(monthStart)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Target Bandwidth (Mbps)</label>
            <input
              type="number"
              min="0"
              value={targetMbps}
              onChange={(e) => setTargetMbps(e.target.value)}
              placeholder="e.g. 500"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {existing[monthStart] != null && (
              <p className="text-xs text-slate-400 mt-1">Current target for this month: {existing[monthStart]} Mbps</p>
            )}
          </div>

          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            If you don't set a target for a future month, it will keep using this employee's most recently set target.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 ${saving ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Target'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetTargetModal;