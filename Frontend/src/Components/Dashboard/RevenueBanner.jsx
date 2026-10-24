import React, { useEffect, useMemo, useState } from "react";
import { useDashboard } from "../../Context/DashboardContext";
import { Link } from "react-router-dom";
import { useCountUp } from "./useCountUp";
import { PER_MB_EXCLUSION_NOTE } from "../ReportsDashboard/drishtiData";

// Used for the loading count-up on a first visit, before any revenue has been seen.
const FIRST_VISIT_PLACEHOLDER = 1e7;

const readCached = (key) => {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

function formatINR(n) {
  if (n === undefined || n === null) return { value: "0", unit: "" };
  if (n >= 1e7) return { value: (n / 1e7).toFixed(2), unit: "Cr" };
  if (n >= 1e5) return { value: (n / 1e5).toFixed(2), unit: "L" };
  if (n >= 1e3) return { value: (n / 1e3).toFixed(1), unit: "K" };
  return { value: String(Math.round(n)), unit: "" };
}

// revenuePerMb: admin-only figure (live MRC ÷ live Mbps); null hides it.
// pending: the revenue request is still in flight (drives the loading count-up).
// storageKey: where the last seen revenue is remembered, so the count-up heads
// toward a realistic figure while loading.
function RevenueBanner({ revenue, revenuePerMb = null, pending = false, storageKey = "fab5.revenueBanner.last" }) {
  const { loadingMetrics } = useDashboard();
  const rows = Array.isArray(revenue?.data) ? revenue.data : [];

  const { total, delta, bars, period } = useMemo(() => {
    const series = rows
      .map((r) => ({ time: r.time, v: Number(r.Global) || 0 }))
      .filter((r) => r.v > 0);

    if (!series.length) return { total: null, delta: null, bars: [], period: "" };

    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const window = series.slice(-12);
    const max = Math.max(...window.map((r) => r.v)) || 1;


    return {
      total: last.v,
      delta: prev ? ((last.v - prev.v) / prev.v) * 100 : null,
      bars: window.map((r) => ({ ...r, h: Math.max(0.12, r.v / max) })),
      period: last.time,
    };
  }, [rows]);

  const waiting = loadingMetrics || pending;
  const noData = !waiting && total === null;
  const negative = delta !== null && delta < 0;

  const [cached] = useState(() => readCached(storageKey));
  useEffect(() => {
    if (waiting || total === null) return;
    try {
      window.localStorage.setItem(storageKey, String(total));
    } catch { /* storage unavailable: count-up just uses the first-visit placeholder */ }
  }, [waiting, total, storageKey]);

  const animatedTotal = useCountUp(waiting ? null : total, {
    pending: waiting,
    placeholder: cached || FIRST_VISIT_PLACEHOLDER,
  });
  const animatedRpm = useCountUp(revenuePerMb);
  const { value, unit } = formatINR(animatedTotal);


  return (
    <section
      style={{
        position: "relative",
        flex: "0 0 auto",
        flexShrink: 0,
        minHeight: 104,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "20px 26px",
        borderRadius: 18,
        background: "linear-gradient(180deg,#1c1f26 0%,#101318 100%)",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg,#f0793c 0%,#f0a13c 22%,#6c5ce7 62%,#3aa0e0 100%)",
          opacity: .9,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 28, minWidth: 0, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9aa1ad", letterSpacing: ".01em" }}>
            Revenue
          </span>
          {delta !== null && (
            <span
              style={{
                padding: "3px 9px",
                borderRadius: 99,
                background: "#ffffff",
                fontSize: 11.5,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: negative ? "#ff2706" : "#03b733",
              }}
            //   className="bg-[#03b733]"
            >
             <Link to={"/report"}>{negative ? "" : "+"}{delta.toFixed(1)}% View More in Drishti</Link> 
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "baseline",
            gap: 2,
            opacity: waiting ? 0.55 : 1,
            transition: "opacity .4s ease",
          }}
          aria-busy={waiting}
        >
          <span
            style={{
              fontSize: 40,
              fontWeight: 650,
              lineHeight: 1,
              letterSpacing: "-.02em",
              color: "#fff",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {noData ? "—" : `₹${value}`}
          </span>
          {!noData && unit && (
            <span style={{ marginLeft: 6, fontSize: 15, fontWeight: 600, letterSpacing: ".06em", color: "#8b929e" }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {revenuePerMb !== null && (
        <div style={{ minWidth: 0, paddingLeft: 28, borderLeft: "1px solid #ffffff1a" }} title={PER_MB_EXCLUSION_NOTE}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9aa1ad", letterSpacing: ".01em", whiteSpace: "nowrap" }}>
            Avg Revenue per Mbps
          </span>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 2, whiteSpace: "nowrap" }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 650,
                lineHeight: 1,
                letterSpacing: "-.02em",
                color: "#fff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ₹{Math.round(animatedRpm).toLocaleString("en-IN")}
            </span>
            <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 600, color: "#8b929e" }}>/ Mbps</span>
          </div>
        </div>
      )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 40 }}>
          {bars.map((b, i) => {
            const last = i === bars.length - 1;
            return (
              <span
                key={b.time}
                title={`${b.time} · ₹${formatINR(b.v).value}${formatINR(b.v).unit}`}
                style={{
                  display: "block",
                  width: 6,
                  height: `${b.h * 100}%`,
                  borderRadius: 99,
                  background: last ? "#f0793c" : "#ffffff1f",
                }}
              />
            );
          })}
        </div>
        <span style={{ fontSize: 11.5, color: "#6f7681", paddingBottom: 2 }}>
          {period || "live"}
        </span>
      </div>
    </section>
  );
}

export default RevenueBanner;