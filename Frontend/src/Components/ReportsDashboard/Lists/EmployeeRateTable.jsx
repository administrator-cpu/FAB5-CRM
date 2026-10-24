import React, { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { formatCurrency, formatBandwidth } from '../../Utils/formatters';

const SORTS = [
  { key: 'revenuePerMb', label: 'Revenue / Mbps' },
  { key: 'bandwidth', label: 'Bandwidth' },
  { key: 'monthRevenue', label: 'Revenue' },
];

const rupeesPerMb = (v) => (v === null || v === undefined ? '—' : `${formatCurrency(Math.round(v))}`);

// Avg Revenue per Mbps for each employee, compared with the company average.
const EmployeeRateTable = ({ data = [], companyAvg = 0 }) => {
  const [sortKey, setSortKey] = useState('revenuePerMb');

  const rows = useMemo(
    () => [...data].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1)),
    [data, sortKey]
  );
  const maxRate = useMemo(
    () => Math.max(companyAvg || 0, ...data.map((r) => r.revenuePerMb || 0)) || 1,
    [data, companyAvg]
  );

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Gauge size={20} className="text-indigo-500" />
            Avg Revenue per Mbps by Employee
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Live circuits, credited to the employee who booked them. Company average{' '}
            <span className="font-semibold text-slate-700">{rupeesPerMb(companyAvg)}/Mbps</span>.
          </p>
        </div>
        <div className="flex max-w-full overflow-x-auto bg-slate-100 rounded-lg p-1 text-sm" role="group" aria-label="Sort by">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortKey(s.key)}
              aria-pressed={sortKey === s.key}
              className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                sortKey === s.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-slate-400">No live circuits found.</div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-2 py-3">Employee</th>
                <th className="px-2 py-3 text-right">Circuits</th>
                <th className="px-2 py-3 text-right">Bandwidth</th>
                <th className="px-2 py-3 text-right">Revenue / mo</th>
                <th className="px-2 py-3 w-[34%]">Avg Revenue per Mbps</th>
                <th className="px-2 py-3 text-right">Margin / Mbps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vsAvg = r.revenuePerMb !== null && companyAvg > 0
                  ? ((r.revenuePerMb - companyAvg) / companyAvg) * 100
                  : null;
                const above = vsAvg !== null && vsAvg >= 0;
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      {!r.isActive && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-slate-600">{r.circuits}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-slate-600">{formatBandwidth(r.bandwidth)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-slate-600">{formatCurrency(Math.round(r.monthRevenue))}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-16 shrink-0 font-bold tabular-nums text-slate-800">{rupeesPerMb(r.revenuePerMb)}</span>
                        <div className="relative h-2 flex-1 rounded-full bg-slate-100">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                            style={{ width: `${Math.min(100, ((r.revenuePerMb || 0) / maxRate) * 100)}%` }}
                          />
                          {companyAvg > 0 && (
                            <div
                              className="absolute -inset-y-1 w-0.5 bg-slate-700"
                              style={{ left: `${(companyAvg / maxRate) * 100}%` }}
                              title={`Company average ${rupeesPerMb(companyAvg)}/Mbps`}
                            />
                          )}
                        </div>
                        <span
                          className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${
                            vsAvg === null ? 'text-slate-300' : above ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                        >
                          {vsAvg === null ? '—' : `${above ? '+' : ''}${vsAvg.toFixed(0)}%`}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`px-2 py-3 text-right tabular-nums font-medium ${
                        r.marginPerMb === null ? 'text-slate-300' : r.marginPerMb < 0 ? 'text-rose-500' : 'text-slate-700'
                      }`}
                    >
                      {rupeesPerMb(r.marginPerMb)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-2 pt-3 text-xs text-slate-400">
            Dark line marks the company average. Circuits priced at ₹0 are left out of the rate; margin uses only circuits with an Airtel cost entered.
          </p>
        </div>
      )}
    </div>
  );
};

export default EmployeeRateTable;
