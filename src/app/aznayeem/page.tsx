import type { Metadata } from "next";
import AdminApp from "@/components/admin/admin-app";

export const metadata: Metadata = {
  title: "LuffyTV Console",
  robots: { index: false, follow: false },
};

export default function AznayeemRoute() {
  return <AdminApp />;
}
