"use client";

// [2026-11-02 사장님 「알림톡 뭐로 쏠지 정해서 보낼 수 있나」] 설정 › 방송·알림 › 카톡 알림 › 방송 알림 템플릿.
//   SOLAPI 에서 승인된 템플릿 이름·ID 를 넣어 두면 방송알림 발송 창에서 골라 보낸다. 「기본」 = 발송 창에 먼저 골라져 있는 것.
//   Vercel 에 처음 넣은 템플릿은 「방송시작 알림 (기존)」으로 늘 맨 앞(지울 수 없음).
import { useEffect, useState } from "react";
import { useSettingsDraft, type SettingsDraftProps } from "./useSettingsDraft";
import { showAdminToast } from "@/lib/adminToast";

type Tpl = { id: string; name: string; fromEnv?: boolean };
type Draft = { list: Tpl[]; defaultId: string };

export default function LiveAlertTemplateCard({ onDraftStateChange }: SettingsDraftProps = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({ list: [], defaultId: "" });
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState("");

  const apply = (j: any): Draft => ({ list: Array.isArray(j?.templates) ? j.templates : [], defaultId: String(j?.defaultId || "") });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin-live/live-alert-templates", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (j?.ok) { const d = apply(j); setDraft(d); markSaved(d); }
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (): Promise<boolean> => {
    const rows = draft.list.filter((t) => !t.fromEnv).map((t) => ({ id: t.id.trim(), name: t.name.trim() })).filter((t) => t.id || t.name);
    if (rows.some((t) => !t.id)) { showAdminToast("템플릿 ID 가 빈 줄이 있어요. ID 를 넣거나 줄을 지워 주세요.", "error"); return false; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/live-alert-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", list: rows, defaultId: draft.defaultId }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { showAdminToast("저장 실패\n\n" + (j?.message || `요청 실패(${res.status})`), "error"); return false; }
      const d = apply(j); setDraft(d); markSaved(d);
      showAdminToast("방송 알림 템플릿을 저장했어요.", "success");
      return true;
    } finally { setSaving(false); }
  };

  const markSaved = useSettingsDraft({ value: draft, loading, saving, save, onDraftStateChange, onDiscard: (v) => setDraft(v) });

  const setRow = (i: number, patch: Partial<Tpl>) => setDraft((p) => ({ ...p, list: p.list.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));
  const removeRow = (i: number) => setDraft((p) => {
    const gone = p.list[i];
    return { list: p.list.filter((_, k) => k !== i), defaultId: gone && gone.id === p.defaultId ? "" : p.defaultId };
  });

  const test = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch("/api/admin-live/live-alert-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", templateId: id, phone: testPhone }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { showAdminToast("시험 발송 실패\n\n" + (j?.message || `요청 실패(${res.status})`), "error"); return; }
      showAdminToast("시험 발송했어요. 폰을 확인해 주세요.", "success");
    } finally { setTesting(""); }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">방송 알림 템플릿</h2>
      <p className="mt-1 text-[13px] text-ink-mute">SOLAPI 에서 승인된 템플릿을 넣어 두면 방송알림 발송 창에서 골라 보내요.</p>

      <div className="mt-4 space-y-2">
        {draft.list.map((t, i) => (
          <div key={t.fromEnv ? "env" : i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
            <label className="flex h-9 shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
              <input type="radio" name="live-alert-default" checked={draft.defaultId === t.id && !!t.id} disabled={!t.id} onChange={() => setDraft((p) => ({ ...p, defaultId: t.id }))} className="h-4 w-4 accent-[#111111]" />
              기본
            </label>
            {t.fromEnv ? (
              <div className="min-w-0 flex-1 text-[14px] text-ink">{t.name} <span className="text-[12px] text-ink-mute">· Vercel 설정 · {t.id}</span></div>
            ) : (
              <>
                <input value={t.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="이름 (예: 방송시작 알림2)" className="h-9 w-44 min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
                <input value={t.id} onChange={(e) => setRow(i, { id: e.target.value.trim() })} placeholder="템플릿 ID" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
                <button type="button" onClick={() => removeRow(i)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-danger-tx">지우기</button>
              </>
            )}
          </div>
        ))}
        {!loading && draft.list.length === 0 ? <p className="text-[13px] text-ink-mute">아직 템플릿이 없어요.</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDraft((p) => ({ ...p, list: [...p.list, { id: "", name: "" }] }))} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink">+ 템플릿 추가</button>
        <button type="button" onClick={() => void save()} disabled={saving || loading} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
      </div>
      <p className="mt-2 text-[12px] text-ink-mute">ID 는 SOLAPI › 알림톡 템플릿 › 「⋮」 › 템플릿 ID 복사. 검수 중인 템플릿은 넣지 마세요(발송 실패).</p>

      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[14px] font-bold text-ink">시험 발송</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="numeric" placeholder="받을 휴대폰 번호" className="h-9 w-48 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
          {draft.list.filter((t) => t.id).map((t) => (
            <button key={t.id} type="button" disabled={!!testing} onClick={() => void test(t.id)} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink disabled:opacity-40">
              {testing === t.id ? "보내는 중…" : `${t.name} 시험`}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-ink-mute">저장된 템플릿으로 1건 보냅니다(건당 요금 발생).</p>
      </div>
    </div>
  );
}
