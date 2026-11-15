"use client";

// [2026-11-15 사장님 「가입 회원에게 손님 주문서 방송 화면에서 조작하는 권한을 편하게」]
//   설정 › 방송·알림 › 방송 화면 권한. 유튜브(역할 고르기 + 채팅에서 바로 지정)·쇼피파이(역할 → 세부 권한) 방식.
//   회원 찾기 → 역할(총관리자·부관리자·채팅 관리자·직접 고르기) → 저장. 관리자페이지 로그인과는 따로.
import { useCallback, useEffect, useRef, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { MEMBER_PERMS, MEMBER_PERM_INFO, MEMBER_PRESETS, presetOf, type MemberBadge, type MemberPerm } from "@/lib/liveMemberRoles";

type Person = { kakaoId: string; perms: MemberPerm[]; badge: MemberBadge | null; nickname: string; name: string; phone: string; photo: string; member?: boolean };
type OpPerson = { key: string; nickname: string; name: string; phone: string; photo: string };

const GROUPS: { key: string; label: string }[] = [
  { key: "owner", label: "총관리자" },
  { key: "sub", label: "부관리자" },
  { key: "chat", label: "채팅 관리자" },
  { key: "chatPhrases", label: "채팅 + 자주 쓰는 말" },
  { key: "custom", label: "직접 고른 권한" },
];

function Avatar({ p }: { p: { photo: string; nickname: string } }) {
  return p.photo
    ? <img src={p.photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[14px] font-bold text-ink-soft">{(p.nickname || "?").slice(0, 1)}</span>;
}

function PermChips({ perms, badge }: { perms: MemberPerm[]; badge: MemberBadge | null }) {
  const shown = perms.includes("owner") ? (["owner"] as MemberPerm[]) : perms;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span key={p} className="inline-flex h-6 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">
          {p === "owner" ? `총관리자 · ${badge === "crown" ? "금색 왕관" : "분홍 왕관"}` : MEMBER_PERM_INFO[p].label}
        </span>
      ))}
    </div>
  );
}

// [2026-11-15] «자주 쓰는 말» 권한만 받은 회원의 본인 목록 — 총관리자 읽기만(그분이 방송 화면에서 고침)
function MemberPhrases({ kakaoId }: { kakaoId: string }) {
  const [state, setState] = useState<{ phrases: string[]; saved: boolean } | null | "error">(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/live-chat/quick-phrases?member=${encodeURIComponent(kakaoId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (alive) setState(j?.ok ? { phrases: j.phrases || [], saved: j.saved === true } : "error"); })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [kakaoId]);
  return (
    <div className="mt-4">
      <div className="text-[13px] font-semibold text-ink-soft">이분의 자주 쓰는 말 (보기만)</div>
      <div className="mt-1 rounded-lg border border-line px-3 py-2 text-[13px] text-ink">
        {state === null ? <span className="text-ink-mute">불러오는 중…</span>
          : state === "error" ? <span className="text-danger-tx">못 불러왔어요</span>
          : !state.phrases.length ? <span className="text-ink-mute">{state.saved ? "비어 있어요" : "아직 안 만들었어요"}</span>
          : <ol className="list-decimal space-y-1 pl-5">{state.phrases.map((t, i) => <li key={i} className="break-words">{t}</li>)}</ol>}
      </div>
    </div>
  );
}

