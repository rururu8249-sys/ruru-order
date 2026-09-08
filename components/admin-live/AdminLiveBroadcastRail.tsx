"use client";

// components/admin-live/AdminLiveBroadcastRail.tsx
// [2026-09-08 5단계 · 레이아웃 B] 오른쪽 접이식 「방송 · 채팅」 레일.
//   · 어느 화면에 있든 방송 화면·라이브 채팅이 옆에 붙어 있다. 손잡이(◀/▶)로 접었다 펼친다.
//   · 방송 시작/종료 · 카톡 · 카드결제 · 알림음(예전 사이드바 「빠른보기」)을 여기로 모았다.
//   · 접혀 있어도 영상·채팅은 마운트 유지(hidden) — 유튜브 iframe 이 다시 로드되지 않게.
//   · 돈/포인트 로직 없음. 방송 시작/종료는 부모 핸들러(확인창 포함) 그대로.

import LiveBroadcastPanels from "./LiveBroadcastPanels";
import AdminSoundControl from "./AdminSoundControl";
import { CONTACT_TYPE_SHORT, adminChatTarget } from "@/lib/shopInfo";
import { useShopInfo } from "@/lib/useShopInfo";
import { showAdminToast } from "@/lib/adminToast";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  open: boolean;
  onToggle: () => void;
  broadcastOn: boolean;
  savingBroadcast: boolean;
  videoRatio: VideoRatio;
  youtubeUrl: string;
  activeBroadcastId: string | null;
  onStartBroadcast: () => void;
  onEndBroadcast: () => void;
};

export default function AdminLiveBroadcastRail({
  open,
  onToggle,
  broadcastOn,
  savingBroadcast,
  videoRatio,
  youtubeUrl,
  activeBroadcastId,
  onStartBroadcast,
  onEndBroadcast,
}: Props) {
  const shopInfo = useShopInfo();
  const chatTarget = adminChatTarget(shopInfo);

  const openKakao = () => {
    if (chatTarget.kind === "id") {
      navigator.clipboard?.writeText(chatTarget.id).catch(() => {});
      showAdminToast(`카카오톡 ID「${chatTarget.id}」를 복사했어요. 카카오톡에서 친구 목록을 확인하세요.`, "success");
      return;
    }
    const aw = window.screen.availWidth || 1600;
    const ah = window.screen.availHeight || 1000;
    const W = Math.min(1700, Math.round(aw * 0.92));
    const H = Math.min(1050, Math.round(ah * 0.92));
    const left = Math.max(0, Math.round((aw - W) / 2));
    const top = Math.max(0, Math.round((ah - H) / 2));
    const w = window.open(chatTarget.url, "ruruKakaoConsult", `popup=yes,width=${W},height=${H},left=${left},top=${top}`);
    if (w) { try { w.resizeTo(W, H); w.moveTo(left, top); w.focus(); } catch { /* 무시 */ } }
  };

  return (
    <>
      {/* 손잡이 — 항상 화면 오른쪽 가장자리 */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "방송·채팅 접기" : "방송·채팅 펼치기"}
        title={open ? "방송·채팅 접기" : "방송·채팅 펼치기"}
        className={[
          "fixed right-0 top-1/2 z-[45] -translate-y-1/2 rounded-l-2xl border border-r-0 px-1.5 py-4 text-[11px] font-black shadow-lg transition",
          broadcastOn ? "border-danger-tx/40 bg-danger-bg text-danger-tx" : "border-line bg-surface text-ink-soft hover:bg-surface-2",
        ].join(" ")}
        style={{ writingMode: "vertical-rl" }}
      >
        {open ? "▶ 접기" : `◀ 방송·채팅${broadcastOn ? " · LIVE" : ""}`}
      </button>

      {/* 레일 본체 — 접히면 display:none (마운트 유지) */}
      <aside
        hidden={!open}
        className="min-w-0 space-y-3 xl:sticky xl:top-3 xl:self-start"
        aria-label="방송 · 채팅"
      >
        <div className="rounded-2xl border border-line bg-surface p-2.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-ink">
              <span className={`inline-block h-2 w-2 rounded-full ${broadcastOn ? "bg-danger-tx" : "bg-line"}`} />
              {broadcastOn ? "방송 중" : "방송 대기"}
            </div>
            <button type="button" onClick={onToggle} className="rounded-lg px-2 py-0.5 text-[11px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink">
              접기 ▶
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={savingBroadcast || broadcastOn}
              onClick={onStartBroadcast}
              className="h-9 rounded-xl bg-emerald-600 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-line disabled:text-ink-mute"
            >
              ▶ 방송시작
            </button>
            <button
              type="button"
              disabled={savingBroadcast || !broadcastOn}
              onClick={onEndBroadcast}
              className="h-9 rounded-xl bg-red-600 text-xs font-black text-white shadow-sm transition hover:bg-red-700 disabled:bg-line disabled:text-ink-mute"
            >
              ■ 방송종료
            </button>
            <button
              type="button"
              onClick={openKakao}
              className="flex h-9 items-center justify-center gap-1 rounded-xl border border-rose-line bg-rose-soft text-xs font-black text-rose-deep transition hover:opacity-90 active:scale-[0.98]"
            >
              💬 {CONTACT_TYPE_SHORT[shopInfo.contactType]}
            </button>
            <button
              type="button"
              onClick={() => window.open(shopInfo.paysterUrl, "ruruPayster", "popup=yes,width=480,height=720")}
              className="flex h-9 items-center justify-center gap-1 rounded-xl border border-line bg-surface-2 text-xs font-black text-ink-soft transition hover:bg-surface-3 active:scale-[0.98]"
            >
              💳 카드결제
            </button>
          </div>
          <div className="mt-2">
            <AdminSoundControl />
          </div>
        </div>

        <LiveBroadcastPanels variant="column" hideProducts videoRatio={videoRatio} youtubeUrl={youtubeUrl} activeBroadcastId={activeBroadcastId} />
      </aside>
    </>
  );
}
