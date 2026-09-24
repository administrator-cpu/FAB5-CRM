import React from "react";
import { Link } from "react-router-dom";
import { useDashboard } from "../../Context/DashboardContext";

const STATUS = {
  Pending:          { label: "Pending",         color: "#f0a13c" },
  Approved:         { label: "Approved",        color: "#6c5ce7" },
  Generation:       { label: "Implementation",  color: "#3aa0e0" },
  Active:           { label: "Active",          color: "#2fb47c" },
  "Notice Period":  { label: "Notice period",   color: "#e08a4a" },
  Disconnected:     { label: "Churned",         color: "#e2604f" },
};

const AVATAR_TINTS = ["#e8e2fb", "#fdeed9", "#dcecfa", "#daf1e4", "#f9e9e6"];
const tintFor = (s = "") =>
  AVATAR_TINTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TINTS.length];

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const ConnectionsTable = ({ user, selectedConnections, handleSelectConnection }) => {
  const {
    connections, loadingConnections, connHasMore, connPage, connStatusFilter, fetchConnectionsList,
  } = useDashboard();

  const showCheckboxColumn = user?.role === "order_generation" || user?.role === "admin";
  const isStaff = user?.role === "employee" || user?.role === "admin";

  const cols = [
    showCheckboxColumn ? "34px" : null,
    "104px",            // OID
    "minmax(180px,1.4fr)", // Customer
    "minmax(110px,1fr)",   // Service
    "96px",             // Bandwidth
    "minmax(130px,1fr)",   // Status / Created by
    "minmax(110px,1fr)",   // Telco
    "68px",             // Action
  ].filter(Boolean).join(" ");

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50 && !loadingConnections && connHasMore) {
      fetchConnectionsList(connPage + 1, connStatusFilter, true);
    }
  };

  const headStyle = {
    display: "grid",
    gridTemplateColumns: cols,
    alignItems: "center",
    gap: 14,
    position: "sticky",
    top: 0,
    zIndex: 2,
    padding: "0 14px 10px",
    background: "#fbfaff",
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: "#a8a3bb",
  };

  return (
    <div
      onScroll={handleScroll}
      style={{ maxHeight: "80vh", overflowY: "auto", overflowX: "auto", position: "relative" }}
    >
      <div style={{ minWidth: 860 }}>
        <div style={headStyle}>
          {showCheckboxColumn && <span />}
          <span>OID</span>
          <span>Customer</span>
          <span>Service</span>
          <span style={{ textAlign: "right" }}>Bandwidth</span>
          <span>{isStaff ? "Status" : "Created by"}</span>
          <span>Telco</span>
          <span style={{ textAlign: "right" }}>Action</span>
        </div>

        {connections.map((conn) => {
          console.log("Connection:", conn?.isIpAdditionRequest);
          const hasProviderCost = Boolean(
            conn?.providerCost?.ratePerMb && Number(conn?.providerCost?.ratePerMb) > 0
          ) || Boolean(conn?.isIpAdditionRequest)
          const isSelected = selectedConnections.includes(conn._id);
          const meta = STATUS[conn?.status] || { label: conn?.status || "—", color: "#a8a3bb" };
          const name = conn?.customer?.name || "Unknown";

          return (
            <div
              key={conn._id}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                alignItems: "center",
                gap: 14,
                padding: "11px 14px",
                borderRadius: 14,
                background: isSelected ? "#efecfd" : "transparent",
                transition: "background .12s ease",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f5f3fd"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {showCheckboxColumn && (
                <span style={{ display: "flex" }}>
                  {conn?.status === "Approved" && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!hasProviderCost}
                      onChange={() => handleSelectConnection(conn._id, hasProviderCost)}
                      title={hasProviderCost ? "Select connection" : "Cannot select: missing bandwidth"}
                      style={{
                        width: 15, height: 15, accentColor: "#6c5ce7",
                        cursor: hasProviderCost ? "pointer" : "not-allowed",
                        opacity: hasProviderCost ? 1 : .3,
                      }}
                    />
                  )}
                </span>
              )}

              <span
                style={{
                  fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                  fontSize: 12, letterSpacing: "-.02em",
                  color: conn?.opportunityId ? "#5d5578" : "#c4bfd6",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {conn?.opportunityId || "——————"}
              </span>

              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    flex: "0 0 auto", width: 28, height: 28, borderRadius: 10,
                    background: tintFor(name), color: "#4a4262",
                    fontSize: 10.5, fontWeight: 700, letterSpacing: ".02em",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {initials(name)}
                </span>
                <span
                  style={{
                    fontSize: 13.5, fontWeight: 500, color: "#1e1a33",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </span>
              </span>

              <span style={{ fontSize: 13, color: "#6f6890", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {conn?.serviceType || "—"}
              </span>

              <span
                style={{
                  textAlign: "right", fontSize: 13,
                  fontVariantNumeric: "tabular-nums",
                  color: conn?.bandwidth ? "#1e1a33" : "#c4bfd6",
                }}
              >
                {conn?.bandwidth ? `${conn.bandwidth} Mbps` : "—"}
              </span>

              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {isStaff ? (
                  <>
                    <span style={{ flex: "0 0 auto", width: 7, height: 7, borderRadius: 99, background: meta.color }} />
                    <span style={{ fontSize: 13, color: "#3d3557", whiteSpace: "nowrap" }}>{meta.label}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: "#6f6890", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conn?.createdBy?.name || "—"}
                  </span>
                )}
              </span>

              <span style={{ fontSize: 13, color: "#9a92ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {conn?.technicalDetails?.telcoProvider || "—"}
              </span>

              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link
                  to={`/customer/${conn?.customer?._id}/connection/${conn?._id}/history`}
                  style={{
                    height: 28, padding: "0 13px", borderRadius: 9,
                    display: "flex", alignItems: "center",
                    background: "#fff", border: "1px solid #e9e5f6",
                    fontSize: 11.5, fontWeight: 600, color: "#4a3fb0", textDecoration: "none",
                    transition: "background .12s ease, border-color .12s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#efecfd"; e.currentTarget.style.borderColor = "#ded6f7"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e9e5f6"; }}
                >
                  View
                </Link>
              </span>
            </div>
          );
        })}
      </div>

      {loadingConnections && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: 16, fontSize: 12, color: "#9a92ad" }}>
          <span
            style={{
              width: 13, height: 13, borderRadius: 99,
              border: "2px solid #6c5ce733", borderBottomColor: "#6c5ce7",
              animation: "spin .7s linear infinite",
            }}
          />
          Loading more
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default ConnectionsTable;