"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminLiveBroadcast } from "./liveBroadcastController";
import { formatBroadcastTime } from "./liveBroadcastController";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { buildChatAnnounceText } from "@/lib/chatAnnounce";
import { buildDetailChatLine, detailProducts } from "@/lib/productDetailModel";
import { feedPinLayout, FEED_PIN_SIZE } from "@/lib/feedText";

type VideoRatio = "vertical" | "wide" | "auto";
type AlertMember = { id: string; name: string; phone: string; orderDays?: number; recent?: boolean; manual?: boolean };

type Props = {
  videoRatio: VideoRatio;
  onVideoRatioChange: (value: VideoRatio) => void;
  activeBroadcast: AdminLiveBroadcast | null;
  savingBroadcast?: boolean;
  onStartBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  onEndBroadcast: () => Promise<void> | void;
  onSaveBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  title: string;
  onTitleChange: (value: string) => void;
  youtubeUrl: string;
  onYoutubeUrlChange: (value: string) => void;
  // 자리만(다음 단계 연결): 진열 상품 수
  productCount?: number;
  shopOpen?: boolean;
  onToggleShopOpen?: () => void;
  // [2026-07-12] 위젯 상품카드 ON/OFF (방송 중에만 의미. 배너는 PRISM 소스라 무관)
  widgetCardOn?: boolean;
  onToggleWidgetCard?: () => void;
  // [2026-09-12] 방송별 📌 고정 공지 저장 (broadcasts.feed_pin_text · 서버 경로). 방송 없으면 못 씀.
  onSaveFeedPin?: (text: string) => Promise<void> | void;
};

function todayLabel() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
}

