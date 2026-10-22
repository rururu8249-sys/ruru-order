"use client";

// [2026-10-22 AI 비서 8단계] 응대 방침 — 대화창의 답장 초안이 지키는 말투·교환반품·배송·입금 규칙(옛 「응대 문구」 탭 접힘 칸을 그대로 옮김).
//   읽기 GET /api/admin-live/assistant-reply(policy·defaultPolicy) · 저장 PUT { policy }(admin_assistant_memos kind=policy, 서버만). 돈 무접촉.
import { useEffect, useState } from "react";

type CaseRow = { id: string; category: string; createdAt: string; customer: string; situation: string; reply: string; reason: string };

export default function AdminLiveAssistantPolicyBox() {
  const [policy, setPolicy] = useState("");
  const [defaultPolicy, setDefaultPolicy] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState("");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [openCase, setOpenCase] = useState("");

  // 좋은 응대 사례(대화 카드 「사례로 저장」) — 보기·삭제만. AI 는 list_cases 로 같은 것을 읽는다
  useEffect(() => {
    void fetch("/api/admin-live/assistant-cases", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.ok) setCases(d.cases as CaseRow[]); }).catch(() => {});
  }, []);
  async function deleteCase(id: string) {
    if (!window.confirm("이 사례를 지울까요? AI 가 더는 참고하지 않아요.")) return;
    const res = await fetch("/api/admin-live/assistant-cases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "delete" }) }).catch(() => null);
    if (res?.ok) setCases((prev) => prev.filter((c) => c.id !== id)); else setNote("사례를 지우지 못했어요.");
  }

  useEffect(() => {
    void fetch("/api/admin-live/assistant-reply", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setPolicy(d.policy); setSaved(d.policy); setDefaultPolicy(d.defaultPolicy); } })
      .catch(() => setNote("방침을 못 불러왔어요."));
  }, []);

  async function save() {
    setNote("");
    const res = await fetch("/api/admin-live/assistant-reply", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res || !res.ok || !data?.ok) { setNote(data?.message || "저장하지 못했어요."); return; }
    setSaved(policy);
    setNote("저장했어요.");
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-ink-soft">손님에게 보낼 답장을 만들 때 AI 가 이대로 지켜요. 말투·교환반품·배송·입금 규칙·금지 표현.</p>
      <textarea
        value={policy}
        onChange={(e) => setPolicy(e.target.value)}
        rows={18}
        aria-label="응대 방침"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] leading-relaxed text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[13px]"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={!policy.trim() || policy === saved}
          className="h-9 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
          방침 저장
        </button>
        {defaultPolicy && policy !== defaultPolicy ? (
          <button type="button" onClick={() => setPolicy(defaultPolicy)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2">기본으로</button>
        ) : null}
        {note ? <span className="text-[13px] text-ink-soft">{note}</span> : policy.trim() && policy === saved ? <span className="text-[13px] text-ink-mute">저장된 방침과 같아요 — 고칠 게 있으면 바꾼 뒤 저장</span> : null}
      </div>
      <section className="border-t border-line pt-3">
        <h3 className="text-[14px] font-bold text-ink">좋은 응대 사례 <span className="text-ink-mute">{cases.length}</span></h3>
        <p className="mt-0.5 text-[13px] text-ink-soft">대화 카드의 「사례로 저장」으로 남긴 실제 답장. 비슷한 문의가 오면 AI 가 참고해요(그대로 복사는 안 함).</p>
        {cases.length === 0 ? <p className="mt-2 text-[13px] text-ink-mute">아직 없어요. 답장을 보낸 뒤 카드에서 「사례로 저장」을 눌러 보세요.</p> : (
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {cases.map((c) => (
              <li key={c.id} className="py-2">
                <button type="button" onClick={() => setOpenCase(openCase === c.id ? "" : c.id)} className="flex w-full items-start gap-2 text-left">
                  <span className="inline-flex h-6 shrink-0 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{c.category}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{c.customer}</span>
                    <span className="block truncate text-[12px] text-ink-mute">{c.reply}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-mute tabular-nums">{String(c.createdAt || "").slice(0, 10)}</span>
                </button>
                {openCase === c.id ? (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-[13px]">
                    <p className="whitespace-pre-wrap break-words text-ink"><span className="font-semibold text-ink-soft">손님 말</span> · {c.customer}</p>
                    {c.situation ? <p className="whitespace-pre-wrap break-words text-ink-soft"><span className="font-semibold">상황</span> · {c.situation}</p> : null}
                    <p className="whitespace-pre-wrap break-words text-ink"><span className="font-semibold text-ink-soft">보낸 답장</span> · {c.reply}</p>
                    {c.reason ? <p className="text-ink-soft"><span className="font-semibold">이유</span> · {c.reason}</p> : null}
                    <button type="button" onClick={() => void deleteCase(c.id)} className="h-8 rounded-lg px-2 text-[13px] font-semibold text-danger-tx hover:bg-surface">지우기</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
