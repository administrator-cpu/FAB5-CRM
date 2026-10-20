import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import dashboardService from "../Services/dashboard.service";
import { useAuth } from "./AuthContext";

const DashboardAPI = createContext();

export const DashboardProvider = ({ children }) => {
  const { user } = useAuth(); //

  // ────────────────────────────────────────────────────────
  // 1. Core State Framework
  // ────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [activeTab, setActiveTab] = useState("connections"); //
  const [revenew,serRevenew]=useState([])
  // Tab Grid Framework Arrays & Lazy Parameters
  const [connections, setConnections] = useState([]);
  const [connPage, setConnPage] = useState(1); //
  const [connStatusFilter, setConnStatusFilter] = useState("All"); //
  const [connHasMore, setConnHasMore] = useState(true); //
  const [loadingConnections, setLoadingConnections] = useState(false); //

  const [customers, setCustomers] = useState([]);
  const [custPage, setCustPage] = useState(1); //
  const [custHasMore, setCustHasMore] = useState(true); //
  const [loadingCustomers, setLoadingCustomers] = useState(false); //

  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState(1); //
  const [userHasMore, setUserHasMore] = useState(true); //
  const [loadingUsers, setLoadingUsers] = useState(false); //

  // 🚀 IN-MEMORY CACHE REF: Preserves data across tab toggles without causing extra renders
  const cacheMap = useRef({
    connections: {},
    customers: {},
    users: {}
  });

  // Helper to completely clear the cache when fresh data is forced
  const invalidateCache = useCallback((type) => {
    if (type) {
      cacheMap.current[type] = {};
    } else {
      cacheMap.current = { connections: {}, customers: {}, users: {} };
    }
  }, []);

  // ────────────────────────────────────────────────────────
  // 2. Data Action Fetch Handlers
  // ────────────────────────────────────────────────────────

  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const response = await dashboardService.metrics(); //
      if (response.success) {
        setMetrics({
          counters: response.counters,
          performance: response.performance
        }); //
      }
    } catch (err) {
      console.error("Failed to load metrics summaries:", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  // CONNECTIONS GRID WITH CACHE LOOKUPS
  const fetchConnectionsList = useCallback(async (page = 1, status = "All", isScroll = false) => {
    const cacheKey = `${status}_p${page}`;

    // 🚀 Cache Hit: If we aren't scrolling and already have this filter/page in memory, hit it instantly!
    if (!isScroll && cacheMap.current.connections[cacheKey]) {
      const cachedData = cacheMap.current.connections[cacheKey];
      setConnections(cachedData.list);
      setConnPage(page);
      setConnStatusFilter(status);
      setConnHasMore(cachedData.hasMore);
      return;
    }

    setLoadingConnections(true);
    try {
      const response = await dashboardService.connections({ page, limit: 25, status }); //
      if (response.success) {
        const fetched = response.connections || []; //
        const nextHasMore = page < response.pages; //

        let updatedList = fetched;
        if (isScroll) {
          setConnections((prev) => {
            updatedList = [...prev, ...fetched];
            return updatedList;
          });
        } else {
          setConnections(fetched);
        }

        // Save into our persistent cache index
        cacheMap.current.connections[cacheKey] = { list: updatedList, hasMore: nextHasMore };

        setConnPage(page); //
        setConnStatusFilter(status); //
        setConnHasMore(nextHasMore); //
      }
    } catch (err) {
    } finally {
      setLoadingConnections(false); //
    }
  }, []);

  // CUSTOMERS GRID WITH CACHE LOOKUPS
  const fetchCustomersList = useCallback(async (page = 1, isScroll = false) => {
    const cacheKey = `p${page}`;

    if (!isScroll && cacheMap.current.customers[cacheKey]) {
      const cachedData = cacheMap.current.customers[cacheKey];
      setCustomers(cachedData.list);
      setCustPage(page);
      setCustHasMore(cachedData.hasMore);
      return;
    }

    setLoadingCustomers(true);
    try {
      const response = await dashboardService.customers({ page, limit: 25 }); //
      if (response.success) {
        const fetched = response.customers || []; //
        const nextHasMore = page < response.pages; //

        let updatedList = fetched;
        if (isScroll) {
          setCustomers((prev) => {
            updatedList = [...prev, ...fetched];
            return updatedList;
          });
        } else {
          setCustomers(fetched);
        }

        cacheMap.current.customers[cacheKey] = { list: updatedList, hasMore: nextHasMore };
        setCustPage(page); //
        setCustHasMore(nextHasMore); //
      }
    } catch (err) {
    } finally {
      setLoadingCustomers(false); //
    }
  }, []);

  // USER GRID WITH CACHE LOOKUPS
  const fetchUsersList = useCallback(async (page = 1, isScroll = false) => {
    const cacheKey = `p${page}`;

    if (!isScroll && cacheMap.current.users[cacheKey]) {
      const cachedData = cacheMap.current.users[cacheKey];
      setUsers(cachedData.list);
      setUserPage(page);
      setUserHasMore(cachedData.hasMore);
      return;
    }

    setLoadingUsers(true);
    try {
      const response = await dashboardService.users({ page, limit: 25 }); //
      if (response.success) {
        const fetched = response.users || []; //
        const nextHasMore = page < response.pages; //

        let updatedList = fetched;
        if (isScroll) {
          setUsers((prev) => {
            updatedList = [...prev, ...fetched];
            return updatedList;
          });
        } else {
          setUsers(fetched);
        }

        cacheMap.current.users[cacheKey] = { list: updatedList, hasMore: nextHasMore };
        setUserPage(page); //
        setUserHasMore(nextHasMore); //
      }
    } catch (err) {
    } finally {
      setLoadingUsers(false); //
    }
  }, []);

  // ────────────────────────────────────────────────────────
  // 3. Socket Connection Lifecycle & Cache Management
  // ────────────────────────────────────────────────────────

  useEffect(() => {
  if (!user) return; //

  let socket;
  
  const socketTimer = setTimeout(() => {
    const serverUrl = import.meta.env.VITE_API_BASE_URL
      ? new URL(import.meta.env.VITE_API_BASE_URL).origin
      : "http://localhost:5000"; //

    socket = io(serverUrl, {
      auth: { token: localStorage.getItem("token") }, //
      transports: ["websocket", "polling"] //
    });

    socket.on("metricsUpdated", (freshMetricsData) => { //
      if (freshMetricsData) {
        setMetrics({
          counters: freshMetricsData.counters,
          performance: freshMetricsData.performance
        }); //
      }
    });


    socket.on("connections_mutated", () => {
      invalidateCache("connections");
      setConnStatusFilter((currentFilter) => {
        fetchConnectionsList(1, currentFilter, false); // Quiet background refresh
        return currentFilter;
      });
      fetchMetrics(); //
    });

    socket.on("customers_mutated", () => {
      invalidateCache("customers"); // 🚀 Wipe customer cache layer
      fetchCustomersList(1, false);
      fetchMetrics(); //
    });

    socket.on("users_mutated", () => {
      invalidateCache("users"); // 🚀 Wipe user cache layer
      fetchUsersList(1, false);
    });
  }, 300);

  return () => {
    clearTimeout(socketTimer);
    if (socket) socket.disconnect(); //
  };
}, [user, fetchMetrics, fetchConnectionsList, fetchCustomersList, fetchUsersList]); //

useEffect(() => {
  if (!user) return; //
  try{
if (activeTab === "connections") {
    fetchConnectionsList(1, connStatusFilter, false); //
  } else if (activeTab === "customers") {
    fetchCustomersList(1, false); //
  } else if (activeTab === "users") {
    fetchUsersList(1, false); //
  }
  }catch(err){}
  

}, [user, activeTab, connStatusFilter, fetchConnectionsList, fetchCustomersList, fetchUsersList]);
  useEffect(() => {
  if (user) {
    fetchMetrics(); //
  }
}, [user, fetchMetrics]); //


  const value = useMemo(
    () => ({
      metrics,
      loadingMetrics,
      fetchMetrics,
      activeTab,
      setActiveTab,
      connections,
      connPage,
      connStatusFilter,
      connHasMore,
      loadingConnections,
      fetchConnectionsList,
      customers,
      custPage,
      custHasMore,
      loadingCustomers,
      fetchCustomersList,
      users,
      userPage,
      userHasMore,
      loadingUsers,
      fetchUsersList,
      invalidateCache,revenew,serRevenew
    }),
    [
      metrics,
      loadingMetrics,
      fetchMetrics,
      activeTab,
      setActiveTab,
      connections,
      connPage,
      connStatusFilter,
      connHasMore,
      loadingConnections,
      fetchConnectionsList,
      customers,
      custPage,
      custHasMore,
      loadingCustomers,
      fetchCustomersList,
      users,
      userPage,
      userHasMore,
      loadingUsers,
      fetchUsersList,
      invalidateCache,revenew,serRevenew
    ]
  ); //

  return (
    <DashboardAPI.Provider value={value}>{children}</DashboardAPI.Provider> //
  );
};

export const useDashboard = () => { //
  const context = use(DashboardAPI); //
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider"); //
  }
  return context;
};