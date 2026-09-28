"use client";

// [2026-09-27] 고객이슈 등록 모달 — 고객이슈 탭 「+ 고객이슈 등록」과 주문상세 「환불·교환 등록」이 «같은 컴포넌트»를 쓴다.
//   ⚠️ 돈/포인트/주문상태를 여기서 움직이지 않는다. 폼만 모으고, 제출은 caller 가 넘긴 onSubmit 이 각자 기존 API 로 한다.
//     · 탭에서 열면 → admin-tasks 생성(포인트 무접촉)
//     · 주문상세에서 열면(orderContext) → order-return 등록(환불 유형일 때 서버에서 포인트 회수, 회수 규칙 불변)

import { useEffect, useMemo, useState } from "react";

export type CustomerIssueCustomerOption = { key: string; nickname: string; name: string; phone: string };

// 유형 라벨 — 고객이슈 유형과 «동일 문자열» 공유(환불/교환/반품/기타).
export const ISSUE_TYPE_LABEL: Record<string, string> = {
  refund: "환불", exchange: "교환", return: "반품", general: "기타", etc: "기타",
};
// 탭 등록·편집 셀렉터가 보여주는 유형(진상/구매 제외).
export const REGISTER_TYPE_OPTIONS: Array<[string, string]> = [
  ["exchange", ISSUE_TYPE_LABEL.exchange],
  ["return", ISSUE_TYPE_LABEL.return],
  ["refund", ISSUE_TYPE_LABEL.refund],
  ["general", ISSUE_TYPE_LABEL.general],
];
// 주문상세 등록(단일 선택) — 환불 / 교환 / 기타.
export const ORDER_ISSUE_TYPES: Array<[string, string]> = [
  ["refund", ISSUE_TYPE_LABEL.refund],
  ["exchange", ISSUE_TYPE_LABEL.exchange],
  ["etc", ISSUE_TYPE_LABEL.etc],
];

export const PRIORITY_OPTIONS: Array<[string, string]> = [
  ["normal", "보통"],
  ["high", "중요"],
  ["urgent", "긴급"],
  ["low", "낮음"],
];

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const cleanCompact = (v: unknown) => String(v ?? "").replace(/\s+/g, "").trim();
const cleanMultiline = (v: unknown) =>
  String(v ?? "").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trimEnd()).join("\n").trim();
function formatPhone(v: unknown) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(v ?? "");
}

export function IssueTypeChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const selected = value.length > 0 ? value : ["general"];
  return (
    <div className="flex flex-wrap gap-2">
      {REGISTER_TYPE_OPTIONS.map(([key, label]) => {
        const active = selected.includes(key);
        return (
          <button key={key} type="button"
            onClick={() => { const next = active ? selected.filter((i) => i !== key) : [...selected, key]; onChange(next.length > 0 ? next : ["general"]); }}
            className={`h-9 rounded-xl px-3 text-sm font-black ${active ? "bg-rose-deep text-white" : "bg-surface-2 text-ink-soft hover:bg-surface-3"}`}>
            {active ? "✓ " : ""}{label}
          </button>
        );
      })}
    </div>
  );
}

// [2026-09-29 ⑬] 주문상세 등록은 처리창(RefundProcessModal) 초안 모드로 이동 → 이 모달은 «고객이슈 탭 등록»만 담당.
export type IssueRegisterSubmit = {
  nickname: string; name: string; phone: string;
  taskTypes: string[]; priority: string; memo: string;
  mode: "refund" | "exchange" | "etc";
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: IssueRegisterSubmit) => void | Promise<void>;
  saving?: boolean;
  customerOptions?: CustomerIssueCustomerOption[]; // 탭 모드 검색용
};

const INPUT_TAB = "h-11 rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg";