export default function LiveHeader({
  videoRatio,
  onVideoRatioChange,
  activeBroadcast,
  savingBroadcast = false,
  onStartBroadcast,
  onEndBroadcast,
  onSaveBroadcast,
  title,
  onTitleChange,
  youtubeUrl,
  onYoutubeUrlChange,
  productCount,
  shopOpen = true,
  onToggleShopOpen,
  widgetCardOn = true,
  onToggleWidgetCard,
  onSaveFeedPin,
}: Props) {
  const [titleSavedAt, setTitleSavedAt] = useState("");
  const [urlAppliedAt, setUrlAppliedAt] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  // [2026-09-12] 📌 위젯 고정 공지 — «주문·입금 피드» 위젯(/order-feed-widget) 맨 위 한 줄.
  //   «이번 방송»의 속성이라 broadcasts.feed_pin_text 에 둔다(유튜브 고정 메시지처럼 방송마다 하나).
  //   → 방송이 끝나면 같이 끝나고, 다음 방송은 빈칸에서 시작(지난 방송 공지가 새어나가지 않음).
  //   저장은 부모(onSaveFeedPin → catalog-write 서버 경로). 위젯은 broadcasts 실시간이라 저장 즉시 반영. 표시 전용(돈·주문 무관).
  const activeBroadcastId = activeBroadcast?.id ?? "";
  const activePinText = String(activeBroadcast?.feed_pin_text ?? "");
  const [pinText, setPinText] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSavedAt, setPinSavedAt] = useState("");
  // 패널을 열 때 / 방송이 바뀔 때 — 입력칸을 현재 방송의 저장값으로 맞춘다
  useEffect(() => {
    if (!editOpen) return;
    setPinText(activePinText);
    setPinSavedAt("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, activeBroadcastId]);
  const savePinText = async () => {
    if (pinSaving || !activeBroadcastId || !onSaveFeedPin) return;
    setPinSaving(true);
    try {
      const value = pinText.trim().slice(0, 60);
      await onSaveFeedPin(value);
      setPinText(value);
      setPinSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      showAdminToast(value ? "위젯 고정 공지를 저장했습니다. 방송 화면에 바로 뜹니다." : "위젯 고정 공지를 지웠습니다.", "success");
    } catch {
      showAdminToast("위젯 고정 공지 저장에 실패했어요.", "error");
    } finally {
      setPinSaving(false);
    }
  };

  // [2026-08-31 사장님 요청] 지금 고정된 상품의 채팅 안내문구를 어디서든 재복사 —
  //   상품관리 📢 채팅 버튼과 같은 문구(lib/chatAnnounce 공용). 복사만 한다(채팅봇 현재상품·고정은 안 건드림).
  //   중간에 다른 걸 복사해서 클립보드가 날아가도 여기서 한 번에 되살린다.
  const [copyingCurrent, setCopyingCurrent] = useState(false);
  const [currentCopied, setCurrentCopied] = useState(false);
  const copyCurrentProductLine = async () => {
    if (!activeBroadcast?.id || copyingCurrent) return;
    setCopyingCurrent(true);
    try {
      const { data: bc } = await supabase
        .from("broadcasts")
        .select("widget_pin_mode,widget_pin_product_id,widget_pin_detail_name")
        .eq("id", activeBroadcast.id)
        .maybeSingle();
      const row = bc as Record<string, unknown> | null;
      const pid = String(row?.widget_pin_product_id ?? "").trim();
      if (String(row?.widget_pin_mode || "auto") !== "pin" || !pid) {
        showAdminToast("고정된 현재상품이 없습니다.\n\n상품 관리에서 「▶ 방송」 또는 「📌 고정」을 먼저 눌러주세요.", "warning");
        return;
      }
      const { data: prow } = await supabase.from("products").select("*").eq("id", pid).maybeSingle();
      if (!prow) { showAdminToast("고정된 상품을 찾지 못했습니다.", "error"); return; }
      const detailName = String(row?.widget_pin_detail_name ?? "").trim();
      let line = "";
      if (detailName) {
        const d = detailProducts(prow as never, { includeHidden: true }).find((x) => x.detailName === detailName);
        if (d) line = buildDetailChatLine(d);
      }
      if (!line) line = buildChatAnnounceText(prow as Record<string, unknown>).replace(/[\r\n]+/g, " ").trim();
      const text = `✅ ${line}`;
      await navigator.clipboard.writeText(text);
      setCurrentCopied(true);
      window.setTimeout(() => setCurrentCopied(false), 1800);
      showAdminToast(`현재상품 문구 복사 완료\n\n${text}`, "success");
    } catch (e) {
      showAdminToast("현재상품 문구 복사 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setCopyingCurrent(false);
    }
  };

  // 방송알림: 대상(신청자/전체) 선택 + 이미 받은 사람 제외(증분) + 미리보기
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMode, setAlertMode] = useState<"priority" | "optin" | "all">("priority");
  const [alertLimit, setAlertLimit] = useState("300");
  const [alertOrderDays, setAlertOrderDays] = useState("90");
  const [alertRecentDays, setAlertRecentDays] = useState("30");
  const alertRequest = useRef(0);
  const [alertIncluded, setAlertIncluded] = useState<string[]>([]);
  const [alertExcluded, setAlertExcluded] = useState<string[]>([]);
  const [alertSearch, setAlertSearch] = useState("");
  const [alertSort, setAlertSort] = useState("name");
  const [alertList, setAlertList] = useState<"selected" | "members" | "excluded">("selected");
  const alertBusy = useRef(false);
  useEffect(() => { alertRequest.current++; setAlertPreview(null); setAlertPreviewLoading(false); setAlertIncluded([]); setAlertExcluded([]); setAlertResult(""); }, [activeBroadcast?.id]);
  const [alertPreview, setAlertPreview] = useState<any>(null);
  const [alertPreviewLoading, setAlertPreviewLoading] = useState(false);
  const [alertSending, setAlertSending] = useState(false);
  const [alertResult, setAlertResult] = useState("");

  const loadAlertPreview = async (mode: "priority" | "optin" | "all", edits?: {includeIds:string[];excludeIds:string[];selectionToken?:string}) => {
    if (!activeBroadcast || alertSending || alertBusy.current) return;
    const requestId = ++alertRequest.current;
    setAlertPreviewLoading(true);
    if (!edits?.selectionToken) setAlertPreview(null);
    setAlertResult("");
    try {
      const r = await fetch("/api/admin-live/live-alert-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: activeBroadcast.id, dryRun: true, mode, limit: Number(alertLimit), orderDays: Number(alertOrderDays), recentDays: Number(alertRecentDays), includeIds:edits?.includeIds ?? alertIncluded,excludeIds:edits?.excludeIds ?? alertExcluded,selectionToken:edits?.selectionToken }),
      }).then((res) => res.json()).catch(() => null);
      if (requestId !== alertRequest.current) return;
      if (!r?.ok) { setAlertResult("대상 조회 실패: " + (r?.error || "권한/네트워크 확인")); return; }
      setAlertPreview(r);
      if(edits){setAlertIncluded(edits.includeIds);setAlertExcluded(edits.excludeIds);}
    } finally {
      if (requestId === alertRequest.current) setAlertPreviewLoading(false);
    }
  };

  const openAlert = () => {
    if (!activeBroadcast || alertBusy.current) return;
    setAlertOpen(true);
    setAlertList("selected");setAlertSearch("");
    setAlertMode("priority");
    if(alertMode!=="priority"){
      setAlertIncluded([]);setAlertExcluded([]);
      void loadAlertPreview("priority",{includeIds:[],excludeIds:[]});
    }else void loadAlertPreview("priority");
  };

  const changeAlertMode = (mode: "priority" | "optin" | "all") => {
    if (alertSending || alertPreviewLoading || alertBusy.current) return;
    setAlertMode(mode);
    setAlertIncluded([]);setAlertExcluded([]);setAlertList("selected");
    void loadAlertPreview(mode,{includeIds:[],excludeIds:[]});
  };

  const editAlertMember = (id:string, include:boolean) => {
    if(alertPreviewLoading||alertSending||alertBusy.current||!alertPreview?.selectionToken)return;
    const includeIds=include?[...new Set([...alertIncluded,id])]:alertIncluded.filter(p=>p!==id);
    const excludeIds=include?alertExcluded.filter(p=>p!==id):[...new Set([...alertExcluded,id])];
    void loadAlertPreview(alertMode,{includeIds,excludeIds,selectionToken:alertPreview.selectionToken});
  };
  const visibleAlertMembers = useMemo(() => {
    const source:AlertMember[]=alertList==="selected"?(alertPreview?.sample||[]):(alertPreview?.members||[]).filter((m:AlertMember)=>alertList!=="excluded"||alertExcluded.includes(m.id));
    const query=alertSearch.trim().toLocaleLowerCase("ko");
    const rows=source.filter(m=>!query||`${m.name} ${m.phone}`.toLocaleLowerCase("ko").includes(query));
    return [...rows].sort((a,b)=>{
      if(alertSort==="orders"&&(b.orderDays||0)!==(a.orderDays||0))return (b.orderDays||0)-(a.orderDays||0);
      if(alertSort==="group"&&!!b.manual!==!!a.manual)return Number(!!b.manual)-Number(!!a.manual);
      return a.name.localeCompare(b.name,"ko",{numeric:true})||a.id.localeCompare(b.id);
    });
  },[alertPreview,alertList,alertExcluded,alertSearch,alertSort]);

  const sendAlert = async () => {
    if (!activeBroadcast || alertSending || alertPreviewLoading || alertBusy.current) return;
    const count = Number(alertPreview?.targetCount || 0);
    if (count === 0) return;
    const selectionToken=alertPreview.selectionToken;
    alertBusy.current=true;
    setAlertSending(true);
    try {
    if (alertMode === "all") {
      const okAll = await showAdminConfirm(`신청 안 한 회원까지 ${count}명에게 발송합니다.\n동의 미확인자 발송은 카카오 채널 제재 위험이 있습니다.\n정말 보낼까요?`, { title: "전체 발송", confirmText: "전체 발송", cancelText: "취소", tone: "danger" });
      if (!okAll) return;
    } else {
      const okSend = await showAdminConfirm(`${count}명에게 방송알림을 발송합니다. 계속할까요?`, { title: "방송알림 발송", confirmText: "발송", cancelText: "취소", tone: "info" });
      if (!okSend) return;
    }
    setAlertResult("");
      const r = await fetch("/api/admin-live/live-alert-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: activeBroadcast.id, mode: alertMode, selectionToken }),
      }).then((res) => res.json()).catch(() => null);
      setAlertResult(r?.ok ? `✅ 발송 접수 ${r.successCount}명 · 즉시 실패 ${r.failCount}명 (최종 수신 결과는 SOLAPI에서 확인)` : "발송 확인 필요: " + (r?.error || "알 수 없는 오류"));
      setAlertPreview(null);
      setAlertIncluded([]);setAlertExcluded([]);
    } finally {
      alertBusy.current=false;
      setAlertSending(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (activeBroadcast) return "방송중";
    return "대기";
  }, [activeBroadcast]);

  const saveCurrentBroadcast = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setTitleSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  const applyYoutubeUrl = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setUrlAppliedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  return (
    <header className="mb-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      {/* 상단줄: 제목 + 날짜 + 상태배지 + [＋새 방송][▶방송시작][■방송종료] */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-[18px] font-black tracking-tight text-rose-deep md:text-[20px]">방송 컨트롤타워</h1>

        <div className="hidden h-6 w-px bg-line md:block" />

        <div className="hidden text-xs font-black text-ink-soft sm:block">📅 {todayLabel()}</div>

        <div
          className={[
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
            statusLabel === "방송중" ? "bg-ok-bg text-ok-tx" : "bg-warn-bg text-warn-tx",
          ].join(" ")}
        >
          <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-[var(--color-ok-tx)]" : "bg-[var(--color-warn-tx)]"].join(" ")} />
          {statusLabel}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* ＋새 방송은 상품 관리 팝업 > 방송 상품 탭으로 이동(중복 제거) */}
          <button
            type="button"
            disabled={savingBroadcast || Boolean(activeBroadcast)}
            onClick={() => onStartBroadcast({ title, youtubeUrl })}
            className="h-9 rounded-xl bg-[var(--color-ok-tx)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[var(--color-ok-tx)] disabled:bg-line disabled:text-ink-mute"
          >
            ▶ 방송시작
          </button>
          <button
            type="button"
            disabled={savingBroadcast || !activeBroadcast}
            onClick={onEndBroadcast}
            className="h-9 rounded-xl bg-[var(--color-danger-tx)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[var(--color-danger-tx)] disabled:bg-line disabled:text-ink-mute"
          >
            ■ 방송종료
          </button>
          {activeBroadcast && (
            <button
              type="button"
              className="h-9 rounded-xl bg-[var(--color-info-tx)] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[var(--color-info-tx)] disabled:bg-line disabled:text-ink-mute"
              onClick={openAlert}
            >
              📣 방송알림
            </button>
          )}
        </div>
      </div>

      {/* 압축 상태바: ● 방송명 · 상품 N개 · 시작시간 + 우측 [쇼핑몰 토글][URL 수정] */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-xs font-black text-ink-soft">
        <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-[var(--color-ok-tx)]" : "bg-[var(--color-warn-tx)]"].join(" ")} />
        <span className="text-ink">{title.trim() || activeBroadcast?.public_title || "방송명 미설정"}</span>
        <span className="text-ink-mute">·</span>
        <span>상품 {typeof productCount === "number" ? productCount : "—"}개</span>
        <span className="text-ink-mute">·</span>
        <span>{activeBroadcast?.started_at ? `시작 ${formatBroadcastTime(activeBroadcast.started_at)}` : "방송시작 전"}</span>
        <span className="hidden text-ink-mute md:inline">· 주문묶음=방송 시작~종료 기준</span>

        <div className="ml-auto flex items-center gap-2">
          {/* [2026-08-31 사장님 요청] 현재 고정 상품 안내문구 재복사 — 상품관리 안 열고도 원클릭 */}
          <button
            type="button"
            disabled={!activeBroadcast || copyingCurrent}
            onClick={() => void copyCurrentProductLine()}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
              currentCopied ? "bg-[var(--color-ok-tx)] text-white" : "bg-rose-soft text-rose-deep",
            ].join(" ")}
            title={activeBroadcast ? "지금 고정된 상품의 채팅 안내문구를 다시 복사합니다 — 유튜브 채팅에 붙여넣기만 하세요" : "방송 중에만 사용할 수 있습니다"}
          >
            {copyingCurrent ? "복사 중…" : currentCopied ? "✔ 복사됨" : "📢 현재상품 복사"}
          </button>
          {/* [2026-07-12] 위젯 상품카드 ON/OFF — 방송 중에만 활성. 카드만 숨김(위젯 투명), 배너는 PRISM 소스라 무관 */}
          <button
            type="button"
            disabled={!activeBroadcast}
            onClick={() => onToggleWidgetCard?.()}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
              widgetCardOn ? "bg-ok-bg text-ok-tx" : "bg-surface-3 text-ink-soft",
            ].join(" ")}
            title={activeBroadcast ? "방송 위젯의 상품카드를 켜고 끕니다 (위젯 반영 최대 20초)" : "방송 중에만 사용할 수 있습니다"}
          >
            📺 상품 카드 {widgetCardOn ? "ON" : "OFF"}
          </button>
          {/* 쇼핑몰 열기/닫기 — settings.shop_open 영속. 방송 ON 중엔 의미 없어 비활성. */}
          <button
            type="button"
            disabled={Boolean(activeBroadcast)}
            onClick={() => onToggleShopOpen?.()}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
              shopOpen ? "bg-ok-bg text-ok-tx" : "bg-surface-3 text-ink-soft",
            ].join(" ")}
            title={activeBroadcast ? "방송 중에는 쇼핑몰 토글을 사용할 수 없습니다" : "쇼핑몰 열기/닫기"}
          >
            🛍 쇼핑몰 {shopOpen ? "열림" : "닫힘"}
          </button>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className="h-7 rounded-lg border border-line bg-surface px-2.5 text-[11px] font-black text-ink-soft transition hover:bg-surface-2"
          >
            {editOpen ? "닫기 ▲" : "제목·URL 수정 ▼"}
          </button>
        </div>
      </div>

      {/* 인라인 편집(접힘): 평소엔 숨김. controlled 값/onChange/저장·적용 disabled 그대로 */}
      {editOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-black text-ink-soft">방송 제목</label>
              <span className="text-[11px] font-bold text-ink-mute">
                {titleSavedAt ? `저장 ${titleSavedAt}` : activeBroadcast ? "방송중" : "저장 필요"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-line focus:ring-2 focus:ring-rose-soft"
              />
              <button
                type="button"
                disabled={savingBroadcast || !activeBroadcast}
                onClick={saveCurrentBroadcast}
                className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white transition hover:opacity-90 disabled:bg-line disabled:text-ink-mute"
              >
                저장
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-black text-ink-soft">유튜브 라이브 URL</label>
              <span className="text-[11px] font-bold text-ink-mute">
                {urlAppliedAt ? `적용 ${urlAppliedAt}` : "영상/채팅 연결"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={youtubeUrl}
                onChange={(event) => onYoutubeUrlChange(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-line focus:ring-2 focus:ring-rose-soft"
              />
              <button
                type="button"
                disabled={savingBroadcast || !activeBroadcast}
                onClick={applyYoutubeUrl}
                className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white transition hover:opacity-90 disabled:bg-line disabled:text-ink-mute"
              >
                적용
              </button>
            </div>
          </div>

          {/* [2026-09-12] 📌 위젯 고정 공지 — «이번 방송» 동안 주문·입금 알림 위젯 맨 위 한 줄(60자). 비우고 저장 = 숨김. 방송 없으면 비활성 */}
          <div className="xl:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-black text-ink-soft">📌 방송 화면 공지 <span className="font-bold text-ink-mute">— 주문·입금 알림 맨 아래에 뜸 · 비우면 안 뜸</span></label>
              <div className="flex items-center gap-2">
                {/* [2026-09-16 사장님 «몇 자 넘으면 2줄로 넘어가?»] 방송 화면 폭 실측 기준으로 지금 문구가 어떻게 뜰지 바로 보여준다.
                    [2026-09-20] 2줄은 더 이상 «나쁜 상태»가 아니다 — 사장님 「좌우 여백 살려서 폰트도 키우라」 지침 이후
                      길면 글자를 쪼그라뜨리는 대신 원래 크기로 2줄을 쓴다. 그래서 경고가 아니라 «있는 그대로» 알려준다. */}
                {pinText.trim() ? (() => {
                  const pin = feedPinLayout(pinText);
                  const biggest = pin.fontSize >= FEED_PIN_SIZE;
                  const label = `${pin.lines === 1 ? "한 줄" : "2줄"} · 글자 ${biggest ? "제일 큼" : `${pin.fontSize}px`}`;
                  return biggest
                    ? <span className="text-[11px] font-black text-ok-tx">{label}</span>
                    : <span className="text-[11px] font-black text-warn-tx">{label} <span className="font-bold text-ink-mute">(짧게 쓰면 {FEED_PIN_SIZE}px까지 커짐)</span></span>;
                })() : null}
                <span className="text-[11px] font-bold text-ink-mute">{pinSavedAt ? `저장 ${pinSavedAt}` : activeBroadcast ? "방송 끝나면 자동으로 지워짐" : "방송 시작 후 쓸 수 있음"}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={pinText}
                maxLength={60}
                disabled={!activeBroadcast}
                onChange={(event) => setPinText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void savePinText(); } }}
                placeholder={activeBroadcast ? "예) 입금자명은 닉네임으로 보내주세요 🙏 (길면 글자가 작아지며 한 줄로 맞춰짐)" : "방송을 시작한 뒤에 쓸 수 있어요 (방송마다 새로 씁니다)"}
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-line focus:ring-2 focus:ring-rose-soft disabled:opacity-50"
              />
              <button
                type="button"
                disabled={pinSaving || !activeBroadcast}
                onClick={() => void savePinText()}
                className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white transition hover:opacity-90 disabled:bg-line disabled:text-ink-mute"
              >
                {pinSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 방송알림 발송 모달: 대상(신청자/전체) 선택 + 이미 받은 사람 제외(증분) + 미리보기 */}
      {alertOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !alertSending && setAlertOpen(false)}
        >
          <div
            role="dialog" aria-modal="true" aria-label="방송알림 발송"
            className="w-full max-w-[960px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl bg-surface p-4 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[14px] font-black text-ink">📣 방송알림 발송</div>
              <button
                type="button"
                onClick={() => !alertSending && setAlertOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-black text-ink-mute hover:bg-surface-2"
              >
                ✕
              </button>
            </div>

            {/* 대상 선택 */}
            <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button type="button" disabled={alertSending} onClick={() => changeAlertMode("priority")} className={`h-10 rounded-xl text-sm font-black border border-line ${alertMode === "priority" ? "bg-info-tx text-white" : "text-ink-soft"}`}>단골 · 최근 신청자 랜덤</button>
              <button
                type="button"
                disabled={alertSending || alertPreviewLoading} onClick={() => changeAlertMode("optin")}
                className={[
                  "h-10 rounded-xl text-sm font-black transition",
                  alertMode === "optin" ? "bg-[var(--color-info-tx)] text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2",
                ].join(" ")}
              >
                알림 신청자만
              </button>
              <button
                type="button"
                disabled={alertSending || alertPreviewLoading} onClick={() => changeAlertMode("all")}
                className={[
                  "h-10 rounded-xl text-sm font-black transition",
                  alertMode === "all" ? "bg-[var(--color-danger-tx)] text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2",
                ].join(" ")}
              >
                전체 회원 ⚠️
              </button>
            </div>

            {alertMode === "priority" && <div className="mb-4 rounded-xl border border-line p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ["발송 인원 (최대)", alertLimit, setAlertLimit, 10000],
                  ["최근 주문 조회 기간 (일)", alertOrderDays, setAlertOrderDays, 365],
                  ["최근 알림 신청 기간 (일)", alertRecentDays, setAlertRecentDays, 365],
                ] as const).map(([label, value, setter, max]) => <label key={label} className="text-sm font-bold text-ink">{label}<input type="number" min={1} max={max} step={1} disabled={alertSending} value={value} onChange={e => { setter(e.target.value); alertRequest.current++; setAlertPreview(null); setAlertPreviewLoading(false); }} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>)}
              </div>
              <p className="mt-2 text-sm text-ink-soft">알림 ON 회원 중 최근 주문일이 많은 단골과 주문을 시작한 최근 알림 신청자를 중심으로 랜덤 선정합니다. 주문일이 많을수록 우선합니다. 조회 기간 내 주문이 없는 최근 신청자는 입력 인원의 최대 5%만 포함하며, 소수점은 버립니다. 주문 회원이 부족해도 이 제한을 넘어 채우지 않습니다.</p>
              <button type="button" disabled={alertSending || alertPreviewLoading} onClick={() => void loadAlertPreview("priority")} className="mt-3 rounded-lg border border-line px-4 py-2 font-bold">{alertPreviewLoading ? "선정 중…" : "대상 선정 / 다시 뽑기"}</button>
            </div>}

            {alertMode === "all" && (
              <div className="mb-3 rounded-xl border border-danger-tx/35 bg-danger-bg px-3 py-2 text-[12px] font-bold text-danger-tx">
                ⚠️ 신청 안 한 회원에게도 발송합니다. 동의 미확인자 발송은 카카오 알림톡 채널이 제재/차단될 수 있어요.
              </div>
            )}

            {/* 미리보기 */}
            <div className="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink">
              {alertPreviewLoading ? (
                <div className="text-ink-mute">대상 계산 중…</div>
              ) : alertPreview ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>후보 <b className="text-ink">{alertPreview.candidateCount}</b>명</span>
                  <span className="text-ink-mute">·</span>
                  <span>발송 처리 이력 <b className="text-ink">{alertPreview.receivedCount}</b>명</span>
                  <span className="text-ink-mute">·</span>
                  <span className="text-info-tx">이번에 받을 <b>{alertPreview.targetCount}</b>명</span>
                </div>
              ) : (
                <div className="text-ink-mute">{alertResult ? "발송 결과는 아래 안내를 확인해 주세요." : "대상 없음"}</div>
              )}
            </div>

            {alertMode === "priority" && alertPreview?.selectionGroups && <div aria-label="선정 그룹별 인원" className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-line px-3 py-3 text-sm font-bold text-ink">
              <span>단골 {alertPreview.selectionGroups.frequent}명 <small className="block text-ink-mute">최근 주문일 2일 이상</small></span>
              <span>주문 시작 회원 {alertPreview.selectionGroups.newBuyer}명 <small className="block text-ink-mute">최근 주문일 1일 · 수동 포함도 집계</small></span>
              <span>최근 주문 없음 {alertPreview.selectionGroups.noRecentOrders}명 / 최대 {alertPreview.selectionGroups.noRecentOrdersMax}명 <small className="block text-ink-mute">수동 포함도 입력 인원의 5% 이내</small></span>
            </div>}

            {alertPreview && <div className="mb-3 rounded-xl border border-line p-3">
              <div className="flex flex-wrap gap-2 mb-3">
                {([["selected","선정 명단"],["members","회원 추가"],["excluded","제외 명단"]] as const).map(([value,label])=><button key={value} type="button" disabled={alertSending || alertPreviewLoading} onClick={()=>setAlertList(value)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${alertList===value?"bg-info-tx text-white":"border-line text-ink"}`}>{label}</button>)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2">
                <input aria-label="명단 검색" type="search" value={alertSearch} onChange={e=>setAlertSearch(e.target.value)} placeholder="회원 이름 또는 전화번호 뒤 4자리 검색" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                <select aria-label="명단 정렬" value={alertSort} onChange={e=>setAlertSort(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm"><option value="name">이름 가나다순</option><option value="orders">최근 주문일 수 많은순</option><option value="group">수동 포함 우선</option></select>
              </div>
              <p className="mt-2 text-sm font-bold text-ink">전체 선정 {alertPreview.targetCount}명 · 검색 결과 {visibleAlertMembers.length}명 · 수동 포함 {alertIncluded.length}명 · 제외 {alertExcluded.length}명</p>
              <p className="mt-1 text-xs text-ink-soft">검색·정렬은 표시만 바꿉니다. 발송은 전체 선정 명단에 진행합니다. 직접 포함·제외한 회원은 다시 뽑아도 유지됩니다. 회원 추가는 알림 ON·발송 이력 없는 회원만 가능합니다.</p>
            </div>}

            {alertPreview ? (
              <div className="mb-3 max-h-[min(52dvh,480px)] overflow-auto rounded-xl border border-line">
                <div className="sticky top-0 bg-surface-2 px-3 py-1.5 text-[11px] font-black text-ink-soft">
                  {alertList==="selected"?"이번 발송 명단":alertList==="members"?"추가 가능한 회원":"이번 명단에서 제외한 회원"} · {visibleAlertMembers.length}명 표시
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2">
                  {visibleAlertMembers.map((s, i) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-3 text-sm font-bold text-ink">
                      <span className="min-w-0 break-words">{i + 1}. {s.name || "(이름없음)"}{(s.manual||alertIncluded.includes(s.id))&&<small className="ml-1 text-info-tx">직접 포함</small>}{s.orderDays !== undefined && <small className="block text-ink-mute">주문 {s.orderDays}일{s.recent ? " · 최근 신청" : ""}</small>}<small className="block text-ink-mute">{s.phone}</small></span>
                      {alertList==="selected"||alertPreview.sample.some((p:AlertMember)=>p.id===s.id)?<button type="button" disabled={alertSending||alertPreviewLoading} onClick={()=>editAlertMember(s.id,false)} className="shrink-0 rounded-lg border border-line px-3 py-2 text-danger-tx">제외</button>:<button type="button" disabled={alertSending||alertPreviewLoading} onClick={()=>editAlertMember(s.id,true)} className="shrink-0 rounded-lg border border-line px-3 py-2 text-info-tx">{alertList==="excluded"?"다시 포함":"포함"}</button>}
                    </li>
                  ))}
                </ul>
                {!visibleAlertMembers.length&&<p className="p-4 text-sm text-ink-mute">표시할 회원이 없습니다.</p>}
              </div>
            ) : null}

            {alertResult && !alertPreviewLoading && (
              <div className="mb-3 text-[13px] font-black text-ink">{alertResult}</div>
            )}

            {/* 발송 버튼 */}
            <button
              type="button"
              disabled={alertSending || alertPreviewLoading || !alertPreview || Number(alertPreview?.targetCount || 0) === 0}
              onClick={sendAlert}
              className={[
                "h-11 w-full rounded-xl text-sm font-black text-white transition disabled:bg-line disabled:text-ink-mute",
                alertMode === "all" ? "bg-[var(--color-danger-tx)] hover:bg-[var(--color-danger-tx)]" : "bg-[var(--color-info-tx)] hover:bg-[var(--color-info-tx)]",
              ].join(" ")}
            >
              {alertSending
                ? "발송 중…"
                : Number(alertPreview?.targetCount || 0) > 0
                  ? `${alertPreview.targetCount}명에게 발송`
                  : "받을 사람 없음"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
