// app/admin-v2/page.tsx
// admin-v2 진입 페이지
// 리팩토링 1단계 오류수정: AdminV2Client named export 방식으로 고정.

import { AdminV2Client } from "@/components/admin-v2/AdminV2Client";

export default function AdminV2Page() {
  return <AdminV2Client />;
}
