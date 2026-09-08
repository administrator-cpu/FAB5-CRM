import React from 'react';
import { AlertTriangle, IndianRupee, Truck, TrendingUp, Filter, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../Utils/formatters';

const TONE = {
  danger: { bg: 'bg-rose-50', border: 'border-rose-100', icon: 'text-rose-500', title: 'text-rose-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', title: 'text-amber-700' },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'text-emerald-500', title: 'text-emerald-700' },
  neutral: { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-400', title: 'text-slate-500' },
};

const AlertCard = ({ tone = 'neutral', icon: Icon, title, value }) => {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl p-4 border ${t.bg} ${t.border} flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className={t.icon} />
        <span className={`text-sm font-bold ${t.title}`}>{title}</span>
      </div>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
};

// `overview` is the external Bahi Khata reports payload. Fields it doesn't
// expose yet (SLA breach %, lead-to-win conversion) are shown as pending
// rather than fabricated.
const AlertsRiskCenter = ({ atRiskAnalytics, overview, salesAchievement }) => {
  const highRiskCustomers = new Set((atRiskAnalytics?.connections || []).map((c) => c.customerName)).size;

  const overdue90 = overview?.agingAnalysis?.find((b) => b.label === '90+ Days')?.total ?? null;

  const collectionEff = overview?.collectionEfficiency;
  const collectionOnTarget = collectionEff != null ? collectionEff >= 90 : null;

  const salesOnTarget = salesAchievement?.hasTarget ? salesAchievement.achievementPct >= 100 : null;

  const cards = [
    {
      tone: highRiskCustomers > 0 ? 'danger' : 'success',
      icon: AlertTriangle,
      title: 'High Churn Risk',
      value: highRiskCustomers > 0 ? `${highRiskCustomers} customer${highRiskCustomers > 1 ? 's' : ''} on notice / at high risk` : 'No customers currently at risk',
    },
    {
      tone: overdue90 ? 'danger' : 'neutral',
      icon: IndianRupee,
      title: 'Overdue Collections',
      value: overdue90 != null ? `${formatCurrency(overdue90)} overdue (90+ days)` : 'No overdue data yet',
    },
    {
      tone: 'neutral',
      icon: Truck,
      title: 'SLA Breach',
      value: overview?.slaBreachRate != null ? `${overview.slaBreachRate.toFixed(1)}% deliveries breached SLA` : 'SLA tracking coming soon',
    },
    {
      tone: salesOnTarget == null ? 'neutral' : salesOnTarget ? 'success' : 'warning',
      icon: TrendingUp,
      title: salesOnTarget === false ? 'Revenue Below Target' : salesOnTarget ? 'Target Achieved' : 'Sales Target',
      value: salesAchievement?.hasTarget
        ? `Sales target achievement is ${salesAchievement.achievementPct}%`
        : 'Set a weekly target to start tracking',
    },
    {
      tone: 'neutral',
      icon: Filter,
      title: 'Low Conversion Rate',
      value: overview?.leadToWinRate != null ? `Lead to win conversion is ${overview.leadToWinRate.toFixed(1)}%` : 'Conversion tracking coming soon',
    },
    {
      tone: collectionOnTarget == null ? 'neutral' : collectionOnTarget ? 'success' : 'warning',
      icon: collectionOnTarget ? CheckCircle2 : ShieldAlert,
      title: collectionOnTarget === false ? 'Collections Below Target' : 'Target Achieved',
      value: collectionEff != null ? `Collection efficiency is ${collectionEff.toFixed(1)}% (${collectionOnTarget ? 'above' : 'below'} target)` : 'No collections data yet',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-indigo-600 flex items-center gap-2 tracking-wide">
        <ShieldAlert size={20} />
        ALERTS &amp; RISK CENTER
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c, i) => <AlertCard key={i} {...c} />)}
      </div>
    </div>
  );
};

export default AlertsRiskCenter;
