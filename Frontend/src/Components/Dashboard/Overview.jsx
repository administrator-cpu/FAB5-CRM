import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../Context/AuthContext";
import { useConnection } from "../../Context/ConnectionContext";
import { useDashboard } from "../../Context/DashboardContext";
import SearchBar from "../Navigation/SearchBar";
import EmployeeDashboard from "./EmployeeDashboard";
import FlowNav from "./FlowNav";
import RevenueBanner from "./RevenueBanner";
import { useDashboardAnalytics } from "../ReportsDashboard/useDashboardAnalytics";
import { excludeTestData } from "../ReportsDashboard/drishtiData";
import DashboardHeader from "../Navigation/DashboardHeader";

const ACCENT = "#6c5ce7";

function Overview() {
  const { metrics, loadingMetrics } = useDashboard();
   const { allData, user } = useAuth();
    const { projectReportData } = useConnection();


  const privileged = user?.role === "employee" || user?.role === "admin";
  const p = metrics?.performance;

  const list = [
    { name: "Revenue",  value: p?.lifeTimeRevenue !== undefined ? `₹${Math.round(p.lifeTimeRevenue).toLocaleString("en-IN")}` : "₹0", lead: true },
  ];

  
    const [pmData, setPmData] = useState(null);
    const [pmLoading, setPmLoading] = useState(false);
  
    const isProjectManager = user?.role === 'project_manager';
    const isAdmin = user?.role === 'admin';
    const isEmployee = user?.role === 'employee';
    const isRestrictedRole = user?.role === 'owner' || user?.role === 'order_generation';
    // Admins see Avg Revenue per Mbps on the banner, computed exactly as in Drishti
    // (test account excluded, admin rules on). Other roles are unchanged.
    const analyticsData = useMemo(() => (isAdmin ? excludeTestData(allData, user) : allData), [allData, user, isAdmin]);
    const {
      summary,
      employeeRateAnalytics,
      growthAnalytics, 
      loading: revenueLoading,
      fetchOverview, 
    } = useDashboardAnalytics({ allData: analyticsData, pmData, isProjectManager, adminRules: isAdmin, ownRateUserId: isEmployee ? (user?._id || user?.id) : null });
    // Admins: company figure. Employees: only their own figure (null hides it).
    const revenuePerMb = isAdmin
      ? (summary ? summary.revenue?.sellingRatePerMb ?? null : null)
      : isEmployee ? (employeeRateAnalytics[0]?.revenuePerMb ?? null) : null;
      useEffect(() => {
        // Only project managers use this report; admins never read it, so they skip the request.
        if (isProjectManager) {
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
    
      useEffect(() => {
        if (isAdmin || isEmployee) {
          fetchOverview();
        }
      }, [isAdmin, isEmployee]);


  return (
    <section
      className="customScroller"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        height: "100vh",
        overflow: "auto",
        padding: "10px 20px 24px",
        flex:1
      }}
    >
      {/* <div style={{ display: "flex" }}>
        <SearchBar />
      </div> */}
      <DashboardHeader/>
     {(isEmployee||isAdmin)&& <RevenueBanner revenue={growthAnalytics} revenuePerMb={revenuePerMb} pending={revenueLoading} revenuePerMbLabel={isEmployee ? "Your Avg Revenue per Mbps" : "Avg Revenue per Mbps"} storageKey={`fab5.revenueBanner.${user?.email || "me"}`}/>}

      {privileged && <FlowNav />}

      <section style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <EmployeeDashboard />
        </div>
      </section>
    </section>
  );
}

export default Overview;