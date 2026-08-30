"use client";

import { useEffect, useState } from "react";
import { noteTimeText, noteAgoText } from "@/lib/noteTime";

type SiteAlert = { id: number; kind: string; title: string; message: string; created_at: string; expires_at: string };
type BoxItem = SiteAlert & { seen_at?: string | null; dismissed_at?: string | null };
type BoxTab = "all" | "notice" | "mine";
type NoticeItem = { id: number; title: string; content: string; category?: string | null; is_pinned?: boolean | null; created_at: string };

// 쪽지 종류에 맞는 아이콘 — 주문 재촉(🛒)과 사장님 쪽지(📩)를 구분한다.
const iconOf = (kind: string) => (kind === "admin_note" ? "📩" : "🛒");

// 시각 표기는 lib/noteTime.ts 에 두고 테스트(scripts/test-note-time-format.mjs)와 같은 함수를 쓴다.
const timeText = noteTimeText;
const agoText = (iso: string) => noteAgoText(iso);

function sessionKey() {
  try { return localStorage.getItem("ruru_cart_session_key") || ""; } catch { return ""; }
}

// [2026-08-30 근본 수정] 알림을 브라우저가 아니라 "사람"에게 붙인다.
//   장바구니 세션키는 브라우저마다 다르다 — 폰에서 담고 PC로 들어오면 못 받았다.
//   전화번호를 같이 보내서, 기기를 바꿔도 그 손님이면 받게 한다.
function customerPhone() {
  try { return (localStorage.getItem("ruru_customer_phone") || "").replace(/[^0-9]/g, ""); } catch { return ""; }
}

