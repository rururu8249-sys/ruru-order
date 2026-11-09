"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminLiveBroadcast } from "./liveBroadcastController";
import { formatBroadcastTime } from "./liveBroadcastController";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { buildChatAnnounceText } from "@/lib/chatAnnounce";
import { buildDetailChatLine, detailProducts } from "@/lib/productDetailModel";
import { LIVE_PAUSED_TEXT_KEY, LIVE_PAUSED_TEXT_DEFAULT, LIVE_PAUSED_TEXT_MAX } from "@/lib/livePausedText";
import { LIVE_WATCH_KEY, LIVE_WATCH_DEFAULT, parseLiveWatchSetting, serializeLiveWatchSetting, type LiveWatchSetting } from "@/lib/liveWatch";
import { LIVE_CHAT_KEY, LIVE_CHAT_DEFAULT, parseLiveChatSetting, serializeLiveChatSetting, type LiveChatSetting } from "@/lib/liveChat";
import { LIVE_CHAT_BOT_KEY, LIVE_CHAT_BOT_DEFAULT, LIVE_CHAT_BOT_DEFAULT_FAQS, parseLiveChatBotSetting, serializeLiveChatBotSetting, type LiveChatBotSetting } from "@/lib/liveChatBot";

type VideoRatio = "vertical" | "wide" | "auto";
type AlertMember = { id: string; cid?: string; name: string; phone: string; orderDays?: number; recent?: boolean; manual?: boolean };
type AlertBlockItem = { id: string; customerId: string; name: string; nickname: string; phone: string; at: string };
type AlertBlockResult = { customerId: string; name: string; nickname: string; phone: string; optin: boolean | null; blocked: boolean };

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

