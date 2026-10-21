"use client";

// [2026-10-22 AI 비서 3단계] 메모함 — 막 적고 「저장」 → 「할 일 · 손님 · 상품·재고 · 기억할 것」으로 정리된 줄.
//   체크 = 끝냄(맨 아래 「끝낸 것」으로), 손님 이름은 누르면 「물어보기」에서 그 손님 찾기.
//   DESIGN-ADMIN: 주버튼 1개(「저장」) · 체크 36 · 날짜 오른쪽 · 이모지 없음 · 설명 한 줄.

import { useCallback, useEffect, useMemo, useState } from "react";
import { MEMO_KIND_LABEL, suggestIssueFromMemo, type MemoKind } from "@/lib/assistantMemo";

type MemoRow = {
  id: string;
  created_at: string;
  kind: MemoKind;
  body: string;
  due_date: string | null;
  who: string | null;
  product: string | null;
  status: "open" | "done";
  done_at: string | null;
};

const ORDER: MemoKind[] = ["todo", "customer", "product", "note"];
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function todayKst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function dueLabel(due: string | null): { text: string; tone: string } | null {
  if (!due) return null;
  const today = todayKst();
  const [y, m, d] = due.split("-").map(Number);
  const dow = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base = `${m}.${String(d).padStart(2, "0")}(${dow})`;
  if (due < today) return { text: `${base} 지남`, tone: "text-danger-tx" };
  if (due === today) return { text: "오늘", tone: "text-warn-tx" };
  return { text: base, tone: "text-ink-mute" };
}

