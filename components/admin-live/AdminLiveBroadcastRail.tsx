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
  /** 넓게 펼침(화면 절반 이상) / 보통 */
  wide: boolean;
  onToggleWide: () => void;
  broadcastOn: boolean;
  videoRatio: VideoRatio;
  youtubeUrl: string;
  activeBroadcastId: string | null;
  /** 방송 시작/종료가 있는 방송 콘솔로 보내기 */
  onOpenBroadcastConsole: () => void;
};

export default function AdminLiveBroadcastRail({
  open,
  onToggle,
  wide,
  onToggleWide,
  broadcastOn,
  videoRatio,
  youtubeUrl,
  activeBroadcastId,
  onOpenBroadcastConsole,
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
          "fixed right-0 top-1/2 z-[45] -translate-y-1/2 rounded-l-2xl border border-r-0 px-2 py-5 text-[12px] font-black shadow-lg transition",
          broadcastOn ? "border-danger-tx/40 bg-danger-bg text-danger-tx" : "border-line bg-surface text-ink-soft hover:bg-surface-2",
        ].join(" ")}
        style={{ writingMode: "vertical-rl" }}
      >
        {open ? "▶ 접기" : `◀ 방송·채팅${broadcastOn ? " · LIVE" : ""}`}
      </button>

      {/* [2026-09-08 사장님 요청] 옆에 붙는 좁은 칸이 아니라 «화면 2/3 사이드 팝업»으로 시원하게.
          접혀 있어도 마운트는 유지(유튜브 iframe 재로드 방지) — 화면 밖으로 밀어 둔다. */}
      <div
        onClick={onToggle}
        aria-hidden={!open}
        className={[
          "fixed inset-0 z-[44] bg-slate-950/35 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <aside
        aria-label="방송 · 채팅"
        aria-hidden={!open}
        className={[
          "fixed inset-y-0 right-0 z-[46] flex flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-3 shadow-2xl transition-transform duration-300",
          wide ? "w-[66vw] min-w-[560px]" : "w-[420px] min-w-[360px]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="rounded-2xl border border-line bg-surface p-2.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-ink">
              <span className={`inline-block h-2 w-2 rounded-full ${broadcastOn ? "bg-danger-tx" : "bg-line"}`} />
              {broadcastOn ? "방송 중" : "방송 대기"}
            </div>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleWide}
                title={wide ? "보통 크기로" : "화면 절반 이상으로 크게"}
                className="rounded-lg border border-line px-2 py-0.5 text-[11px] font-black text-ink-soft hover:bg-surface-2"
              >
                {wide ? "작게 ◀" : "크게 ▶"}
              </button>
              <button type="button" onClick={onToggle} className="rounded-lg px-2 py-0.5 text-[11px] font-black text-ink-mute hover:bg-surface-2 hover:text-ink">
                접기 ▶
              </button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {/* 방송시작·종료 버튼은 「방송 › 방송 콘솔」 한 곳에만 둔다(중복 제거) */}
            <button
              type="button"
              onClick={onOpenBroadcastConsole}
              className="col-span-2 flex h-9 items-center justify-center gap-1 rounded-xl border border-line bg-surface-2 text-xs font-black text-ink-soft transition hover:bg-surface-3"
            >
              {broadcastOn ? "■ 방송 종료하러 가기" : "▶ 방송 시작하러 가기"}
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

        <div className="min-h-0 flex-1">
          <LiveBroadcastPanels variant="column" hideProducts videoRatio={videoRatio} youtubeUrl={youtubeUrl} activeBroadcastId={activeBroadcastId} />
        </div>
      </aside>
    </>
  );
}
