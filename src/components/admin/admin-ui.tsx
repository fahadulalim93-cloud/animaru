"use client";

import React from "react";
import { useAdmin } from "./admin-layout";

// ── Shared UI primitives ─────────────────────────────────────────────────

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/5 bg-[#111111] p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label, value, icon: Icon, color, delta
}: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; delta?: number | null;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    yellow: "bg-amber-500/10 text-amber-400",
    teal: "bg-teal-500/10 text-teal-400",
    purple: "bg-violet-500/10 text-violet-400",
    red: "bg-red-500/10 text-red-400",
  };
  const cls = colorMap[color] || colorMap.blue;

  return (
    <Card className="flex items-center gap-4">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
      {delta != null && (
        <span className={`text-xs font-semibold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {delta >= 0 ? "+" : ""}{delta}%
        </span>
      )}
    </Card>
  );
}

export function PanelHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: string }) {
  const variants: Record<string, string> = {
    default: "bg-zinc-800 text-zinc-300",
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    danger: "bg-red-500/15 text-red-400",
    info: "bg-blue-500/15 text-blue-400",
    purple: "bg-violet-500/15 text-violet-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
      <Icon className="h-12 w-12 mb-3 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Button({
  children, variant = "default", size = "default", onClick, disabled, className = ""
}: {
  children: React.ReactNode; variant?: string; size?: string;
  onClick?: () => void; disabled?: boolean; className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
    primary: "bg-violet-600 text-white hover:bg-violet-500",
    danger: "bg-red-600/20 text-red-400 hover:bg-red-600/30",
    ghost: "text-zinc-400 hover:text-white hover:bg-white/5",
  };
  const sizes: Record<string, string> = {
    default: "px-4 py-2 text-sm",
    sm: "px-3 py-1.5 text-xs",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant] || variants.default} ${sizes[size] || sizes.default} ${className}`}
    >
      {children}
    </button>
  );
}

export function StatusDot({ status }: { status: "online" | "offline" | "degraded" }) {
  const colors = { online: "bg-emerald-400", offline: "bg-red-400", degraded: "bg-amber-400" };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || colors.offline}`} />;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        {label && <span>{label}</span>}
        <span>{value.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
