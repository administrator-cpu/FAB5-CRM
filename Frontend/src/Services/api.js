import axios from "axios";
import { expireSession, hasStoredSession } from "./session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      config.headers.token = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// A 401 from a protected endpoint means the login token expired or is no longer valid: log out.
// Login / sign-up / password-reset answer 401 for wrong details, so they're left to show their own error.
const AUTH_ENDPOINTS = ["/users/login", "/users/register", "/users/request-reset", "/users/verify-reset-otp", "/users/reset-password", "/users/logout"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    if (error.response?.status === 401 && hasStoredSession() && !AUTH_ENDPOINTS.some((path) => url.startsWith(path))) {
      expireSession();
    }
    return Promise.reject(error);
  }
);

export default api;
