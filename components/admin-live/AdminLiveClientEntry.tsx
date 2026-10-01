"use client";

import { useEffect, useState } from "react";
import AdminLiveDashboard from "./AdminLiveDashboard";

export default function AdminLiveClientEntry() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // The authenticated dashboard initializes from URL and browser storage.
  // Keep SSR and the first client render identical; initialize that state only
  // after mounting instead of rendering a conflicting default broadcast view.
  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper text-ink">
        <p role="status" className="text-sm font-semibold">관리자 화면을 불러오는 중입니다.</p>
      </main>
    );
  }
  return <AdminLiveDashboard />;
}
