import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import AdminConfirmHost from "@/components/admin/AdminConfirmHost";
import DeployChunkReloadGuard from "@/components/DeployChunkReloadGuard";
import CustomerAccessBlockGuard from "@/components/customer/CustomerAccessBlockGuard";
import CustomerSiteAlertPopup from "@/components/customer/CustomerSiteAlertPopup";

export const metadata: Metadata = {
  title: "루루동이 집구석LIVE",
  description: "루루동이 주문 시스템",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "루루동이" },
};
export const viewport: Viewport = { themeColor: "#7B2D43" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DeployChunkReloadGuard />
        <CustomerAccessBlockGuard />
        <PresenceHeartbeat />
        {children}
        <CustomerSiteAlertPopup />
        <AdminConfirmHost />
      </body>
    </html>
  );
}
