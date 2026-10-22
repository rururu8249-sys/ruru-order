"use client";

// [2026-10-22 AI 비서 8단계] 대화창 하나 — 사장님이 아무 말이나 하면 AI 가 스스로 손님 찾기·매출 집계·메모·응대 문구·유튜브 SEO 를 골라 답한다.
//   서버(/api/admin-live/assistant-chat)는 읽기만. 저장·등록은 아래 카드의 버튼을 사장님이 눌러야만 기존 API 로 간다:
//     메모 저장 → POST /api/admin-live/assistant-memos(메모함과 같은 경로) · 고객이슈 등록 → POST /api/admin-v2/admin-tasks(메모함 제안 카드와 같은 몸체)
//     답장·SEO 는 「복사」만. 돈·입금·정산·주문상태는 이 창에서 못 바꾼다.
//   사진(캡처)은 응대 문구와 같은 준비(assistantImagePrep: 줄이고 → 글자 읽어 전화·계좌·주소 검게 → JPEG)로 보낸다.
//   DESIGN-ADMIN: 주버튼 1개(「보내기」 검정) · 보조 36 · 이모지 없음 · 설명 한 줄.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { MAX_IMAGES, prepareImage, type PreparedImage } from "./assistantImagePrep";

export type ChatRange = "today" | "last_7_days" | "last_30_days" | "custom";
// [10/22 사장님] 기간 = 오늘·일주일·최근 30일·기간 선택 4개만(말로 한 기간이 우선)
export const CHAT_RANGE_OPTIONS: [ChatRange, string][] = [["today", "오늘"], ["last_7_days", "일주일"], ["last_30_days", "최근 30일"], ["custom", "기간 선택"]];

type OrderCard = { orderNo: string; createdAt: string | null; summary: string; amount: number; paymentLabel: string; paymentCode: string; shippingLabel: string; paymentMethod: string };
type Person = { key: string; nickname: string; name: string; phone: string; blocked: boolean; match: string; lastOrderAt: string | null; orderCount: number; orders: OrderCard[] };
type ProductHit = { id: number; name: string; detail: string; price: number; createdAt: string | null; hidden: boolean; photo: string | null; match: string };
type Buyer = { orderNo: string; createdAt: string | null; nickname: string; name: string; productName: string; option: string; qty: number; paymentLabel: string; paymentCode: string; shippingLabel: string };
type Card =
  | { kind: "customers"; people: Person[] }
  | { kind: "products"; products: ProductHit[]; buyers: Buyer[] }
  | { kind: "memo"; text: string }
  | { kind: "issue"; issueType: "exchange" | "refund" | "return" | "general"; nickname: string; name: string; orderNo: string; memo: string }
  | { kind: "reply"; category: string; summary: string; analysis: string; cautions: string; ownerCheck: string; drafts: { label: string; text: string }[] }
  | { kind: "seo"; broadcastId: string; titles: string[]; description: string; tags: string[]; pinnedComment?: string };

type Img = PreparedImage & { key: string; name: string };
type Msg = { id: string; role: "user" | "assistant"; text: string; images?: Img[]; cards?: Card[]; failed?: boolean };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const nowY = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  return `${k.getUTCFullYear() === nowY ? "" : `${k.getUTCFullYear()}.`}${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")}(${WEEK[k.getUTCDay()]})`;
}
const won = (n: number) => `${(Number(n) || 0).toLocaleString("ko-KR")}원`;
const ISSUE_LABEL: Record<string, string> = { exchange: "교환", refund: "환불", return: "반품", general: "기타" };