export default function LiveHeader({
  activeBroadcast,
  savingBroadcast = false,
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

  const activeBroadcastId = activeBroadcast?.id ?? "";
  // [2026-11-10] 「방송 화면 공지」(broadcasts.feed_pin_text) 입력칸 삭제 — 띄우던 주문·입금 알림 위젯이 11/09 폐지돼 어디에도 안 나왔음. 저장값·onSaveFeedPin 은 그대로 둠.
  // [2026-11-09 사장님 13:55 「잠시 쉬는 중 문구 내가 수정할 수 있게」] 손님 화면 「잠시 쉬는 중」 문구 — settings live_paused_text(방송과 무관한 상시 설정, 비우면 기본 문구).
  //   저장은 손님 공지 설정과 같은 settings upsert(한 키만). 손님 화면은 loadBroadcast 가 읽는다(돈·주문 무관, 표시만).
  const [pausedText, setPausedText] = useState("");
  const [pausedTextSaved, setPausedTextSaved] = useState("");
  const [pausedSaving, setPausedSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.from("settings").select("value").eq("key", LIVE_PAUSED_TEXT_KEY).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const v = String(data?.value ?? "").trim();
      setPausedText(v);
      setPausedTextSaved(v);
    });
    return () => { alive = false; };
  }, []);
  // [2026-11-09] 「방송 보며 주문」 — 손님 주문서에서 방송 영상을 보며 담기. 누구에게(끔/관리자 시험 계정만/모든 손님)·처음 화면.
  //   settings 한 키(live_watch_v1). 손님 화면 loadBroadcast 가 읽는다(표시만 — 담기·주문은 기존 그대로).
  const [liveWatch, setLiveWatch] = useState<LiveWatchSetting>(LIVE_WATCH_DEFAULT);
  const [liveWatchSaving, setLiveWatchSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle().then(({ data }) => {
      if (alive) setLiveWatch(parseLiveWatchSetting(data?.value));
    });
    return () => { alive = false; };
  }, []);
  const saveLiveWatch = async (next: LiveWatchSetting) => {
    if (liveWatchSaving) return;
    const prev = liveWatch;
    setLiveWatch(next);
    setLiveWatchSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert([{ key: LIVE_WATCH_KEY, value: serializeLiveWatchSetting(next) }], { onConflict: "key" });
      if (error) throw error;
      showAdminToast(next.audience === "off" ? "「방송 보며 주문」을 껐어요." : next.audience === "admin" ? "관리자 시험 계정에만 보여요. 손님 화면을 새로고침하면 나와요." : "모든 손님에게 켰어요. 새로 들어오는 손님부터 보여요.", "success");
    } catch {
      setLiveWatch(prev);
      showAdminToast("설정 저장에 실패했어요.", "error");
    } finally {
      setLiveWatchSaving(false);
    }
  };

  // [2026-11-10 사장님 05:54] 시험 손님(베타테스터) — 「시험 손님만」일 때 보이는 손님. 넣기·빼기는 서버(live-watch-testers)가 phones 한 칸만 바꿈.
  type Tester = { key: string; phone: string; nickname: string; name: string; op?: boolean };
  type TesterResult = Tester & { tester: boolean };
  const [testers, setTesters] = useState<Tester[]>([]);
  const [testerQuery, setTesterQuery] = useState("");
  const [testerResults, setTesterResults] = useState<TesterResult[]>([]);
  const [testerSearching, setTesterSearching] = useState(false);
  const [testerBusy, setTesterBusy] = useState(false);
  const testerSeq = useRef(0);
  const testerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin-live/live-watch-testers", { cache: "no-store" }).then((r) => r.json()).then((r) => { if (alive && r?.ok) setTesters(r.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const searchTesters = (value: string) => {
    setTesterQuery(value);
    const q = value.trim();
    const seq = ++testerSeq.current;
    if (testerTimer.current) clearTimeout(testerTimer.current);
    if (!q) { setTesterResults([]); setTesterSearching(false); return; }
    setTesterSearching(true);
    testerTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/admin-live/live-watch-testers?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((res) => res.json()).catch(() => null);
      if (seq !== testerSeq.current) return;
      setTesterResults(r?.ok ? r.results || [] : []);
      setTesterSearching(false);
    }, 300);
  };
  const setTester = async (key: string, add: boolean, label: string) => {
    if (testerBusy) return;
    setTesterBusy(true);
    try {
      const r = await fetch("/api/admin-live/live-watch-testers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, add }) }).then((res) => res.json());
      if (!r?.ok) { showAdminToast(r?.message || "저장 못 했어요.", "error"); return; }
      const items = (r.items || []) as Tester[];
      setTesters(items);
      setLiveWatch((prev) => ({ ...prev, phones: items.map((t) => t.key) })); // 다른 설정 저장 때 옛 명단으로 덮지 않게
      setTesterResults((prev) => prev.map((x) => (x.key === key ? { ...x, tester: add } : x)));
      showAdminToast(add ? `${label || "손님"}님을 시험 손님에 넣었어요.` : `${label || "손님"}님을 뺐어요.`, "success");
    } catch {
      showAdminToast("저장 못 했어요.", "error");
    } finally {
      setTesterBusy(false);
    }
  };

  // [2026-11-10 ③] 사이트 채팅 설정(live_chat_v1) — 켜기·고정 공지·더 막을 말
  const [liveChat, setLiveChat] = useState<LiveChatSetting>(LIVE_CHAT_DEFAULT);
  const [liveChatNotice, setLiveChatNoticeDraft] = useState("");
  const [liveChatWords, setLiveChatWordsDraft] = useState("");
  const [liveChatSaving, setLiveChatSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.from("settings").select("value").eq("key", LIVE_CHAT_KEY).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const st = parseLiveChatSetting(data?.value);
      setLiveChat(st);
      setLiveChatNoticeDraft(st.notice);
      setLiveChatWordsDraft(st.words.join(", "));
    });
    return () => { alive = false; };
  }, []);
  const saveLiveChat = async (next: LiveChatSetting, okText: string) => {
    if (liveChatSaving) return;
    const prev = liveChat;
    const clean = parseLiveChatSetting(next);
    setLiveChat(clean);
    setLiveChatSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert([{ key: LIVE_CHAT_KEY, value: serializeLiveChatSetting(clean) }], { onConflict: "key" });
      if (error) throw error;
      setLiveChatNoticeDraft(clean.notice);
      setLiveChatWordsDraft(clean.words.join(", "));
      showAdminToast(okText, "success");
    } catch {
      setLiveChat(prev);
      showAdminToast("채팅 설정 저장에 실패했어요.", "error");
    } finally {
      setLiveChatSaving(false);
    }
  };

  // [2026-11-10] 루루동이AI(사이트 채팅 자동 안내) 설정 — live_chat_bot_v1. 자주 묻는 말은 방송마다 고쳐 저장
  const [bot, setBot] = useState<LiveChatBotSetting>(LIVE_CHAT_BOT_DEFAULT);
  const [botFaqDraft, setBotFaqDraft] = useState<{ words: string; answer: string }[]>([]);
  const [botSaving, setBotSaving] = useState(false);
  const [botFaqOpen, setBotFaqOpen] = useState(false);
  const toFaqDraft = (st: LiveChatBotSetting) => st.faqs.map((f) => ({ words: f.words.join(", "), answer: f.answer }));
  useEffect(() => {
    let alive = true;
    supabase.from("settings").select("value").eq("key", LIVE_CHAT_BOT_KEY).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const st = parseLiveChatBotSetting(data?.value);
      setBot(st);
      setBotFaqDraft(toFaqDraft(st));
    });
    return () => { alive = false; };
  }, []);
  const saveBot = async (next: LiveChatBotSetting, okText: string) => {
    if (botSaving) return;
    const prev = bot;
    const clean = parseLiveChatBotSetting(next);
    setBot(clean);
    setBotSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert([{ key: LIVE_CHAT_BOT_KEY, value: serializeLiveChatBotSetting(clean) }], { onConflict: "key" });
      if (error) throw error;
      setBotFaqDraft(toFaqDraft(clean));
      showAdminToast(okText, "success");
    } catch {
      setBot(prev);
      showAdminToast("루루동이AI 설정 저장에 실패했어요.", "error");
    } finally {
      setBotSaving(false);
    }
  };
  const botFaqChanged = JSON.stringify(botFaqDraft) !== JSON.stringify(toFaqDraft(bot));

  const savePausedText = async () => {
    if (pausedSaving) return;
    setPausedSaving(true);
    try {
      const value = pausedText.trim().slice(0, LIVE_PAUSED_TEXT_MAX);
      const { error } = await supabase.from("settings").upsert([{ key: LIVE_PAUSED_TEXT_KEY, value }], { onConflict: "key" });
      if (error) throw error;
      setPausedText(value);
      setPausedTextSaved(value);
      showAdminToast(value ? "「잠시 쉬는 중」 문구를 저장했어요. 손님 화면에 45초 안에 반영돼요." : "문구를 비워 기본 문구로 돌아가요.", "success");
    } catch {
      showAdminToast("문구 저장에 실패했어요.", "error");
    } finally {
      setPausedSaving(false);
    }
  };

  // [2026-11-06 사장님 「두 채널 다 채팅 주문글」·「방송화면 두 개면 정신없다」] 두 번째 채널 라이브 URL —
  //   주문 알림 채팅만 거기에도 올린다. 영상·채팅 화면은 위 메인 URL 하나 그대로. 이번 방송 동안만(방송 바뀌면 안 씀).
  const [secondUrl, setSecondUrl] = useState("");
  const [secondSaving, setSecondSaving] = useState(false);
  const [secondState, setSecondState] = useState("");
  const [secondOpen, setSecondOpen] = useState(false);
  useEffect(() => {
    if (!activeBroadcastId) return;
    let alive = true;
    fetch("/api/admin-live/second-live", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!alive || !j?.ok) return;
      setSecondUrl(String(j.url || ""));
      setSecondState(j.url ? (j.chatFound ? "두 채널에 올라가는 중" : "채팅방 찾는 중") : "");
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeBroadcastId]);
  const saveSecondUrl = async () => {
    if (secondSaving || !activeBroadcastId) return;
    setSecondSaving(true);
    try {
      const r = await fetch("/api/admin-live/second-live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: secondUrl.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { showAdminToast(String(j?.message || "저장 실패"), "error"); return; }
      setSecondUrl(String(j.url || ""));
      setSecondState(j.url ? (j.chatFound ? "두 채널에 올라가는 중" : "채팅방 찾는 중") : "");
      showAdminToast(String(j.message || "저장했어요."), j.url && !j.chatFound ? "warning" : "success");
    } catch {
      showAdminToast("두 번째 채널 저장에 실패했어요.", "error");
    } finally {
      setSecondSaving(false);
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
        showAdminToast("고정된 현재상품이 없습니다.\n\n상품 목록에서 「소개」를 먼저 눌러주세요.", "warning");
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
  // [2026-11-09] 같은 방송을 쉬었다 다시 시작할 때 «오늘 다시 알림» — 이 방송 알림을 이미 받은 사람에게도 한 번 더(오늘 한 번까지)
  const [alertAgain, setAlertAgain] = useState(false);
  // 발송이 끝나면(성공·실패 모두) 명단을 다시 받는다 — 예전엔 「명단을 불러오지 못했어요」로 멈춰 다시 보낼 수가 없었음(사장님 11/9 20:44)
  const [alertReloadTick, setAlertReloadTick] = useState(0);
  const [alertLimit, setAlertLimit] = useState("300");
  const [alertOrderDays, setAlertOrderDays] = useState("90");
  const [alertRecentDays, setAlertRecentDays] = useState("30");
  const alertRequest = useRef(0);
  const [alertIncluded, setAlertIncluded] = useState<string[]>([]);
  const [alertExcluded, setAlertExcluded] = useState<string[]>([]);
  const [alertSearch, setAlertSearch] = useState("");
  const [alertSort, setAlertSort] = useState("name");
  const [alertList, setAlertList] = useState<"selected" | "members" | "excluded" | "blocked">("selected");
  // [2026-11-01 사장님] «계속 제외» — 해제할 때까지 모든 방송알림에서 빠지는 회원(서버 비공개 저장소)
  const [blockItems, setBlockItems] = useState<AlertBlockItem[]>([]);
  const [blockQuery, setBlockQuery] = useState("");
  const [blockResults, setBlockResults] = useState<AlertBlockResult[]>([]);
  const [blockSearching, setBlockSearching] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockLoadError, setBlockLoadError] = useState("");
  const alertBusy = useRef(false);
  const [alertPreview, setAlertPreview] = useState<any>(null);
  const [alertPreviewLoading, setAlertPreviewLoading] = useState(false);
  const [alertSending, setAlertSending] = useState(false);
  const [alertResult, setAlertResult] = useState("");
  // [2026-11-09 사장님 「금액 맞춰 발송한 거 같은데 결과를 제대로 출력해」] 발송 결과는 명단 다시 불러와도 안 지워지게 따로 둠
  type AlertSendReport = { at: number; ok: boolean; target: number; success: number; fail: number; error: string; fit: { perPersonWon: number; notSent: number; needWon: number; depositBefore: number; depositAfterEst: number } | null };
  const [alertLastSend, setAlertLastSend] = useState<AlertSendReport | null>(null);
  // [2026-11-02 사장님 「알림톡 뭐로 쏠지 정해서」] 보낼 템플릿 — 설정 › 카톡 알림에 저장한 목록에서 고름
  const [alertTemplates, setAlertTemplates] = useState<{ id: string; name: string; fromEnv?: boolean }[]>([]);
  const [alertTemplateId, setAlertTemplateId] = useState("");
  const [tplAddOpen, setTplAddOpen] = useState(false);
  const [tplAddName, setTplAddName] = useState("");
  const [tplAddId, setTplAddId] = useState("");
  const [tplAddSaving, setTplAddSaving] = useState(false);
  // 발송 창에서 바로 템플릿 추가(설정 › 카톡 알림 › 방송 알림 템플릿과 같은 저장) → 추가한 것을 기본·선택으로
  const addAlertTemplate = async () => {
    const id = tplAddId.trim();
    const name = tplAddName.trim() || id;
    if (!id || tplAddSaving) return;
    setTplAddSaving(true);
    try {
      const list = [...alertTemplates.filter((t: { id: string; fromEnv?: boolean }) => !t.fromEnv && t.id !== id).map((t) => ({ id: t.id, name: t.name })), { id, name }];
      const r = await fetch("/api/admin-live/live-alert-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", list, defaultId: id }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { showAdminToast("템플릿 추가 실패\n\n" + (j?.message || `요청 실패(${r.status})`), "error"); return; }
      setAlertTemplates(Array.isArray(j.templates) ? j.templates : []);
      setAlertTemplateId(id);
      setTplAddOpen(false); setTplAddName(""); setTplAddId("");
      showAdminToast(`「${name}」 추가했어요. 이걸로 보내요.`, "success");
    } finally { setTplAddSaving(false); }
  };
  useEffect(() => {
    if (!alertOpen) return;
    let alive = true;
    fetch("/api/admin-live/live-alert-templates", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!alive || !j?.ok) return;
      const list = Array.isArray(j.templates) ? j.templates : [];
      setAlertTemplates(list);
      setAlertTemplateId((cur) => (cur && list.some((t: { id: string }) => t.id === cur) ? cur : String(j.defaultId || list[0]?.id || "")));
    }).catch(() => {});
    return () => { alive = false; };
  }, [alertOpen]);
  useEffect(() => { alertRequest.current++; setAlertPreview(null); setAlertPreviewLoading(false); setAlertIncluded([]); setAlertExcluded([]); setAlertResult(""); setAlertLastSend(null); }, [activeBroadcast?.id]);

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
        body: JSON.stringify({ broadcastId: activeBroadcast.id, again: alertAgain, dryRun: true, mode, limit: Number(alertLimit), orderDays: Number(alertOrderDays), recentDays: Number(alertRecentDays), includeIds:edits?.includeIds ?? alertIncluded,excludeIds:edits?.excludeIds ?? alertExcluded,selectionToken:edits?.selectionToken }),
      }).then((res) => res.json()).catch(() => null);
      if (requestId !== alertRequest.current) return;
      if (!r?.ok) { setAlertResult("대상 조회 실패: " + (r?.error || "권한/네트워크 확인")); return; }
      setAlertPreview(r);
      if(edits){setAlertIncluded(edits.includeIds);setAlertExcluded(edits.excludeIds);}
    } finally {
      if (requestId === alertRequest.current) setAlertPreviewLoading(false);
    }
  };

  const loadBlocks = async () => {
    try {
      const r = await fetch("/api/admin-live/live-alert-block", { cache: "no-store" }).then((res) => res.json()).catch(() => null);
      if (r?.ok) { setBlockItems(r.items || []); setBlockLoadError(""); }
      else setBlockLoadError("계속 제외 명단을 못 불러왔어요. 창을 다시 열어 주세요.");
    } catch { setBlockLoadError("계속 제외 명단을 못 불러왔어요. 창을 다시 열어 주세요."); }
  };
  const blockSearchSeq = useRef(0);
  const blockSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBlockCustomers = (value: string) => {
    setBlockQuery(value);
    const q = value.trim();
    const seq = ++blockSearchSeq.current;
    if (blockSearchTimer.current) clearTimeout(blockSearchTimer.current);
    if (!q) { setBlockResults([]); setBlockSearching(false); return; }
    setBlockSearching(true);
    blockSearchTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/admin-live/live-alert-block?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((res) => res.json()).catch(() => null);
      if (seq !== blockSearchSeq.current) return;
      setBlockResults(r?.ok ? r.results || [] : []);
      if (r?.ok) setBlockItems(r.items || []);
      setBlockSearching(false);
    }, 300);
  };
  // 계속 제외를 바꾸면 명단을 다시 받는다(단골 모드는 뽑은 명단 유지, 나머지는 새로 계산)
  // 「오늘 다시 알림」을 켜고 끄면 명단을 새로 받는다(바뀐 값으로 계산되게 렌더 뒤에)
  const againMounted = useRef(false);
  useEffect(() => {
    if (!againMounted.current) { againMounted.current = true; return; }
    if (alertOpen) void loadAlertPreview(alertMode, { includeIds: [], excludeIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertAgain]);
  const refreshAfterBlock = () => {
    if (alertMode === "priority") {
      if (alertPreview?.selectionToken) void loadAlertPreview("priority", { includeIds: alertIncluded, excludeIds: alertExcluded, selectionToken: alertPreview.selectionToken });
    } else void loadAlertPreview(alertMode, { includeIds: alertIncluded, excludeIds: alertExcluded });
  };
  const addBlock = async (customerIds: string[], label?: string) => {
    if (blockBusy || alertSending || !customerIds.length) return;
    setBlockBusy(true);
    try {
      const r = await fetch("/api/admin-live/live-alert-block", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", customerIds }) }).then((res) => res.json()).catch(() => null);
      if (!r?.ok) { showAdminToast("계속 제외 실패\n\n" + (r?.message || "다시 눌러 주세요."), "error"); return; }
      setBlockItems(r.items || []);
      setBlockResults((rows) => rows.map((x) => (customerIds.includes(x.customerId) ? { ...x, blocked: true } : x)));
      showAdminToast(`${label || "회원"} 계속 제외`, "success");
      refreshAfterBlock();
    } finally { setBlockBusy(false); }
  };
  const removeBlock = async (ids: string[], label?: string) => {
    if (blockBusy || alertSending || !ids.length) return;
    setBlockBusy(true);
    try {
      const r = await fetch("/api/admin-live/live-alert-block", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", ids }) }).then((res) => res.json()).catch(() => null);
      if (!r?.ok) { showAdminToast("해제 실패\n\n" + (r?.message || "다시 눌러 주세요."), "error"); return; }
      setBlockItems(r.items || []);
      setBlockResults((rows) => rows.map((x) => (r.items || []).some((b: AlertBlockItem) => b.customerId === x.customerId) ? x : { ...x, blocked: false }));
      showAdminToast(`${label || "회원"} 제외 해제`, "success");
      refreshAfterBlock();
    } finally { setBlockBusy(false); }
  };

  const openAlert = () => {
    if (!activeBroadcast || alertBusy.current) return;
    setAlertOpen(true);
    searchBlockCustomers("");
    void loadBlocks();
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
      const okAll = await showAdminConfirm(`신청 안 한 회원까지 ${count}명에게 발송합니다.\n보낼 알림톡: ${alertTemplates.find((t) => t.id === alertTemplateId)?.name || "기본"}\n동의 미확인자 발송은 카카오 채널 제재 위험이 있습니다.\n정말 보낼까요?`, { title: "전체 발송", confirmText: "전체 발송", cancelText: "취소", tone: "danger" });
      if (!okAll) return;
    } else {
      const okSend = await showAdminConfirm(`${count}명에게 방송알림을 발송합니다.\n보낼 알림톡: ${alertTemplates.find((t) => t.id === alertTemplateId)?.name || "기본"}\n계속할까요?`, { title: "방송알림 발송", confirmText: "발송", cancelText: "취소", tone: "info" });
      if (!okSend) return;
    }
    setAlertResult("");
      const r = await fetch("/api/admin-live/live-alert-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: activeBroadcast.id, again: alertAgain, mode: alertMode, selectionToken, templateId: alertTemplateId || undefined }),
      }).then((res) => res.json()).catch(() => null);
      // [2026-11-08] 실패하면 이유를 그대로(잔액 부족 등) — 서버가 실패한 사람을 「이미 받음」에서 빼 두니 다시 뽑기 → 발송으로 재시도
      setAlertResult(r?.ok ? "" : "발송 실패: " + (r?.error || "알 수 없는 오류"));
      setAlertLastSend({ at: Date.now(), ok: !!r?.ok, target: Number(r?.targetCount) || 0, success: Number(r?.successCount) || 0, fail: Number(r?.failCount) || 0, error: String(r?.error || (r ? "" : "응답 없음(네트워크)")), fit: r?.fit || null });
      setAlertPreview(null);
      setAlertIncluded([]);setAlertExcluded([]);
    } finally {
      alertBusy.current=false;
      setAlertSending(false);
      setAlertReloadTick((t) => t + 1);
    }
  };

  useEffect(() => {
    if (alertReloadTick > 0 && alertOpen && !alertSending) void loadAlertPreview(alertMode, { includeIds: [], excludeIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertReloadTick, alertSending]);

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

  // [2026-11-10 사장님 05:54 「방송관리 정신 사납다 — 필요 없는 것 지우고 예쁘게」] 방송 관리 창 다시 정리.
  //   묶음 4개(방송 / 방송 보며 주문 / 사이트 채팅 / 루루동이 자동 안내) + 기타(쉬는 중 문구·도구). 켬/끔은 오른쪽 스위치 하나.
  //   저장 버튼은 «고친 게 있을 때만» 보임. 「방송 화면 공지」 칸은 뺌(그 공지를 띄우던 주문·입금 알림 위젯이 11/09 폐지돼 어디에도 안 나왔음).
  //   저장·적용·알림·토글 함수는 전부 그대로.
  const fieldCls = "h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-ink disabled:bg-surface-2 disabled:text-ink-mute";
  const primaryCls = "h-10 shrink-0 rounded-lg bg-ink px-4 text-[13px] font-bold text-white transition disabled:opacity-40";
  const secondaryCls = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
  const sectionCls = "border-t border-line pt-5";
  const titleCls = "text-[16px] font-bold text-ink";
  const subCls = "mt-0.5 text-[13px] text-ink-mute";
  const watchOn = liveWatch.audience !== "off";
  const chatOn = watchOn && liveChat.enabled;
  return (
    <header className="space-y-5">
      {/* 상태 + 알림 보내기 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-danger-tx" : "bg-line"].join(" ")} />
        <span className="text-[16px] font-bold text-ink">{statusLabel === "방송중" ? "방송 중" : "방송 대기"}</span>
        <span className="text-[13px] text-ink-mute">
          {activeBroadcast?.started_at ? `${formatBroadcastTime(activeBroadcast.started_at)} 시작` : "시작 전"} · 상품 {typeof productCount === "number" ? productCount : "—"}개
        </span>
        {activeBroadcast ? (
          <button type="button" className={`${primaryCls} ml-auto`} onClick={openAlert} title="방송 알림톡을 보낼 손님을 고르고 발송">알림 보내기</button>
        ) : null}
      </div>

      {/* ① 방송 — 제목·라이브 주소 */}
      <section className={sectionCls}>
        <h3 className={titleCls}>방송</h3>
        <div className="mt-3 space-y-3">
          <FormRow label="제목" hint={titleSavedAt ? `저장 ${titleSavedAt}` : ""}>
            <input value={title} onChange={(event) => onTitleChange(event.target.value)} disabled={!activeBroadcast} placeholder={activeBroadcast ? "" : "방송 시작 때 정해요"} className={fieldCls} />
            <button type="button" disabled={savingBroadcast || !activeBroadcast} onClick={saveCurrentBroadcast} className={primaryCls}>저장</button>
          </FormRow>
          <FormRow label="유튜브 라이브 주소" hint={urlAppliedAt ? `적용 ${urlAppliedAt}` : ""}>
            <input value={youtubeUrl} onChange={(event) => onYoutubeUrlChange(event.target.value)} disabled={!activeBroadcast} placeholder="https://www.youtube.com/watch?v=..." className={fieldCls} />
            <button type="button" disabled={savingBroadcast || !activeBroadcast} onClick={applyYoutubeUrl} className={primaryCls}>적용</button>
          </FormRow>
          {secondOpen || secondUrl.trim() ? (
            <FormRow label="두 번째 채널 주소" hint={secondState || "주문 알림 채팅만 같이 올림 · 비우고 적용하면 끔"}>
              <input value={secondUrl} disabled={!activeBroadcast} onChange={(event) => setSecondUrl(event.target.value)} placeholder="동시 방송하는 다른 채널 라이브 주소" className={fieldCls} />
              <button type="button" disabled={secondSaving || !activeBroadcast} onClick={() => void saveSecondUrl()} className={primaryCls}>{secondSaving ? "적용 중…" : "적용"}</button>
            </FormRow>
          ) : (
            <button type="button" disabled={!activeBroadcast} onClick={() => setSecondOpen(true)} className="text-[13px] font-bold text-ink-soft underline-offset-2 hover:underline disabled:opacity-40">+ 두 번째 채널 동시 방송</button>
          )}
        </div>
      </section>

      {/* ② 방송 보며 주문 — 누구에게·처음 화면·시험 손님 */}
      <section className={sectionCls}>
        <h3 className={titleCls}>방송 보며 주문</h3>
        <p className={subCls}>손님 주문서에서 방송 영상을 보며 바로 담기</p>
        <div className="mt-3 space-y-3">
          <OptionRow label="보이는 손님">
            <Segmented value={liveWatch.audience} disabled={liveWatchSaving} options={[["off", "끔"], ["admin", "시험 손님만"], ["all", "모든 손님"]]} onChange={(v) => void saveLiveWatch({ ...liveWatch, audience: v })} />
          </OptionRow>
          {watchOn ? (
            <OptionRow label="처음 화면">
              <Segmented value={liveWatch.firstView} disabled={liveWatchSaving} options={[["live", "방송 화면"], ["shop", "쇼핑몰 화면"]]} onChange={(v) => void saveLiveWatch({ ...liveWatch, firstView: v })} />
            </OptionRow>
          ) : null}
          {liveWatch.audience === "admin" ? (
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-bold text-ink">시험 손님 {testers.length}명</span>
                <span className="text-[12px] text-ink-mute">관리자 시험 계정은 늘 포함 · 잠시 멈춤 중에도 시험 가능</span>
              </div>
              {testers.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {testers.map((t) => (
                    <span key={t.key} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[13px] text-ink">
                      <b className="font-bold">{t.nickname || t.name || "이름 없음"}</b>
                      {t.nickname && t.name ? <span className="text-ink-soft">{t.name}</span> : null}
                      <span className="text-ink-mute">{t.phone.slice(-4)}</span>
                      {t.op ? <span className="rounded bg-surface-2 px-1 text-[11px] font-bold text-ink-soft">관리자 번호</span> : null}
                      <button type="button" disabled={testerBusy} onClick={() => void setTester(t.key, false, t.nickname || t.name)} aria-label={`${t.nickname || t.name} 빼기`} className="flex h-7 w-7 items-center justify-center rounded-full text-ink-mute hover:bg-surface-2 hover:text-ink">
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <input value={testerQuery} onChange={(e) => searchTesters(e.target.value)} type="search" placeholder="시험 손님 추가 · 닉네임 · 이름 · 전화 뒤 4자리" aria-label="시험 손님 찾기" className={`${fieldCls} mt-2 w-full`} />
              {testerQuery.trim() ? (
                <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface">
                  {testerSearching ? <li className="px-3 py-2 text-[13px] text-ink-mute">찾는 중…</li> : null}
                  {!testerSearching && testerResults.length === 0 ? <li className="px-3 py-2 text-[13px] text-ink-mute">맞는 회원이 없어요</li> : null}
                  {testerResults.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink"><b className="font-bold">{r.nickname || "-"}</b> <span className="text-ink-soft">{r.name}</span> <span className="text-[12px] text-ink-mute">{r.phone}</span></span>
                      {r.tester ? <span className="text-[12px] font-bold text-ink-mute">넣음</span> : (
                        <button type="button" disabled={testerBusy} onClick={() => void setTester(r.key, true, r.nickname || r.name)} className={secondaryCls}>넣기</button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* ③ 사이트 채팅 — 방송 보며 주문 화면 안에서만 */}
      {watchOn ? (
        <section className={sectionCls}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={titleCls}>사이트 채팅</h3>
              <p className={subCls}>방송 화면 안 채팅 · 관리자 PC 오른쪽 「방송·채팅」 칸에서 보고 관리</p>
            </div>
            <Switch on={liveChat.enabled} disabled={liveChatSaving} label="사이트 채팅" onChange={(v) => void saveLiveChat({ ...liveChat, enabled: v }, v ? "사이트 채팅을 켰어요." : "사이트 채팅을 껐어요.")} />
          </div>
          {liveChat.enabled ? (
            <div className="mt-3 space-y-3">
              <FormRow label="채팅 공지" hint="채팅 글 바로 위 노란 「공지」 한 줄 · 비우면 안 보임">
                <input value={liveChatNotice} onChange={(e) => setLiveChatNoticeDraft(e.target.value.slice(0, 120))} placeholder="예) 입금자명은 닉네임으로 보내주세요" aria-label="채팅 공지" className={fieldCls} />
                {liveChatNotice.trim() !== liveChat.notice ? <button type="button" disabled={liveChatSaving} onClick={() => void saveLiveChat({ ...liveChat, notice: liveChatNotice }, "채팅 공지를 저장했어요.")} className={primaryCls}>저장</button> : null}
              </FormRow>
              <FormRow label="더 막을 말" hint="쉼표로 · 욕설은 기본으로 막혀요">
                <input value={liveChatWords} onChange={(e) => setLiveChatWordsDraft(e.target.value)} placeholder="예) 당근, 번개장터" aria-label="채팅 금지어" className={fieldCls} />
                {liveChatWords !== liveChat.words.join(", ") ? <button type="button" disabled={liveChatSaving} onClick={() => void saveLiveChat({ ...liveChat, words: liveChatWords.split(/[,\n]/) }, "금지어를 저장했어요.")} className={primaryCls}>저장</button> : null}
              </FormRow>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ④ 루루동이 자동 안내 */}
      {chatOn ? (
        <section className={sectionCls}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={titleCls}>루루동이 자동 안내</h3>
              <p className={subCls}>손님 채팅에 상품번호·자주 묻는 말이 나오면 자동으로 답해요</p>
            </div>
            <Switch on={bot.enabled} disabled={botSaving} label="루루동이 자동 안내" onChange={(v) => void saveBot({ ...bot, enabled: v }, v ? "자동 안내를 켰어요." : "자동 안내를 껐어요.")} />
          </div>
          {bot.enabled ? (
            <div className="mt-3 divide-y divide-line rounded-xl border border-line">
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <div>
                  <div className="text-[14px] font-bold text-ink">상품 안내</div>
                  <div className="text-[12px] text-ink-mute">상품번호(509)나 상품 이름+「얼마·사이즈·?」 → 그 상품이 하나일 때만</div>
                </div>
                <Switch on={bot.product} disabled={botSaving} label="상품 안내" onChange={(v) => void saveBot({ ...bot, product: v }, v ? "상품 안내를 켰어요." : "상품 안내를 껐어요.")} />
              </div>
              <div className="px-3 py-3">
                <button type="button" aria-expanded={botFaqOpen} onClick={() => setBotFaqOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
                  <span>
                    <span className="block text-[14px] font-bold text-ink">자주 묻는 말 {bot.faqs.length}개</span>
                    <span className="block text-[12px] text-ink-mute">방송마다 바뀌는 내용(합배송·배송일)은 방송 전에 고쳐 저장</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold text-ink">{botFaqOpen ? "닫기" : "고치기"}</span>
                </button>
                {botFaqOpen ? (
                  <div className="mt-3 space-y-2">
                    {botFaqDraft.map((f, i) => (
                      <div key={i} className="rounded-lg bg-surface-2 p-2">
                        <div className="flex items-center gap-2">
                          <span className="w-10 shrink-0 text-[12px] font-bold text-ink-mute">낱말</span>
                          <input value={f.words} onChange={(e) => setBotFaqDraft((d) => d.map((x, j) => (j === i ? { ...x, words: e.target.value } : x)))} placeholder="쉼표로 · 예: 계좌, 계좌번호" aria-label={`자주 묻는 말 ${i + 1} 낱말`} className={fieldCls} />
                          <button type="button" onClick={() => setBotFaqDraft((d) => d.filter((_, j) => j !== i))} aria-label={`자주 묻는 말 ${i + 1} 빼기`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-surface hover:text-danger-tx">
                            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        </div>
                        <div className="mt-2 flex items-start gap-2">
                          <span className="mt-2.5 w-10 shrink-0 text-[12px] font-bold text-ink-mute">답</span>
                          <textarea value={f.answer} onChange={(e) => setBotFaqDraft((d) => d.map((x, j) => (j === i ? { ...x, answer: e.target.value.slice(0, 200) } : x)))} rows={2} placeholder="200자까지" aria-label={`자주 묻는 말 ${i + 1} 답`} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-ink" />
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setBotFaqDraft((d) => [...d, { words: "", answer: "" }])} className={secondaryCls}>+ 추가</button>
                      <button type="button" onClick={() => setBotFaqDraft(LIVE_CHAT_BOT_DEFAULT_FAQS.map((f) => ({ words: f.words.join(", "), answer: f.answer })))} className="h-9 px-2 text-[13px] font-bold text-ink-mute hover:text-ink">기본으로</button>
                      {botFaqChanged ? <button type="button" disabled={botSaving} onClick={() => void saveBot({ ...bot, faqs: botFaqDraft.map((x) => ({ words: x.words.split(/[,\n]/), answer: x.answer })) }, "자주 묻는 말을 저장했어요.")} className={`${primaryCls} ml-auto`}>저장</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ⑤ 기타 — 잠시 쉬는 중 문구 · 방송 중 도구 */}
      <section className={sectionCls}>
        <h3 className={titleCls}>기타</h3>
        <div className="mt-3 space-y-3">
          <FormRow label="잠시 쉬는 중 문구" hint={pausedText.trim() !== pausedTextSaved ? "저장 안 됨" : "「잠시 멈춤」 때 손님 화면에 나와요 · 비우면 기본 문구"}>
            <input value={pausedText} maxLength={LIVE_PAUSED_TEXT_MAX} onChange={(event) => setPausedText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void savePausedText(); } }}
              placeholder={LIVE_PAUSED_TEXT_DEFAULT} className={fieldCls} />
            {pausedText.trim() !== pausedTextSaved ? <button type="button" disabled={pausedSaving} onClick={() => void savePausedText()} className={primaryCls}>{pausedSaving ? "저장 중…" : "저장"}</button> : null}
          </FormRow>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!activeBroadcast || copyingCurrent} onClick={() => void copyCurrentProductLine()} className={secondaryCls}
              title={activeBroadcast ? "지금 소개 중인 상품의 채팅 안내문을 다시 복사" : "방송 중에만"}>
              {copyingCurrent ? "복사 중…" : currentCopied ? "복사됨" : "소개 중 상품 안내문 복사"}
            </button>
            <button type="button" disabled={!activeBroadcast} onClick={() => onToggleWidgetCard?.()} className={secondaryCls} aria-pressed={widgetCardOn}
              title={activeBroadcast ? "방송 화면 상품 카드를 켜고 끔(반영 최대 20초)" : "방송 중에만"}>
              방송 화면 상품 카드 {widgetCardOn ? "켜짐" : "꺼짐"}
            </button>
            <button type="button" disabled={Boolean(activeBroadcast)} onClick={() => onToggleShopOpen?.()} className={secondaryCls} aria-pressed={shopOpen}
              title={activeBroadcast ? "방송 중에는 바꿀 수 없어요" : "쇼핑몰 열기/닫기"}>
              쇼핑몰 {shopOpen ? "열림" : "닫힘"}
            </button>
          </div>
        </div>
      </section>

      {/* 방송알림 발송 창 — 대상 고르기 · 받을 사람 수 · 명단(발송/회원 추가/이번만 제외/계속 제외) · 발송 (2026-11-01 DESIGN-ADMIN 기준 다시 그림) */}
      {alertOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4 max-md:p-0"
          onClick={() => !alertSending && setAlertOpen(false)}
        >
          <div
            role="dialog" aria-modal="true" aria-label="방송알림 발송"
            className="flex w-full max-w-[960px] max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.08)] max-md:h-[100dvh] max-md:max-h-none max-md:rounded-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 머리 */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
              <div className="text-base font-bold text-ink">방송알림 발송</div>
              <button type="button" onClick={() => !alertSending && setAlertOpen(false)} className="h-9 rounded-lg px-3 text-sm text-ink-mute hover:bg-surface-2 max-md:h-11">닫기</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {/* 보낼 알림톡 템플릿 — 하나뿐이어도 늘 보임(어떤 문구로 나가는지 발송 전에 확인) */}
              <div className="mb-4">
                <label className="flex items-center gap-3">
                  <span className="shrink-0 text-[13px] font-semibold text-ink">보낼 알림톡</span>
                  <select value={alertTemplateId} disabled={alertSending || alertTemplates.length === 0} onChange={(e) => setAlertTemplateId(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:h-11 max-md:text-base sm:max-w-[320px]">
                    {alertTemplates.length === 0 ? <option value="">불러오는 중…</option> : null}
                    {alertTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                {!tplAddOpen ? (
                  <button type="button" disabled={alertSending} onClick={() => setTplAddOpen(true)} className="mt-1 text-xs font-semibold text-ink underline disabled:opacity-40">+ 알림톡 템플릿 추가</button>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={tplAddName} onChange={(e) => setTplAddName(e.target.value)} placeholder="이름 (예: 방송시작 알림2)" className="h-9 w-44 min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:h-11" />
                    <input value={tplAddId} onChange={(e) => setTplAddId(e.target.value.trim())} placeholder="템플릿 ID (SOLAPI ⋮ › 템플릿 ID 복사)" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink max-md:h-11" />
                    <button type="button" disabled={!tplAddId.trim() || tplAddSaving} onClick={() => void addAlertTemplate()} className="h-9 rounded-lg bg-ink px-3 text-sm font-bold text-white disabled:opacity-40 max-md:h-11">{tplAddSaving ? "저장 중…" : "추가"}</button>
                    <button type="button" onClick={() => setTplAddOpen(false)} className="h-9 rounded-lg px-2 text-sm text-ink-mute max-md:h-11">닫기</button>
                  </div>
                )}
              </div>
              {/* 받을 사람 고르기 */}
              <div className="text-[13px] font-semibold text-ink">받을 사람</div>
              <div role="group" aria-label="받을 사람" className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {([["priority", "단골·최근 신청자"], ["optin", "알림 신청자"], ["all", "전체 회원"]] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={alertMode === value} disabled={alertSending || alertPreviewLoading} onClick={() => changeAlertMode(value)}
                    className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition max-md:h-11 max-md:px-3 ${alertMode === value ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {alertMode === "all" && <p className="mt-2 text-xs font-semibold text-danger-tx">알림 신청 안 한 회원도 받아요. 카카오 채널 제재 위험이 있어요.</p>}

              {alertMode === "priority" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    ["최대 인원", alertLimit, setAlertLimit, 10000],
                    ["주문 조회(일)", alertOrderDays, setAlertOrderDays, 365],
                    ["신청 조회(일)", alertRecentDays, setAlertRecentDays, 365],
                  ] as const).map(([label, value, setter, max]) => (
                    <label key={label} className="text-[13px] font-semibold text-ink">{label}
                      <input type="number" inputMode="numeric" min={1} max={max} step={1} disabled={alertSending} value={value}
                        onChange={e => { setter(e.target.value); alertRequest.current++; setAlertPreview(null); setAlertPreviewLoading(false); }}
                        className="mt-1 h-9 w-full rounded-lg border border-line px-3 text-sm font-normal tabular-nums max-md:h-11 max-md:text-base" />
                    </label>
                  ))}
                  <p className="col-span-3 text-xs text-ink-mute">주문 많은 단골 먼저 · 주문 없는 신청자는 최대 인원의 5%까지</p>
                </div>
              )}

              <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-ink">
                <input type="checkbox" checked={alertAgain} disabled={alertSending} onChange={(e) => { setAlertAgain(e.target.checked); alertRequest.current++; setAlertPreview(null); setAlertPreviewLoading(false); setAlertIncluded([]); setAlertExcluded([]); }} className="h-4 w-4 accent-black" />
                <span><b className="font-semibold">오늘 다시 알림</b> · 이 방송 알림을 이미 받은 사람에게도 한 번 더 보내요(쉬었다 다시 시작할 때, 오늘 한 번까지)</span>
              </label>
              {alertLastSend ? (
                <div role="status" className={`mt-4 rounded-xl border-2 px-4 py-3 ${alertLastSend.success > 0 ? "border-ink" : "border-danger"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <b className="text-[16px] text-ink">방금 발송 결과</b>
                    <span className="text-[12px] tabular-nums text-ink-mute">{new Date(alertLastSend.at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                    <div><div className="text-[12px] text-ink-mute">보내려던 사람</div><div className="text-[20px] font-bold text-ink">{alertLastSend.target.toLocaleString()}명</div></div>
                    <div><div className="text-[12px] text-ink-mute">보냄</div><div className="text-[20px] font-bold text-ink">{alertLastSend.success.toLocaleString()}명</div></div>
                    <div><div className="text-[12px] text-ink-mute">못 보냄</div><div className={`text-[20px] font-bold ${alertLastSend.fail > 0 ? "text-danger-tx" : "text-ink"}`}>{alertLastSend.fail.toLocaleString()}명</div></div>
                  </div>
                  {alertLastSend.fit ? (
                    <ul className="mt-2 grid gap-0.5 text-[13px] text-ink">
                      <li>· 솔라피 예치금이 모자라서, 우선순위 앞쪽부터 돈에 맞는 {alertLastSend.success.toLocaleString()}명만 보냈어요.</li>
                      <li className="tabular-nums">· 1명당 약 {alertLastSend.fit.perPersonWon.toLocaleString()}원(부가세 포함) · 발송 전 예치금 {Math.round(alertLastSend.fit.depositBefore).toLocaleString()}원 → 남은 예치금 약 {alertLastSend.fit.depositAfterEst.toLocaleString()}원</li>
                      <li className="tabular-nums font-semibold">· 못 받은 {alertLastSend.fit.notSent.toLocaleString()}명에게 보내려면 약 {alertLastSend.fit.needWon.toLocaleString()}원 충전 → 아래 「발송」을 한 번 더 누르면 그 사람들만 받아요.</li>
                    </ul>
                  ) : alertLastSend.error ? <p className="mt-2 text-[13px] text-ink">{alertLastSend.error}</p> : null}
                  <p className="mt-1 text-[12px] text-ink-mute">«보냄»은 솔라피가 접수한 숫자예요. 카톡이 실제로 도착했는지는 솔라피 발송 내역에서 확인돼요.</p>
                </div>
              ) : null}
              {/* 받을 사람 수 */}
              <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-ink-mute">이번에 받을 사람</div>
                    <div className="text-xl font-bold tabular-nums text-ink">{alertPreviewLoading ? "계산 중…" : alertPreview ? `${Number(alertPreview.targetCount || 0).toLocaleString()}명` : "—"}</div>
                  </div>
                  {alertMode === "priority" && (
                    <button type="button" disabled={alertSending || alertPreviewLoading} onClick={() => void loadAlertPreview("priority")} className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink hover:bg-surface-2 max-md:h-11">{alertPreviewLoading ? "뽑는 중…" : "다시 뽑기"}</button>
                  )}
                </div>
                {alertPreview && !alertPreviewLoading && (
                  <div className="mt-1 text-xs tabular-nums text-ink-mute">
                    후보 {Number(alertPreview.candidateCount || 0).toLocaleString()} · 이미 받음 {Number(alertPreview.receivedCount || 0).toLocaleString()} · 계속 제외 {Number(alertPreview.blockedCount || 0).toLocaleString()}
                  </div>
                )}
              </div>
              {alertMode === "priority" && alertPreview?.selectionGroups && (
                <div aria-label="선정 그룹별 인원" className="mt-2 text-xs tabular-nums text-ink-soft">
                  단골 {alertPreview.selectionGroups.frequent}명 · 첫 주문 {alertPreview.selectionGroups.newBuyer}명 · 최근 주문 없음 {alertPreview.selectionGroups.noRecentOrders}명 / 최대 {alertPreview.selectionGroups.noRecentOrdersMax}명
                </div>
              )}

              {/* 명단 */}
              <div role="tablist" aria-label="명단" className="mt-5 flex gap-4 overflow-x-auto border-b border-line [scrollbar-width:none]">
                {([
                  ["selected", `발송 명단${alertPreview ? ` ${alertPreview.targetCount}` : ""}`],
                  ["members", "회원 추가"],
                  ["excluded", `이번만 제외${alertExcluded.length ? ` ${alertExcluded.length}` : ""}`],
                  ["blocked", `계속 제외${blockItems.length ? ` ${blockItems.length}` : ""}`],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={alertList === value} disabled={alertSending} onClick={() => setAlertList(value)}
                    className={`-mb-px h-10 shrink-0 whitespace-nowrap border-b-2 text-sm tabular-nums max-md:h-11 ${alertList === value ? "border-ink font-bold text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {alertList !== "blocked" ? (
                <>
                  <div className="mt-3 grid grid-cols-[1fr_180px] gap-2 max-sm:grid-cols-[1fr_128px]">
                    <input aria-label="명단 검색" type="search" inputMode="search" value={alertSearch} onChange={e => setAlertSearch(e.target.value)} placeholder="이름 · 전화 뒤 4자리" className="h-9 w-full rounded-lg border border-line px-3 text-sm max-md:h-11 max-md:text-base" />
                    <select aria-label="명단 정렬" value={alertSort} onChange={e => setAlertSort(e.target.value)} className="h-9 rounded-lg border border-line px-3 text-sm max-md:h-11"><option value="name">이름순</option><option value="orders">주문 많은순</option><option value="group">직접 포함 먼저</option></select>
                  </div>
                  {alertPreview ? (
                    <ul className="mt-2 grid grid-cols-1 border-t border-line sm:grid-cols-2">
                      {visibleAlertMembers.map((s, i) => {
                        const inSend = alertList === "selected" || alertPreview.sample.some((p: AlertMember) => p.id === s.id);
                        return (
                          <li key={s.id} className="flex min-h-[56px] items-center justify-between gap-2 border-b border-line px-1 py-2 sm:odd:pr-3 sm:even:pl-3">
                            <span className="min-w-0 break-words">
                              <span className="text-[13px] font-semibold text-ink">{i + 1}. {s.name || "(이름없음)"}</span>
                              {(s.manual || alertIncluded.includes(s.id)) && <span className="ml-1.5 rounded-lg bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">직접 포함</span>}
                              <span className="block text-xs tabular-nums text-ink-mute">{s.phone}{s.orderDays !== undefined ? ` · 주문 ${s.orderDays}일` : ""}{s.recent ? " · 최근 신청" : ""}</span>
                            </span>
                            <span className="flex shrink-0 gap-1.5">
                              {inSend ? (
                                <>
                                  <button type="button" disabled={alertSending || alertPreviewLoading} onClick={() => editAlertMember(s.id, false)} className="h-9 rounded-lg border border-line px-3 text-sm text-danger-tx hover:bg-surface-2 max-md:h-11">제외</button>
                                  {s.cid ? <button type="button" disabled={alertSending || alertPreviewLoading || blockBusy} onClick={() => void addBlock([s.cid as string], s.name)} className="h-9 rounded-lg px-2 text-sm text-ink-mute hover:bg-surface-2 max-md:h-11">계속 제외</button> : null}
                                </>
                              ) : (
                                <button type="button" disabled={alertSending || alertPreviewLoading} onClick={() => editAlertMember(s.id, true)} className="h-9 rounded-lg border border-line px-3 text-sm text-ink hover:bg-surface-2 max-md:h-11">{alertList === "excluded" ? "다시 포함" : "포함"}</button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {alertPreview && !visibleAlertMembers.length && <p className="py-6 text-center text-sm text-ink-mute">{alertSearch ? "검색 결과가 없어요. 다른 이름으로 찾아 보세요." : alertList === "excluded" ? "이번만 제외한 회원이 없어요. 발송 명단에서 「제외」를 누르면 여기 모여요." : "표시할 회원이 없어요. 위에서 다른 받을 사람을 골라 보세요."}</p>}
                  {!alertPreview && !alertPreviewLoading && <p className="py-6 text-center text-sm text-ink-mute">{alertMode === "priority" ? "「다시 뽑기」를 눌러 명단을 만드세요." : <>명단이 비어 있어요. <button type="button" disabled={alertSending} onClick={() => void loadAlertPreview(alertMode, { includeIds: [], excludeIds: [] })} className="ml-1 font-semibold text-ink underline">다시 불러오기</button></>}</p>}
                </>
              ) : (
                <>
                  <p className="mt-3 text-xs text-ink-mute">해제할 때까지 모든 방송알림에서 빠져요.</p>
                  <input aria-label="계속 제외 회원 찾기" type="search" inputMode="search" value={blockQuery} onChange={e => searchBlockCustomers(e.target.value)} placeholder="회원 찾기 · 이름 · 닉네임 · 전화 뒤 4자리" className="mt-2 h-9 w-full rounded-lg border border-line px-3 text-sm max-md:h-11 max-md:text-base" />
                  {blockQuery.trim() ? (
                    <ul aria-label="회원 찾기 결과" className="mt-2 rounded-xl border border-line">
                      {blockResults.map((r) => (
                        <li key={r.customerId} className="flex min-h-[52px] items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0">
                          <span className="min-w-0 break-words">
                            <span className="text-[13px] font-semibold text-ink">{r.nickname || r.name || "(이름없음)"}</span>
                            {r.nickname && r.name ? <span className="ml-1 text-xs text-ink-mute">{r.name}</span> : null}
                            <span className="block text-xs tabular-nums text-ink-mute">{r.phone}{r.optin === true ? " · 알림 신청" : r.optin === false ? " · 알림 끔" : ""}</span>
                          </span>
                          {r.blocked ? <span className="shrink-0 text-xs text-ink-mute">제외 중</span> : (
                            <button type="button" disabled={blockBusy} onClick={() => void addBlock([r.customerId], r.nickname || r.name)} className="h-9 shrink-0 rounded-lg border border-line px-3 text-sm text-danger-tx hover:bg-surface-2 max-md:h-11">계속 제외</button>
                          )}
                        </li>
                      ))}
                      {!blockResults.length && <li className="p-4 text-center text-sm text-ink-mute">{blockSearching ? "찾는 중…" : "찾는 회원이 없어요. 다른 글자로 찾아 보세요."}</li>}
                    </ul>
                  ) : null}
                  <div className="mt-4 text-[13px] font-semibold text-ink">제외 중 {blockItems.length}명</div>
                  <ul aria-label="계속 제외 명단" className="mt-2 grid grid-cols-1 border-t border-line sm:grid-cols-2">
                    {blockItems.map((b) => (
                      <li key={b.id} className="flex min-h-[52px] items-center justify-between gap-2 border-b border-line px-1 py-2 sm:odd:pr-3 sm:even:pl-3">
                        <span className="min-w-0 break-words">
                          <span className="text-[13px] font-semibold text-ink">{b.nickname || b.name || "(이름없음)"}</span>
                          {b.nickname && b.name ? <span className="ml-1 text-xs text-ink-mute">{b.name}</span> : null}
                          <span className="block text-xs tabular-nums text-ink-mute">{b.phone}{b.at ? ` · ${new Date(b.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 제외` : ""}</span>
                        </span>
                        <button type="button" disabled={blockBusy} onClick={() => void removeBlock([b.id], b.nickname || b.name)} className="h-9 shrink-0 rounded-lg border border-line px-3 text-sm text-ink hover:bg-surface-2 max-md:h-11">해제</button>
                      </li>
                    ))}
                  </ul>
                  {!blockItems.length && <p className="py-6 text-center text-sm text-ink-mute">{blockLoadError || "계속 제외한 회원이 없어요. 위 검색칸에서 회원을 찾아 넣으세요."}</p>}
                </>
              )}

              {alertResult && !alertPreviewLoading && <div className="mt-4 text-[13px] font-semibold text-ink">{alertResult}</div>}
            </div>

            {/* 바닥: 발송 */}
            <div className="shrink-0 border-t border-line px-4 py-3 sm:px-6 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={alertSending || alertPreviewLoading || !alertPreview || Number(alertPreview?.targetCount || 0) === 0}
                onClick={sendAlert}
                className="h-10 w-full rounded-lg bg-ink text-sm font-bold text-white tabular-nums transition disabled:bg-line disabled:text-ink-mute max-md:h-[52px] max-md:text-base"
              >
                {alertSending
                  ? "발송 중…"
                  : Number(alertPreview?.targetCount || 0) > 0
                    ? `${alertPreview.targetCount}명에게 발송`
                    : "받을 사람 없음"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// [2026-11-10] 방송 관리 창 작은 부품 — 표시만
function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        {hint ? <span className="min-w-0 truncate text-[12px] text-ink-mute">{hint}</span> : null}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[13px] font-bold text-ink">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg bg-surface-2 p-1">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => value !== v && onChange(v)}
          className={`h-8 rounded-md px-3 text-[13px] font-bold transition disabled:opacity-50 ${value === v ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-mute hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
