"use client";

import React, { useState, useEffect } from "react";
import { Video, Loader2 } from "lucide-react";
import { Card, PanelHeader, StatCard, Badge, Table, EmptyState } from "@/components/admin/admin-ui";
import { Eye, MessageSquare, Bookmark, Star } from "lucide-react";

export default function ContentPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [overviewRes, commentsRes, bookmarksRes] = await Promise.all([
          fetch("/api/admin/overview", { credentials: "include" }),
          fetch("/api/admin/moderation", { credentials: "include" }),
          fetch("/api/analytics/stats?days=14", { credentials: "include" }),
        ]);
        if (overviewRes.ok) {
          const data = await overviewRes.json();
          setStats(data);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  const content = stats?.content || { totalComments: 0, pendingReview: 0, totalViews: 0, collections: 0 };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PanelHeader title="CONTENT" subtitle="Content engagement metrics and breakdown." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Views" value={content.totalViews.toLocaleString()} icon={Eye} color="green" />
        <StatCard label="Comments" value={content.totalComments} icon={MessageSquare} color="blue" />
        <StatCard label="Collections" value={content.collections} icon={Bookmark} color="purple" />
        <StatCard label="Pending Review" value={content.pendingReview} icon={Star} color="yellow" />
      </div>

      <Card>
        <EmptyState icon={Video} message="Detailed content breakdown coming soon" />
      </Card>
    </div>
  );
}
