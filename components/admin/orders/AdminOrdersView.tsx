"use client";

import type { ReactNode } from "react";

type AdminOrdersViewProps = {
  children: ReactNode;
};

/**
 * 주문관리 화면 전용 wrapper
 *
 * 주의:
 * - 1차 분리 단계에서는 돈/DB/입금매칭/정산 로직을 절대 옮기지 않는다.
 * - app/admin/page.tsx 안의 기존 주문관리 동작을 그대로 유지한 채,
 *   주문관리 화면 영역을 components/admin/orders 쪽으로 분리하기 위한 시작점이다.
 * - 다음 단계에서 필터/표/행/일괄처리/입금매칭 버튼을 순서대로 이 파일 하위 컴포넌트로 이동한다.
 */
export default function AdminOrdersView({ children }: AdminOrdersViewProps) {
  return <div className="grid gap-5">{children}</div>;
}
