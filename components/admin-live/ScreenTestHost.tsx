"use client";
// [2026-11-13 사장님 「컴퓨터가 화면까지 테스트」] 화면 테스트 — 관리자 화면이 손님 주문 화면(/order)을 작은 창에 띄워
//   실제 버튼(상품 → 옵션 → 담기 → 주문서 → 결제 → 제출)을 직접 누른다. 사장님 컴퓨터·폰에서 돌아 비용·횟수 제한 없음.
//   - 켜 두면(이 기기 저장) 관리자 화면이 열려 있는 동안 5~10분마다. 「지금 화면 테스트」는 바로 한 번.
//   - 준비(상품·옵션·수량·결제·새 닉네임)와 결과 확인(DB)은 서버(/api/admin-live/auto-test-order)가 함.
//   - 그 브라우저의 손님 로그인 값은 테스트 동안만 테스트 회원으로 바꿨다가 끝나면 그대로 돌려놓음.
//   - 손님 화면 코드는 버튼 표식(data-at)만 붙어 있고 동작은 그대로. 돈·주문 로직 무접촉(주문은 손님 화면이 냄).
import { useCallback, useEffect, useRef, useState } from "react";
import { liveWatchViewKey } from "@/lib/liveWatch";
import { CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION, REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION, YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY } from "@/lib/customer/customerSession";

const LOCK_KEY = "ruru_admin_screen_test_lock";
export const SCREEN_TEST_EVENT = "ruru-screen-test";

type Plan = {
  chatAfter?: string;
  nickname: string; paymentMethod: "무통장입금" | "카드결제"; broadcastId: string;
  lines: Array<{ productId: string; productName: string; color: string; size: string; qty: number; brand: boolean }>;
  identity: { kakaoId: string; phone: string; name: string; zipcode: string; address: string; detailAddress: string };
};

class SkipSignal extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 손님 화면이 쓰는 값만(관리자 화면 값 — 알림 한 번만·미션 등 — 은 안 건드림)
const isCustomerKey = (k: string) => k.startsWith("ruru_") && !k.includes("admin") && !k.startsWith("ruru_alert_once") && k !== "ruru_mission_last";