function tone(code: string): string {
  if (code === "canceled") return "bg-surface-2 text-ink-soft";
  if (code === "paid" || code === "auto_paid" || code === "manual_paid" || code === "card_paid") return "bg-ok-bg text-ok-tx";
  return "bg-warn-bg text-warn-tx";
}
function Badges({ paymentLabel, paymentCode, shippingLabel }: { paymentLabel: string; paymentCode: string; shippingLabel: string }) {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {paymentLabel ? <span className={`inline-flex h-6 items-center rounded-lg px-2 text-[12px] font-semibold ${tone(paymentCode)}`}>{paymentLabel}</span> : null}
      {shippingLabel ? <span className={`inline-flex h-6 items-center rounded-lg px-2 text-[12px] font-semibold ${shippingLabel === "택배출고" ? "bg-ink text-white" : "bg-surface-2 text-ink-soft"}`}>{shippingLabel}</span> : null}
    </span>
  );
}

// 대화는 창을 닫았다 열어도 남게 모듈 메모리에 둔다(브라우저 저장소 아님 — 새로고침하면 비워짐). 「화면 지우기」로만 비움.
const chatStore: { messages: Msg[]; done: Record<string, string> } = { messages: [], done: {} };

const SUB = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-40";
const MAIN = "h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40";

