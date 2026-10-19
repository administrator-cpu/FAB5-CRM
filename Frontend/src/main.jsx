import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./Routes/Routes.jsx";
import { AuthProvider } from "./Context/AuthContext";
import { CustomerProvider } from "./Context/CustomerContext";
import { ConnectionProvider } from "./Context/ConnectionContext";
import { DashboardProvider } from "./Context/DashboardContext.jsx";

// After a deploy, an open tab may request a lazily-loaded chunk that no longer
// exists. Reload once to pick up the new build instead of showing a broken page.
window.addEventListener("vite:preloadError", (event) => {
  const key = "chunk-reload-at";
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 10000) {
    event.preventDefault();
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <CustomerProvider>
      <ConnectionProvider>
        <DashboardProvider>
          <RouterProvider router={router} />
        </DashboardProvider>
      </ConnectionProvider>
    </CustomerProvider>
  </AuthProvider>
);
