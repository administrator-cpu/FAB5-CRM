import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";
import Loading from "../Components/Utils/Loading";

const PublicRouter = () => {
  const { user, loading } = useAuth();
  

  if (loading) {
    return <Loading />;
  }

  if (user) {

    return <Navigate to={user.isProfileComplete ? "/dashboard" : "/profile"} replace />
  }

  return <Outlet />;
};

export default PublicRouter;