export default function AdminLiveAssistantChatBox({ onShowInOrders, ask }: { onShowInOrders: (keyword: string) => void; ask?: { n: number; text: string } | null }) {
  const [messages, setMessagesState] = useState<Msg[]>(() => chatStore.messages);
  const setMessages = (next: Msg[] | ((prev: Msg[]) => Msg[])) =>
    setMessagesState((prev) => { const v = typeof next === "function" ? next(prev) : next; chatStore.messages = v; return v; });
  const [zoom, setZoom] = useState<Img | null>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [range, setRange] = useState<ChatRange>("last_30_days");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState("");
  const [caseEdit, setCaseEdit] = useState<{ key: string; reply: string; reason: string } | null>(null); // 「사례로 저장」 입력 중인 카드
  const [done, setDoneState] = useState<Record<string, string>>(() => chatStore.done); // 카드 버튼 결과 메시지
  const setDone = (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) =>
    setDoneState((prev) => { const v = typeof next === "function" ? next(prev) : next; chatStore.done = v; return v; });
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, busy]);

  async function addFiles(files: FileList | File[] | null | undefined) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setError("");
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setError(`사진은 한 번에 ${MAX_IMAGES}장까지예요.`); return; }
    for (const file of list.slice(0, room)) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setImages((prev) => [...prev, { key, name: file.name, mimeType: "", data: "", preview: "", masked: 0, status: "ocr" }]);
      try {
        const prepared = await prepareImage(file, () => {});
        setImages((prev) => prev.map((im) => (im.key === key ? { ...im, ...prepared } : im)));
      } catch (e) {
        setImages((prev) => prev.filter((im) => im.key !== key));
        setError(e instanceof Error ? e.message : "사진을 열 수 없어요.");
      }
    }
  }
  function onDrop(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer?.files); }
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); void addFiles(files); }
  }

  function send() { return sendText(text); }

  async function sendText(raw: string) {
    const q = raw.trim();
    const ready = images.filter((im) => im.status !== "ocr" && im.data);
    if ((!q && ready.length === 0) || busy) return;
    if (images.some((im) => im.status === "ocr")) { setError("사진 속 개인정보를 가리는 중이에요. 잠깐만요."); return; }
    setBusy(true);
    setError("");
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q, images: ready };
    const next = [...messages, userMsg];
    setMessages(next);
    setText("");
    setImages([]);
    try {
      const payload = next.slice(-14).map((m) => ({ role: m.role, text: m.text, images: m.role === "user" && m.images?.length ? m.images.map((im) => ({ mimeType: im.mimeType, data: im.data })) : undefined }));
      const res = await fetch("/api/admin-live/assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload, range, from: range === "custom" ? rangeFrom : undefined, to: range === "custom" ? rangeTo : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.message || "답을 못 받았어요. 잠시 뒤 다시 보내 주세요."); return; }
      setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: "assistant", text: String(data.answer || ""), cards: Array.isArray(data.cards) ? data.cards : [], failed: !!data.failed }]);
    } catch {
      setError("연결이 끊겼어요. 잠시 뒤 다시 보내 주세요.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // 메모함 「손님 ○○ 찾기」 → 그 말을 바로 보냄
  const askSeen = useRef(0);
  useEffect(() => {
    if (!ask || ask.n === askSeen.current) return;
    askSeen.current = ask.n;
    void sendText(ask.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  async function copy(key: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { setError("복사하지 못했어요. 글자를 길게 눌러 복사해 주세요."); }
  }

  // 메모 저장 — 메모함 「저장」과 같은 API
  async function saveMemo(key: string, memoText: string) {
    setDone((d) => ({ ...d, [key]: "저장 중…" }));
    const res = await fetch("/api/admin-live/assistant-memos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: memoText }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setDone((d) => ({ ...d, [key]: res?.ok && data?.ok ? "메모함에 저장했어요." : `저장 못 했어요. ${data?.message || ""}`.trim() }));
  }
  // 고객이슈 등록 — 메모함 제안 카드(AdminLiveAssistantMemoBox.registerIssue)와 같은 몸체(포인트 무접촉)
  async function registerIssue(key: string, c: Extract<Card, { kind: "issue" }>) {
    setDone((d) => ({ ...d, [key]: "등록 중…" }));
    const res = await fetch("/api/admin-v2/admin-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_type: c.issueType,
        title: `[고객이슈] ${c.nickname || "수동메모"}`,
        body: c.orderNo ? `${c.memo}\n주문번호: ${c.orderNo}` : c.memo,
        customer_name: c.name || "",
        customer_nickname: c.nickname,
        priority: "normal",
        source: "admin-live-assistant",
        raw_payload: { nickname: c.nickname, name: c.name || "", phone: "", issue_types: [c.issueType], memo: c.memo, order_no: c.orderNo || "", source: "admin-live-assistant" },
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setDone((d) => ({ ...d, [key]: res?.ok && data?.ok ? "고객이슈에 등록했어요. 고객 › 고객이슈에서 확인할 수 있어요." : `등록 못 했어요. ${data?.message || "고객 › 고객이슈에서 직접 등록해 주세요."}`.trim() }));
  }

  const REVISE_CHIPS = ["좀 더 부드럽게", "짧고 단호하게", "사과는 빼고", "원칙대로 처리한다고 강조", "비용 할인 방향으로"];
  const REVISE_RE = /^방금 답장을|다시 써|부드럽게|단호하게|사과는 빼|짧게|길게|강조/;
  // 「사례로 저장」 — 손님 말(그 카드 바로 앞 사장님 입력, 가린 그대로)·상황(분석)·최종 문구·이유 → /api/admin-live/assistant-cases(kind=case). 돈 무접촉
  function customerTextBefore(key: string): string {
    const msgId = key.replace(/-\d+$/, "");
    const idx = messages.findIndex((m) => m.id === msgId);
    for (let i = (idx < 0 ? messages.length : idx) - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role !== "user" || (!m.text.trim() && !m.images?.length)) continue;
      if (REVISE_RE.test(m.text) && !m.images?.length) continue; // 「좀 더 부드럽게」 같은 수정 지시는 손님 말이 아님 → 더 앞으로
      return m.text.trim() || `(캡처 ${m.images?.length}장 — 글자 없음)`;
    }
    return "";
  }
  async function saveCase(key: string, c: Extract<Card, { kind: "reply" }>, reply: string, reason: string) {
    setDone((d) => ({ ...d, [key]: "저장 중…" }));
    const res = await fetch("/api/admin-live/assistant-cases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: c.category, customer: customerTextBefore(key), situation: [c.summary, c.analysis].filter(Boolean).join("\n"), reply, reason }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setDone((d) => ({ ...d, [key]: res?.ok && data?.ok ? "응대 사례로 저장했어요. 다음 비슷한 문의 때 AI 가 참고해요." : `저장 못 했어요. ${data?.message || ""}`.trim() }));
    if (res?.ok && data?.ok) setCaseEdit(null);
  }

  function renderCard(c: Card, key: string) {
    const note = done[key];
    const finished = !!note && !/중…$/.test(note) && !/못 했어요/.test(note);
    if (c.kind === "customers") {
      return (
        <div key={key} className="space-y-2">
          {c.people.map((p) => (
            <article key={p.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-bold text-ink">{p.nickname}</span>
                    {p.name ? <span className="text-[13px] text-ink-soft">{p.name}</span> : null}
                    <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{p.match}</span>
                    {p.blocked ? <span className="inline-flex h-6 items-center rounded-lg bg-danger-bg px-2 text-[12px] font-semibold text-danger-tx">차단</span> : null}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-mute tabular-nums">{[p.phone, p.lastOrderAt ? `마지막 주문 ${dateLabel(p.lastOrderAt)} · 주문 ${p.orderCount}건` : "이 기간 주문 없음"].filter(Boolean).join(" · ")}</div>
                </div>
                <button type="button" onClick={() => onShowInOrders(p.nickname !== "-" ? p.nickname : p.name)} className={`${SUB} shrink-0`}>주문서에서 보기</button>
              </div>
              {p.orders.length > 0 ? (
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {p.orders.map((o) => (
                    <li key={o.orderNo} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 py-2">
                      <span className="text-[12px] text-ink-mute tabular-nums">{dateLabel(o.createdAt)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink" title={o.summary}>{o.summary}</span>
                        <span className="block text-[12px] text-ink-mute tabular-nums">{won(o.amount)} · {o.paymentMethod} · {o.orderNo}</span>
                      </span>
                      <Badges paymentLabel={o.paymentLabel} paymentCode={o.paymentCode} shippingLabel={o.shippingLabel} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      );
    }
    if (c.kind === "products") {
      return (
        <div key={key} className="space-y-2">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {c.products.map((p) => (
              <li key={p.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 p-2.5">
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo} alt="" className="h-12 w-12 rounded-lg bg-surface-2 object-cover" loading="lazy" />
                ) : <span className="h-12 w-12 rounded-lg bg-surface-2" aria-hidden />}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{p.name}</span>
                  {p.detail ? <span className="block truncate text-[12px] text-ink-soft">{p.detail}</span> : null}
                  <span className="block text-[12px] text-ink-mute tabular-nums">{won(p.price)} · 등록 {dateLabel(p.createdAt)}{p.hidden ? " · 숨김" : ""}</span>
                </span>
                <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{p.match}</span>
              </li>
            ))}
          </ul>
          {c.buyers.length > 0 ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {c.buyers.map((b, i) => (
                <li key={`${b.orderNo}-${i}`} className="grid grid-cols-[72px_1fr_40px_auto] items-center gap-2 px-2.5 py-2">
                  <span className="text-[12px] text-ink-mute tabular-nums">{dateLabel(b.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{b.nickname}{b.name && b.name !== b.nickname ? <span className="font-normal text-ink-soft"> · {b.name}</span> : null}</span>
                    <span className="block truncate text-[12px] text-ink-mute">{b.productName}{b.option ? ` · ${b.option}` : ""}</span>
                  </span>
                  <span className="text-right text-[13px] text-ink tabular-nums">{b.qty}개</span>
                  <Badges paymentLabel={b.paymentLabel} paymentCode={b.paymentCode} shippingLabel={b.shippingLabel} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
    if (c.kind === "memo") {
      return (
        <article key={key} className="rounded-xl border border-line bg-surface p-3">
          <h4 className="text-[13px] font-bold text-ink-soft">메모 저장 제안</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-ink">{c.text}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={MAIN} disabled={finished || note === "저장 중…"} onClick={() => void saveMemo(key, c.text)}>{finished ? "저장됨" : "메모함에 저장"}</button>
            {note ? <span className="text-[13px] text-ink-soft">{note}</span> : null}
          </div>
        </article>
      );
    }
    if (c.kind === "issue") {
      return (
        <article key={key} className="rounded-xl border border-line bg-surface p-3">
          <h4 className="text-[13px] font-bold text-ink-soft">고객이슈 등록 제안</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{ISSUE_LABEL[c.issueType]}</span>
            <span className="text-[14px] font-bold text-ink">{c.nickname}</span>
            {c.name ? <span className="text-[13px] text-ink-soft">{c.name}</span> : null}
            {c.orderNo ? <span className="text-[12px] text-ink-mute tabular-nums">{c.orderNo}</span> : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-ink">{c.memo}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={MAIN} disabled={finished || note === "등록 중…"} onClick={() => void registerIssue(key, c)}>{finished ? "등록됨" : "고객이슈 등록"}</button>
            {note ? <span className="text-[13px] text-ink-soft">{note}</span> : null}
          </div>
        </article>
      );
    }
    if (c.kind === "reply") {
      const editing = caseEdit?.key === key ? caseEdit : null;
      return (
        <div key={key} className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {c.category ? <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{c.category}</span> : null}
            {c.ownerCheck ? <span className="inline-flex h-6 items-center rounded-lg bg-warn-bg px-2 text-[12px] font-semibold text-warn-tx" title={c.ownerCheck}>사장님 결정 필요</span> : <span className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-mute">방침으로 바로 답 가능</span>}
            {c.summary ? <span className="text-[13px] text-ink-soft">{c.summary}</span> : null}
          </div>
          {c.analysis || c.cautions || c.ownerCheck ? (
            <article className="rounded-xl bg-surface-2 p-3">
              <h4 className="text-[13px] font-bold text-ink-soft">상황 분석 · 추천 대응</h4>
              {c.analysis ? <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{c.analysis}</p> : null}
              {c.ownerCheck ? <p className="mt-1.5 text-[13px] text-warn-tx"><span className="font-semibold">사장님이 정할 것</span> · {c.ownerCheck}</p> : null}
              {c.cautions ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-ink-soft"><span className="font-semibold text-ink">주의·확인</span> · {c.cautions}</p> : null}
            </article>
          ) : null}
          {c.drafts.map((d, i) => (
            <article key={i} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-bold text-ink-soft">{c.drafts.length > 1 ? d.label : "손님에게 보낼 답장"}</h4>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" className={SUB} disabled={!!editing} onClick={() => setCaseEdit({ key, reply: d.text, reason: "" })}>사례로 저장</button>
                  <button type="button" className={MAIN} onClick={() => void copy(`${key}-${i}`, d.text)}>{copied === `${key}-${i}` ? "복사됨" : "복사"}</button>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink">{d.text}</p>
            </article>
          ))}
          {editing ? (
            <article className="rounded-xl border border-line bg-surface p-3">
              <h4 className="text-[13px] font-bold text-ink-soft">응대 사례로 저장</h4>
              <p className="mt-0.5 text-[12px] text-ink-mute">실제로 보낸 문구로 고쳐서 저장하세요. 전화·계좌 번호는 자동으로 가려요. 다음 비슷한 문의 때 AI 가 참고해요.</p>
              <textarea value={editing.reply} onChange={(e) => setCaseEdit({ ...editing, reply: e.target.value })} rows={4} aria-label="실제로 보낸 답장"
                className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none focus-visible:border-ink md:text-[13px]" />
              <input value={editing.reason} onChange={(e) => setCaseEdit({ ...editing, reason: e.target.value })} placeholder="이 답을 고른 이유(선택) 예: 사전 고지된 사이즈 추천 기준이라 원칙대로" aria-label="이 답을 고른 이유"
                className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:border-ink md:text-[13px]" />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className={MAIN} disabled={!editing.reply.trim() || note === "저장 중…"} onClick={() => void saveCase(key, c, editing.reply, editing.reason)}>저장</button>
                <button type="button" className={SUB} onClick={() => setCaseEdit(null)}>취소</button>
              </div>
            </article>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {REVISE_CHIPS.map((chip) => (
              <button key={chip} type="button" disabled={busy} onClick={() => void sendText(`방금 답장을 ${chip} 다시 써 줘`)}
                className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-40">{chip}</button>
            ))}
          </div>
          <p className="text-[12px] text-ink-mute">{note ? note : "보내는 건 사장님이 복사해서 직접 해요. 칩을 누르면 그 방향으로 다시 써요."}</p>
        </div>
      );
    }
    if (c.kind === "seo") {
      const tagText = c.tags.join(", "); // 유튜브 태그 칸용: # 없는 낱말, 쉼표
      return (
        <div key={key} className="space-y-2">
          <article className="rounded-xl border border-line bg-surface p-3">
            <h4 className="text-[13px] font-bold text-ink-soft">제목</h4>
            <ul className="mt-1 space-y-1">
              {c.titles.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="text-[14px] text-ink">{t}</span>
                  <button type="button" className={`${SUB} shrink-0`} onClick={() => void copy(`${key}-t${i}`, t)}>{copied === `${key}-t${i}` ? "복사됨" : "복사"}</button>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-bold text-ink-soft">설명란</h4>
              <button type="button" className={SUB} onClick={() => void copy(`${key}-d`, c.description)}>{copied === `${key}-d` ? "복사됨" : "복사"}</button>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink">{c.description}</p>
          </article>
          <article className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-bold text-ink-soft">태그 {c.tags.length}개 <span className="font-normal text-ink-mute">(유튜브 태그 칸에 붙여넣기)</span></h4>
              <button type="button" className={SUB} onClick={() => void copy(`${key}-g`, c.tags.join(", "))}>{copied === `${key}-g` ? "복사됨" : "복사"}</button>
            </div>
            <p className="mt-1 break-words text-[13px] text-ink">{tagText}</p>
          </article>
          {c.pinnedComment ? (
            <article className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-bold text-ink-soft">고정 댓글 <span className="font-normal text-ink-mute">([주문서 링크] 자리에 링크 넣기)</span></h4>
                <button type="button" className={SUB} onClick={() => void copy(`${key}-p`, c.pinnedComment || "")}>{copied === `${key}-p` ? "복사됨" : "복사"}</button>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink">{c.pinnedComment}</p>
            </article>
          ) : null}
        </div>
      );
    }
    return null;
  }

  const ocrBusy = images.some((im) => im.status === "ocr");

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[420px] flex-col" onPaste={onPaste}>
      {/* 기간 */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <label className="flex items-center gap-1 text-[13px] text-ink-soft">
          기간
          <select value={range} onChange={(e) => setRange(e.target.value as ChatRange)} aria-label="기간" className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ink">
            {CHAT_RANGE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {range === "custom" ? (
          <>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} aria-label="시작 날짜" className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
            <span className="text-[13px] text-ink-mute">~</span>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} aria-label="끝 날짜" className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
          </>
        ) : null}
        <span className="text-[12px] text-ink-mute">기간을 말로 하면 그게 우선이에요.</span>
      </div>

      {/* 대화 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-line bg-surface-2 p-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-1 text-[13px] text-ink-soft">
            <p className="font-semibold text-ink">아무 말이나 해 보세요.</p>
            <p>「행복나무 주문 뭐야」 「지난달 매출 제일 많던 날」 「폴로 셔츠 누가 샀어」 「목요일 송장 출력 적어 둬」</p>
            <p>「홍길동 니트 사이즈 교환 원해, 이슈 등록」 「이 카톡에 뭐라고 답하지」(캡처 붙여넣기) 「지난 방송 유튜브 제목 만들어 줘」</p>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[92%] space-y-2 ${m.role === "user" ? "rounded-2xl rounded-br-md bg-ink px-3 py-2 text-white" : "w-full"}`}>
              {m.images?.length ? (
                <div className="flex flex-wrap gap-1">
                  {m.images.map((im) => (
                    <button key={im.key} type="button" onClick={() => setZoom(im)} aria-label="보낸 사진 크게 보기(가린 상태 확인)" className="relative h-16 w-16 overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.preview} alt="" className="h-16 w-16 object-cover" />
                      {im.masked > 0 ? <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[11px] font-semibold text-white">{im.masked}곳 가림</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {m.text ? (
                <p className={`whitespace-pre-wrap break-words text-[14px] ${m.role === "user" ? "" : `rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-2 ${m.failed ? "text-warn-tx" : "text-ink"}`}`}>{m.text}</p>
              ) : null}
              {m.cards?.map((c, i) => renderCard(c, `${m.id}-${i}`))}
            </div>
          </div>
        ))}
        {busy ? <p className="text-[13px] text-ink-mute">생각하는 중… (손님·매출을 찾을 땐 10초쯤 걸려요)</p> : null}
      </div>

      {/* 입력 */}
      <div
        className={`mt-2 rounded-xl border ${dragOver ? "border-ink" : "border-line"} bg-surface p-2`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {images.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((im) => (
              <div key={im.key} className="relative h-16 w-16">
                {im.preview ? (
                  <button type="button" onClick={() => setZoom(im)} aria-label="사진 크게 보기" className="h-16 w-16 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.preview} alt="" className="h-16 w-16 object-cover" />
                  </button>
                ) : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-2 text-[11px] text-ink-mute">가리는 중</span>}
                <button type="button" aria-label="사진 빼기" onClick={() => setImages((prev) => prev.filter((x) => x.key !== im.key))}
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-ink text-[11px] font-bold leading-5 text-white">×</button>
              </div>
            ))}
            <span className="self-end text-[12px] text-ink-mute">전화·계좌·주소는 검게 가려서 보내요. 이름·닉네임은 못 가려요.</span>
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          rows={2}
          aria-label="AI 비서에게 할 말"
          placeholder="할 말을 적고 Enter (줄바꿈은 Shift+Enter). 캡처는 Ctrl+V 나 끌어다 놓기."
          className="w-full resize-none bg-transparent px-1 text-[16px] text-ink outline-none placeholder:text-ink-mute md:text-[14px]"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            <button type="button" className={SUB} onClick={() => fileRef.current?.click()} disabled={images.length >= MAX_IMAGES}>+ 사진 {images.length ? `${images.length}/${MAX_IMAGES}` : ""}</button>
            {messages.length > 0 ? <button type="button" className="h-9 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2" onClick={() => { if (window.confirm("대화 내용을 모두 지울까요? (저장된 메모·이슈는 그대로예요)")) { setMessages([]); setDone({}); } }}>화면 지우기</button> : null}
          </div>
          <button type="button" className={MAIN} disabled={busy || ocrBusy || (!text.trim() && images.length === 0)} onClick={() => void send()}>{busy ? "보내는 중…" : "보내기"}</button>
        </div>
        {error ? <p className="mt-1 text-[13px] text-warn-tx">{error}</p> : null}
      </div>

      {zoom ? (
        <div role="dialog" aria-label="사진 크게 보기" className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.preview} alt="" className="max-h-[85vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="mt-2 text-[13px] text-white">{zoom.masked > 0 ? `${zoom.masked}곳 검게 가림 · 이 모습 그대로 AI 에 갔어요` : "가린 곳 없음 · 이 모습 그대로 AI 에 갔어요"} · 누르면 닫힘</p>
        </div>
      ) : null}
    </div>
  );
}
