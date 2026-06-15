"use client";

import { showAdminToast } from "@/lib/adminToast";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";

type RouletteMode = "live" | "test" | "preview";

const FIXED_OVERLAY_TOKEN = "roulette_luludongi_live";
const FIXED_CLAW_OVERLAY_TOKEN = "claw_luludongi_live";

type RouletteBroadcast = {
  id: string;
  title: string;
  label: string;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
};

type RouletteParticipant = {
  nickname: string;
  order_count?: number;
  qty_sum?: number;
  amount_sum?: number;
  order_ids?: string[];
  weight?: number;
};

type RouletteEvent = {
  id?: string;
  title: string;
  overlay_token?: string;
  overlay_api_path?: string;
  mode: RouletteMode;
  is_test: boolean;
  status: "idle" | "spinning" | "result" | "closed";
  event_date?: string | null;
  source_date?: string | null;
  participants?: RouletteParticipant[];
  participant_count?: number;
  winner_nickname?: string | null;
  winner_note?: string | null;
  winner_order_ids?: string[];
  spin_started_at?: string | null;
  spin_duration_ms?: number | null;
  result_at?: string | null;
};

type RouletteWinner = {
  id: string;
  event_id: string;
  nickname: string;
  winner_note: string;
  winner_at: string;
  is_reward_done: boolean;
  reward_done_at?: string | null;
  is_test: boolean;
  memo?: string | null;
  created_at?: string;
};

type BroadcastsPayload = {
  ok: boolean;
  message?: string;
  broadcasts?: RouletteBroadcast[];
};

type ParticipantsPayload = {
  ok: boolean;
  message?: string;
  mode?: RouletteMode;
  source_date?: string;
  participant_count?: number;
  participants?: RouletteParticipant[];
};

type EventPayload = {
  ok: boolean;
  message?: string;
  event?: RouletteEvent;
  saved?: boolean;
};

type EventsPayload = {
  ok: boolean;
  message?: string;
  events?: RouletteEvent[];
};

type AdminLiveEventRoulettePanelProps = {
  buttonLabel?: string;
  buttonClassName?: string;
  renderTrigger?: boolean;
  controlledOpen?: boolean;
  onRequestClose?: () => void;
  activeBroadcastId?: string | number | null;
};

type WinnersPayload = {
  ok: boolean;
  message?: string;
  winners?: RouletteWinner[];
};

function todayText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return kst.toISOString().slice(0, 10);
}

function money(value: unknown) {
  const amount = Math.floor(Number(value || 0));

  return `${amount.toLocaleString("ko-KR")}원`;
}