// [2026-08-30 보안] 전화번호만으로는 쪽지를 못 읽게 바뀌었다.
//   본인 확인용으로 카카오 계정(이 프로젝트의 고객 식별 원칙) 또는 유튜브 닉네임을 같이 보낸다.
//   주소창에 남지 않도록 POST 본문으로 보낸다.
function kakaoId() {
  try { return (localStorage.getItem("ruru_kakao_id") || "").trim(); } catch { return ""; }
}
function youtubeNickname() {
  try { return (localStorage.getItem("ruru_youtube_nickname") || "").trim(); } catch { return ""; }
}
async function askAlerts(mode: "alert" | "box") {
  const res = await fetch("/api/customer-site-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ mode, sessionKey: sessionKey(), phone: customerPhone(), kakaoId: kakaoId(), nickname: youtubeNickname() }),
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

export default function CustomerSiteAlertPopup() {
  const [alert, setAlert] = useState<SiteAlert | null>(null);
  // [2026-08-30] 쪽지함 — 팝업을 닫아도 다시 볼 수 있게
  const [boxOpen, setBoxOpen] = useState(false);
  const [box, setBox] = useState<BoxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasAny, setHasAny] = useState(false);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  // [2026-08-30 회귀 복구] 「주문서 공지 문구」(설정 → 주문서 표시). 쪽지함 맨 위에 항상 보인다.
  const [shopGuide, setShopGuide] = useState("");
  // [2026-08-30] 접속 공지 팝업이 떠 있으면 쪽지 팝업은 기다린다(팝업 두 개 겹침 방지).
  const [noticePopupOpen, setNoticePopupOpen] = useState(false);
  // [2026-08-30] 하단 메뉴에 「공지·쪽지」가 있는 화면이면 🔔 버튼은 숨긴다(중복 + 화면 가림).
  const [noticeMenuOn, setNoticeMenuOn] = useState(false);
  // [2026-08-30] 게시판형 쪽지함 — 탭 + 하나만 펼치기
  const [boxTab, setBoxTab] = useState<BoxTab>("all");
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;
    let stopped = false;
    const load = async () => {
      const key = sessionKey();
      const phone = customerPhone();
      if (!key && !phone) return;
      try {
        const json = await askAlerts("alert");
        if (!stopped && json?.ok) setAlert(json.alert || null);
      } catch { /* 개인알림 실패는 주문 흐름에 영향 없음 */ }

      // 쪽지함 개수(안 읽음 배지)도 같이 갱신 — 실패해도 무시
      try {
        const j2 = await askAlerts("box");
        if (!stopped && j2?.ok) {
          const list = Array.isArray(j2.box) ? (j2.box as BoxItem[]) : [];
          const nots = Array.isArray(j2.notices) ? (j2.notices as NoticeItem[]) : [];
          setBox(list);
          setNotices(nots);
          setUnread(Number(j2.unread) || 0);
          const guide = String(j2.shopGuide ?? "").trim();
          setShopGuide(guide);
          // 떠 있는 🔔 버튼은 "받은 것이 있을 때"만 — 상시 안내 때문에 항상 떠 있으면 화면만 가린다.
          setHasAny(list.length > 0 || nots.length > 0);
          // 주문서 하단 메뉴 배지에 반영
          try { window.dispatchEvent(new CustomEvent("ruru-note-unread", { detail: Number(j2.unread) || 0 })); } catch { /* 무시 */ }
        }
      } catch { /* 쪽지함은 보조 기능 */ }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    const onFocus = () => void load();
    // 접속 팝업 공지의 [📬 공지 · 쪽지 전체보기] 에서 열 수 있게
    const onOpenBox = () => { setBoxOpen(true); void load(); };
    // 접속 공지 팝업이 떠 있는지 — 떠 있으면 쪽지 팝업을 미룬다
    const onNoticePopup = (e: Event) => setNoticePopupOpen(Boolean((e as CustomEvent).detail));
    // 하단 메뉴(공지·쪽지)가 떠 있는지 — 떠 있으면 🔔 버튼을 숨긴다
    const onNoticeMenu = (e: Event) => setNoticeMenuOn(Boolean((e as CustomEvent).detail));
    try {
      const w = window as unknown as Record<string, unknown>;
      setNoticePopupOpen(Boolean(w.__ruruNoticePopupOpen));
      setNoticeMenuOn(Boolean(w.__ruruNoticeMenuOn));
    } catch { /* 무시 */ }
    window.addEventListener("focus", onFocus);
    window.addEventListener("ruru-open-notice-box", onOpenBox);
    window.addEventListener("ruru-notice-popup", onNoticePopup as EventListener);
    window.addEventListener("ruru-notice-menu", onNoticeMenu as EventListener);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ruru-open-notice-box", onOpenBox);
      window.removeEventListener("ruru-notice-popup", onNoticePopup as EventListener);
      window.removeEventListener("ruru-notice-menu", onNoticeMenu as EventListener);
    };
  }, []);

  const dismiss = async (goOrder: boolean) => {
    const current = alert;
    setAlert(null);
    if (current) {
      const key = sessionKey();
      const phone = customerPhone();
      if (key || phone) {
        void fetch("/api/customer-site-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: current.id, sessionKey: key, phone, kakaoId: kakaoId(), nickname: youtubeNickname() }),
        }).catch(() => undefined);
      }
    }
    if (goOrder && typeof window !== "undefined" && window.location.pathname !== "/order") window.location.href = "/order";
  };

  // 팝업도 없고 쪽지함도 비었으면 아무것도 그리지 않는다.
  if (!alert && !hasAny) return null;

  return (
    <>
      {/* [2026-08-30] 쪽지함 버튼 — 팝업을 실수로 닫아도 여기서 다시 본다.
          일반 쇼핑몰의 알림함과 같은 자리(오른쪽 아래 떠 있는 버튼). */}
      {hasAny && !alert && !noticePopupOpen && !noticeMenuOn ? (
        <button
          type="button"
          onClick={() => setBoxOpen(true)}
          aria-label={unread > 0 ? `안 읽은 쪽지 ${unread}개` : "쪽지함"}
          className="fixed bottom-5 right-4 z-[480] flex h-12 w-12 items-center justify-center rounded-full bg-[#7B2D43] text-xl shadow-lg active:scale-95"
        >
          🔔
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {/* 쪽지함 목록 */}
      {boxOpen ? (
        <div className="fixed inset-0 z-[490] flex items-end justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setBoxOpen(false); }}>
          <div className="flex max-h-[76vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[26px] bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-[17px] font-black text-slate-950">📬 공지 · 쪽지함</h2>
              <button type="button" onClick={() => setBoxOpen(false)} className="text-lg font-black text-slate-400">✕</button>
            </div>
            {/* [2026-08-30 사장님 지적] 내용이 전부 펼쳐져 있어서 「내 쪽지」가 아래 있는지 몰랐다.
                → 게시판처럼 제목만 보이고, 누르면 펼쳐진다. 탭으로 공지/내 쪽지를 나눈다.
                   안 읽은 쪽지는 처음부터 펼쳐 둔다(놓치면 안 되는 것). */}
            <div className="flex gap-1.5 border-b border-slate-100 px-4 py-2.5">
              {([
                { key: "all", label: "전체", n: unread },
                { key: "notice", label: "공지", n: 0 },
                { key: "mine", label: "내 쪽지", n: unread },
              ] as { key: BoxTab; label: string; n: number }[]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setBoxTab(t.key)}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-black transition ${boxTab === t.key ? "bg-[#7B2D43] text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  {t.label}
                  {t.n > 0 ? (
                    <span className={`ml-1 rounded-full px-1.5 text-[10px] ${boxTab === t.key ? "bg-white/25 text-white" : "bg-red-500 text-white"}`}>{t.n}</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {/* 쇼핑 전 꼭 확인 — 늘 해당되는 안내(사이즈 오차·교환반품 비용). 접어 둔다. */}
              {shopGuide && boxTab !== "mine" ? (
                <button
                  type="button"
                  onClick={() => setOpenKey(openKey === "guide" ? "" : "guide")}
                  className="mb-2 w-full rounded-2xl border border-[#E7D2DA] bg-[#FBF3F6] p-3.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">📌</span>
                    <span className="min-w-0 flex-1 text-[14px] font-black text-slate-900">쇼핑 전 꼭 확인</span>
                    <span className="shrink-0 text-[11px] font-black text-slate-400">{openKey === "guide" ? "접기 ▲" : "펼치기 ▼"}</span>
                  </div>
                  {openKey === "guide" ? (
                    <p className="mt-2 whitespace-pre-line text-[13px] font-bold leading-6 text-slate-700">{shopGuide}</p>
                  ) : (
                    <p className="mt-1 truncate text-[12px] font-bold text-slate-400">{shopGuide.replace(/\s+/g, " ")}</p>
                  )}
                </button>
              ) : null}

              {/* 공지사항 — 제목만. 누르면 펼쳐진다. */}
              {boxTab !== "mine" && notices.length > 0 ? (
                <ul className="mb-2 space-y-2">
                  {notices.map((n) => {
                    const k = `n-${n.id}`;
                    const on = openKey === k;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => setOpenKey(on ? "" : k)}
                          className="w-full rounded-2xl border border-[#E7D2DA] bg-[#FBF3F6] p-3.5 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{n.is_pinned ? "📌" : "📢"}</span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-black text-slate-900">{n.title}</span>
                            {n.is_pinned ? <span className="shrink-0 rounded-full bg-[#7B2D43] px-2 py-0.5 text-[10px] font-black text-white">고정</span> : null}
                            <span className="shrink-0 text-[11px] font-black text-slate-400">{on ? "▲" : "▼"}</span>
                          </div>
                          {on ? (
                            <>
                              <p className="mt-2 whitespace-pre-line text-[13px] font-bold leading-6 text-slate-700">{n.content}</p>
                              <div className="mt-1.5 text-[11px] font-bold text-slate-400">
                                {timeText(n.created_at)}{agoText(n.created_at) ? ` · ${agoText(n.created_at)}` : ""}
                              </div>
                            </>
                          ) : (
                            <p className="mt-1 truncate text-[12px] font-bold text-slate-400">{String(n.content ?? "").replace(/\s+/g, " ")}</p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {/* 내 쪽지 — 안 읽은 것은 펼친 채로 시작한다. */}
              {boxTab !== "notice" ? (
                box.length === 0 ? (
                  boxTab === "mine" ? (
                    <div className="py-12 text-center text-sm font-bold text-slate-400">받은 쪽지가 없어요.</div>
                  ) : null
                ) : (
                  <ul className="space-y-2">
                    {box.map((b) => {
                      const k = `b-${b.id}`;
                      const on = openKey === k || (!openKey && !b.seen_at);
                      return (
                        <li key={k}>
                          <button
                            type="button"
                            onClick={() => setOpenKey(on ? `close-${k}` : k)}
                            className={`w-full rounded-2xl border p-3.5 text-left ${b.seen_at ? "border-slate-100 bg-white" : "border-rose-200 bg-rose-50/60"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">{iconOf(b.kind)}</span>
                              <span className="min-w-0 flex-1 truncate text-[14px] font-black text-slate-900">{b.title}</span>
                              {b.seen_at ? (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-400">읽음</span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">안 읽음</span>
                              )}
                              <span className="shrink-0 text-[11px] font-black text-slate-400">{on ? "▲" : "▼"}</span>
                            </div>
                            {on ? (
                              <>
                                <p className="mt-2 whitespace-pre-line text-[13px] font-bold leading-6 text-slate-600">{b.message}</p>
                                <div className="mt-1.5 text-[11px] font-bold text-slate-400">
                                  받은 날짜 {timeText(b.created_at)}{agoText(b.created_at) ? ` · ${agoText(b.created_at)}` : ""}
                                  {b.seen_at ? <span className="ml-1 text-slate-300">· 읽은 날짜 {timeText(b.seen_at)}</span> : null}
                                </div>
                              </>
                            ) : (
                              <p className="mt-1 truncate text-[12px] font-bold text-slate-400">{String(b.message ?? "").replace(/\s+/g, " ")}</p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}

              {boxTab === "all" && box.length === 0 && notices.length === 0 && !shopGuide ? (
                <div className="py-12 text-center text-sm font-bold text-slate-400">받은 쪽지가 없어요.</div>
              ) : null}
              {boxTab === "notice" && notices.length === 0 && !shopGuide ? (
                <div className="py-12 text-center text-sm font-bold text-slate-400">등록된 공지가 없어요.</div>
              ) : null}
            </div>
            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => { setBoxOpen(false); if (window.location.pathname !== "/order") window.location.href = "/order"; }}
                className="h-12 w-full rounded-2xl bg-[#7B2D43] text-[15px] font-black text-white"
              >주문서로 가기</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 새 쪽지 팝업 — 접속하면 바로, 접속 중에 오면 15초 안에 뜬다.
          단, 접속 공지 팝업이 떠 있으면 기다린다(팝업 두 개가 연달아 뜨지 않게). */}
      {alert && !noticePopupOpen ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 px-5" role="dialog" aria-modal="true" aria-label="쪽지 알림">
          <div className="w-full max-w-[420px] overflow-hidden rounded-[26px] bg-white shadow-2xl">
            <div className="px-6 pb-3 pt-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-3xl">{iconOf(alert.kind)}</div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">{alert.title}</h2>
              <p className="mt-3 whitespace-pre-line text-sm font-bold leading-6 text-slate-600">{alert.message}</p>
            </div>
            <div className="grid gap-2 px-5 pb-5 pt-2">
              <button type="button" onClick={() => void dismiss(true)} className="h-13 rounded-2xl bg-[#7B2D43] text-base font-black text-white shadow-sm">주문 확인하기</button>
              <button type="button" onClick={() => void dismiss(false)} className="h-10 rounded-xl text-xs font-black text-slate-400">확인했어요</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