export default function AdminLiveAssistantMemoBox({ onFindCustomer }: { onFindCustomer: (who: string) => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<MemoRow[]>([]);
  const [done, setDone] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [notice, setNotice] = useState("");
  const [showDone, setShowDone] = useState(false);
  // [AI-5] 고객이슈 등록 제안 카드 — 사장님이 [등록]을 눌러야만 기존 등록 API(admin-tasks, 포인트 무접촉) 호출
  const [issueDraft, setIssueDraft] = useState<{ row: MemoRow; issueType: string; nickname: string; memo: string } | null>(null);
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueNote, setIssueNote] = useState("");

  async function registerIssue() {
    if (!issueDraft || issueSaving) return;
    const nickname = issueDraft.nickname.trim();
    const memo = issueDraft.memo.trim();
    if (!memo) { setIssueNote("내용을 적어 주세요."); return; }
    setIssueSaving(true);
    setIssueNote("");
    try {
      // 고객이슈 탭 「+ 고객이슈 등록」과 같은 모양(AdminLiveCustomerIssueRail.saveIssueMemo)
      const res = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_type: issueDraft.issueType,
          title: `[고객이슈] ${nickname || "수동메모"}`,
          body: memo,
          customer_name: "",
          customer_nickname: nickname,
          priority: "normal",
          source: "admin-live-assistant",
          raw_payload: { nickname, name: "", phone: "", issue_types: [issueDraft.issueType], memo, source: "admin-live-assistant", memo_id: issueDraft.row.id },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setIssueNote(data?.message || "등록하지 못했어요. 고객 › 고객이슈에서 직접 등록해 주세요."); return; }
      setIssueDraft(null);
      setNotice("고객이슈에 등록했어요. 고객 › 고객이슈에서 확인할 수 있어요.");
      await setStatus(issueDraft.row, "done");
    } catch {
      setIssueNote("연결이 끊겼어요. 다시 눌러 주세요.");
    } finally {
      setIssueSaving(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-live/assistant-memos", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.needsSetup) { setNeedsSetup(true); return; }
      if (!res.ok || !data?.ok) { setError(data?.message || "메모를 못 불러왔어요. 잠시 뒤 다시 열어 주세요."); return; }
      setNeedsSetup(false);
      setError("");
      setRows(data.open || []);
      setDone(data.done || []);
    } catch {
      setError("연결이 끊겼어요. 잠시 뒤 다시 열어 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/admin-live/assistant-memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => null);
      if (data?.needsSetup) { setNeedsSetup(true); return; }
      if (!res.ok || !data?.ok) { setError(data?.message || "저장하지 못했어요. 적은 내용은 그대로 있어요."); return; }
      setDraft("");
      setNotice(data.message || (data.organizedBy === "ai" ? `${(data.items || []).length}줄로 정리했어요.` : "저장했어요. 줄·쉼표 기준으로 나눴어요."));
      await load();
    } catch {
      setError("연결이 끊겼어요. 적은 내용은 그대로 있어요.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(row: MemoRow, status: "open" | "done" | "deleted") {
    // 화면 먼저 바꾸고, 실패하면 되돌림
    const prevRows = rows, prevDone = done;
    if (status === "done") { setRows((r) => r.filter((x) => x.id !== row.id)); setDone((d) => [{ ...row, status: "done", done_at: new Date().toISOString() }, ...d]); }
    if (status === "open") { setDone((d) => d.filter((x) => x.id !== row.id)); setRows((r) => [{ ...row, status: "open", done_at: null }, ...r]); }
    if (status === "deleted") { setRows((r) => r.filter((x) => x.id !== row.id)); setDone((d) => d.filter((x) => x.id !== row.id)); }
    const res = await fetch("/api/admin-live/assistant-memos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status }),
    }).catch(() => null);
    if (!res || !res.ok) { setRows(prevRows); setDone(prevDone); setError("저장하지 못했어요. 다시 눌러 주세요."); }
  }

  const groups = useMemo(() => {
    const map = new Map<MemoKind, MemoRow[]>();
    for (const r of rows) map.set(r.kind, [...(map.get(r.kind) || []), r]);
    // 할 일은 날짜 빠른 순(날짜 없는 건 뒤), 나머지는 최근 순
    const todo = map.get("todo");
    if (todo) map.set("todo", [...todo].sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || b.created_at.localeCompare(a.created_at)));
    return ORDER.filter((k) => (map.get(k) || []).length > 0).map((k) => ({ kind: k, rows: map.get(k)! }));
  }, [rows]);

  if (needsSetup) {
    return <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-soft">메모함 준비 중이에요. 설정을 마치면 바로 쓸 수 있어요.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }}
          rows={3}
          aria-label="메모"
          placeholder="예: 홍길동 내일 교환 연락, 폴로자켓 L 2개 더 주문, 금요일 택배 늦게 옴"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[14px]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-mute">생각나는 대로 적으면 줄로 나눠 정리해요.</span>
          <button type="button" onClick={() => void save()} disabled={saving || !draft.trim()}
            className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition disabled:opacity-40">
            {saving ? "정리 중" : "저장"}
          </button>
        </div>
        {notice ? <p className="text-[13px] text-ok-tx">{notice}</p> : null}
        {error ? <p className="text-[13px] font-semibold text-danger-tx">{error}</p> : null}
      </div>

      {issueDraft ? (
        <section className="space-y-2 rounded-xl border border-ink bg-surface p-3" aria-label="고객이슈 등록 제안">
          <h3 className="text-[14px] font-bold text-ink">고객이슈로 등록</h3>
          <div className="flex flex-wrap gap-1.5">
            {([["exchange", "교환"], ["refund", "환불"], ["return", "반품"], ["general", "기타"]] as [string, string][]).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={issueDraft.issueType === k} onClick={() => setIssueDraft({ ...issueDraft, issueType: k })}
                className={`inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold ${issueDraft.issueType === k ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>
                {label}
              </button>
            ))}
          </div>
          <input value={issueDraft.nickname} onChange={(e) => setIssueDraft({ ...issueDraft, nickname: e.target.value })} placeholder="손님 닉네임(없으면 비워도 돼요)" aria-label="손님 닉네임"
            className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink md:text-[14px]" />
          <textarea value={issueDraft.memo} onChange={(e) => setIssueDraft({ ...issueDraft, memo: e.target.value })} rows={2} aria-label="이슈 내용"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none focus-visible:border-ink md:text-[14px]" />
          <div className="flex items-center justify-end gap-2">
            {issueNote ? <span className="mr-auto text-[13px] text-danger-tx">{issueNote}</span> : null}
            <button type="button" onClick={() => setIssueDraft(null)} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2">취소</button>
            <button type="button" onClick={() => void registerIssue()} disabled={issueSaving} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-bold text-white disabled:opacity-40">{issueSaving ? "등록 중" : "등록"}</button>
          </div>
        </section>
      ) : null}

      {loading && rows.length === 0 ? <p className="text-[13px] text-ink-mute">불러오는 중</p> : null}
      {!loading && rows.length === 0 && !error ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-soft">남은 메모가 없어요. 위에 적고 「저장」을 눌러 주세요.</p>
      ) : null}

      {groups.map((g) => (
        <section key={g.kind} className="space-y-1.5">
          <h3 className="text-[14px] font-bold text-ink">{MEMO_KIND_LABEL[g.kind]} <span className="font-semibold text-ink-mute tabular-nums">{g.rows.length}</span></h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {g.rows.map((r) => <MemoLine key={r.id} row={r} onToggle={() => void setStatus(r, "done")} onDelete={() => void setStatus(r, "deleted")} onFindCustomer={onFindCustomer}
              onSuggestIssue={(issueType) => { setIssueNote(""); setIssueDraft({ row: r, issueType, nickname: r.who || "", memo: r.body }); }} />)}
          </ul>
        </section>
      ))}

      {done.length > 0 ? (
        <section className="space-y-1.5">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="h-9 rounded-lg px-1 text-[13px] font-semibold text-ink-mute hover:text-ink">
            끝낸 것 <span className="tabular-nums">{done.length}</span> · {showDone ? "닫기" : "열기"}
          </button>
          {showDone ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {done.map((r) => <MemoLine key={r.id} row={r} onToggle={() => void setStatus(r, "open")} onDelete={() => void setStatus(r, "deleted")} onFindCustomer={onFindCustomer} />)}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MemoLine({ row, onToggle, onDelete, onFindCustomer, onSuggestIssue }: { row: MemoRow; onToggle: () => void; onDelete: () => void; onFindCustomer: (who: string) => void; onSuggestIssue?: (issueType: string) => void }) {
  const isDone = row.status === "done";
  const due = isDone ? null : dueLabel(row.due_date);
  const suggestion = !isDone && onSuggestIssue ? suggestIssueFromMemo(row) : null;
  return (
    <li className="grid grid-cols-[36px_1fr_auto] items-start gap-2 px-2.5 py-2">
      <button type="button" role="checkbox" aria-checked={isDone} aria-label={isDone ? "다시 할 일로" : "끝냄"} onClick={onToggle}
        className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border text-[14px] font-bold transition focus-visible:outline-2 focus-visible:outline-ink ${isDone ? "border-ink bg-ink text-white" : "border-line bg-surface text-transparent hover:bg-surface-2"}`}>
        ✓
      </button>
      <span className="min-w-0 pt-1.5">
        <span className={`block break-words text-[14px] ${isDone ? "text-ink-mute line-through" : "text-ink"}`}>{row.body}</span>
        {row.who || row.product || suggestion ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {suggestion ? (
              <button type="button" onClick={() => onSuggestIssue?.(suggestion.issueType)} className="inline-flex h-7 items-center rounded-lg border border-line bg-surface px-2 text-[12px] font-semibold text-ink hover:bg-surface-2">
                고객이슈 등록 · {suggestion.label}
              </button>
            ) : null}
            {row.who ? (
              <button type="button" onClick={() => onFindCustomer(row.who!)} className="text-[12px] font-semibold text-ink-soft underline-offset-2 hover:underline">
                손님 {row.who} 찾기
              </button>
            ) : null}
            {row.product ? <span className="text-[12px] text-ink-mute">상품 {row.product}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-1 pt-1.5">
        {due ? <span className={`text-[12px] font-semibold tabular-nums ${due.tone}`}>{due.text}</span> : null}
        <button type="button" onClick={onDelete} className="text-[12px] text-ink-mute hover:text-danger-tx">삭제</button>
      </span>
    </li>
  );
}