function dateTime(value: unknown) {
  const raw = String(value || "");

  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 년월일(요일) 시간 — 예: 2026.06.06(금) 21:40
function dateTimeFull(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd}(${wd}) ${hh}:${mi}`;
}

function modeLabel(mode: RouletteMode) {
  if (mode === "live") return "실제 운영";
  if (mode === "test") return "테스트";
  return "미리보기";
}

function modeBadgeClass(mode: RouletteMode) {
  if (mode === "live") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (mode === "test") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload?.message || "룰렛 요청 실패");
  }

  return payload;
}

function buildOverlayUrl(_event: RouletteEvent | null) {
  if (typeof window === "undefined") return "";

  return "https://ruru-order.vercel.app/event-roulette/live?token=roulette_luludongi_live&scale=0.72&v=b50";
}

function buildClawOverlayUrl() {
  if (typeof window === "undefined") return "";

  return `${window.location.origin}/event-claw/overlay?token=${encodeURIComponent(FIXED_CLAW_OVERLAY_TOKEN)}`;
}

async function copyText(value: string) {
  if (!value) {
    showAdminToast("복사할 위젯주소가 없습니다.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showAdminToast("방송용 위젯주소를 복사했습니다.", "success");
  } catch {
    showAdminToast("복사 실패. 주소를 직접 선택해서 복사해주세요.", "error");
  }
}

export default function AdminLiveEventRoulettePanel({
  buttonLabel = "🎁 이벤트",
  buttonClassName = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl bg-violet-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-violet-700",
  renderTrigger = true,
  controlledOpen,
  onRequestClose,
  activeBroadcastId,
}: AdminLiveEventRoulettePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const closePanel = () => {
    if (controlledOpen !== undefined) onRequestClose?.();
    else setInternalOpen(false);
  };
  const [mode, setMode] = useState<RouletteMode>("test");
  const [sourceDate] = useState(todayText);
  const [broadcasts, setBroadcasts] = useState<RouletteBroadcast[]>([]);
  const [broadcastId, setBroadcastId] = useState("");
  const [title, setTitle] = useState("🎁 루루동이 선물 이벤트");
  const [winnerNote, setWinnerNote] = useState("이벤트 당첨");
  const [participants, setParticipants] = useState<RouletteParticipant[]>([]);
  const [currentEvent, setCurrentEvent] = useState<RouletteEvent | null>(null);
  const [events, setEvents] = useState<RouletteEvent[]>([]);
  const [winners, setWinners] = useState<RouletteWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [eventTab, setEventTab] = useState<"roulette" | "claw">("claw");
  const [participantSource, setParticipantSource] = useState<"auto" | "paid" | "manual">("auto");
  const [manualParticipantText, setManualParticipantText] = useState("");
  const [fixedWinnerNickname, setFixedWinnerNickname] = useState("");
  const [clawResultType, setClawResultType] = useState<"capsule" | "doll">("capsule");
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [giftType, setGiftType] = useState<"point" | "custom">("point");
  const [giftPointAmount, setGiftPointAmount] = useState("");
  // 시안 신규 UI 상태 (추첨 로직 무변경 — 표시/선택용)
  const [excludeDailyDup, setExcludeDailyDup] = useState(true);
  const [useWeight, setUseWeight] = useState(false);
  const [listPeriod, setListPeriod] = useState<"today" | "week" | "month" | "date">("today");
  const [listDate, setListDate] = useState("");


  const overlayUrl = useMemo(() => buildOverlayUrl(currentEvent), [currentEvent]);
  const clawOverlayUrl = useMemo(() => buildClawOverlayUrl(), []);

  const manualParticipants = useMemo<RouletteParticipant[]>(() => {
    const seen = new Set<string>();

    return manualParticipantText
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((nickname) => {
        if (seen.has(nickname)) return false;
        seen.add(nickname);
        return true;
      })
      .map((nickname) => ({
        nickname,
        order_count: 0,
        qty_sum: 0,
        amount_sum: 0,
        order_ids: [],
        weight: 1,
      }));
  }, [manualParticipantText]);

  const finalParticipants = participantSource === "manual" ? manualParticipants : participants;
  const selectedWinnerNickname =
    fixedWinnerNickname.trim() ||
    finalParticipants[0]?.nickname ||
    currentEvent?.winner_nickname ||
    "";

  const recentEvents = events.slice(0, 3);
  const recentWinners = winners.slice(0, 100);
  const autoParticipantCount = participants.length;
  const manualParticipantCount = manualParticipants.length;

  // 명단(소스 전환·재로드 포함)이 바뀌어 고정 당첨자가 현재 명단에 없으면 자동 해제(유령 고정값 방지).
  // 비교는 칩 클릭 토글과 동일하게 닉네임 정확 일치. 명단에 있으면 그대로 유지.
  useEffect(() => {
    if (!fixedWinnerNickname) return;
    if (!finalParticipants.some((p) => p.nickname === fixedWinnerNickname)) {
      setFixedWinnerNickname("");
    }
  }, [finalParticipants, fixedWinnerNickname]);

  // 룰렛 휠 색상(시안 팔레트) + conic-gradient (참가자 N등분)
  const WHEEL_COLORS = ["#ec4899", "#fb7185", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#7c3aed"];
  const wheelCount = Math.max(finalParticipants.length, 1);
  const wheelGradient = `conic-gradient(${Array.from({ length: wheelCount })
    .map((_, i) => {
      const start = (i / wheelCount) * 100;
      const end = ((i + 1) / wheelCount) * 100;
      return `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${start}% ${end}%`;
    })
    .join(", ")})`;

  // 이벤트목록 기간필터 (오늘/이번주/이번달/날짜선택) — winner_at 기준 클라이언트 필터
  const filteredWinners = useMemo(() => {
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;
    if (listPeriod === "today") {
      from = startOf(now);
    } else if (listPeriod === "week") {
      const day = (now.getDay() + 6) % 7; // 월요일 시작
      from = startOf(now) - day * 86400000;
    } else if (listPeriod === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (listPeriod === "date" && listDate) {
      const picked = new Date(listDate);
      from = startOf(picked);
      to = from + 86400000;
    }
    return recentWinners.filter((w) => {
      const raw = String(w.winner_at || "");
      const t = raw ? new Date(raw).getTime() : 0;
      if (!Number.isFinite(t) || t === 0) return listPeriod === "today" ? false : true;
      return t >= from && t < to;
    });
  }, [recentWinners, listPeriod, listDate]);

  // ===== 룰렛 canvas (실제 회전 스핀) =====
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const animatedKeyRef = useRef("");
  const namesRef = useRef<string[]>([]);
  namesRef.current = finalParticipants.map((p) => p.nickname);
  const wheelKey = namesRef.current.join("|");
  const [centerWinner, setCenterWinner] = useState("");

  const drawWheel = (angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;
    const names = namesRef.current;
    const n = Math.max(names.length, 1);
    const seg = (Math.PI * 2) / n;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < n; i += 1) {
      const a0 = angle - Math.PI / 2 + i * seg;
      const a1 = a0 + seg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (names.length > 0 && n <= 40) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a0 + seg / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        const fs = Math.max(8, Math.min(13, 240 / n));
        ctx.font = `700 ${fs}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
        const nm = names[i].length > 7 ? `${names[i].slice(0, 7)}` : names[i];
        ctx.fillText(nm, r - 10, fs * 0.35);
        ctx.restore();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.27, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  };

  // 참가자/탭/열림 변할 때 휠 다시 그림(정지 상태)
  useEffect(() => {
    drawWheel(angleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelKey, open, eventTab]);

  // 당첨자 확정(status=result) → 실제 회전 8~14바퀴, 4~6초, 당첨 칸에서 멈춤
  useEffect(() => {
    const winner = currentEvent?.winner_nickname || "";
    if (!winner || currentEvent?.status !== "result") return;
    const key = `${currentEvent?.id || ""}|${winner}|${currentEvent?.result_at || ""}`;
    if (animatedKeyRef.current === key) return;
    animatedKeyRef.current = key;

    const names = namesRef.current;
    const n = Math.max(names.length, 1);
    const idx = Math.max(0, names.indexOf(winner));
    const seg = (Math.PI * 2) / n;
    const turns = 30; // 30바퀴
    const duration = 4000 + Math.random() * 2000; // 4~6초
    const target = turns * Math.PI * 2 - (idx * seg + seg / 2);

    // 당첨 확정 시점의 선물 설정 캡처 (포인트 자동지급용)
    const gType = giftType;
    const gAmount = Number(giftPointAmount || 0);
    const gReason = (winnerNote || title || "이벤트 당첨").trim();
    const isLive = mode === "live";
    const gEventId = currentEvent?.id || ""; // 중복지급 가드 키

    setCenterWinner("");
    angleRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      angleRef.current = target * eased;
      drawWheel(angleRef.current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCenterWinner(winner);
        // 포인트 선물 + 금액 있으면 자동지급 (운영 모드만)
        if (gType === "point" && gAmount > 0) {
          if (isLive) {
            void grantPointToWinner(winner, gAmount, gReason, gEventId);
          } else {
            showAdminToast("테스트 모드라 포인트 자동지급은 건너뜁니다.", "info");
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEvent?.winner_nickname, currentEvent?.status, currentEvent?.result_at, currentEvent?.id]);

  // 같은 이벤트(event.id)에 대해 이번 세션에서 이미 지급했는지 기록(effect 재실행 중복지급 방지)
  const grantedEventIdsRef = useRef<Set<string>>(new Set());

  // 당첨자 닉네임 → orders 최신 주문 전화번호 매핑 → 기존 포인트 API로 자동지급
  // 중복지급 가드: ① 이번 세션 ref ② 영구 게이트 is_reward_done. 지급 성공 시 is_reward_done=true로 잠금.
  const grantPointToWinner = async (nickname: string, amount: number, reason: string, eventId = "") => {
    const evId = String(eventId || "").trim();

    if (evId) {
      // 이번 세션에서 이미 지급/진행 중이면 skip
      if (grantedEventIdsRef.current.has(evId)) return;
      // 이미 지급완료(is_reward_done) 표시된 이벤트면 skip (재로드/다른탭 포함)
      const alreadyPaid = winners.some((w) => String(w.event_id) === evId && w.is_reward_done);
      if (alreadyPaid) {
        grantedEventIdsRef.current.add(evId);
        return;
      }
      // 동시/연속 재실행 선점 잠금 (지급 실패 시 catch에서 해제)
      grantedEventIdsRef.current.add(evId);
    }

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_phone")
        .eq("youtube_nickname", nickname)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const phone = String((data as { customer_phone?: unknown } | null)?.customer_phone || "").replace(/[^0-9]/g, "");
      if (!phone) {
        if (evId) grantedEventIdsRef.current.delete(evId); // 지급 안 됐으니 잠금 해제
        showAdminToast(`${nickname}의 전화번호를 찾지 못해 포인트 자동지급을 건너뜁니다.`, "warning");
        return;
      }
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/customer-points", {
        method: "POST",
        body: JSON.stringify({
          phone,
          action: "grant",
          amount,
          reason: reason || "이벤트 당첨",
          youtube_nickname: nickname,
          customer_visible: true,
        }),
      });
      if (!payload.ok) throw new Error(payload.message || "포인트 지급 실패");
      showAdminToast(`${nickname}님에게 ${amount.toLocaleString("ko-KR")}P 자동지급 완료.`, "success");

      // 지급 성공 → 해당 당첨자 레코드 is_reward_done=true (영구 중복지급 게이트). 기존 mark_reward_done API 재사용.
      if (evId) {
        const { data: wRow } = await supabase
          .from("event_roulette_winners")
          .select("id")
          .eq("event_id", evId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const winnerId = (wRow as { id?: string } | null)?.id;
        if (winnerId) {
          await requestJson<{ ok: boolean }>("/api/admin-live/event-roulette", {
            method: "POST",
            body: JSON.stringify({ action: "mark_reward_done", winnerId, isRewardDone: true }),
          }).catch(() => {});
          await loadEventsAndWinners();
        }
      }
    } catch (e) {
      if (evId) grantedEventIdsRef.current.delete(evId); // 실패 시 잠금 해제(재시도 허용)
      showAdminToast("포인트 자동지급 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  const openEventPanel = () => {
    setInternalOpen(true);
  };

  // 초기화: 참가자 + 당첨고정 + 당첨자발표(현재 이벤트) 동시 리셋. 기록/목록은 건드리지 않음.
  const resetEvent = () => {
    setParticipants([]);
    setManualParticipantText("");
    setFixedWinnerNickname("");
    setCurrentEvent(null);
  };

  const changeMode = (nextMode: RouletteMode) => {
    setMode(nextMode);
    void loadParticipants(nextMode, sourceDate, broadcastId);
  };

  const changeBroadcast = (nextBroadcastId: string) => {
    setBroadcastId(nextBroadcastId);
    void loadParticipants(mode, sourceDate, nextBroadcastId);
  };

  // 참가자 불러오기 기준 = 현재 활성 방송(activeBroadcast) 기간. 방송 OFF면 안내.
  const liveBroadcastId = activeBroadcastId != null ? String(activeBroadcastId) : "";

  const changeParticipantSource = (source: "auto" | "paid" | "manual") => {
    setParticipantSource(source);

    if (source === "auto" || source === "paid") {
      if (!liveBroadcastId) {
        showAdminToast("진행 중인 방송이 없습니다.\n\n방송을 시작한 뒤 참가자를 불러올 수 있어요.", "warning");
        return;
      }
      void loadParticipants(mode, sourceDate, liveBroadcastId, source === "paid");
    }
  };

  // 채팅 붙여넣기 → @닉네임만 추출(중복 제거). @가 없으면 줄/쉼표 단위로 처리.
  const parseChatNicknames = (raw: string) => {
    const atTokens = raw.match(/@[^\s,@]+/g);
    const source = atTokens && atTokens.length > 0 ? atTokens.map((t) => t.slice(1)) : raw.split(/\r?\n|,/);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const token of source) {
      const name = token.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      result.push(name);
    }
    return result;
  };

  const handleManualPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted.includes("@")) return; // 일반 붙여넣기는 그대로
    event.preventDefault();
    const existing = manualParticipantText.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
    const merged = parseChatNicknames([...existing, ...parseChatNicknames(pasted)].join("\n"));
    setManualParticipantText(merged.join("\n"));
  };

  const addManualSample = () => {
    const current = manualParticipantText.trim();

    if (!current) {
      setManualParticipantText("눈누난나\n뽀글이\n오랑이");
      return;
    }

    setManualParticipantText(`${current}\n새참가자`);
  };

  const previewClawAnimation = () => {
    showAdminToast("인형뽑기 미리보기는 다음 단계에서 방송용 위젯에 연결합니다.", "info");
  };

  const startClawEvent = async () => {
    if (finalParticipants.length === 0) {
      showAdminToast("참가자 명단이 없습니다. 자동 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }

    setCurrentEvent(null); // 이전 당첨자 표시 제거 후 새 게임
    setSpinning(true);

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          mode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: "claw",
          excludeDailyDup,
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "인형뽑기 이벤트 생성 실패");
      }

      const eventId = createPayload.event.id;

      if (!eventId) {
        setCurrentEvent(createPayload.event);
        setParticipants(createPayload.event.participants || finalParticipants);
        showAdminToast("인형뽑기 미리보기 이벤트를 불러왔습니다.", "success");
        return;
      }

      const spinPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
        
          manualParticipantText,
        }),
      });

      if (!spinPayload.ok || !spinPayload.event) {
        throw new Error(spinPayload.message || "인형뽑기 시작 실패");
      }

      setCurrentEvent(spinPayload.event);
      setParticipants(spinPayload.event.participants || createPayload.event.participants || finalParticipants);
      await loadEventsAndWinners();
      showAdminToast(`인형뽑기 당첨자: ${spinPayload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("인형뽑기 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const loadBroadcasts = async () => {
    try {
      const payload = await requestJson<BroadcastsPayload>("/api/admin-live/event-roulette?action=broadcasts");

      if (!payload.ok) {
        throw new Error(payload.message || "방송리스트 조회 실패");
      }

      const list = payload.broadcasts || [];
      setBroadcasts(list);

      return list;
    } catch (error) {
      showAdminToast("방송리스트 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      return [];
    }
  };

  const loadParticipants = async (nextMode = mode, nextSourceDate = sourceDate, nextBroadcastId = broadcastId, paidOnly = false) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        action: "participants",
        mode: nextMode,
        sourceDate: nextSourceDate,
      });

      if (nextBroadcastId) {
        params.set("broadcastId", nextBroadcastId);
      }

      // 입금완료만 필터 (서버 지원 시 적용 · P2에서 서버 연동)
      if (paidOnly) {
        params.set("paidOnly", "true");
      }

      // 당일 중복당첨 금지 OFF면 중복체크 건너뛰기
      if (!excludeDailyDup) {
        params.set("excludeDailyDup", "false");
      }

      const payload = await requestJson<ParticipantsPayload>(`/api/admin-live/event-roulette?${params.toString()}`);

      if (!payload.ok) {
        throw new Error(payload.message || "참여자 조회 실패");
      }

      setParticipants(payload.participants || []);
      await ensureRoulettePreviewEvent(payload.participants || []);
    } catch (error) {
      showAdminToast("룰렛 참여자 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadEventsAndWinners = async () => {
    try {
      const [eventsPayload, winnersPayload] = await Promise.all([
        requestJson<EventsPayload>("/api/admin-live/event-roulette?action=events&includeTest=true"),
        requestJson<WinnersPayload>("/api/admin-live/event-roulette?action=winners&includeTest=true"),
      ]);

      if (eventsPayload.ok) setEvents(eventsPayload.events || []);
      if (winnersPayload.ok) setWinners(winnersPayload.winners || []);
    } catch (error) {
      showAdminToast("룰렛 기록 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  useEffect(() => {
    if (!open) return;

    const bootstrap = async () => {
      const list = await loadBroadcasts();
      const nextBroadcastId = broadcastId || list[0]?.id || "";

      if (nextBroadcastId) {
        setBroadcastId(nextBroadcastId);
      }

      await loadParticipants(mode, sourceDate, nextBroadcastId);
      await loadEventsAndWinners();
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createEvent = async () => {
    setLoading(true);

    try {
      const payload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          mode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: "roulette",
          excludeDailyDup,
        }),
      });

      if (!payload.ok || !payload.event) {
        throw new Error(payload.message || "룰렛 이벤트 생성 실패");
      }

      setCurrentEvent(payload.event);
      setParticipants(payload.event.participants || participants);
      await loadEventsAndWinners();

      if (payload.saved === false) {
        showAdminToast("미리보기 룰렛을 불러왔습니다. 실제 기록에는 저장되지 않습니다.", "success");
      } else {
        showAdminToast(`${modeLabel(mode)} 룰렛 이벤트를 만들었습니다.`, "success");
      }
    } catch (error) {
      showAdminToast("룰렛 이벤트 생성 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setLoading(false);
    }
  };

  const spinEvent = async () => {
    if (!currentEvent?.id) {
      showAdminToast("먼저 테스트 또는 실제 운영 룰렛 이벤트를 만들어주세요.", "warning");
      return;
    }

    if (!String(currentEvent.overlay_token || "").startsWith("roulette_")) {
      setCurrentEvent(null);
      setSpinning(false);
      showAdminToast("현재 선택된 이벤트가 룰렛이 아닙니다. 룰렛 만들기를 먼저 눌러주세요.", "warning");
      return;
    }

    setSpinning(true);

    try {
      const payload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId: currentEvent.id,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
        
          manualParticipantText,
        }),
      });

      if (!payload.ok || !payload.event) {
        throw new Error(payload.message || "룰렛 시작 실패");
      }

      setCurrentEvent(payload.event);
      await loadEventsAndWinners();
      showAdminToast(`당첨자: ${payload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("룰렛 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const ensureRoulettePreviewEvent = async (nextParticipants: RouletteParticipant[]) => {
    if (eventTab !== "roulette") return;
    if (nextParticipants.length === 0) return;

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          title,
          mode,
          sourceDate,
          broadcastId,
          participants: nextParticipants,
          eventKind: "roulette",
          excludeDailyDup,
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "룰렛 미리보기 이벤트 생성 실패");
      }

      setCurrentEvent(createPayload.event);
      setParticipants(createPayload.event.participants || nextParticipants);
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast(
        "룰렛 미리보기 생성 실패\\n\\n" + (error instanceof Error ? error.message : String(error)),
        "error"
      );
    }
  };

  const startRouletteOneClick = async () => {
    if (finalParticipants.length === 0) {
      showAdminToast("먼저 주문서 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }

    if (spinning) {
      return;
    }

    setCurrentEvent(null); // 이전 당첨자 표시 제거 후 새 게임
    setSpinning(true);

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          title,
          mode,
          sourceDate,
          broadcastId,
          participantSource,
          participants: finalParticipants,
          manualParticipantText,
          eventKind: "roulette",
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "룰렛 이벤트 생성 실패");
      }

      setCurrentEvent(createPayload.event);
      setParticipants(createPayload.event.participants || finalParticipants);

      const spinPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "spin_event",
          eventId: createPayload.event.id,
          winnerNote,
          fixedWinnerNickname: fixedWinnerNickname.trim(),
          participantSource,
          participants: finalParticipants,
          manualParticipantText,
        }),
      });

      if (!spinPayload.ok || !spinPayload.event) {
        throw new Error(spinPayload.message || "룰렛 시작 실패");
      }

      setCurrentEvent(spinPayload.event);
      setParticipants(spinPayload.event.participants || createPayload.event.participants || finalParticipants);
      await loadEventsAndWinners();
      showAdminToast(`당첨자: ${spinPayload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("룰렛 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  const markRewardDone = async (winner: RouletteWinner, isRewardDone: boolean) => {
    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_reward_done",
          winnerId: winner.id,
          isRewardDone,
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "지급완료 처리 실패");
      }

      await loadEventsAndWinners();
      showAdminToast(isRewardDone ? "지급완료 체크했습니다." : "지급완료 체크를 해제했습니다.", "success");
    } catch (error) {
      showAdminToast("지급완료 처리 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const deleteRouletteEvent = async (
    event: {
      id?: string | null;
      title?: string | null;
      mode?: string | null;
      is_test?: boolean | null;
      winner_nickname?: string | null;
    },
    sourceLabel: string,
  ) => {
    if (!event?.id) {
      showAdminToast("삭제할 룰렛 이벤트 ID가 없습니다.", "warning");
      return;
    }

    const isLive = event.mode === "live" || event.is_test === false;
    const confirmMessage = isLive
      ? `운영 룰렛 이벤트를 삭제합니다.\n\n이벤트: ${event.title || sourceLabel}\n당첨자: ${event.winner_nickname || "-"}\n\n이 룰렛 이벤트와 연결 당첨자 기록이 당첨자 관리에서 모두 삭제됩니다.\n이미 지급/고객 안내한 내용은 별도로 확인해야 합니다.\n\n정말 삭제할까요?`
      : `테스트 룰렛 이벤트를 삭제할까요?\n\n${event.title || sourceLabel}`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_event",
          eventId: event.id,
          allowLiveDelete: isLive,
          liveConfirmText: isLive ? "운영이벤트삭제" : "",
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "룰렛 이벤트 삭제 실패");
      }

      if (currentEvent?.id && currentEvent.id === event.id) {
        setCurrentEvent(null);
      }

      showAdminToast("룰렛 이벤트를 삭제했습니다.", "success");
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast("룰렛 이벤트 삭제 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const deleteWinnerRecord = async (winner: RouletteWinner) => {
    if (!winner?.event_id) {
      showAdminToast("연결된 룰렛 이벤트 ID가 없어 당첨자 기록만 삭제할 수 없습니다.", "warning");
      return;
    }

    await deleteRouletteEvent(
      {
        id: winner.event_id,
        title: `${winner.nickname} 당첨 룰렛`,
        mode: winner.is_test ? "test" : "live",
        is_test: winner.is_test,
        winner_nickname: winner.nickname,
      },
      winner.is_test ? "테스트 당첨 룰렛" : "운영 당첨 룰렛",
    );
  };


  const deleteAllTestRecords = async () => {
    if (!window.confirm("테스트 룰렛 이벤트와 테스트 당첨 기록을 모두 삭제할까요?\n\n운영 기록은 삭제하지 않습니다.")) return;

    try {
      const payload = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_test_records",
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "테스트 기록 삭제 실패");
      }

      if (currentEvent?.is_test) {
        setCurrentEvent(null);
      }

      showAdminToast("테스트 룰렛 기록을 삭제했습니다.", "success");
      await loadEventsAndWinners();
    } catch (error) {
      showAdminToast("테스트 기록 삭제 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    }
  };


  const startSpin = eventTab === "roulette" ? startRouletteOneClick : startClawEvent;
  const widgetUrl = eventTab === "roulette" ? overlayUrl : clawOverlayUrl;
  const periodChips: { key: "today" | "week" | "month" | "date"; label: string }[] = [
    { key: "today", label: "오늘" },
    { key: "week", label: "이번주" },
    { key: "month", label: "이번달" },
    { key: "date", label: "날짜선택" },
  ];

  return (
    <>
      {renderTrigger ? (
        <button type="button" onClick={openEventPanel} className={buttonClassName}>
          {buttonLabel}
        </button>
      ) : null}

      {open ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.55)", padding: "12px" }}>
          <div className="ruru-event-sian" style={{ width: "680px", flexShrink: 0, maxHeight: "calc(100vh-24px)", overflowY: "auto" }}>
            <div className="body">

              {/* 헤더 */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: "13px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>◆ 이벤트</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge" style={{ padding: "4px 16px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "roulette" ? "var(--rose)" : "#fff", color: eventTab === "roulette" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("roulette"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>룰렛</span>
                  <span className="badge" style={{ padding: "4px 16px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "claw" ? "var(--rose)" : "#fff", color: eventTab === "claw" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("claw"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>인형뽑기</span>
                  <span style={{ width: "1px", height: "18px", background: "var(--bd)", margin: "0 3px" }} />
                  <span className="badge" style={{ padding: "4px 10px", cursor: "pointer", border: "1px solid var(--bd)", background: mode === "test" ? "var(--amber-bg)" : "#fff", color: mode === "test" ? "var(--amber)" : "var(--mut)" }} onClick={() => changeMode("test")}>테스트</span>
                  <span className="badge" style={{ padding: "4px 10px", cursor: "pointer", border: "1px solid var(--bd)", background: mode === "live" ? "var(--green-bg)" : "#fff", color: mode === "live" ? "var(--green)" : "var(--mut)" }} onClick={() => changeMode("live")}>운영</span>
                  <button className="btn" style={{ height: "auto", padding: "5px 10px" }} onClick={() => { resetEvent(); setCenterWinner(""); }}>↺ 초기화</button>
                  <button className="btn" style={{ height: "auto", padding: "5px 10px" }} onClick={closePanel}>✕</button>
                </span>
              </div>

              {/* 룰렛 + 참가자 */}
              <div style={{ display: "flex", gap: "14px", alignItems: "stretch", marginBottom: "13px" }}>
                <div style={{ flex: 1, background: "#f7f5f1", borderRadius: "10px", minHeight: "190px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", position: "relative" }}>
                  {eventTab === "roulette" ? (
                    <div className="wheel">
                      <span className="pt" style={{ top: "6px", fontSize: "24px" }}>▼</span>
                      <canvas ref={canvasRef} width={300} height={300} style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block" }} />
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>{finalParticipants.length}명</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: "150px", height: "150px", borderRadius: "16px", background: "#fff", border: "1px solid var(--bd)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <span style={{ fontSize: "46px", lineHeight: 1 }}>🕹️</span>
                      <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>인형뽑기 · {finalParticipants.length}명</span>
                    </div>
                  )}
                  <button className="btn rose" style={{ height: "auto", padding: "9px 30px" }} onClick={startSpin} disabled={spinning || finalParticipants.length === 0}>{spinning ? "진행중..." : "▶ 돌리기"}</button>

                  {/* 당첨자 발표 카드 — EventRouletteOverlayClient result-card 디자인 */}
                  {centerWinner && currentEvent?.winner_nickname === centerWinner ? (
                    <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(90%,320px)", borderRadius: "28px", background: "rgba(255,255,255,0.96)", boxShadow: "0 24px 70px rgba(15,23,42,0.24)", padding: "24px", textAlign: "center", backdropFilter: "blur(6px)" }}>
                      <div style={{ color: "#7c3aed", fontSize: "18px", fontWeight: 950, letterSpacing: "-0.05em" }}>당첨</div>
                      <div style={{ marginTop: "6px", color: "#111827", fontSize: "40px", fontWeight: 950, lineHeight: 1.05, letterSpacing: "-0.08em", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{centerWinner}</div>
                      <div style={{ marginTop: "10px", color: "#475569", fontSize: "16px", fontWeight: 900, letterSpacing: "-0.05em" }}>{currentEvent?.winner_note || "이벤트 당첨"}</div>
                    </div>
                  ) : null}
                </div>

                <div style={{ flex: 0.95, display: "flex", flexDirection: "column", gap: "9px" }}>
                  <div className="note">참가자 불러오기</div>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "7px", borderColor: participantSource === "auto" ? "var(--rose)" : "var(--bd)", color: participantSource === "auto" ? "var(--rose)" : "var(--ink)" }} onClick={() => changeParticipantSource("auto")} disabled={!liveBroadcastId}>👥 주문서 제출자 전체 <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "auto" ? `${autoParticipantCount}명` : ""}</span></button>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "7px", borderColor: participantSource === "paid" ? "var(--green)" : "var(--bd)", color: participantSource === "paid" ? "var(--green)" : "var(--ink)" }} onClick={() => changeParticipantSource("paid")} disabled={!liveBroadcastId}>💵 입금완료한 사람만 <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "paid" ? `${autoParticipantCount}명` : ""}</span></button>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "7px", borderColor: participantSource === "manual" ? "var(--rose)" : "var(--bd)", color: participantSource === "manual" ? "var(--rose)" : "var(--ink)" }} onClick={() => changeParticipantSource("manual")}>✎ 수동 입력 (쉼표로 자동분리) <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "manual" ? `${manualParticipantCount}명` : ""}</span></button>
                  {participantSource === "manual" ? (
                    <textarea value={manualParticipantText} onChange={(e) => setManualParticipantText(e.target.value)} onPaste={handleManualPaste}
                      placeholder={"닉네임/쉼표 구분. 채팅 붙여넣으면 @닉네임만 자동 추출."}
                      style={{ width: "100%", height: "70px", resize: "none", fontSize: "11px", border: "1px solid var(--bd)", borderRadius: "7px", padding: "8px", background: "#fff" }} />
                  ) : null}
                  {!liveBroadcastId && participantSource !== "manual" ? (
                    <div className="note" style={{ color: "var(--amber)" }}>⚠ 방송 OFF — 방송 시작 후 명단을 불러올 수 있어요.</div>
                  ) : null}
                  <div style={{ background: "#f7f5f1", borderRadius: "7px", padding: "8px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExcludeDailyDup((v) => !v)}>
                    <span style={{ fontSize: "11px" }}>당일 중복당첨 금지</span>
                    <span className={`tog ${excludeDailyDup ? "on" : "off"}`}><i /></span>
                  </div>
                  <div style={{ background: "#f7f5f1", borderRadius: "7px", padding: "8px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setUseWeight((v) => !v)}>
                    <span style={{ fontSize: "11px" }}>많이 산 사람 확률 ↑ <span style={{ color: "var(--mut2)" }}>(금액40%+당일60%)</span></span>
                    <span className={`tog ${useWeight ? "on" : "off"}`}><i /></span>
                  </div>
                </div>
              </div>

              {/* 당첨 고정 */}
              <div style={{ border: "1px solid var(--rose-bd)", background: "var(--rose-bg)", borderRadius: "8px", padding: "9px 11px", marginBottom: "11px" }}>
                <div style={{ fontSize: "11px", color: "var(--rose)", fontWeight: 600, marginBottom: "7px" }}>🎯 당첨 고정 (명단에서 닉네임 클릭)</div>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", maxHeight: "92px", overflowY: "auto" }}>
                  {finalParticipants.length === 0 ? (
                    <span className="note">참가자를 먼저 불러오세요.</span>
                  ) : (
                    finalParticipants.map((p, i) => {
                      const on = fixedWinnerNickname === p.nickname;
                      return (
                        <span key={`fix-${p.nickname}-${i}`} className={`nick ${on ? "win" : ""}`} onClick={() => setFixedWinnerNickname(on ? "" : p.nickname)}>{on ? "👑 " : ""}{p.nickname}</span>
                      );
                    })
                  )}
                </div>
                <div className="note" style={{ marginTop: "7px" }}>👑 = 당첨 고정 선택됨</div>
              </div>

              {/* 제목 + 당첨 내용(선물) */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "11px" }}>
                <input className="ipt" style={{ flex: 1 }} placeholder="이벤트 제목" value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} />
                <select className="ipt" style={{ flex: "0 0 84px" }} value={giftType} onChange={(e) => { const next = e.target.value as "point" | "custom"; setGiftType(next); if (next === "point") setWinnerNote(`포인트 ${Number(giftPointAmount || 0).toLocaleString("ko-KR")}P`); }}>
                  <option value="point">포인트</option>
                  <option value="custom">직접입력</option>
                </select>
                {giftType === "point" ? (
                  <input className="ipt" style={{ flex: 1, textAlign: "right" }} placeholder="당첨 내용(포인트)" inputMode="numeric" value={giftPointAmount ? Number(giftPointAmount).toLocaleString("ko-KR") : ""}
                    onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ""); setGiftPointAmount(d); setWinnerNote(`포인트 ${Number(d || 0).toLocaleString("ko-KR")}P`); }} />
                ) : (
                  <input className="ipt" style={{ flex: 1 }} placeholder="당첨 내용" value={winnerNote} maxLength={40} onChange={(e) => setWinnerNote(e.target.value)} />
                )}
              </div>

              {/* 위젯주소 */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "11px" }}>
                <span className="note" style={{ flexShrink: 0 }}>방송 위젯주소</span>
                <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{widgetUrl || "준비중"}</span>
                <button className="btn rose" style={{ height: "auto", padding: "5px 12px" }} onClick={() => void copyText(widgetUrl)} disabled={!widgetUrl}>복사</button>
              </div>

              {/* 이벤트 목록 */}
              <div style={{ borderTop: "1px solid var(--bd)", paddingTop: "11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span className="seclabel" style={{ margin: 0 }}>이벤트 목록 <span className="note">지난 기록</span></span>
                  {periodChips.map((chip) => (
                    <span key={chip.key} className="badge" style={{ cursor: "pointer", padding: "4px 10px", border: "1px solid var(--bd)", background: listPeriod === chip.key ? "var(--rose)" : "#fff", color: listPeriod === chip.key ? "#fff" : "var(--mut)" }} onClick={() => setListPeriod(chip.key)}>{chip.label}</span>
                  ))}
                  {listPeriod === "date" ? (
                    <input type="date" className="ipt" style={{ height: "26px" }} value={listDate} onChange={(e) => setListDate(e.target.value)} />
                  ) : null}
                  <span style={{ marginLeft: "auto", display: "flex", gap: "5px" }}>
                    <button className="btn" style={{ height: "26px", padding: "0 8px" }} onClick={() => void loadEventsAndWinners()}>새로고침</button>
                    <button className="btn" style={{ height: "26px", padding: "0 8px" }} onClick={() => void deleteAllTestRecords()}>테스트정리</button>
                  </span>
                </div>
                {filteredWinners.length === 0 ? (
                  <div className="note" style={{ textAlign: "center", padding: "20px 0" }}>해당 기간 당첨 기록이 없습니다.</div>
                ) : (
                  filteredWinners.map((w) => (
                    <div key={`winner-${w.id}`} className="row">
                      <span className="note" style={{ width: "120px", flexShrink: 0 }}>{dateTimeFull(w.winner_at)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.is_test ? "테스트" : "운영"} · {(() => { const ev = events.find((e) => e.id === w.event_id); const token = ev?.overlay_token || ""; return token.startsWith("roulette") ? "🎡룰렛" : token.startsWith("claw") ? "🪆인형뽑기" : "이벤트"; })()} · 당첨 <b>{w.nickname}</b> · {w.winner_note || "이벤트 당첨"}</span>
                      <span className={`badge ${w.is_reward_done ? "b-ok" : "b-card"}`} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => markRewardDone(w, !w.is_reward_done)}>{w.is_reward_done ? "지급완료" : "지급대기"}</span>
                      <span className="note" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => void deleteWinnerRecord(w)}>삭제</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
