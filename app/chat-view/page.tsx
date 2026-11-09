// app/chat-view/page.tsx
// [2026-11-10 07:05 사장님] 갤럭시탭(가로)에 띄워 두는 «채팅만 보는» 화면 — 링크만 누르면 바로(로그인 없음).
//   왼쪽 유튜브 채팅 · 오른쪽 사이트 채팅. 보기 전용(쓰기·관리 없음). 돈·주문 무관.
import type { Metadata } from "next";
import ChatViewClient from "./ChatViewClient";

export const metadata: Metadata = {
  title: "채팅 보기 · 루루동이",
  robots: { index: false, follow: false },
};

export default function ChatViewPage() {
  return <ChatViewClient />;
}
