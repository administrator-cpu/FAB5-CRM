import api from "./api";
import axios from "axios";

const plainApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

const authService = {
  sendOtp: async (payload) => {
    const { data } = await api.post("/users/register/send-otp", payload);
    return data;
  },

  verifyOtp: async (payload) => {
    const { data } = await api.post("/users/register/verify", payload);
    localStorage.setItem("token", data?.token);
    return data;
  },

  login: async (credentials) => {
    const { data } = await api.post("/users/login", credentials);
    localStorage.setItem("token", data?.token);
    return data?.user;
  },

  logout: async () => {
    try {
      await api.post("/users/logout");
    } catch (err) {
    } finally {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
  },

  requestreset: async (payload) => {
    const { data } = await api.post("/users/request-reset", payload);
    return data;
  },

  verifyResetOtp: async (payload) => {
    const { data } = await api.post("/users/verify-reset-otp", payload);
    return data;
  },

  resetpassword: async (payload) => {
    const { data } = await api.patch("/users/reset-password", payload);
    return data;
  },

  getProfile: async () => {
    const { data } = await api.get("/users/me");
    return data;
  },

  updateProfile: async (payload) => {
    const { data } = await api.put("/users/me", payload);
    return data;
  },

  //admin

  //users
  getAllUsers: async (page = 1, limit = 25) => {
    const { data } = await api.get(`/users/all?page=${page}&limit=${limit}`);
    return data;
  },
};

export default authService;