export default function IssueRegisterModal({ open, onClose, onSubmit, saving = false, customerOptions = [] }: Props) {
  // 탭 등록 폼
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [priority, setPriority] = useState("normal");
  const [memo, setMemo] = useState("");
  // 유형 = 환불/교환/기타 단일 선택. taskTypes 는 이 하나에서 파생(기타→general).
  const [mode, setMode] = useState<"refund" | "exchange" | "etc">("etc");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    if (!open) return;
    setNickname(""); setName(""); setPhone("");
    setPriority("normal"); setMemo(""); setMode("etc");
    setSearchDraft(""); setSearchKeyword("");
  }, [open]);

  const searchResults = useMemo(() => {
    const keyword = cleanCompact(searchKeyword || searchDraft);
    if (!keyword) return [] as CustomerIssueCustomerOption[];
    return customerOptions
      .filter((c) => cleanCompact(`${c.nickname}${c.name}${c.phone}`).includes(keyword))
      .slice(0, 20);
  }, [customerOptions, searchDraft, searchKeyword]);

  if (!open) return null;

  const submit = () => {
    // 탭 저장(admin-tasks)은 taskTypes[0] 을 task_type 으로 씀 → 기타=general, 나머지는 mode 그대로.
    const taskTypes = [mode === "etc" ? "general" : mode];
    void onSubmit({ nickname: clean(nickname), name: clean(name), phone: clean(phone), taskTypes, priority, memo: cleanMultiline(memo), mode });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink-soft)]/35 px-4">
      <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-ink">고객이슈 등록</h3>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft hover:bg-surface-2">닫기</button>
        </div>

        {(
          <>
            {/* ChatGPT 정리 도우미 */}
            <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink">🤖 ChatGPT로 고객이슈 정리</div>
              <button type="button" onClick={() => window.open("https://chatgpt.com/", "_blank", "noopener")} className="mt-2 h-9 rounded-lg bg-rose-deep px-3 text-xs font-black text-white">🤖 ChatGPT 열기</button>
              <div className="mt-1.5 text-[11px] font-bold leading-4 text-ink-mute">ChatGPT 창에 카톡 대화를 붙여넣고 &quot;손님 말만 골라 닉네임/이름/유형/내용으로 정리해줘&quot;라고 하세요. 나온 결과를 아래 메모칸에 붙여넣으면 됩니다.</div>
            </div>

            {/* 고객 검색 */}
            <div className="mt-4">
              <div className="text-xs font-black text-ink-soft">고객 검색</div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_96px]">
                <input value={searchDraft} onChange={(e) => { setSearchDraft(e.target.value); setSearchKeyword(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") setSearchKeyword(searchDraft); }}
                  placeholder="닉네임 / 이름 / 전화번호 검색" className={INPUT_TAB} />
                <button type="button" onClick={() => setSearchKeyword(searchDraft)} className="h-11 rounded-xl bg-rose-deep px-3 text-sm font-black text-white transition hover:opacity-90">검색</button>
              </div>
              <div className="mt-2 rounded-2xl border border-dashed border-line bg-surface-2 p-2">
                {!clean(searchDraft) ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">닉네임·이름·전화번호를 검색하면 고객 추천이 표시됩니다.</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs font-black text-ink-mute">검색 결과가 없습니다. 직접 입력도 가능합니다.</div>
                ) : (
                  <div className="space-y-1">
                    {searchResults.map((c) => (
                      <button key={c.key} type="button" onClick={() => { setNickname(c.nickname); setName(c.name); setPhone(c.phone); }}
                        className="grid w-full grid-cols-[1fr_auto] gap-2 rounded-xl bg-surface px-3 py-2 text-left text-xs font-bold text-ink-soft hover:bg-rose-soft">
                        <span className="min-w-0 truncate"><b className="text-ink">{c.nickname || "-"}</b> · {c.name || "-"}</span>
                        <span className="font-black text-rose-deep">{formatPhone(c.phone)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임" className={INPUT_TAB} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={INPUT_TAB} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호" className={INPUT_TAB} />
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-black text-ink-soft">유형</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ORDER_ISSUE_TYPES.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setMode(key as "refund" | "exchange" | "etc")}
                    className={`rounded-xl px-3 py-1.5 text-[14px] font-black transition ${mode === key ? (key === "refund" ? "bg-rose-deep text-white" : "bg-[var(--color-ink-soft)] text-white") : "border border-line bg-surface text-ink-mute hover:bg-surface-2"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 w-full rounded-xl border border-line px-3 text-sm font-black text-ink outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg">
                {PRIORITY_OPTIONS.map(([value, label]) => (<option key={value} value={value}>우선순위: {label}</option>))}
              </select>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[13px] font-black text-ink-mute">메모</div>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="고객이슈 내용을 입력하세요."
                className="min-h-[180px] w-full resize-none rounded-2xl border border-line p-3 text-sm font-bold leading-6 outline-none focus:border-info-tx/35 focus:ring-4 focus:ring-info-bg" />
            </div>
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-line bg-surface text-sm font-black text-ink-soft hover:bg-surface-2">취소</button>
          <button type="button" onClick={submit} disabled={saving} className="h-11 rounded-xl bg-rose-deep text-sm font-black text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "접수중…" : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
