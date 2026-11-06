import React from 'react';
import { Crown, Building } from 'lucide-react';
import { formatCurrency } from '../../Utils/formatters';

const TopAccountsList = ({ data }) => {
  return (
    <div className="lg:col-span-1 bg-white rounded-2xl p-6 max-h-[60vh] overflow-y-auto shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Crown size={20} className="text-amber-500" />
            Top 5 Accounts
          </h3>
          <p className="text-sm text-slate-500 mt-1">Largest clients by live MRR.</p>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        {data && data.length > 0 ? (
          data.map((whale, index) => (
            <div
              key={whale.name}
              className={`flex items-center gap-4 p-3 rounded-xl border transition-all hover:shadow-md ${
                index === 0
                  ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                  : 'bg-slate-50 border-slate-100'
              }`}
            >
              {/* Rank Badge */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm ${
                  index === 0 ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 border border-slate-200'
                }`}
              >
                {index === 0 ? <Crown size={18} /> : `#${index + 1}`}
              </div>

              {/* Client Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-800 truncate" title={whale.name}>
                  {whale.name}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <Building size={12} />
                  <span>
                    {whale.circuitCount} Active Circuit{whale.circuitCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Revenue Info */}
              <div className="text-right">
                <span className={`block font-black ${index === 0 ? 'text-amber-600 text-lg' : 'text-slate-700'}`}>
                  {formatCurrency(whale.totalRevenue)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">/mo</span>
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 pb-8">
            <p>No active revenue data found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopAccountsList;