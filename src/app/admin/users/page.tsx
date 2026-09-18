"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Users, Search, Ban, ShieldCheck, ShieldAlert, Unlock, UserMinus, UserPlus, Loader2, RefreshCw } from "lucide-react";
import { useAdmin } from "@/components/admin/admin-layout";
import { Card, PanelHeader, Badge, Button, Table, EmptyState } from "@/components/admin/admin-ui";

interface Member {
  id: string; username: string; name: string; email: string;
  createdAt: string; lastSeen: number; status: string;
  reason: string | null; until: number | null; role: string;
}

export default function UsersPage() {
  const { user: adminUser } = useAdmin();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/moderation", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const doAction = async (username: string, action: string, reason?: string) => {
    setActing(username);
    try {
      await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, action, reason }),
      });
      await fetchMembers();
    } catch {} finally { setActing(null); }
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return m.username.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const statusBadge = (status: string) => {
    if (status === "banned") return <Badge variant="danger">Banned</Badge>;
    if (status === "suspended") return <Badge variant="warning">Suspended</Badge>;
    return <Badge variant="success">Active</Badge>;
  };

  const roleBadge = (role: string) => {
    if (role === "mod") return <Badge variant="purple">Mod</Badge>;
    return <Badge variant="default">Member</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader
        title="USERS CONTROL"
        subtitle={`${members.length} registered members. Manage roles, bans, and suspensions.`}
        action={
          <Button onClick={() => { setLoading(true); fetchMembers(); }} variant="ghost" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, name, or email..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#111] border border-white/10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        />
      </div>

      {/* Users table */}
      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} message="No users found" />
        ) : (
          <Table
            headers={["User", "Status", "Role", "Joined", "Actions"]}
            rows={filtered.map((m) => [
              <div key="user" className="min-w-0">
                <p className="font-medium text-sm truncate">{m.name || m.username}</p>
                <p className="text-xs text-zinc-500">{m.username}</p>
              </div>,
              <div key="status">{statusBadge(m.status)}</div>,
              <div key="role">{roleBadge(m.role)}</div>,
              <div key="joined" className="text-xs text-zinc-500">{new Date(m.createdAt).toLocaleDateString()}</div>,
              <div key="actions" className="flex items-center gap-1">
                {m.status === "active" ? (
                  <>
                    <button onClick={() => doAction(m.username, "suspend")} disabled={acting === m.username} className="p-1.5 rounded hover:bg-amber-500/10 text-amber-400 disabled:opacity-50" title="Suspend">
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => doAction(m.username, "ban")} disabled={acting === m.username} className="p-1.5 rounded hover:bg-red-500/10 text-red-400 disabled:opacity-50" title="Ban">
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => doAction(m.username, m.status === "banned" ? "unban" : "unsuspend")} disabled={acting === m.username} className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-400 disabled:opacity-50" title={m.status === "banned" ? "Unban" : "Unsuspend"}>
                      <Unlock className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {m.role === "member" ? (
                  <button onClick={() => doAction(m.username, "promote")} disabled={acting === m.username} className="p-1.5 rounded hover:bg-violet-500/10 text-violet-400 disabled:opacity-50" title="Promote to Mod">
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button onClick={() => doAction(m.username, "demote")} disabled={acting === m.username} className="p-1.5 rounded hover:bg-zinc-500/10 text-zinc-400 disabled:opacity-50" title="Demote">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>,
            ])}
          />
        )}
      </Card>
    </div>
  );
}
