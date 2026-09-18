"use client";

import { useState, useEffect } from "react";

interface CdnStats {
  titles: number;
  images: number;
  stored: number;
  warming: number;
  mapped: number;
  adult: number;
  lastSyncAt: number | null;
  loadedAt: number;
}

export default function CdnDashboard() {
  const [stats, setStats] = useState<CdnStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/cdn/v1/stats", { cache: "no-store" });
        if (res.ok) setStats(await res.json());
      } catch {}
      setLoading(false);
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (n: number) => n.toLocaleString("en-US");
  const formatDate = (ts: number | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e5e5e5",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{ maxWidth: 600, width: "100%" }}>
        {/* Header */}
        <header style={{ marginBottom: "2rem", textAlign: "center" }}>
          <h1 style={{
            fontSize: "2rem",
            fontWeight: 700,
            color: "#fff",
          }}>
            LuffyTV CDN
          </h1>
          <p style={{ color: "#555", fontSize: "0.8rem", marginTop: "0.5rem" }}>
            Self-hosted anime metadata & image CDN
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#444" }}>
            Loading...
          </div>
        ) : stats && (
          <>
            {/* Stats grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "1rem",
              marginBottom: "2rem",
            }}>
              <StatCard label="Anime" value={formatNumber(stats.titles)} color="#D4A017" />
              <StatCard label="Images" value={formatNumber(stats.images)} color="#10b981" />
              <StatCard label="Adult" value={formatNumber(stats.adult)} color="#ec4899" />
              <StatCard label="Mapped" value={formatNumber(stats.mapped)} color="#3b82f6" />
            </div>

            {/* Sync info */}
            <div style={{
              padding: "1rem",
              border: "1px solid #1a1a1a",
              borderRadius: "0.5rem",
              background: "#0f0f0f",
              marginBottom: "2rem",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}>
              <div>
                <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Last Sync
                </div>
                <div style={{ fontSize: "0.85rem", marginTop: "0.25rem", color: "#888" }}>
                  {formatDate(stats.lastSyncAt)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Loaded
                </div>
                <div style={{ fontSize: "0.85rem", marginTop: "0.25rem", color: "#888" }}>
                  {formatDate(stats.loadedAt)}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              paddingTop: "1rem",
              borderTop: "1px solid #1a1a1a",
              color: "#333",
              fontSize: "0.7rem",
              textAlign: "center",
            }}>
              LuffyTV CDN · {new Date().getFullYear()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "1.25rem",
      border: "1px solid #1a1a1a",
      borderRadius: "0.5rem",
      background: "#0f0f0f",
      textAlign: "center",
    }}>
      <div style={{ color: "#444", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color, marginTop: "0.5rem" }}>
        {value}
      </div>
    </div>
  );
}
