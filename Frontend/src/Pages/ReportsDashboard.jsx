import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Activity, Users, Download, Lock, EyeOff, IndianRupee, Wifi, CheckCircle2, Clock, AlertCircle, XCircle, Building2, Globe, Briefcase, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../Context/AuthContext';
import { useConnection } from '../Context/ConnectionContext';
import { generateRoleBasedReport } from '../Services/ReportExportService';
import Header from '../Components/ReportsDashboard/Header';
import StatCard from '../Components/ReportsDashboard/StatCard';
import { useDashboardAnalytics } from '../Components/ReportsDashboard/useDashboardAnalytics';
import { formatCurrency } from '../Components/Utils/formatters';
import SystemGrowthChart from '../Components/ReportsDashboard/Charts/SystemGrowthChart';
import GeoPenetrationChart from '../Components/ReportsDashboard/Charts/GeoPenetrationChart';
import AtRiskWatchlist from '../Components/ReportsDashboard/Lists/AtRiskWatchlist';
import ChurnAcquisitionChart from '../Components/ReportsDashboard/Charts/ChurnAcquisitionChart';
import TopAccountsList from '../Components/ReportsDashboard/Lists/TopAccountsList';
import CollectionsOverview from '../Components/ReportsDashboard/CollectionsOverview';
import ServiceTypeChart from '../Components/ReportsDashboard/Charts/ServiceTypeChart';
import RevenueVsChurnChart from '../Components/ReportsDashboard/Charts/RevenueVsChurnChart';
import SalesVsTargetChart from '../Components/ReportsDashboard/Charts/SalesVsTargetChart';
import KPISummaryStrip from '../Components/ReportsDashboard/KPISummaryStrip';
import AlertsRiskCenter from '../Components/ReportsDashboard/AlertsRiskCenter';
import { useSalesAchievement } from '../Components/ReportsDashboard/useSalesAchievement';
import { useDashboard } from '../Context/DashboardContext';

