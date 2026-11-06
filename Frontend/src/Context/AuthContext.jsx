import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import authService from "../Services/authService";
import { handleRequest } from "../Services/handleRequest";
import { consumeExpiredFlag, expireSession, msUntilTokenExpiry } from "../Services/session";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("Customers");
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetToken, setResetToken] = useState(null);
  const [activeTab, setActiveTab] = useState("connections");
  const [statusFilter, setStatusFilter] = useState("all");
  const [status, setStatus] = useState();
  const [registerData, setRegisterData] = useState();
  const isAuthenticated = useMemo(() => !!user, [user]);

  // /users/all is the heaviest call in the app and many actions ask for it at once. Calls made while
  // one is running share it, plus a single follow-up so changes made meanwhile are picked up.
  const dashboardRequest = useRef(null);
  const dashboardRefreshQueued = useRef(false);
  const getDashboardData = useCallback(async () => {
    if (dashboardRequest.current) {
      dashboardRefreshQueued.current = true;
      return dashboardRequest.current;
    }
    const load = async () => {
      try {
        const data = await authService.getAllUsers();
        setAllData(data);
        return data;
      } catch {
        toast.error("Failed to load dashboard data");
        return null;
      }
    };
    dashboardRequest.current = (async () => {
      let data = await load();
      while (dashboardRefreshQueued.current) {
        dashboardRefreshQueued.current = false;
        data = await load();
      }
      dashboardRequest.current = null;
      return data;
    })();
    return dashboardRequest.current;
  }, []);

const fetchUserProfile = useCallback(async () => {
  const cachedUser = sessionStorage.getItem("user_profile");

  if (cachedUser) {
    try {
      const parsedUser = JSON.parse(cachedUser);
      setUser(parsedUser);
      setLoading(false);
      
      getDashboardData();
      const { user: freshProfile } = await authService.getProfile();
      
      sessionStorage.setItem("user_profile", JSON.stringify(freshProfile));
      setUser(freshProfile);
      return; 
    } catch (cacheErr) {
      // console.error("Cache read failed, falling back to network", cacheErr);
    }
  }

  try {
    const { user: freshProfile } = await authService.getProfile();
    sessionStorage.setItem("user_profile", JSON.stringify(freshProfile));
    setUser(freshProfile);
    getDashboardData();
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
  } finally {
    setLoading(false);
  }
}, [getDashboardData]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  // Coming back to the login page after the session expired: say why.
  useEffect(() => {
    if (consumeExpiredFlag()) toast.error("Your session has expired. Please log in again.", { id: "session-expired" });
  }, []);

  // Log out when the login token expires, even if the app is left open without making requests.
  useEffect(() => {
    if (!user) return undefined;
    const ms = msUntilTokenExpiry();
    if (ms === null) return undefined;
    if (ms <= 0) {
      expireSession();
      return undefined;
    }
    const timer = setTimeout(expireSession, Math.min(ms, 2147483647));
    return () => clearTimeout(timer);
  }, [user]);

  const sendRegistrationOtp = useCallback(async (email, password) => {
    return await handleRequest(
      () => authService.sendOtp({ email, password }),
      `OTP sent to ${email}`,
    );
  }, []);

  const verifyOtpAndRegister = useCallback(
    async (email, password, otp, name = null) => {
      const successCallback = (data) => {
        // setAccessToken(data.accessToken);
        setUser(data.user);
      };

      const res = await handleRequest(
        () =>
          authService.verifyOtp({
            email,
            password,
            otp,
            ...(name && { name }),
          }),
        "Account created successfully!",
        successCallback,
      );

      return res ? res.redirect || "/profile" : false;
    },
    [],
  );

  const login = useCallback(
    async (email, password) => {
      const successCallback = (data) => {
        setUser(data.user);
        getDashboardData(); 
      };

      const res = await handleRequest(
        () => authService.login({ email, password }),
        "Welcome back!",
        successCallback,
      );

      return res ? res.redirect || "/dashboard" : false;
    },
    [getDashboardData],
  );

const logout = useCallback(async () => {
  const tid = toast.loading("Logging out...");
  
  try {
    sessionStorage.removeItem("user_profile");
    setUser(null);
    setAllData(null); 
    
    await authService.logout();
    
    toast.success("Logged out successfully", { id: tid });
  } catch (err) {
    console.error("Logout API error:", err);
    toast.success("Logged out", { id: tid }); 
  }
}, []);

  const requestReset = useCallback(async (email) => {
    return await handleRequest(
      () => authService.requestreset(email),
      "If this email exists, an OTP has been sent",
      () => setStatus(1)
    );
  }, []);

  const verifyResetOtp = useCallback(async (e) => {
    const successCallback = (data) => {
      setResetToken(data.resetToken);
      setStatus(4);
    };

    const res = await handleRequest(
      () => authService.verifyResetOtp(e),
      "OTP verified!",
      successCallback,
    );

    return !!res; 
  }, []);

  const resetPassword = useCallback(
    async (password) => {
      const successCallback = () => {
        setResetToken(null);
      };

      const res = await handleRequest(
        () => authService.resetpassword({ resetToken, password }),
        "Password reset successfully! Please log in.",
        successCallback,
      );

      return !!res;
    },
    [resetToken],
  );

  const updateProfile = useCallback(async (profileData) => {
    const successCallback = (data) => {
      setUser(data.user);
    };

    const res = await handleRequest(
      () => authService.updateProfile(profileData),
      "Profile saved!",
      successCallback,
    );

    return res ? res.redirect || "/dashboard" : false;
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      setUser,
      loading,
      allData,
      setAllData,
      resetToken,
      login,
      logout,
      sendRegistrationOtp,
      verifyOtpAndRegister,
      requestReset,
      verifyResetOtp,
      resetPassword,
      updateProfile,
      getDashboardData,
      tab,
      setTab,
      activeTab,
      setActiveTab,
      statusFilter,
      setStatusFilter,
      fetchUserProfile,
      status,
      setStatus,
      registerData,
      setRegisterData,
      isLoggedIn: !!user,
      isProfileComplete: !!user?.isProfileComplete,
      userRole: user?.role ?? null,
    }),
    [
      user,
      loading,
      allData,
      setAllData,
      resetToken,
      login,
      logout,
      sendRegistrationOtp,
      verifyOtpAndRegister,
      requestReset,
      verifyResetOtp,
      resetPassword,
      updateProfile,
      getDashboardData,
      fetchUserProfile,
      tab,
      setTab,
      activeTab,
      setActiveTab,
      statusFilter,
      setStatusFilter,
      status,
      setStatus,
      registerData,
      setRegisterData,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => use(AuthContext);