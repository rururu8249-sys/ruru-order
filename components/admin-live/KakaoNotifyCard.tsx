"use client";

// [2026-10-26 사장님 「사이트 닫으면 쪽지를 몰라 — 손님이 아무것도 안 해도 폰이 울리게」]
//   설정 › 방송·알림 › 카톡 알림. 알림톡 문구 틀 두 개를 보여주고(복사해서 SOLAPI 에 그대로 붙여 넣기),
//   카카오 승인 뒤 받은 템플릿 ID 를 저장하면 기존 버튼(결제요청 쪽지·주문 확인 알림)이 카톡도 같이 보낸다.
//   ID 가 비어 있으면 예전처럼 쪽지만. 시험 발송은 사장님 폰으로 1건.
import { useEffect, useState } from "react";
import { useSettingsDraft, type SettingsDraftProps } from "./useSettingsDraft";
import { showAdminToast } from "@/lib/adminToast";
import { KAKAO_NOTIFY_TEMPLATES, type KakaoNotifyKind } from "@/lib/kakaoNotify";

const KINDS: KakaoNotifyKind[] = ["unpaid", "cart"];

export default function KakaoNotifyCard({ onDraftStateChange }: SettingsDraftProps = {}) {
  const [loading, setLoading] = useState(true);
  const [envReady, setEnvReady] = useState(true);
  const [ids, setIds] = useState<Record<KakaoNotifyKind, string>>({ unpaid: "", cart: "" });
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState<KakaoNotifyKind | "">("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin-live/kakao-notify", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (json?.ok) { setIds({ unpaid: json.ids?.unpaid || "", cart: json.ids?.cart || "" }); setEnvReady(!!json.envReady); }
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/kakao-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...ids }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("저장 실패\n\n" + (json?.message || `요청 실패(${res.status})`), "error"); return false; }
      const next = { unpaid: json.ids?.unpaid || "", cart: json.ids?.cart || "" };
      setIds(next); markSaved(next);
      showAdminToast("카톡 알림 설정을 저장했어요.", "success");
      return true;
    } finally { setSaving(false); }
  };

  const markSaved = useSettingsDraft({ value: ids, loading, saving, save, onDraftStateChange, onDiscard: (v) => setIds(v) });

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); showAdminToast(`${label} 복사했어요.`, "success"); }
    catch { showAdminToast("복사 실패 — 직접 드래그해서 복사해 주세요.", "error"); }
  };

  const test = async (kind: KakaoNotifyKind) => {
    setTesting(kind);
    try {
      const res = await fetch("/api/admin-live/kakao-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", kind, phone: testPhone }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { showAdminToast("시험 발송 실패\n\n" + (json?.message || `요청 실패(${res.status})`), "error"); return; }
      showAdminToast("시험 발송했어요. 폰을 확인해 주세요.", "success");
    } finally { setTesting(""); }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">카톡 알림</h2>
      <p className="mt-1 text-[13px] text-ink-mute">사이트를 닫은 손님에게도 폰이 울려요. 카톡이 없으면 문자로 대신 갑니다.</p>
      {!envReady ? <p className="mt-2 text-[13px] font-semibold text-danger-tx">SOLAPI 연결 정보가 없어 보낼 수 없어요.</p> : null}

      <ol className="mt-4 space-y-1 text-[13px] leading-5 text-ink-soft">
        <li>1. 아래 문구를 「본문 복사」 → SOLAPI › 카카오 › 알림톡 템플릿 등록에 그대로 붙여 넣기</li>
        <li>2. 버튼도 아래대로 추가(웹링크) → 심사 신청</li>
        <li>3. 승인되면 템플릿 ID를 아래 칸에 넣고 저장 → 시험 발송으로 확인</li>
      </ol>

      {KINDS.map((kind) => {
        const tpl = KAKAO_NOTIFY_TEMPLATES[kind];
        return (
          <div key={kind} className="mt-4 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[16px] font-bold text-ink">{tpl.title}</div>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${ids[kind] ? "bg-ok-bg text-ok-tx" : "bg-surface-2 text-ink-mute"}`}>{ids[kind] ? "켜짐" : "ID 없음 · 쪽지만"}</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-mute">{tpl.when}</p>
            <div className="mt-3 grid gap-1 text-[13px] text-ink-soft">
              <div>템플릿 이름: <b className="text-ink">{tpl.name}</b> <button type="button" onClick={() => void copy(tpl.name, "이름")} className="ml-1 text-[12px] font-semibold text-ink underline">복사</button></div>
              <div>카테고리: {tpl.category} · 메시지 유형: 기본형</div>
              <div>버튼: 웹링크 「{tpl.button.name}」 · 모바일·PC 주소 <span className="break-all text-ink">{tpl.button.link}</span> <button type="button" onClick={() => void copy(tpl.button.link, "버튼 주소")} className="ml-1 text-[12px] font-semibold text-ink underline">복사</button></div>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-[13px] leading-6 text-ink">{tpl.content}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copy(tpl.content, "본문")} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink">본문 복사</button>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-ink-soft">템플릿 ID
                <input value={ids[kind]} onChange={(e) => setIds((p) => ({ ...p, [kind]: e.target.value.trim() }))} placeholder="승인 후 붙여 넣기" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
              </label>
            </div>
          </div>
        );
      })}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={saving || loading} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="text-[14px] font-bold text-ink">시험 발송</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="numeric" placeholder="받을 휴대폰 번호" className="h-9 w-48 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink" />
          {KINDS.map((kind) => (
            <button key={kind} type="button" disabled={!!testing || !ids[kind]} onClick={() => void test(kind)} className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink disabled:opacity-40">
              {testing === kind ? "보내는 중…" : `${KAKAO_NOTIFY_TEMPLATES[kind].title} 시험`}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-ink-mute">저장된 ID로 예시 내용 1건을 보냅니다(건당 요금 발생).</p>
      </div>
    </div>
  );
}
