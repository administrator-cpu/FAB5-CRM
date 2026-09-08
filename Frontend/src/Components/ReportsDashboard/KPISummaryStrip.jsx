import React from 'react';
import { IndianRupee, Target, Users, Percent, Truck, UserX } from 'lucide-react';
import { formatCr } from '../Utils/formatters';

const KPICard = ({ icon: Icon, iconBg, iconColor, label, value, sub }) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center gap-3">
    <div className={`p-2.5 rounded-full shrink-0 ${iconBg} ${iconColor}`}>
      <Icon size={20} />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-slate-500 font-medium truncate">{label}</div>
      <div className="text-xl font-black text-slate-900 leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  </div>
);

// `overview` is the external Bahi Khata reports payload; fields it doesn't
// yet expose (delivery success rate) degrade gracefully to "—" instead of
// being guessed at.
const KPISummaryStrip = ({ summary, overview, salesAchievement }) => {
  const activeCustomers = summary?.customers?.active ?? 0;
  const totalConns = summary?.connections?.total || 0;
  const churnedConns = summary?.connections?.churned || 0;
  const churnPct = overview?.customerChurnRate ?? (totalConns > 0 ? +((churnedConns / totalConns) * 100).toFixed(2) : 0);

  const cards = [
    {
      icon: IndianRupee, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
      label: 'Total Revenue', value: formatCr(summary?.revenue?.totalLiveRevenue),
    },
    {
      icon: Target, iconBg: 'bg-violet-50', iconColor: 'text-violet-600',
      label: 'Sales Target Achievement',
      value: salesAchievement?.hasTarget ? `${salesAchievement.achievementPct}%` : '—',
      sub: salesAchievement?.hasTarget ? undefined : 'No target set yet',
    },
    {
      icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
      label: 'Active Customers', value: activeCustomers.toLocaleString('en-IN'),
    },
    {
      icon: Percent, iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
      label: 'Collection Efficiency',
      value: overview?.collectionEfficiency != null ? `${overview.collectionEfficiency.toFixed(1)}%` : '—',
    },
    {
      icon: Truck, iconBg: 'bg-rose-50', iconColor: 'text-rose-600',
      label: 'Delivery Success Rate',
      value: overview?.deliverySuccessRate != null ? `${overview.deliverySuccessRate.toFixed(1)}%` : '—',
      sub: overview?.deliverySuccessRate != null ? undefined : 'Data pending',
    },
    {
      icon: UserX, iconBg: 'bg-pink-50', iconColor: 'text-pink-600',
      label: 'Customer Churn', value: `${churnPct}%`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c, i) => <KPICard key={i} {...c} />)}
    </div>
  );
};

export default KPISummaryStrip;