async function api(body: Record<string, unknown>) {
  const r = await fetch("/api/admin-live/auto-test-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.message || "서버 응답 오류");
  return j;
}

/** 손님 화면 하나를 띄워 주문까지 — 실패하면 어느 단계에서 멈췄는지 글자로 돌려줌 */
async function drive(frame: HTMLIFrameElement, plan: Plan, step: (s: string) => void): Promise<string> {
  const win = () => frame.contentWindow as (Window & typeof globalThis) | null;
  const doc = () => frame.contentDocument;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => doc()?.querySelector<T>(sel) ?? null;
  const qa = (sel: string) => Array.from(doc()?.querySelectorAll<HTMLElement>(sel) ?? []);
  const waitFor = async <T,>(fn: () => T | null | undefined | false, ms: number): Promise<T | null> => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(200); }
    return null;
  };
  const visible = (el: HTMLElement) => el.getClientRects().length > 0;
  const btnByText = (texts: string[]) => qa("button").find((b) => visible(b) && texts.includes((b.textContent || "").trim()));
  const dialogText = () => qa('[role="alertdialog"], [role="dialog"]').filter(visible).map((d) => (d.textContent || "").trim()).filter(Boolean).pop() || "";
  const dismiss = async () => {
    for (let i = 0; i < 5; i += 1) {
      const b = btnByText(["닫기", "확인", "나중에", "24시간 동안 열지 않기", "다시 보지 않기", "알겠어요", "시작하기"]);
      if (!b) return;
      b.click();
      await sleep(400);
    }
  };
  const esc = (v: string) => (win()?.CSS?.escape ? win()!.CSS.escape(v) : v.replace(/"/g, '\\"'));
  const pickOpt = async (kind: "color" | "size", value: string): Promise<boolean> => {
    const buttons = qa(`button[data-at="${kind}"]`).filter(visible);
    const hit = buttons.find((b) => b.getAttribute("data-at-v") === value);
    if (hit) {
      // 하나뿐이면 화면이 이미 골라 둠(다시 누르면 풀림)
      if (buttons.length === 1 && (hit.getAttribute("aria-checked") === "true" || hit.style.border.includes("2px"))) return true;
      if (buttons.length > 1 || hit.getAttribute("aria-checked") !== "true") hit.click();
      await sleep(300);
      return true;
    }
    const sel = q<HTMLSelectElement>(`select[data-at="${kind}-select"]`);
    if (sel && Array.from(sel.options).some((o) => o.value === value)) {
      const W = win();
      const setter = W ? Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value")?.set : undefined;
      if (setter) setter.call(sel, value); else sel.value = value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(300);
      return true;
    }
    return buttons.length === 0 && !sel; // 고를 칸이 없음 = 고를 필요 없음
  };

  step("손님 화면 여는 중");
  const firstCard = await waitFor(() => q('[data-at="card"]'), 40_000);
  if (!firstCard) return `손님 화면에 상품이 안 떴어요${dialogText() ? ` — ${dialogText().slice(0, 80)}` : ""}`;
  await sleep(1200);
  await dismiss();

  for (const [i, line] of plan.lines.entries()) {
    const label = `${line.productName} ${[line.color, line.size].filter((x) => x && x !== "없음").join("/")}`.trim();
    step(`${i + 1}/${plan.lines.length} ${label} 담는 중`);
    const card = await waitFor(() => q(`[data-at="card"][data-at-pid="${esc(line.productId)}"]`), 10_000);
    if (!card) return `상품 카드를 못 찾았어요 — ${label}`;
    card.scrollIntoView({ block: "center" });
    await sleep(300);
    const open = Array.from(card.querySelectorAll<HTMLElement>("button")).find((b) => /담기|상품 선택/.test(b.textContent || "") && !(b as HTMLButtonElement).disabled);
    if (open) open.click(); else card.click();
    const sheet = await waitFor(() => q('[data-at="sheet-add"]') || q('[data-at="detail"]'), 8_000);
    if (!sheet) return `「담기」를 눌러도 옵션 창이 안 열려요 — ${label}`;
    if (line.brand) {
      const d = await waitFor(() => qa('[data-at="detail"]').find((b) => b.getAttribute("data-at-v") === line.productName), 6_000);
      if (!d) return `세부상품을 못 찾았어요 — ${line.productName}`;
      d.scrollIntoView({ block: "center" });
      d.click();
      await sleep(600);
    }
    if (line.color && line.color !== "없음" && !(await pickOpt("color", line.color))) return `색상 「${line.color}」를 못 골랐어요 — ${label}`;
    if (line.size && !(await pickOpt("size", line.size))) return `사이즈 「${line.size}」를 못 골랐어요 — ${label}`;
    const plus = await waitFor(() => q('[data-at="qty-plus"]'), 3_000);
    for (let k = 1; k < line.qty; k += 1) { plus?.click(); await sleep(200); }
    const add = q('[data-at="sheet-add"]');
    if (!add) return `「장바구니 담기」 버튼이 없어요 — ${label}`;
    add.click();
    await sleep(800);
    const dup = btnByText(["그래도 담기"]);
    if (dup) { dup.click(); await sleep(800); }
    if (q('[data-order-option-missing="true"]')) return `옵션을 다 골랐는데 담기가 안 돼요(빠진 칸 있음) — ${label}`;
    // 브랜드 묶음은 연달아 담게 창이 남아 있음 → 닫기
    if (q('[data-at="sheet-add"]') || q('[data-at="detail"]')) {
      const close = qa('[role="dialog"] button[aria-label="닫기"]').filter(visible).pop();
      close?.click();
      await sleep(700);
    }
  }

  step("주문서 여는 중");
  await dismiss();
  const openOrder = await waitFor(() => q('[data-at="open-order"]'), 8_000);
  if (!openOrder) return "장바구니 바(「주문서 확인」)가 안 보여요 — 담기가 안 된 것 같아요";
  openOrder.click();
  const pay = await waitFor(() => q(`[data-at="pay-${plan.paymentMethod}"]`), 8_000);
  if (!pay) return "주문서 창에 결제 방법 버튼이 안 보여요";
  step(`결제 방법 ${plan.paymentMethod === "카드결제" ? "카드" : "무통장"} 고르는 중`);
  pay.scrollIntoView({ block: "center" });
  pay.click();
  await sleep(500);
  const finalBox = q<HTMLInputElement>('[data-final-confirm="true"] input[type="checkbox"]');
  if (finalBox && !finalBox.checked) { finalBox.click(); await sleep(300); }
  const submit = q('[data-at="submit"]');
  if (!submit) return "「주문서 제출」 버튼이 없어요";
  step("주문서 제출 중");
  submit.scrollIntoView({ block: "center" });
  submit.click();
  const consent = await waitFor(() => q<HTMLInputElement>('[data-at="consent-check"]'), 3_000);
  if (consent) {
    if (!consent.checked) consent.click();
    await sleep(300);
    q('[data-at="consent-ok"]')?.click();
  }
  // 제출이 끝날 때까지(버튼 글자가 「제출 중」이 아닐 때까지) 최대 30초
  await sleep(1500);
  await waitFor(() => !/제출 중|구매 조건 확인 중/.test(q('[data-at="submit"]')?.textContent || ""), 30_000);
  await sleep(1500);
  const msg = dialogText();
  return /오류|실패|못|없어요|부족|막혀|확인해 주세요/.test(msg) ? msg.slice(0, 160) : "";
}

export default function ScreenTestHost() {
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [src, setSrc] = useState("");
  const runningRef = useRef(false);

  const runOnce = useCallback(async (scheduled: boolean) => {
    if (runningRef.current) return;
    try {
      const lock = Number(localStorage.getItem(LOCK_KEY) || 0);
      if (lock > Date.now()) return; // 다른 관리자 탭이 하는 중
      localStorage.setItem(LOCK_KEY, String(Date.now() + 150_000));
    } catch { /* 저장소 못 쓰면 그냥 진행 */ }
    runningRef.current = true;
    setRunning(true);
    setStatus("준비 중");
    // 이 브라우저의 손님 값 보관
    const saved: Record<string, string> = {};
    let sessionKey = "", sessionSaved: string | null = null;
    let plan: Plan | null = null;
    let note = "";
    let snap = false;
    let doneMsg = "";
    try {
      const j = await api({ action: "screen-plan", scheduled });
      if (j.skip) { setStatus(String(j.skip)); doneMsg = scheduled ? "" : String(j.skip); throw new SkipSignal(); }
      plan = j.plan as Plan;
      if (plan.chatAfter) { setStatus("채팅 올림 · 잠깐 기다리는 중"); await sleep(8_000 + Math.floor(Math.random() * 12_000)); }
      snap = true;
      for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && isCustomerKey(k)) saved[k] = localStorage.getItem(k) ?? ""; }
      for (const k of Object.keys(saved)) localStorage.removeItem(k);
      const id = plan.identity;
      const set: Record<string, string> = {
        ruru_kakao_id: id.kakaoId, ruru_customer_phone: id.phone, ruru_youtube_nickname: plan.nickname, ruru_customer_name: id.name,
        ruru_customer_zipcode: id.zipcode, ruru_customer_address: id.address, ruru_customer_detail_address: id.detailAddress,
        ruru_howto_done: "1", ruru_popup_notice_seen: String(Date.now()), ruru_privacy_consent_version: "autotest",
        // 없으면 손님 화면이 «옛 로그인»으로 보고 지워 버림(lib/customer/customerSession)
        [CUSTOMER_SESSION_VERSION_KEY]: REQUIRED_CUSTOMER_SESSION_VERSION,
        [YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY]: REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION,
      };
      for (const [k, v] of Object.entries(set)) localStorage.setItem(k, v);
      sessionKey = liveWatchViewKey(plan.broadcastId);
      sessionSaved = sessionStorage.getItem(sessionKey);
      sessionStorage.setItem(sessionKey, "shop");
      setSrc(`/order?autotest=${Date.now()}`);
      const frame = await (async () => { for (let i = 0; i < 50; i += 1) { if (frameRef.current) return frameRef.current; await sleep(100); } return null; })();
      if (!frame) throw new Error("테스트 창을 못 만들었어요");
      await new Promise<void>((resolve) => { const t = setTimeout(resolve, 15_000); frame.addEventListener("load", () => { clearTimeout(t); resolve(); }, { once: true }); });
      try { const w = frame.contentWindow as Window | null; if (w) { w.confirm = () => true; w.alert = () => {}; } } catch { /* 무시 */ }
      note = await drive(frame, plan, setStatus);
    } catch (e) {
      if (!(e instanceof SkipSignal)) note = e instanceof Error ? e.message : "화면 테스트 실패";
    } finally {
      // 손님 값 원래대로(바꾼 적이 있을 때만)
      if (snap) try {
        for (let i = localStorage.length - 1; i >= 0; i -= 1) { const k = localStorage.key(i); if (k && isCustomerKey(k) && !(k in saved)) localStorage.removeItem(k); }
        for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
        if (sessionKey) { if (sessionSaved === null) sessionStorage.removeItem(sessionKey); else sessionStorage.setItem(sessionKey, sessionSaved); }
      } catch { /* 무시 */ }
      setSrc("");
    }
    if (!plan && note) { doneMsg = note; setStatus(note); }
    try {
      if (plan) {
        setStatus("저장 확인 중");
        const j = await api({ action: "screen-verify", plan, note });
        doneMsg = String(j.last?.message || "끝");
        setStatus(doneMsg);
        // 채팅 켜짐: 주문 잘 들어갔으면 잠깐 뒤 같은 닉네임으로 주문 후 한 줄
        if (j.last?.ok && plan.chatAfter) {
          const p = plan;
          window.setTimeout(() => { void api({ action: "chat-after", plan: p }).catch(() => {}); }, 10_000 + Math.floor(Math.random() * 15_000));
        }
      }
    } catch (e) {
      doneMsg = e instanceof Error ? e.message : "확인 실패";
      setStatus(doneMsg);
    } finally {
      window.dispatchEvent(new CustomEvent(SCREEN_TEST_EVENT, { detail: { action: "done", message: doneMsg } }));
      try { localStorage.removeItem(LOCK_KEY); } catch { /* 무시 */ }
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  // 자동 테스트가 켜져 있으면 서버 일정(5~10분)대로 — 관리자 화면이 열려 있는 동안은 이 화면이 맡고, 닫히면 서버가 맡음
  useEffect(() => {
    let stop = false;
    const beat = async () => {
      if (stop || runningRef.current || document.hidden) return;
      try {
        const r = await fetch("/api/admin-live/auto-test-order?host=1", { cache: "no-store" });
        const j = await r.json();
        const st = j?.state;
        if ((st?.enabled || st?.pending) && st.nextRunAt && st.nextRunAt <= Date.now() && !(st.lockUntil > Date.now())) void runOnce(true);
      } catch { /* 다음에 */ }
    };
    void beat();
    const t = window.setInterval(() => void beat(), 30_000);
    const onEvent = (e: Event) => { if ((e as CustomEvent).detail?.action === "run") void runOnce(false); };
    window.addEventListener(SCREEN_TEST_EVENT, onEvent);
    return () => { stop = true; window.clearInterval(t); window.removeEventListener(SCREEN_TEST_EVENT, onEvent); };
  }, [runOnce]);

  if (!running && !src) return null;
  return (
    <div className="fixed bottom-3 left-3 z-[1000] w-[230px] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)]" aria-live="polite">
      <div className="px-3 py-2 text-[12px] font-bold text-ink">화면 테스트 · {status}</div>
      {src ? (
        <div style={{ width: 230, height: 420, overflow: "hidden" }}>
          <iframe ref={frameRef} src={src} title="화면 테스트" style={{ width: 390, height: 712, border: 0, transform: "scale(0.59)", transformOrigin: "0 0", pointerEvents: "none" }} />
        </div>
      ) : null}
    </div>
  );
}
