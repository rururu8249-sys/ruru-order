"use client";

import { useRef, useState } from "react";
import AdminSelect from "./AdminSelect";
import { useAdminModalFocus } from "./useAdminModalFocus";

export type MemberStatusFilter = "all" | "normal" | "blocked" | "attention" | "nokakao";
export type MemberSortMode = "latest" | "amount" | "orders" | "nickname" | "joinedDesc" | "joinedAsc" | "lastLogin" | "oldLogin";

// Values and ordering retain the existing member comparator contract.
export const MEMBER_SORT_OPTIONS = [
  { value: "latest", label: "최근주문순" },
  { value: "lastLogin", label: "최근 로그인순" },
  { value: "oldLogin", label: "과거접속순 (오래 안 온 순)" },
  { value: "joinedDesc", label: "최근가입순" },
  { value: "joinedAsc", label: "과거가입순" },
  { value: "amount", label: "누적 결제순" },
  { value: "orders", label: "주문수순" },
  { value: "nickname", label: "닉네임순" },
] as const;

type Props = {
  keyword: string; status: MemberStatusFilter; sort: MemberSortMode; buyersOnly: boolean;
  profileReady: boolean; blockReady: boolean; statsReady: boolean;
  counts: { all: number; normal: number; blocked: number; attention: number; blockedTotal: number; standalone: number };
  onKeyword: (value: string) => void; onStatus: (value: MemberStatusFilter) => void;
  onSort: (value: MemberSortMode) => void; onBuyersOnly: (value: boolean) => void; onReset: () => void;
  onBlockedList: () => void; onPhoneBlock: () => void; phoneBlockOpen: boolean;
};

export default function MemberFilterToolbar(props: Props) {
  const { keyword, status, sort, buyersOnly, profileReady, blockReady, statsReady, counts } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const backdropDown = useRef(false);
  useAdminModalFocus(sheetRef, () => setSheetOpen(false), sheetOpen);
  const changed = Boolean(keyword.trim() || status !== "all" || sort !== "latest" || buyersOnly);
  const activeCount = Number(Boolean(keyword.trim())) + Number(status !== "all") + Number(sort !== "latest") + Number(buyersOnly);
  const sortLabel = MEMBER_SORT_OPTIONS.find(option => option.value === sort)?.label;
  const statusOptions: Array<{value:MemberStatusFilter;label:string;count?:number;ready:boolean;disabled?:boolean}> = [
    {value:"all",label:"전체",count:counts.all,ready:profileReady},
    {value:"normal",label:"정상",count:counts.normal,ready:profileReady && blockReady,disabled:!blockReady},
    {value:"blocked",label:"차단",count:counts.blocked,ready:profileReady && blockReady,disabled:!blockReady},
    {value:"attention",label:"관리필요",count:counts.attention,ready:statsReady,disabled:!statsReady},
    {value:"nokakao",label:"카카오 미연동",ready:profileReady},
  ];
  const search = (mobile = false) => (
    <input value={keyword} onChange={event => props.onKeyword(event.target.value)}
      placeholder="닉네임 / 이름 / 전화번호 검색" aria-label="고객 검색" inputMode="search"
      className={`min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-mute ${mobile ? "" : "md:min-h-9 md:text-sm"}`} />
  );
  const buyers = () => (
    <button type="button" disabled={!statsReady} aria-pressed={buyersOnly} onClick={() => props.onBuyersOnly(!buyersOnly)}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold disabled:opacity-40 md:min-h-9 ${buyersOnly ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />{buyersOnly ? <path d="m7 12 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}</svg>
      주문 있는 고객만
    </button>
  );
  const reset = () => changed ? <button type="button" onClick={props.onReset} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-ink-soft hover:bg-surface-2 md:min-h-9">초기화</button> : null;
  const management = (fromSheet = false) => <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={props.onBlockedList} disabled={!profileReady || !blockReady}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink-soft hover:bg-surface-2 disabled:opacity-40 md:min-h-9">
      차단 목록 <span className="tabular-nums text-danger-tx">{profileReady && blockReady ? counts.blockedTotal.toLocaleString("ko-KR") : "…"}</span>
    </button>
    <button type="button" onClick={() => { if (fromSheet) setSheetOpen(false); props.onPhoneBlock(); }} aria-expanded={props.phoneBlockOpen} disabled={!blockReady}
      className={`min-h-11 rounded-lg px-3 text-[13px] font-semibold disabled:opacity-40 md:min-h-9 ${props.phoneBlockOpen ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface-2"}`}>전화번호 차단</button>
    {profileReady && blockReady && counts.standalone > 0 ? <span className="text-xs text-ink-mute">번호 {counts.standalone}건 포함</span> : null}
  </div>;

  return (
    <div data-member-filters className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="회원 상태" className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto p-1 [scrollbar-width:none]">
          {statusOptions.map(option => <button type="button" key={option.value}
            aria-pressed={status === option.value} disabled={option.disabled}
            onClick={() => props.onStatus(option.value)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold tabular-nums disabled:opacity-40 md:min-h-9 ${status === option.value ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-soft hover:bg-surface-2"}`}>
            {option.label}{option.count !== undefined ? <span>{option.ready ? option.count.toLocaleString("ko-KR") : "…"}</span> : null}
          </button>)}
        </div>
        <div className="hidden md:block">{management()}</div>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <div className="min-w-[200px] flex-1">{search()}</div>
        <AdminSelect label="회원 정렬" value={sort} options={MEMBER_SORT_OPTIONS} onChange={props.onSort} className="w-[224px]" />
        {buyers()}{reset()}
      </div>
      <div className="flex items-start gap-3 md:hidden">
        <button type="button" aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => { openedAt.current = Date.now(); setSheetOpen(true); }}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 17h16M8 4v6m8 4v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          필터 {activeCount > 0 ? <span className="tabular-nums">{activeCount}</span> : null}
        </button>
        <div className="min-w-0 flex-1 py-3 text-[13px] text-ink-soft [overflow-wrap:anywhere]">
          {[keyword.trim() ? `검색: ${keyword.trim()}` : "", sortLabel, buyersOnly ? "주문 있는 고객만" : ""].filter(Boolean).join(" · ")}
        </div>
      </div>

      {sheetOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/40"
        onMouseDown={event => { backdropDown.current = event.target === event.currentTarget; }}
        onClick={event => { if (event.target === event.currentTarget && backdropDown.current && Date.now() - openedAt.current > 600) setSheetOpen(false); backdropDown.current = false; }}>
        <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="회원 필터" tabIndex={-1} style={{ outline: "none" }}
          className="flex max-h-[85dvh] w-full min-w-0 flex-col rounded-t-xl border-t border-line bg-surface text-ink shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
            <h2 className="text-base font-bold">회원 필터</h2>
            <button type="button" aria-label="회원 필터 닫기" onClick={() => setSheetOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <label className="block space-y-2"><span className="block text-[13px] font-semibold">회원 검색</span>{search(true)}</label>
            <div className="space-y-2"><div className="text-[13px] font-semibold">정렬</div><AdminSelect label="회원 정렬" value={sort} options={MEMBER_SORT_OPTIONS} onChange={props.onSort} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2">{buyers()}{reset()}</div>
            <div className="space-y-2 border-t border-line pt-4"><h3 className="text-[13px] font-semibold">차단 관리</h3>{management(true)}</div>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
