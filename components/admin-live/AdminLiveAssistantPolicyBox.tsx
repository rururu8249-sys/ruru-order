"use client";

// [2026-10-22 AI 비서 8단계] 응대 방침 — 대화창의 답장 초안이 지키는 말투·교환반품·배송·입금 규칙(옛 「응대 문구」 탭 접힘 칸을 그대로 옮김).
//   읽기 GET /api/admin-live/assistant-reply(policy·defaultPolicy) · 저장 PUT { policy }(admin_assistant_memos kind=policy, 서버만). 돈 무접촉.
import { useEffect, useState } from "react";

export default function AdminLiveAssistantPolicyBox() {
  const [policy, setPolicy] = useState("");
  const [defaultPolicy, setDefaultPolicy] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState("");

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
    </div>
  );
}
