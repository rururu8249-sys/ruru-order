"use client";

// [2026-11-26 리뉴얼 — 사장님 「AI 비서는 그냥 AI 메모장처럼만」] 창 = 메모장 하나.
//   막 적고 저장 → AI 가 할 일·손님·상품으로 정리(기존 메모함 그대로). 대화·응대 방침 탭은 화면에서 뺐다(파일·서버는 보존).
//   메모의 「손님 ○○ 찾기」 → 실시간 주문서 검색칸에 그 이름을 넣는다.

import AdminLiveSideDrawer from "./AdminLiveSideDrawer";
import AdminLiveAssistantMemoBox from "./AdminLiveAssistantMemoBox";

export default function AdminLiveAssistantDrawer({
  onClose,
  onShowInOrders,
}: {
  onClose: () => void;
  /** 「주문서에서 보기」 — 실시간 주문서 검색칸에 이 글자를 넣고 기간 전체로 */
  onShowInOrders: (keyword: string) => void;
}) {
  return (
    <AdminLiveSideDrawer title="AI 메모장" width={560} onClose={onClose}>
      <div className="p-4">
        <AdminLiveAssistantMemoBox onFindCustomer={(who) => { onShowInOrders(who); onClose(); }} />
      </div>
    </AdminLiveSideDrawer>
  );
}
