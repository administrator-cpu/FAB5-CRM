import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../Context/AuthContext";
import { Link } from "react-router-dom";
// import AllFilter from "./AllFilter";
import toast from "react-hot-toast";
import { useConnection } from "../../Context/ConnectionContext";
import DashboardData from "../DashboardConections/DashboardData";

const EmployeeDashboard = () => {

  return (
<DashboardData/>
  );
};

export default EmployeeDashboard;
