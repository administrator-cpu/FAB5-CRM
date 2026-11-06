import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from "react-router-dom";
import { lazy } from "react";
import App from "../App";
import Dashboard from "../Pages/Dashboard";
import Customer from "../Pages/Customer";
import Auth from "../Pages/Auth";
import PrivateRoute from "./PrivateRoute";
import PublicRouter from "./PublicRouter";

// Pages load on demand so the first screen doesn't wait for every page (charts, forms, exports) to download.
const Home = lazy(() => import("../Pages/Home"));
const CustomerSumDetails = lazy(() => import("../Components/Dashboard/CustomerSumDetails"));
const Login = lazy(() => import("../Components/Auth/Login"));
const Signup = lazy(() => import("../Components/Auth/Signup"));
const Profile = lazy(() => import("../Components/Auth/Profile"));
const OTP = lazy(() => import("../Components/Auth/OTP"));
const ResetPassword = lazy(() => import("../Components/Auth/ResetPassword"));
const PageNotFound = lazy(() => import("../Components/Utils/PageNotFound"));
const AddCustomer = lazy(() => import("../Pages/AddCustomer"));
const CreateConnection = lazy(() => import("../Components/Connection/CreateConnection"));
const ManageOrder = lazy(() => import("../Components/Connection/ManageOrder"));
const HistoryCard = lazy(() => import("../Components/Connection/HistoryCard"));
const Overview = lazy(() => import("../Components/Dashboard/Overview"));
const TeamMate = lazy(() => import("../Components/Dashboard/TeamMate"));
const SupportPage = lazy(() => import("../Pages/SupportPage"));
const EditRegectedConnection = lazy(() => import("../Components/Connection/EditRegectedConnection"));
const BulkConnectionUpload = lazy(() => import("../Components/Connection/BulkConnectionUpload"));
const ReportsDashboard = lazy(() => import("../Pages/ReportsDashboard"));


export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<App />}>
      <Route path="" element={<Home />} />


      <Route element={<PrivateRoute />}>
        <Route path="/report" element={<ReportsDashboard />} />


        <Route path="/customer/:id" element={<Customer />}>
          <Route index element={<CustomerSumDetails />} />
          <Route path="create" element={<CreateConnection />} />
          <Route path="bulk" element={<BulkConnectionUpload />} />
          <Route path="connection/:cid/manage" element={<ManageOrder />} />
          <Route path="connection/:cid/history" element={<HistoryCard />} />
          <Route path="connection/:cid/edit" element={<EditRegectedConnection />} />


        </Route>

        <Route path="/dashboard" element={<Dashboard />}>
          <Route index element={<Overview />} />
        </Route>

        <Route path="/customers/add" element={<Dashboard />}>
          <Route index element={<AddCustomer />} />
        </Route>

        <Route path="/profile" element={<Profile />} />

        <Route path="/employees" element={<Dashboard />}>
          <Route path=":id" element={<TeamMate />} />
        </Route>

      </Route>

      <Route element={<PublicRouter />}>
        <Route path="/auth" element={<Auth />}>
          <Route path="login" element={<Login />} />
          <Route index element={<Signup />} />
          <Route path="verification" element={<OTP />} />
          <Route path="reset" element={<ResetPassword />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
      <Route path="/support" element={<SupportPage />} />
    </Route>,
  ),
);