export default function MemberRolesCard() {
  const [items, setItems] = useState<Person[]>([]);
  const [ops, setOps] = useState<OpPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [edit, setEdit] = useState<Person | null>(null);
  const [draft, setDraft] = useState<{ perms: MemberPerm[]; badge: MemberBadge }>({ perms: [], badge: "crown_pink" });
  const [saving, setSaving] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const seq = useRef(0);

  const apply = (j: { items?: Person[]; ops?: OpPerson[] }) => { if (j.items) setItems(j.items); if (j.ops) setOps(j.ops); };
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-live/member-roles", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (j?.ok) apply(j); else showAdminToast("권한 목록을 못 불러왔어요.", "error");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // 회원 찾기 — 쓰는 대로 0.3초 쉬었다 찾음
  useEffect(() => {
    const text = q.trim();
    if (text.length < 1) { setResults(null); return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin-live/member-roles?q=${encodeURIComponent(text)}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (my === seq.current) setResults(j?.ok ? j.results || [] : []);
      } finally { if (my === seq.current) setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const open = (p: Person) => {
    setEdit(p);
    setDraft({ perms: p.perms.length ? [...p.perms] : ["moderate"], badge: p.badge ?? "crown_pink" });
  };

  const save = async () => {
    if (!edit) return;
    if (!draft.perms.length) { showAdminToast("권한을 하나 이상 골라 주세요. 모두 빼려면 「권한 빼기」를 누르세요.", "error"); return; }
    if (draft.perms.includes("owner") && !edit.perms.includes("owner")) {
      if (!(await showAdminConfirm(`${edit.nickname || "이 회원"}님을 총관리자로 정할까요?\n\n왕관 표시가 붙고 방송 화면의 모든 조작(고정 댓글·채팅 관리자 지정 포함)을 할 수 있어요. 관리자페이지 로그인은 따로예요.`, { title: "총관리자 지정", confirmText: "지정", tone: "warning" }))) return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/member-roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", kakaoId: edit.kakaoId, perms: draft.perms, badge: draft.badge, nickname: edit.nickname }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { showAdminToast(j?.message || `저장 실패(${res.status})`, "error"); return; }
      apply(j); setEdit(null); setQ(""); setResults(null);
      showAdminToast(j.message || "저장했어요.", "success");
    } finally { setSaving(false); }
  };

  const remove = async (p: Person) => {
    if (!(await showAdminConfirm(`${p.nickname || "이 회원"}님의 방송 화면 권한을 모두 뺄까요?\n\n다음 글부터 일반 손님과 같아져요.`, { title: "권한 빼기", confirmText: "빼기", tone: "danger" }))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/member-roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", kakaoId: p.kakaoId }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { showAdminToast(j?.message || `못 뺐어요(${res.status})`, "error"); return; }
      apply(j); setEdit(null);
      showAdminToast(j.message || "권한을 뺐어요.", "success");
    } finally { setSaving(false); }
  };

  const draftPreset = presetOf(draft.perms);
  const togglePerm = (p: MemberPerm) => setDraft((d) => {
    if (d.perms.includes(p)) return { ...d, perms: d.perms.filter((x) => x !== p) };
    if (p === "owner") return { ...d, perms: [...MEMBER_PERMS] }; // 총관리자는 모든 기능
    return { ...d, perms: MEMBER_PERMS.filter((x) => x === p || d.perms.includes(x)) };
  });

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">방송 화면 권한</h2>
      <p className="mt-1 text-[13px] text-ink-mute">손님 주문서 방송 화면에서 쓸 기능을 회원에게 줘요. 관리자페이지 로그인과는 따로예요.</p>

      {/* 회원 찾기 */}
      <div className="relative mt-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="권한 줄 회원 찾기 — 닉네임·이름·전화 뒤 4자리"
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
        {results !== null ? (
          <div className="mt-2 rounded-lg border border-line">
            {searching && !results.length ? <div className="px-3 py-3 text-[13px] text-ink-mute">찾는 중…</div> : null}
            {!searching && !results.length ? <div className="px-3 py-3 text-[13px] text-ink-mute">맞는 회원이 없어요. 카카오로 로그인한 회원만 나와요.</div> : null}
            {results.map((p) => (
              <button key={p.kakaoId} type="button" onClick={() => open(p)} className="flex min-h-[48px] w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2">
                <Avatar p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">{p.nickname || "(닉네임 없음)"} <span className="font-normal text-ink-mute">{p.name}</span></span>
                  <span className="block text-[13px] text-ink-mute">{p.phone}</span>
                </span>
                {p.perms.length ? <PermChips perms={p.perms} badge={p.badge} /> : <span className="text-[13px] font-semibold text-ink">권한 주기 ›</span>}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 지금 권한 있는 회원 */}
      <div className="mt-5 space-y-4">
        {loading ? <div className="text-[13px] text-ink-mute">불러오는 중…</div> : null}
        {!loading && GROUPS.map((g) => {
          const list = items.filter((p) => presetOf(p.perms) === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key}>
              <div className="text-[13px] font-bold text-ink-soft">{g.label} {list.length}</div>
              <div className="mt-1 rounded-lg border border-line">
                {list.map((p) => (
                  <div key={p.kakaoId} className="flex min-h-[56px] flex-wrap items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                    <Avatar p={p} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-bold text-ink">{p.nickname || "(닉네임 없음)"} <span className="font-normal text-ink-mute">{p.name}</span></div>
                      <div className="text-[13px] text-ink-mute">{p.member === false ? "회원 정보 없음" : p.phone}</div>
                    </div>
                    {g.key === "custom" ? <PermChips perms={p.perms} badge={p.badge} /> : null}
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => open(p)} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink">변경</button>
                      <button type="button" disabled={saving} onClick={() => void remove(p)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-danger-tx disabled:opacity-40">빼기</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {!loading && !items.length ? <div className="text-[13px] text-ink-mute">권한 있는 회원이 없어요. 위에서 회원을 찾아 주세요.</div> : null}

        {ops.length ? (
          <section>
            <div className="text-[13px] font-bold text-ink-soft">관리자 시험 계정 {ops.length} · 방송 진행 권한 자동</div>
            <div className="mt-1 rounded-lg border border-line">
              {ops.map((p) => (
                <div key={p.key} className="flex min-h-[48px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                  <Avatar p={p} />
                  <div className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.nickname || "(회원 아님)"} <span className="text-ink-mute">{p.name} · {p.phone}</span></div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="mt-4 text-[13px] font-semibold text-ink underline">{showTable ? "권한별로 되는 것 닫기" : "권한별로 되는 것 보기"}</button>
      {showTable ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="bg-surface-2 text-ink-soft"><tr><th className="px-3 py-2 text-left font-semibold">기능</th>{MEMBER_PRESETS.map((p) => <th key={p.key} className="px-3 py-2 text-center font-semibold">{p.label}</th>)}</tr></thead>
            <tbody>
              {MEMBER_PERMS.map((perm) => (
                <tr key={perm} className="border-t border-line">
                  <td className="px-3 py-2"><b className="text-ink">{MEMBER_PERM_INFO[perm].label}</b><div className="text-ink-mute">{MEMBER_PERM_INFO[perm].desc}</div></td>
                  {MEMBER_PRESETS.map((p) => <td key={p.key} className="px-3 py-2 text-center text-ink">{p.perms.includes(perm) ? "✓" : "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* 권한 고르기 창 */}
      {edit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEdit(null); }}>
          <div role="dialog" aria-modal="true" aria-label="방송 화면 권한" className="flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-[0_8px_24px_rgba(0,0,0,.08)] sm:max-w-[520px] sm:rounded-xl">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Avatar p={edit} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-bold text-ink">{edit.nickname || "(닉네임 없음)"} <span className="font-normal text-ink-mute">{edit.name}</span></div>
                <div className="text-[13px] text-ink-mute">{edit.phone}</div>
              </div>
              <button type="button" onClick={() => setEdit(null)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-ink-soft">닫기</button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <div className="text-[13px] font-semibold text-ink-soft">역할</div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 sm:grid-cols-3">
                {[...MEMBER_PRESETS.map((p) => ({ key: p.key, label: p.label, perms: p.perms as MemberPerm[] | null })), { key: "custom", label: "직접 고르기", perms: null }].map((p) => {
                  const on = draftPreset === p.key;
                  return (
                    <button key={p.key} type="button" aria-pressed={on} onClick={() => { if (p.perms) setDraft((d) => ({ ...d, perms: [...p.perms!] })); }}
                      disabled={!p.perms}
                      className={`h-10 rounded-lg text-[14px] font-bold ${on ? "bg-ink text-white" : "text-ink-soft"} ${!p.perms && !on ? "opacity-60" : ""}`}>{p.label}</button>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] text-ink-mute">{MEMBER_PRESETS.find((p) => p.key === draftPreset)?.desc ?? "아래에서 고른 기능만 써요"}</p>

              <div className="mt-4 text-[13px] font-semibold text-ink-soft">기능</div>
              <div className="mt-1 divide-y divide-line rounded-lg border border-line">
                {MEMBER_PERMS.map((perm) => {
                  const on = draft.perms.includes(perm);
                  const lockedByOwner = perm !== "owner" && draft.perms.includes("owner");
                  return (
                    <label key={perm} className={`flex min-h-[52px] cursor-pointer items-start gap-3 px-3 py-2 ${lockedByOwner ? "opacity-60" : ""}`}>
                      <input type="checkbox" checked={on || lockedByOwner} disabled={lockedByOwner} onChange={() => togglePerm(perm)} className="mt-1 h-5 w-5 accent-[#111111]" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold text-ink">{MEMBER_PERM_INFO[perm].label}</span>
                        <span className="block text-[13px] text-ink-mute">{MEMBER_PERM_INFO[perm].desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {draft.perms.includes("owner") ? (
                <div className="mt-4">
                  <div className="text-[13px] font-semibold text-ink-soft">왕관 색</div>
                  <div className="mt-2 flex gap-2">
                    {([["crown", "금색 왕관"], ["crown_pink", "분홍 왕관"]] as const).map(([k, label]) => (
                      <button key={k} type="button" aria-pressed={draft.badge === k} onClick={() => setDraft((d) => ({ ...d, badge: k }))}
                        className={`h-9 rounded-full border px-4 text-[13px] font-bold ${draft.badge === k ? "border-ink bg-ink text-white" : "border-line text-ink"}`}>{label}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {edit.perms.includes("phrases") && !edit.perms.includes("host") && !edit.perms.includes("owner") ? <MemberPhrases kakaoId={edit.kakaoId} /> : null}
              <p className="mt-4 text-[13px] text-ink-mute">저장하면 그분 다음 채팅 글부터 표시가 바뀌고, 방송 화면은 새로고침하면 바로 적용돼요.</p>
            </div>
            <div className="flex items-center gap-2 border-t border-line px-5 py-3">
              {edit.perms.length ? <button type="button" disabled={saving} onClick={() => void remove(edit)} className="h-10 rounded-lg px-2 text-[14px] font-semibold text-danger-tx disabled:opacity-40">권한 빼기</button> : null}
              <span className="flex-1" />
              <button type="button" onClick={() => setEdit(null)} className="h-10 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink">취소</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-lg bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
