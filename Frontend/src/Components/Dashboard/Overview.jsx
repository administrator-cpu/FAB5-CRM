import { useEffect, useState } from "react";
import { useAuth } from "../../Context/AuthContext";
import { useConnection } from "../../Context/ConnectionContext";
import { useDashboard } from "../../Context/DashboardContext";
import SearchBar from "../Navigation/SearchBar";
import EmployeeDashboard from "./EmployeeDashboard";
import FlowNav from "./FlowNav";
import RevenueBanner from "./RevenueBanner";
import { useDashboardAnalytics } from "../ReportsDashboard/useDashboardAnalytics";
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
    const {
      growthAnalytics, 
      fetchOverview, 
    } = useDashboardAnalytics({ allData, pmData, isProjectManager});
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
     {(isEmployee||isAdmin)&& <RevenueBanner revenue={growthAnalytics}/>}

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