const ReportsDashboard = () => {
  const { allData, user, loading } = useAuth();
  const { projectReportData } = useConnection();

  const [isExporting, setIsExporting] = useState(false);
  const [pmData, setPmData] = useState(null);
  const [pmLoading, setPmLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('month');

  const isProjectManager = user?.role === 'project_manager';
  const isAdmin = user?.role === 'admin';
  const isEmployee = user?.role === 'employee';
  const isRestrictedRole = user?.role === 'owner' || user?.role === 'order_generation';

  // 1. Destructure the new fetchOverview and overview state from your hook
  const { 
    summary, 
    growthAnalytics, 
    geoAnalytics, 
    whaleAnalytics, 
    atRiskAnalytics, 
    churnAnalytics, 
    productAnalytics,
    salesTargetAnalytics,
    fetchOverview, 
    overview 
  } = useDashboardAnalytics({ allData, pmData, isProjectManager, timeRange });

  const salesAchievement = useSalesAchievement(salesTargetAnalytics.events, salesTargetAnalytics.employees);

  // console.log(overview)

  useEffect(() => {
    if (isProjectManager || isAdmin) {
      const fetchPMData = async () => {
        setPmLoading(true);
        try {
          const { data } = await projectReportData();
          setPmData(Array.isArray(data) ? data : (data?.connections || data?.data || []));
        } catch (error) { }
        finally { setPmLoading(false); }
      };
      fetchPMData();
    }
  }, [isProjectManager, projectReportData]);

  // 2. NEW: Actually call the fetch function when the dashboard loads
  useEffect(() => {
    if (isAdmin || isEmployee) {
      fetchOverview();
    }
  }, [isAdmin, isEmployee]);

  const handleMasterExport = async () => {
    if (!summary) return toast.error("Data is still loading. Please wait.");
    setIsExporting(true);
    const tid = toast.loading("Generating Excel Report...");
    try {
      setTimeout(() => {
        generateRoleBasedReport(isProjectManager ? [] : allData.customers, isProjectManager ? pmData : allData.connections, user?.role);
        toast.success("Report Downloaded Successfully!", { id: tid });
        setIsExporting(false);
      }, 500);
    } catch (error) {
      toast.error("Failed to generate report.", { id: tid });
      setIsExporting(false);
    }
  };

  if (loading || pmLoading || !summary) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  }

  if (isRestrictedRole) {
    return (
      <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center p-8 bg-slate-50/50 text-center">
        <div className="bg-red-100 text-red-500 p-6 rounded-full mb-6"><Lock size={48} /></div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Access Restricted</h2>
        <p className="text-slate-500 max-w-md">Your current role does not have clearance to view or generate system reports.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-[70vh] p-4 md:p-8 bg-slate-50/50">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <Header />

        {(isAdmin || isEmployee) && (
          <KPISummaryStrip summary={summary} overview={overview} salesAchievement={salesAchievement} />
        )}

        {/* TOP ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><FileSpreadsheet size={28} /></div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Master Database Report</h3>
            <p className="text-slate-500 text-sm mb-6 flex-1">
              Complete export of all records.
              {isProjectManager && <span className="text-amber-600 block mt-2"><EyeOff size={14} className="inline mr-1" /> Financials excluded.</span>}
            </p>
            <button onClick={handleMasterExport} disabled={isExporting} className={`w-full py-3.5 rounded-xl font-bold text-white ${isExporting ? 'bg-indigo-400' : 'bg-indigo-600'}`}>
              <Download size={18} className="inline mr-2" /> {isExporting ? 'Formatting Excel...' : 'Download Master Report'}
            </button>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 shadow-md text-white flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Activity size={120} /></div>
            <h3 className="text-lg font-bold text-slate-300 mb-6 border-b border-slate-700 pb-4 relative z-10">Live Infrastructure & Revenue</h3>
            <div className={`grid gap-6 relative z-10 ${isProjectManager ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!isProjectManager && (
                <div>
                  <div className="text-slate-400 font-medium"><IndianRupee size={18} className="inline text-emerald-400 mr-2" /> Total Live MRR</div>
                  <div className="text-3xl font-black text-emerald-50">{formatCurrency(summary.revenue.totalLiveRevenue)}</div>
                </div>
              )}
              <div>
                <div className="text-slate-400 font-medium"><Wifi size={18} className="inline text-blue-400 mr-2" /> Total Bandwidth</div>
                <div className="text-3xl font-black text-blue-50">{summary.revenue.totalBandwidth.toLocaleString('en-IN')} <span className="text-lg text-slate-400">Mbps</span></div>
              </div>
            </div>
          </div>
        </div>

        {(isAdmin || isEmployee) && (
          <>
            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <SystemGrowthChart
                chartInfo={growthAnalytics}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
              />
              {!isProjectManager && (
                <GeoPenetrationChart data={geoAnalytics} />
              )}
            </div>

            {!isProjectManager && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <SalesVsTargetChart
                  events={salesTargetAnalytics.events}
                  employees={salesTargetAnalytics.employees}
                />
              </div>
            )}

            {/* BOTTOM ROW: Reusable StatCards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {!isProjectManager && (
                <StatCard
                  title="Customer Base"
                  icon={Users}
                  iconColorClass="text-blue-500"
                  total={summary.customers.total}
                  items={[
                    { label: "Active Accounts", value: summary.customers.active, bgClass: "bg-emerald-50", borderClass: "border-emerald-100", textClass: "text-emerald-800", valueClass: "text-emerald-600" },
                    { label: "Inactive Accounts", value: summary.customers.inactive, bgClass: "bg-rose-50", borderClass: "border-rose-100", textClass: "text-rose-800", valueClass: "text-rose-500" }
                  ]}
                  summaryItems={[
                    { label: "Enterprise", value: summary.customers.enterprise, icon: Building2 },
                    { label: "ISP", value: summary.customers.isp, icon: Globe },
                    { label: "Operator", value: summary.customers.operator, icon: Briefcase },
                    { label: "Government", value: summary.customers.government, icon: Landmark },
                    { label: "Other", value: summary.customers.other, icon: Users }
                  ]}
                />
              )}

              <StatCard
                title="Inventory State"
                icon={Activity}
                iconColorClass="text-indigo-500"
                total={summary.connections.total}
                items={[
                  { label: "Live / Active", icon: CheckCircle2, iconColor: "text-indigo-500", value: summary.connections.active, bgClass: "bg-indigo-50", borderClass: "border-indigo-100", textClass: "text-indigo-800", valueClass: "text-indigo-600" },
                  { label: "In Pipeline", icon: Clock, iconColor: "text-amber-500", value: summary.connections.pending, bgClass: "bg-amber-50", borderClass: "border-amber-100", textClass: "text-amber-800", valueClass: "text-amber-600" },
                  { label: "Notice Period", icon: AlertCircle, iconColor: "text-orange-500", value: summary.connections.notice, bgClass: "bg-orange-50", borderClass: "border-orange-100", textClass: "text-orange-800", valueClass: "text-orange-600" },
                  { label: "Disconnected/Lost", icon: XCircle, iconColor: "text-slate-400", value: summary.connections.churned, bgClass: "bg-slate-50", borderClass: "border-slate-200", textClass: "text-slate-700", valueClass: "text-slate-600" },
                ]}
              />

              {!isProjectManager && <TopAccountsList data={whaleAnalytics} />}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <ChurnAcquisitionChart data={churnAnalytics} />
              {!isProjectManager && (
                <ServiceTypeChart data={productAnalytics} />
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {!isProjectManager && (
                <>
                  <AtRiskWatchlist data={atRiskAnalytics} isPM={isProjectManager} />
                  <RevenueVsChurnChart data={churnAnalytics} />
                </>
              )}
            </div>

            {!isProjectManager && (
              <AlertsRiskCenter
                atRiskAnalytics={atRiskAnalytics}
                overview={overview}
                salesAchievement={salesAchievement}
              />
            )}

            {/* 3. Pass the fetched overview data down to your collections component */}
              <CollectionsOverview apiData={overview} />
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsDashboard;