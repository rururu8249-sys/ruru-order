"use client";

import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import AdminLiveMissionPanel from "./AdminLiveMissionPanel";
import AdminLiveEventSoundboard from "./AdminLiveEventSoundboard"; // [2026-08-12] 효과음 재생 버튼(표시·재생 전용)

type RouletteMode = "live" | "test" | "preview";

const FIXED_OVERLAY_TOKEN = "roulette_luludongi_live";
const FIXED_CLAW_OVERLAY_TOKEN = "claw_luludongi_live";
const FIXED_SURVIVAL_OVERLAY_TOKEN = "survival_luludongi_live";
const FIXED_RACE_OVERLAY_TOKEN = "race_luludongi_live"; // [2026-07-26] 달리기 대회

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
  /** [2026-09-08] 결제완료 금액(응모권 근거) · 응모권 장수(= weight) */
  paid_amount_sum?: number;
  tickets?: number;
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
  winnerId?: string; // spin_event 응답: 방금 만든 당첨자 레코드 id(배지 마킹용, 재조회 없이 사용)
};

// resolve_survival_event 응답: 생존자 K명 + 각 당첨자 레코드 id(지급/마킹용)
type SurvivalResolvePayload = {
  ok: boolean;
  message?: string;
  event?: RouletteEvent;
  winner_count?: number;
  survivors?: string[];
  winners?: { nickname: string; winnerId: string }[];
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
  /** [2026-09-08 5단계] 페이지 안에 그대로(방송 › 이벤트 탭). 팝업 껍데기·✕ 없음 */
  embedded?: boolean;
  activeBroadcastId?: string | number | null;
  filteredOrderGroupIds?: string[]; // 주문서 화면 필터로 현재 보이는 주문 group_id 목록(룰렛 참가자 기준)
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

function buildSurvivalOverlayUrl() {
  if (typeof window === "undefined") return "";

  return `${window.location.origin}/event-survival/live?token=${encodeURIComponent(FIXED_SURVIVAL_OVERLAY_TOKEN)}`;
}

function buildRaceOverlayUrl() {
  if (typeof window === "undefined") return "";

  return `${window.location.origin}/event-race/live?token=${encodeURIComponent(FIXED_RACE_OVERLAY_TOKEN)}`;
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
  buttonClassName = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl bg-[var(--color-cardpay)] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[var(--color-cardpay)]",
  renderTrigger = true,
  controlledOpen,
  onRequestClose,
  embedded = false,
  activeBroadcastId,
  filteredOrderGroupIds,
}: AdminLiveEventRoulettePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;

  // 주문서 화면 필터로 현재 보이는 주문 group_id (룰렛 참가자 기준). 항상 최신값을 ref로 보관(스테일 클로저 방지).
  const filteredIdsRef = useRef<string[] | null>(Array.isArray(filteredOrderGroupIds) ? filteredOrderGroupIds : null);
  filteredIdsRef.current = Array.isArray(filteredOrderGroupIds) ? filteredOrderGroupIds : null;
  const closePanel = () => {
    if (controlledOpen !== undefined) onRequestClose?.();
    else setInternalOpen(false);
  };
  // [2026-09-08] 테스트/운영 토글 삭제 → 기본 운영. 테스트는 「테스트로 해보기」 버튼이 한 판만 test 로 돌린다.
  const [mode, setMode] = useState<RouletteMode>("live");
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
  // [2026-09-08] 기본 탭 서바이벌(실사용 최다). 탭 순서: 서바이벌·달리기·룰렛·인형뽑기·미션
  const [eventTab, setEventTab] = useState<"roulette" | "claw" | "mission" | "survival" | "race">("survival");
  const [participantSource, setParticipantSource] = useState<"auto" | "paid" | "manual">("auto");
  const [manualParticipantText, setManualParticipantText] = useState("");
  const [fixedWinnerNickname, setFixedWinnerNickname] = useState("");
  const [clawResultType, setClawResultType] = useState<"capsule" | "doll">("capsule");
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [giftType, setGiftType] = useState<"point" | "custom">("point");
  const [giftPointAmount, setGiftPointAmount] = useState("");
  // 서바이벌(생존게임) 전용 상태 — 다른 탭 로직에는 영향 없음
  const [survivorCount, setSurvivorCount] = useState(1); // 최종 생존자(당첨자) 수 K
  const [fixedSurvivorNicknames, setFixedSurvivorNicknames] = useState<string[]>([]); // 미리 지정한 고정 당첨자(다중, 최대 K)
  // 시안 신규 UI 상태 (추첨 로직 무변경 — 표시/선택용)
  const [excludeDailyDup, setExcludeDailyDup] = useState(true);
  // [2026-09-08] 구매 응모권 규칙 — 켜면 "1장 + 결제완료 금액 unit원마다 1장, 최대 max장". 서버에 그대로 보내고 서버가 계산.
  //   (예전 useWeight 토글은 어디에도 안 보내져서 장식이었고, 서버는 항상 1~1.8배 가중치를 걸고 있었음)
  // [2026-09-09 사장님 지시] 「수동을 작성 하는거 없애라. 자동으로 손님들 분석해서 당첨 잘되게」
  //   → 숫자 입력칸(만원 단위·최대 장수)을 «전부 삭제». 켜기/끄기 하나만 남는다.
  //     장수는 서버가 그날 명단을 보고 계산한다(오늘 얼마 샀나 + 과거에 몇 번 왔나).
  const [ticketEnabled, setTicketEnabled] = useState(false);
  // 사장님이 직접 바꾼 뒤에만 저장·재조회한다(처음 불러온 값 반영 중엔 아무것도 안 함 — 저장값 덮어쓰기 방지)
  const ticketTouchedRef = useRef(false);
  useEffect(() => {
    // 마운트 직후 한 번, 저장해 둔 규칙을 읽어 온다(서버 렌더와 어긋나지 않게 다음 틱에서 반영)
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("ruru_event_ticket_rule");
        if (!raw) return;
        const j = JSON.parse(raw) as { enabled?: boolean };
        if (typeof j.enabled === "boolean") setTicketEnabled(j.enabled);
        // [2026-09-09] 숫자 규칙은 없어졌다 — 켜짐/꺼짐만 기억한다
      } catch { /* 저장된 규칙 없음 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  // [2026-09-09] 서버로 나가는 규칙 — 켜짐 여부와 «자동» 표시만. 숫자는 안 보낸다.
  const ticketRuleBody = useMemo(() => ({
    useWeight: ticketEnabled,
    ticketAuto: true,
  }), [ticketEnabled]);
  const ticketRuleKey = JSON.stringify(ticketRuleBody);
  const [listPeriod, setListPeriod] = useState<"today" | "week" | "month" | "date">("today");
  const [listDate, setListDate] = useState("");


  const overlayUrl = useMemo(() => buildOverlayUrl(currentEvent), [currentEvent]);
  const clawOverlayUrl = useMemo(() => buildClawOverlayUrl(), []);
  const survivalOverlayUrl = useMemo(() => buildSurvivalOverlayUrl(), []);
  const raceOverlayUrl = useMemo(() => buildRaceOverlayUrl(), []); // [2026-07-26] 달리기

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
  // [2026-09-08] 전체 응모권 장수 — 칩의 확률 표시용
  // [2026-09-08 사장님 지적] 「명단이 ㄱㄴㄷ 순도 아니고 닉네임 확인도 어렵다」
  //   ⚠ finalParticipants 는 추첨 API 본문(participants)으로 그대로 나간다 → 순서를 바꾸면 안 된다.
  //   그래서 «화면에서 고를 때만» 쓰는 복사본을 따로 만든다(정렬·검색). 추첨 결과·확률과 무관.
  const [nickFilter, setNickFilter] = useState("");
  const pickList = useMemo(() => {
    const sorted = [...finalParticipants].sort((a, b) =>
      String(a.nickname ?? "").localeCompare(String(b.nickname ?? ""), "ko", { numeric: true }),
    );
    const q = nickFilter.trim().toLowerCase();
    return q ? sorted.filter((p) => String(p.nickname ?? "").toLowerCase().includes(q)) : sorted;
  }, [finalParticipants, nickFilter]);

  const totalTickets = finalParticipants.reduce((sum, p) => sum + Math.max(1, Math.floor(Number(p.tickets ?? p.weight ?? 1)) || 1), 0);
  // [2026-09-09] 「1장 4명 · 2장 2명 · 3장 1명」 — 돌리기 «전»에 눈으로 확인하는 결과 미리보기
  const ticketPreview = useMemo(() => {
    const byTickets = new Map<number, number>();
    for (const p of finalParticipants) {
      const t = Math.max(1, Math.floor(Number(p.tickets ?? p.weight ?? 1)) || 1);
      byTickets.set(t, (byTickets.get(t) || 0) + 1);
    }
    const rows = Array.from(byTickets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([tickets, count]) => ({ tickets, count }));
    return { rows, total: finalParticipants.length };
  }, [finalParticipants]);
  const selectedWinnerNickname =
    fixedWinnerNickname.trim() ||
    finalParticipants[0]?.nickname ||
    currentEvent?.winner_nickname ||
    "";

  const recentEvents = events.slice(0, 3);
  const recentWinners = winners.slice(0, 100);
  const autoParticipantCount = participants.length;
  // 「주문서 제출자 전체 / 결제완료한 사람만」 각각의 마지막 결과를 기억 → 다시 누르면 즉시 보여주고 뒤에서 갱신.
  //   추첨에 쓰이는 값은 서버 응답 그대로다(캐시는 화면 표시용 첫 그림일 뿐, 갱신되면 덮어씀).
  const participantCacheRef = useRef<{ auto: RouletteParticipant[] | null; paid: RouletteParticipant[] | null }>({ auto: null, paid: null });
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
  // [2026-09-08] 응모권 장수만큼 같은 이름 칸 반복 → 휠 칸 수 = 실제 확률 (방송 위젯도 같은 규칙)
  namesRef.current = finalParticipants.flatMap((p) => {
    const t = Math.max(1, Math.min(20, Math.floor(Number(p.tickets ?? p.weight ?? 1)) || 1));
    return Array.from({ length: t }, () => p.nickname);
  });
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
    // [2026-09-08] 이 판이 운영인지 — 화면 상태가 아니라 서버가 만든 이벤트 행의 mode 로 판단(테스트 한 판 중 상태 꼬임 방지)
    const isLive = (currentEvent?.mode || mode) === "live";
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

  // spin_event 응답이 준 당첨자 레코드 id(eventId→winnerId). 배지 마킹 시 재조회(race/RLS) 대신 직접 사용.
  const winnerIdByEventRef = useRef<Map<string, string>>(new Map());

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
      const nick = String(nickname || "").trim();
      const digitsOf = (v: unknown) => String(v || "").replace(/[^0-9]/g, "");
      // 전화번호 조회: ① 주문(orders) 닉네임 → ② 고객(customers) 닉네임 → ③ 고객 카카오닉네임.
      //   카카오 간편로그인은 customers에 전화번호가 항상 저장되므로, orders에 없어도 여기서 찾는다.
      let phone = "";
      {
        const { data: oRow } = await supabase
          .from("orders").select("customer_phone")
          .eq("youtube_nickname", nick)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        phone = digitsOf((oRow as { customer_phone?: unknown } | null)?.customer_phone);
      }
      if (!phone) {
        const { data: cRows } = await supabase
          .from("customers").select("customer_phone")
          .eq("youtube_nickname", nick)
          .order("last_order_at", { ascending: false }).limit(1);
        phone = digitsOf((cRows as { customer_phone?: unknown }[] | null)?.[0]?.customer_phone);
      }
      if (!phone) {
        const { data: kRows } = await supabase
          .from("customers").select("customer_phone")
          .eq("kakao_nickname", nick).limit(1);
        phone = digitsOf((kRows as { customer_phone?: unknown }[] | null)?.[0]?.customer_phone);
      }
      if (!phone) {
        if (evId) grantedEventIdsRef.current.delete(evId); // 지급 안 됐으니 잠금 해제
        showAdminToast(`${nick}의 전화번호를 어디서도 찾지 못해 자동지급을 건너뜁니다.`, "warning");
        return;
      }
      // [2026-08-30] 중복지급 근본 차단 — 이 이벤트의 당첨자 줄 하나당 평생 1회.
      //   winnerId 를 알면 그걸로, 아직 모르면 eventId 로 키를 만든다(둘 다 1이벤트 1당첨자 전제).
      const rouletteWinnerId = evId ? winnerIdByEventRef.current.get(evId) : "";
      const rouletteSourceKey = rouletteWinnerId
        ? `event_winner:${rouletteWinnerId}`
        : evId
          ? `event_pick:${evId}`
          : "";

      const payload = await requestJson<{ ok: boolean; message?: string; duplicate?: boolean }>("/api/admin-live/customer-points", {
        method: "POST",
        body: JSON.stringify({
          phone,
          action: "grant",
          amount,
          reason: reason || "이벤트 당첨",
          youtube_nickname: nickname,
          customer_visible: true,
          ...(rouletteSourceKey ? { source_key: rouletteSourceKey } : {}),
        }),
      });
      if (!payload.ok) throw new Error(payload.message || "포인트 지급 실패");
      if (payload.duplicate) {
        showAdminToast(`${nickname}님은 이미 지급된 건이라 다시 지급하지 않았습니다.`, "info");
      } else {
        showAdminToast(`${nickname}님에게 ${amount.toLocaleString("ko-KR")}P 자동지급 완료.`, "success");
      }

      // 지급 성공 → 해당 당첨자 레코드 is_reward_done=true (영구 중복지급 게이트). 기존 mark_reward_done API 재사용.
      //   winnerId는 spin 응답이 직접 줌(winnerIdByEventRef) → 재조회(race/RLS) 불필요. 없을 때만 event_id로 재조회(최대 3회).
      if (evId) {
        // [2026-07-10 버그수정] 마킹이 실패하면 "돈은 나갔는데 잠금이 안 걸린" 상태가 되어 재실행 시 중복지급된다.
        //   (2026-07-05 쥬쥬엉니 2,000P 실제 발생) → 마킹을 3회 재시도하고, winnerId를 못 구하면
        //   서버가 eventId로 직접 찾아 마킹하는 폴백(mark_reward_done_by_event)을 쓴다. 돈 API는 무변경.
        const winnerId: string | undefined = winnerIdByEventRef.current.get(evId) || undefined;
        let marked = false;
        for (let i = 0; i < 3 && !marked; i++) {
          const body = winnerId
            ? { action: "mark_reward_done", winnerId, isRewardDone: true }
            : { action: "mark_reward_done_by_event", eventId: evId, nickname };
          const markRes = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
            method: "POST",
            body: JSON.stringify(body),
          }).catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
          marked = !!markRes.ok;
          if (!marked) await new Promise((r) => setTimeout(r, 700));
        }
        if (marked) {
          await loadEventsAndWinners();
        } else {
          // 포인트는 이미 지급됨(재지급 X). 배지 마킹만 실패 → 세션 잠금은 유지하고 운영자에게 알린다.
          showAdminToast(`⚠️ ${nickname} 포인트는 지급됐지만 '지급완료' 배지 표시에 실패했어요. 중복지급 방지를 위해 배지를 직접 눌러 지급완료로 바꿔주세요.`, "warning");
          await loadEventsAndWinners();
        }
      }
    } catch (e) {
      if (evId) grantedEventIdsRef.current.delete(evId); // 실패 시 잠금 해제(재시도 허용)
      showAdminToast("포인트 자동지급 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  // ── 서바이벌(생존게임) 전용 지급 ─────────────────────────────────────────
  // 왜 별도 함수인가: 위 grantPointToWinner는 "이벤트당 당첨자 1명" 전제라 dedup 키가 eventId다.
  //   서바이벌은 한 이벤트에 생존자 K명이라 그대로 쓰면 1명 지급 후 나머지가 전부 skip된다.
  //   → 돈이 나가는 API·전화번호 조회는 100% 동일하게 쓰고, 중복 가드 키만 winnerId(당첨자 행) 단위로 바꿈.
  //   ⚠ 기존 grantPointToWinner / 룰렛 / 인형뽑기 지급 로직은 무변경.
  const grantedWinnerIdsRef = useRef<Set<string>>(new Set()); // 세션 중복지급 가드(당첨자 행 단위)

  // 닉네임 → 전화번호 (grantPointToWinner와 동일한 3단계 조회, 읽기 전용)
  const findWinnerPhone = async (nick: string) => {
    const digitsOf = (v: unknown) => String(v || "").replace(/[^0-9]/g, "");
    let phone = "";
    {
      const { data: oRow } = await supabase
        .from("orders").select("customer_phone")
        .eq("youtube_nickname", nick)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      phone = digitsOf((oRow as { customer_phone?: unknown } | null)?.customer_phone);
    }
    if (!phone) {
      const { data: cRows } = await supabase
        .from("customers").select("customer_phone")
        .eq("youtube_nickname", nick)
        .order("last_order_at", { ascending: false }).limit(1);
      phone = digitsOf((cRows as { customer_phone?: unknown }[] | null)?.[0]?.customer_phone);
    }
    if (!phone) {
      const { data: kRows } = await supabase
        .from("customers").select("customer_phone")
        .eq("kakao_nickname", nick).limit(1);
      phone = digitsOf((kRows as { customer_phone?: unknown }[] | null)?.[0]?.customer_phone);
    }
    return phone;
  };

  // 생존자 K명에게 각각 amount 포인트 지급. 한 명 실패해도 나머지는 계속 진행.
  //   중복지급 방지 2중: ① 세션 ref(winnerId) ② DB의 is_reward_done(그 당첨자 행) 확인 후 지급, 성공 시 즉시 잠금.
  const grantPointToSurvivors = async (
    survivorWinners: { nickname: string; winnerId: string }[],
    amount: number,
    reason: string
  ) => {
    const paid: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const w of survivorWinners) {
      const nick = String(w.nickname || "").trim();
      const winnerId = String(w.winnerId || "").trim();

      if (!nick || !winnerId) {
        failed.push(`${nick || "?"}(당첨 레코드 없음)`);
        continue;
      }
      if (grantedWinnerIdsRef.current.has(winnerId)) {
        skipped.push(nick);
        continue;
      }

      // 영구 게이트: 이 당첨자 행이 이미 지급완료면 skip (재실행/새로고침/다른 탭 포함)
      const { data: wRow } = await supabase
        .from("event_roulette_winners").select("is_reward_done")
        .eq("id", winnerId).maybeSingle();
      if ((wRow as { is_reward_done?: boolean } | null)?.is_reward_done) {
        grantedWinnerIdsRef.current.add(winnerId);
        skipped.push(nick);
        continue;
      }

      grantedWinnerIdsRef.current.add(winnerId); // 선점 잠금(실패 시 아래에서 해제)

      try {
        const phone = await findWinnerPhone(nick);
        if (!phone) {
          grantedWinnerIdsRef.current.delete(winnerId); // 지급 안 됐으니 해제
          failed.push(`${nick}(전화번호 없음)`);
          continue;
        }

        // [2026-08-30] 중복지급 근본 차단 — 당첨자 줄(winnerId) 하나당 평생 1회.
        //   화면 잠금(is_reward_done)이 실패해도 서버가 두 번째 지급을 거부한다.
        //   (2026-08-29 쩡이 2,000P 중복 사고의 실제 원인이 그 잠금 실패였다)
        const payload = await requestJson<{ ok: boolean; message?: string; duplicate?: boolean }>("/api/admin-live/customer-points", {
          method: "POST",
          body: JSON.stringify({
            phone,
            action: "grant",
            amount,
            reason: reason || "서바이벌 생존",
            youtube_nickname: nick,
            customer_visible: true,
            source_key: `event_winner:${winnerId}`,
          }),
        });
        if (!payload.ok) throw new Error(payload.message || "포인트 지급 실패");
        if (payload.duplicate) {
          // 서버가 막았다 = 이미 나간 건. 잠금만 맞춰주고 넘어간다(돈 무변동).
          grantedWinnerIdsRef.current.add(winnerId);
          skipped.push(nick);
          void requestJson("/api/admin-live/event-roulette", {
            method: "POST",
            body: JSON.stringify({ action: "mark_reward_done", winnerId, isRewardDone: true }),
          }).catch(() => undefined);
          continue;
        }

        // 지급 성공 → 그 당첨자 행만 지급완료로 잠금(영구 중복지급 게이트)
        //   [2026-07-10] 마킹 실패 = 중복지급 위험 → 3회 재시도(룰렛과 동일 정책)
        let marked = false;
        for (let i = 0; i < 3 && !marked; i++) {
          const markRes = await requestJson<{ ok: boolean; message?: string }>("/api/admin-live/event-roulette", {
            method: "POST",
            body: JSON.stringify({ action: "mark_reward_done", winnerId, isRewardDone: true }),
          }).catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
          marked = !!markRes.ok;
          if (!marked) await new Promise((r) => setTimeout(r, 700));
        }
        if (!marked) {
          // 포인트는 이미 지급됨(재지급 X). 배지 표시만 실패 → 운영자가 직접 배지 클릭하도록 안내.
          showAdminToast(`⚠️ ${nick} 포인트는 지급됐지만 '지급완료' 배지 표시에 실패했어요. 중복지급 방지를 위해 배지를 직접 눌러주세요.`, "warning");
        }
        paid.push(nick);
      } catch (e) {
        grantedWinnerIdsRef.current.delete(winnerId); // 실패 시 잠금 해제(재시도 허용)
        failed.push(`${nick}(${e instanceof Error ? e.message : String(e)})`);
      }
    }

    await loadEventsAndWinners();

    const lines = [`⛈️ 서바이벌 포인트 지급 결과`];
    if (paid.length) lines.push(`✅ 지급 ${paid.length}명: ${paid.join(", ")} (각 ${amount.toLocaleString("ko-KR")}P)`);
    if (skipped.length) lines.push(`⏭️ 이미 지급됨 ${skipped.length}명: ${skipped.join(", ")}`);
    if (failed.length) lines.push(`❌ 실패 ${failed.length}명: ${failed.join(", ")}\n→ 실패한 사람은 회원상세에서 수동 지급해주세요.`);
    showAdminToast(lines.join("\n"), failed.length ? "warning" : "success");
  };

  const openEventPanel = () => {
    setInternalOpen(true);
  };

  // 초기화: 참가자 + 당첨고정 + 당첨자발표(현재 이벤트) 동시 리셋. 기록/목록은 건드리지 않음.
  // [2026-09-09 4순위 전수감사] 「↺ 초기화」에 확인창이 없었다.
  //   이 버튼은 탭(🎯 미션 …)과 「✕ 닫기」 «사이»에 끼어 있고 크기도 작다(padding 4px 8px).
  //   방송 중에 잘못 누르면 불러온 명단·직접 적은 참가자·고정 당첨자가 «한 번에» 사라진다.
  //   (같은 종류의 오클릭 위험을 2026-09-08 감사에서 「지급완료 옆 삭제」로 한 번 고쳤다 — 여기가 남아 있었다)
  //   → 지울 게 «있을 때만» 물어본다. 이미 비어 있으면 예전처럼 그냥 넘어간다(불필요한 확인창 금지).
  const resetEvent = async () => {
    const losing: string[] = [];
    if (participants.length > 0) losing.push(`명단 ${participants.length}명`);
    if (manualParticipantText.trim()) losing.push("직접 적은 참가자");
    if (fixedWinnerNickname.trim()) losing.push(`고정 당첨자 「${fixedWinnerNickname.trim()}」`);

    if (losing.length > 0) {
      const ok = await showAdminConfirm(
        `${losing.join(" · ")}\n\n이걸 전부 지우고 처음으로 되돌릴까요?\n(이미 지급한 포인트·당첨 기록은 그대로 남습니다)`,
        { title: "이벤트 화면 초기화", confirmText: "초기화", cancelText: "그대로 두기", tone: "warning" },
      );
      if (!ok) return;
    }

    setParticipants([]);
    setManualParticipantText("");
    setFixedWinnerNickname("");
    setCurrentEvent(null);
    setCenterWinner(""); // 「취소」를 누르면 여기까지 안 오므로 화면이 그대로 남는다
  };

  const changeBroadcast = (nextBroadcastId: string) => {
    setBroadcastId(nextBroadcastId);
    void loadParticipants(mode, sourceDate, nextBroadcastId);
  };

  // 참가자 기준 = 주문서 화면 필터로 보이는 주문(우선) / 없으면 현재 활성 방송.
  const liveBroadcastId = activeBroadcastId != null ? String(activeBroadcastId) : "";
  const hasFilteredOrders = Array.isArray(filteredOrderGroupIds) && filteredOrderGroupIds.length > 0;
  const canLoadParticipants = hasFilteredOrders || !!liveBroadcastId;

  const changeParticipantSource = (source: "auto" | "paid" | "manual") => {
    setParticipantSource(source);

    // 이미 한 번 불러온 기준이면 캐시를 먼저 그려 «즉시» 반응하게 한다(그 다음 아래에서 최신값 재조회).
    if (source === "auto" || source === "paid") {
      const cached = participantCacheRef.current[source];
      if (cached) setParticipants(cached);
    }

    if (source === "auto" || source === "paid") {
      if (!canLoadParticipants) {
        showAdminToast("불러올 주문이 없습니다.\n\n방송을 시작했거나 주문서에 주문이 보이는 상태여야 참가자를 불러올 수 있어요.", "warning");
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

  const startClawEvent = async (runMode: RouletteMode = mode) => {
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
          mode: runMode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: "claw",
          excludeDailyDup,
          ...ticketRuleBody,
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

      if (spinPayload.event.id && spinPayload.winnerId) winnerIdByEventRef.current.set(String(spinPayload.event.id), String(spinPayload.winnerId));
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
      // 참가자 = 주문서 화면 필터로 보이는 주문 기준. group_id 목록을 POST로 보냄(배열이면 그 기준, null이면 서버가 방송 fallback).
      //   group_id가 많아 URL 길이 초과 위험이 있어 POST 사용. 서버가 동일한 dedup·중복당첨제외·가중치 로직으로 빌드.
      const payload = await requestJson<ParticipantsPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "participants",
          mode: nextMode,
          sourceDate: nextSourceDate,
          broadcastId: nextBroadcastId || undefined,
          paidOnly: paidOnly || undefined,
          excludeDailyDup,
          orderGroupIds: paidOnly ? undefined : (filteredIdsRef.current ?? undefined),
          ...ticketRuleBody,
        }),
      });

      if (!payload.ok) {
        throw new Error(payload.message || "참여자 조회 실패");
      }

      const nextRows = payload.participants || [];
      participantCacheRef.current[paidOnly ? "paid" : "auto"] = nextRows;
      setParticipants(nextRows);
      // 목록·인원수는 즉시 표시하고 로딩 해제(버벅임 방지). 미리보기 이벤트 생성(추가 서버 왕복)은
      //   화면을 막지 않게 백그라운드로 — 룰렛 휠은 잠시 뒤 채워짐. 추첨/지급 로직은 무변경.
      setLoading(false);
      void ensureRoulettePreviewEvent(payload.participants || []);
    } catch (error) {
      showAdminToast("룰렛 참여자 조회 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      setLoading(false);
    }
  };

  // [2026-09-08] 응모권 규칙이 바뀌면 명단(장수)을 다시 불러오고 규칙을 기억해 둔다(수동 입력은 전원 1장이라 제외)
  useEffect(() => {
    if (!ticketTouchedRef.current) return;
    try { window.localStorage.setItem("ruru_event_ticket_rule", JSON.stringify({ enabled: ticketEnabled })); } catch { /* 무시 */ }
    if (!open) return;
    if (participantSource !== "auto" && participantSource !== "paid") return;
    // [2026-09-09] 예전엔 «글자를 칠 때마다» 0.5초 뒤 조회가 나갔다. 이제 규칙이 «적용»될 때만 바뀌므로
    //   기다릴 이유가 없다 — 바로 한 번 불러온다. (켜기/끄기 토글도 같은 경로)
    void loadParticipants(mode, sourceDate, broadcastId, participantSource === "paid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketRuleKey]);

  // 주문서 화면 필터(보이는 주문)가 바뀌면 자동/입금완료 참가자를 다시 불러온다(수동 입력 모드는 제외).
  const filterFirstRunRef = useRef(false);
  const filteredKey = Array.isArray(filteredOrderGroupIds) ? filteredOrderGroupIds.join(",") : "";
  useEffect(() => {
    if (!open) return;
    if (!filterFirstRunRef.current) {
      filterFirstRunRef.current = true;
      return; // 첫 마운트는 bootstrap 로드가 처리(중복 호출 방지)
    }
    if (participantSource !== "auto" && participantSource !== "paid") return;
    void loadParticipants(mode, sourceDate, broadcastId, participantSource === "paid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredKey]);

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

      if (payload.event.id && payload.winnerId) winnerIdByEventRef.current.set(String(payload.event.id), String(payload.winnerId));
      setCurrentEvent(payload.event);
      await loadEventsAndWinners();
      showAdminToast(`당첨자: ${payload.event.winner_nickname || "-"}`, "success");
    } catch (error) {
      showAdminToast("룰렛 시작 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };


  // [2026-09-09] 명단을 불러올 때마다 «대기 이벤트»를 DB에 새로 만들던 것 → 같은 명단이면 건너뛴다.
  //   (예전: 명단 1회 로드 = participants + create_event + events + winners = 서버 왕복 4회,
  //    게다가 테스트 이벤트 행이 계속 쌓였다)
  const previewSignatureRef = useRef("");
  const ensureRoulettePreviewEvent = async (nextParticipants: RouletteParticipant[]) => {
    if (eventTab !== "roulette") return;
    if (nextParticipants.length === 0) return;

    // 명단(닉네임+응모권 장수)과 방송·제목·규칙이 그대로면 위젯에 띄울 내용도 그대로다 → 서버에 안 간다.
    const signature = JSON.stringify([
      nextParticipants.map((p) => `${p.nickname}:${Math.max(1, Math.floor(Number(p.tickets ?? p.weight ?? 1)) || 1)}`),
      broadcastId,
      title,
      excludeDailyDup,
      ticketRuleKey,
    ]);
    if (previewSignatureRef.current === signature) return;

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          title,
          // [2026-09-08] 명단을 불러올 때 방송 위젯에 휠을 미리 띄우려고 만드는 "대기" 이벤트 — 항상 테스트 기록으로.
          //   (기본 모드가 운영으로 바뀌면서 운영 대기 행이 쌓이는 걸 막음. 실제 추첨은 돌리기 때 새 이벤트를 만든다)
          mode: "test",
          sourceDate,
          broadcastId,
          participants: nextParticipants,
          eventKind: "roulette",
          excludeDailyDup,
          ...ticketRuleBody,
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || "룰렛 미리보기 이벤트 생성 실패");
      }

      previewSignatureRef.current = signature;
      setCurrentEvent(createPayload.event);
      setParticipants(createPayload.event.participants || nextParticipants);
      // [2026-09-09] 여기서 기록(이벤트목록·당첨자)까지 다시 불러오느라 왕복이 2회 더 나갔다.
      //   이건 «테스트 대기 이벤트»라 목록에 즉시 보일 필요가 없다 → 아래 「새로고침」 버튼에 맡긴다.
    } catch (error) {
      previewSignatureRef.current = ""; // 실패했으면 다음에 다시 시도한다
      showAdminToast(
        "룰렛 미리보기 생성 실패\\n\\n" + (error instanceof Error ? error.message : String(error)),
        "error"
      );
    }
  };

  // 서바이벌(생존게임) 실행.
  //   ① create_event(eventKind:"survival")로 이벤트 생성 → ② resolve_survival_event로 서버가 생존자 K명 확정
  //   (고정 당첨자 우선 → 나머지 가중치 랜덤). 방송 위젯은 그 결과를 폴링해 연출을 재생한다.
  //   포인트 지급은 여기서 하지 않는다(Phase 4에서 기존 grant 흐름 연결).
  const startSurvivalEvent = async (runMode: RouletteMode = mode) => {
    if (finalParticipants.length === 0) {
      showAdminToast("참가자 명단이 없습니다. 자동 명단을 불러오거나 수동 참가자를 입력해주세요.", "warning");
      return;
    }
    if (survivorCount < 1 || survivorCount >= finalParticipants.length) {
      showAdminToast(`생존자 수는 1명 이상, 참가자 수(${finalParticipants.length}명)보다 적어야 합니다.`, "warning");
      return;
    }
    if (fixedSurvivorNicknames.length > survivorCount) {
      showAdminToast(`고정 당첨자(${fixedSurvivorNicknames.length}명)가 생존자 수(${survivorCount}명)보다 많습니다.`, "warning");
      return;
    }

    // [2026-07-26] 달리기(race)는 서바이벌과 동일 엔진 — 탭에 따라 eventKind/문구만 다름.
    const isRace = eventTab === "race";
    const kindLabel = isRace ? "🏁 달리기 대회" : "⛈️ 서바이벌";
    const winnerWord = isRace ? "당첨자" : "생존자";

    // 실제 돈이 나가므로 총 지급액을 먼저 확인시킨다(운영모드 + 포인트 선물일 때만).
    const gAmountPre = Number(String(giftPointAmount || "").replace(/[^0-9]/g, "")) || 0;
    if (runMode === "live" && giftType === "point" && gAmountPre > 0) {
      const totalPre = gAmountPre * survivorCount;
      const okStart = await showAdminConfirm(
        `${kindLabel}을 시작합니다.\n\n${winnerWord} ${survivorCount}명 × ${gAmountPre.toLocaleString("ko-KR")}P` +
        `\n= 총 ${totalPre.toLocaleString("ko-KR")}P 가 실제로 지급됩니다.\n\n진행할까요?`,
        { title: "이벤트 시작", confirmText: "시작", cancelText: "취소", tone: "warning" },
      );
      if (!okStart) return;
    }

    setCurrentEvent(null); // 이전 결과 표시 제거 후 새 판
    setSpinning(true);

    try {
      const createPayload = await requestJson<EventPayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "create_event",
          mode: runMode,
          sourceDate,
          broadcastId,
          title,
          participantSource,
          participants: finalParticipants,
          eventKind: isRace ? "race" : "survival",
          excludeDailyDup,
          ...ticketRuleBody,
        }),
      });

      if (!createPayload.ok || !createPayload.event) {
        throw new Error(createPayload.message || `${kindLabel} 이벤트 생성 실패`);
      }

      const eventId = createPayload.event.id;

      const resolvePayload = await requestJson<SurvivalResolvePayload>("/api/admin-live/event-roulette", {
        method: "POST",
        body: JSON.stringify({
          action: "resolve_survival_event",
          eventId,
          winnerCount: survivorCount,
          fixedNicknames: fixedSurvivorNicknames,
          winnerNote,
          participants: finalParticipants,
          excludeDailyDup,
        }),
      });

      if (!resolvePayload.ok) {
        throw new Error(resolvePayload.message || "서바이벌 생존자 확정 실패");
      }

      setCurrentEvent(resolvePayload.event || null);
      const survivors = resolvePayload.survivors || [];
      showAdminToast(
        `${kindLabel} ${winnerWord} ${survivors.length}명 확정!\n${survivors.join(", ")}\n\n방송 위젯에서 연출이 시작됩니다.`,
        "success"
      );

      // 포인트 자동지급 — 룰렛과 동일한 게이트: 운영(live) 모드 + 선물=포인트 + 금액>0 일 때만.
      //   생존자는 서버가 이미 확정했으므로 연출 종료를 기다리지 않고 바로 지급한다(연출이 끊겨도 지급 누락 없음).
      const gAmount = Number(String(giftPointAmount || "").replace(/[^0-9]/g, "")) || 0;
      if (giftType === "point" && gAmount > 0 && runMode === "live") {
        await grantPointToSurvivors(resolvePayload.winners || [], gAmount, winnerNote || (isRace ? "달리기 당첨" : "서바이벌 생존"));
      } else {
        if (giftType === "point" && gAmount > 0) {
          showAdminToast("테스트 모드라 포인트 자동지급은 건너뜁니다.", "info");
        }
        void loadEventsAndWinners();
      }
    } catch (error) {
      showAdminToast("서바이벌 실행 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSpinning(false);
    }
  };

  const startRouletteOneClick = async (runMode: RouletteMode = mode) => {
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
          mode: runMode,
          sourceDate,
          broadcastId,
          participantSource,
          participants: finalParticipants,
          manualParticipantText,
          eventKind: "roulette",
          ...ticketRuleBody,
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
    // [2026-09-08] 지급대기→지급완료는 즉시, 지급완료→지급대기(되돌리기)만 확인창 — 되돌리기는 드물고 실수 가능성 높음
    if (!isRewardDone) {
      const ok = await showAdminConfirm(
        `${winner.nickname || "당첨자"}의 「지급완료」 체크를 해제해 다시 「지급대기」로 되돌립니다.\n포인트가 회수되는 건 아니고, 표시만 바뀝니다.`,
        { title: "지급완료 되돌리기", confirmText: "되돌리기", cancelText: "취소", tone: "warning" },
      );
      if (!ok) return;
    }
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

    const okDelete = await showAdminConfirm(confirmMessage, { title: "이벤트 삭제", confirmText: "삭제", cancelText: "취소", tone: "danger" });
    if (!okDelete) return;

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
    const okClean = await showAdminConfirm("테스트 룰렛 이벤트와 테스트 당첨 기록을 모두 삭제할까요?\n\n운영 기록은 삭제하지 않습니다.", { title: "테스트 기록 정리", confirmText: "삭제", cancelText: "취소", tone: "danger" });
    if (!okClean) return;

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


  // 돌리기 가드: 운영모드 + 선물=포인트인데 금액이 0/빈칸이면 자동지급이 안 되므로 먼저 경고(막기).
  //   → "당첨 내용(포인트)" 안 채우고 돌려서 당첨자가 포인트 못 받는 사고 방지. (지급/grant 로직은 무변경)
  // [2026-09-08] testRun=true 면 이 한 판만 테스트(포인트 안 나감, 테스트 기록으로 저장). 평소는 운영.
  const startSpin = async (testRun = false) => {
    const runMode: RouletteMode = testRun ? "test" : "live";
    setMode(runMode);
    const amt = Number(String(giftPointAmount || "").replace(/[^0-9]/g, "")) || 0;
    if (runMode === "live" && giftType === "point" && amt <= 0) {
      const okZero = await showAdminConfirm("당첨자에게 줄 포인트 금액이 비어 있어요 (0P).\n이대로 돌리면 포인트 자동지급이 안 됩니다.\n\n‘당첨 내용(포인트)’에 금액을 먼저 입력하세요.\n\n그래도 그냥 돌릴까요?", { title: "포인트 금액 없음", confirmText: "그냥 돌리기", cancelText: "취소", tone: "warning" });
      if (!okZero) { setMode("live"); return; }
    }
    // 룰렛·인형뽑기: 운영 + 포인트 > 0 이면 서바이벌과 같은 시작 확인창(당첨자 1명에게 실제 지급)
    if (runMode === "live" && giftType === "point" && amt > 0 && (eventTab === "roulette" || eventTab === "claw")) {
      const okStart = await showAdminConfirm(
        `${eventTab === "roulette" ? "🎡 룰렛" : "🪆 인형뽑기"}을 시작합니다.\n\n당첨자 1명에게 ${amt.toLocaleString("ko-KR")}P 가 실제로 지급됩니다.\n\n진행할까요?`,
        { title: "이벤트 시작", confirmText: "시작", cancelText: "취소", tone: "warning" },
      );
      if (!okStart) return;
    }
    try {
      // [2026-07-26] 달리기(race)는 서바이벌과 동일 실행 함수 사용(startSurvivalEvent가 탭 감지).
      await (eventTab === "roulette" ? startRouletteOneClick(runMode) : (eventTab === "survival" || eventTab === "race") ? startSurvivalEvent(runMode) : startClawEvent(runMode));
    } finally {
      // 다음 판은 다시 운영
      setMode("live");
    }
  };
  // [2026-07-26] K명 당첨 방식(서바이벌·달리기 공용) 판정 — UI 게이팅에 사용.
  const isKWinnerTab = eventTab === "survival" || eventTab === "race";
  const widgetUrl = eventTab === "roulette" ? overlayUrl : eventTab === "survival" ? survivalOverlayUrl : eventTab === "race" ? raceOverlayUrl : clawOverlayUrl;
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
        <div style={embedded ? { width: "100%", height: "100%" } : { position: "fixed", inset: 0, zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.55)", padding: "12px" }}>
          <div className="ruru-event-sian" style={embedded ? { width: "100%", height: "100%", overflowY: "auto", overflowX: "auto" } : { width: "680px", maxWidth: "100%", flexShrink: 0, height: "88vh", overflowY: "auto", overflowX: "auto" }}>
            <div className="body" style={{ minHeight: "100%", boxSizing: "border-box" }}>

              {/* 헤더 */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>◆ 이벤트</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* [2026-09-08] 탭 순서 = 실제 쓰는 순서(서바이벌·달리기 최다). 테스트/운영 토글은 삭제 — 「테스트로 해보기」 버튼으로 */}
                  <span className="badge" style={{ padding: "4px 12px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "survival" ? "var(--rose)" : "var(--color-surface)", color: eventTab === "survival" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("survival"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>⛈️ 서바이벌</span>
                  <span className="badge" style={{ padding: "4px 12px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "race" ? "var(--rose)" : "var(--color-surface)", color: eventTab === "race" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("race"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>🏁 달리기</span>
                  <span className="badge" style={{ padding: "4px 16px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "roulette" ? "var(--rose)" : "var(--color-surface)", color: eventTab === "roulette" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("roulette"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>🎡 룰렛</span>
                  <span className="badge" style={{ padding: "4px 16px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "claw" ? "var(--rose)" : "var(--color-surface)", color: eventTab === "claw" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("claw"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>🪆 인형뽑기</span>
                  <span className="badge" style={{ padding: "4px 12px", cursor: "pointer", border: "1px solid var(--bd)", background: eventTab === "mission" ? "var(--rose)" : "var(--color-surface)", color: eventTab === "mission" ? "#fff" : "var(--mut)" }}
                    onClick={() => { setEventTab("mission"); setCurrentEvent(null); setSpinning(false); setCenterWinner(""); }}>🎯 미션</span>
                  <span style={{ width: "1px", height: "18px", background: "var(--bd)", margin: "0 4px" }} />
                  <button className="btn" style={{ height: "auto", padding: "4px 8px" }} onClick={() => { void resetEvent(); }}>↺ 초기화</button>
                  {embedded ? null : <button className="btn" style={{ height: "auto", padding: "4px 8px" }} onClick={closePanel}>✕</button>}
                </span>
              </div>

              {eventTab === "mission" ? (
                <AdminLiveMissionPanel />
              ) : (
              <>
              {/* 룰렛 + 참가자 */}
              <div style={{ display: "flex", gap: "12px", alignItems: "stretch", marginBottom: "12px" }}>
                <div style={{ flex: 1, background: "var(--color-surface-2)", borderRadius: "8px", minHeight: "190px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", position: "relative" }}>
                  {eventTab === "roulette" ? (
                    <div className="wheel">
                      <span className="pt" style={{ top: "6px", fontSize: "24px" }}>▼</span>
                      <canvas ref={canvasRef} width={300} height={300} style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block" }} />
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>{finalParticipants.length}명</span>
                      </div>
                    </div>
                  ) : isKWinnerTab ? (
                    <div style={{ width: "150px", height: "150px", borderRadius: "16px", background: "var(--color-surface)", border: "1px solid var(--bd)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <span style={{ fontSize: "44px", lineHeight: 1 }}>{eventTab === "race" ? "🏁" : "⛈️"}</span>
                      <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>{eventTab === "race" ? "달리기" : "서바이벌"} · {finalParticipants.length}명</span>
                      <span style={{ fontSize: "11px", color: "var(--mut2)" }}>{eventTab === "race" ? "당첨" : "생존"} {survivorCount}명</span>
                    </div>
                  ) : (
                    <div style={{ width: "150px", height: "150px", borderRadius: "16px", background: "var(--color-surface)", border: "1px solid var(--bd)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <span style={{ fontSize: "46px", lineHeight: 1 }}>🕹️</span>
                      <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>인형뽑기 · {finalParticipants.length}명</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                    <button className="btn rose" style={{ height: "auto", padding: "8px 32px" }} onClick={() => void startSpin(false)} disabled={spinning || finalParticipants.length === 0}>
                      {spinning ? "진행중..." : giftType === "point" && Number(giftPointAmount || 0) > 0 ? `▶ 시작 · ${isKWinnerTab ? `${survivorCount}명에게 ` : "당첨자에게 "}${Number(giftPointAmount).toLocaleString("ko-KR")}P 지급` : "▶ 시작"}
                    </button>
                    <button className="btn" style={{ height: "auto", padding: "8px 12px" }} onClick={() => void startSpin(true)} disabled={spinning || finalParticipants.length === 0} title="포인트가 나가지 않고 테스트 기록으로만 남습니다">
                      테스트로 해보기 · 포인트 안 나감
                    </button>
                  </div>

                  {/* 당첨자 발표 카드 — 룰렛 위(상단)에만 덮어서 아래 ▶돌리기 버튼은 가리지 않음. 클릭도 통과(pointerEvents none) */}
                  {centerWinner && currentEvent?.winner_nickname === centerWinner ? (
                    <div style={{ position: "absolute", left: "50%", top: "8px", transform: "translateX(-50%)", width: "min(90%,300px)", borderRadius: "20px", background: "var(--color-surface)", boxShadow: "0 24px 70px rgba(15,23,42,0.24)", padding: "16px", textAlign: "center", zIndex: 30, pointerEvents: "none" }}>
                      <div style={{ color: "var(--color-cardpay)", fontSize: "18px", fontWeight: 950, letterSpacing: "-0.05em" }}>당첨</div>
                      <div style={{ marginTop: "6px", color: "var(--color-ink)", fontSize: "40px", fontWeight: 950, lineHeight: 1.05, letterSpacing: "-0.08em", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{centerWinner}</div>
                      <div style={{ marginTop: "8px", color: "var(--color-ink-soft)", fontSize: "16px", fontWeight: 900, letterSpacing: "-0.05em" }}>{currentEvent?.winner_note || "이벤트 당첨"}</div>
                    </div>
                  ) : null}
                </div>

                <div style={{ flex: 0.95, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div className="note">참가자 불러오기</div>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "8px", borderColor: participantSource === "auto" ? "var(--rose)" : "var(--bd)", color: participantSource === "auto" ? "var(--rose)" : "var(--ink)" }} onClick={() => changeParticipantSource("auto")} disabled={!canLoadParticipants}>👥 주문서 제출자 전체 <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "auto" ? (loading ? "불러오는 중…" : `${autoParticipantCount}명`) : ""}</span></button>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "8px", borderColor: participantSource === "paid" ? "var(--green)" : "var(--bd)", color: participantSource === "paid" ? "var(--green)" : "var(--ink)" }} onClick={() => changeParticipantSource("paid")} disabled={!canLoadParticipants}>💵 결제완료한 사람만 <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "paid" ? (loading ? "불러오는 중…" : `${autoParticipantCount}명`) : ""}</span></button>
                  <button className="btn" style={{ textAlign: "left", height: "auto", padding: "8px", borderColor: participantSource === "manual" ? "var(--rose)" : "var(--bd)", color: participantSource === "manual" ? "var(--rose)" : "var(--ink)" }} onClick={() => changeParticipantSource("manual")}>✎ 수동 입력 (쉼표로 자동분리) <span style={{ float: "right", color: "var(--mut2)" }}>{participantSource === "manual" ? `${manualParticipantCount}명` : ""}</span></button>
                  {participantSource === "manual" ? (
                    <textarea value={manualParticipantText} onChange={(e) => setManualParticipantText(e.target.value)} onPaste={handleManualPaste}
                      placeholder={"닉네임/쉼표 구분. 채팅 붙여넣으면 @닉네임만 자동 추출."}
                      style={{ width: "100%", height: "70px", resize: "none", fontSize: "11px", border: "1px solid var(--bd)", borderRadius: "8px", padding: "8px", background: "var(--color-surface)" }} />
                  ) : null}
                  {!canLoadParticipants && participantSource !== "manual" ? (
                    <div className="note" style={{ color: "var(--amber)" }}>⚠ 불러올 주문 없음 — 방송 시작 또는 주문서에 주문이 보이면 명단을 불러올 수 있어요.</div>
                  ) : participantSource !== "manual" ? (
                    <div className="note" style={{ color: "var(--mut2)" }}>※ 주문서 제출자 전체=화면 필터(기간·방송·상태) 기준. 결제완료한 사람만=이 방송의 입금확인·카드결제완료 전부.</div>
                  ) : null}
                  <div style={{ background: "var(--color-surface-2)", borderRadius: "8px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExcludeDailyDup((v) => !v)}>
                    <span style={{ fontSize: "11px" }}>당일 중복당첨 금지</span>
                    <span className={`tog ${excludeDailyDup ? "on" : "off"}`}><i /></span>
                  </div>
                  {/* [2026-09-08] 구매 응모권 — 실제로 서버에 전달되어 추첨 확률이 된다 */}
                  <div style={{ background: "var(--color-surface-2)", borderRadius: "8px", padding: "8px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => { ticketTouchedRef.current = true; setTicketEnabled((v) => !v); }}>
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>많이 산 손님 · 단골 당첨확률 올리기 <span style={{ color: "var(--mut2)", fontWeight: 400 }}>(자동)</span></span>
                      <span className={`tog ${ticketEnabled ? "on" : "off"}`}><i /></span>
                    </div>
                    {ticketEnabled ? (
                      <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--mut2)", lineHeight: 1.6 }}>
                        {/* [2026-09-09 사장님 지시] 숫자 입력칸 삭제 — 사이트가 그날 명단을 보고 알아서 정한다 */}
                        사이트가 <b>오늘 명단을 보고 알아서</b> 응모권을 나눠줍니다. 사장님이 정할 숫자는 없습니다.
                        <br />· <b>오늘 많이 산 손님</b> — 오늘 명단 안에서 비교(평균 이상 +1장, 특히 많이 샀으면 +1장 더)
                        <br />· <b>자주 오는 단골</b> — 예전에 산 날 수(2번 이상 +1장, 5번 이상 +1장 더)
                        <br />기본 1장 · 한 사람 최대 5장. <b>미입금 주문은 장수가 안 늘어요</b>(참가는 됨). 수동 입력 명단은 전원 1장.
                        {ticketPreview.total > 0 ? (
                          <div style={{ marginTop: "6px", padding: "6px 8px", borderRadius: "8px", background: "var(--color-surface)", border: "1px solid var(--bd)", color: "var(--ink)", fontWeight: 700 }}>
                            지금 명단 기준 → {ticketPreview.rows.map((r) => `${r.tickets}장 ${r.count}명`).join(" · ")}
                            <span style={{ color: "var(--mut2)", fontWeight: 400 }}>{loading ? " (계산 중…)" : ""}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--mut2)" }}>지금은 <b>꺼짐</b> — 61명이든 1명이든 <b>전원 똑같은 확률</b>입니다. 켜면 많이 산 손님·단골에게 응모권이 더 갑니다.</div>
                    )}
                  </div>
                  {isKWinnerTab ? (
                    <div style={{ background: "var(--rose-bg)", border: "1px solid var(--rose-bd)", borderRadius: "8px", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--rose)", fontWeight: 600 }}>{eventTab === "race" ? "당첨자(등수) 수" : "생존자(당첨자) 수"}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button className="btn" style={{ height: "auto", padding: "2px 8px" }} onClick={() => setSurvivorCount((v) => Math.max(1, v - 1))}>−</button>
                        <input className="ipt" style={{ width: "48px", textAlign: "center", padding: "4px" }} inputMode="numeric" value={survivorCount}
                          onChange={(e) => { const d = Number(e.target.value.replace(/[^0-9]/g, "")) || 1; setSurvivorCount(Math.min(Math.max(1, d), Math.max(1, finalParticipants.length - 1))); }} />
                        <button className="btn" style={{ height: "auto", padding: "2px 8px" }} onClick={() => setSurvivorCount((v) => Math.min(v + 1, Math.max(1, finalParticipants.length - 1)))}>+</button>
                        <span style={{ fontSize: "11px", color: "var(--mut2)" }}>명</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 당첨 고정 */}
              <div style={{ border: "1px solid var(--rose-bd)", background: "var(--rose-bg)", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--rose)", fontWeight: 600 }}>🎯 당첨 고정 (닉네임 클릭){isKWinnerTab ? ` · 최대 ${survivorCount}명` : ""}</span>
                  <span style={{ fontSize: "11px", color: "var(--mut2)" }}>ㄱㄴㄷ 순 · 안 고르면 전원 추첨</span>
                  {/* [2026-09-08] 61명 중에서 눈으로 찾기 어렵다 → 검색칸. 찾는 즉시 걸러진다. */}
                  <input
                    className="ipt"
                    style={{ marginLeft: "auto", width: "150px", height: "26px", padding: "0 8px", fontSize: "11px" }}
                    placeholder="🔍 닉네임 찾기"
                    value={nickFilter}
                    onChange={(e) => setNickFilter(e.target.value)}
                  />
                  {nickFilter ? (
                    <button className="btn" style={{ height: "26px", padding: "0 8px", fontSize: "11px" }} onClick={() => setNickFilter("")}>지우기</button>
                  ) : null}
                  <span style={{ fontSize: "11px", color: "var(--mut2)", minWidth: "62px", textAlign: "right" }}>
                    {nickFilter ? `${pickList.length}/${finalParticipants.length}명` : `${finalParticipants.length}명`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxHeight: "150px", overflowY: "auto" }}>
                  {finalParticipants.length === 0 ? (
                    <span className="note">참가자를 먼저 불러오세요.</span>
                  ) : pickList.length === 0 ? (
                    <span className="note">「{nickFilter}」와 맞는 닉네임이 없어요.</span>
                  ) : (
                    pickList.map((p, i) => {
                      const on = isKWinnerTab ? fixedSurvivorNicknames.includes(p.nickname) : fixedWinnerNickname === p.nickname;
                      const myTickets = Math.max(1, Math.floor(Number(p.tickets ?? p.weight ?? 1)) || 1);
                      const ticketTail = ticketEnabled && totalTickets > 0 ? ` ×${myTickets}장 · ${Math.round((myTickets / totalTickets) * 1000) / 10}%` : "";
                      const toggleFixed = () => {
                        if (isKWinnerTab) {
                          setFixedSurvivorNicknames((prev) =>
                            prev.includes(p.nickname)
                              ? prev.filter((n) => n !== p.nickname)
                              : prev.length >= survivorCount
                                ? prev
                                : [...prev, p.nickname]
                          );
                        } else {
                          setFixedWinnerNickname(on ? "" : p.nickname);
                        }
                      };
                      return (
                        <span key={`fix-${p.nickname}-${i}`} className={`nick ${on ? "win" : ""}`} onClick={toggleFixed} title={ticketEnabled ? `결제완료 ${Number(p.paid_amount_sum || 0).toLocaleString("ko-KR")}원` : undefined}>{on ? "👑 " : ""}{p.nickname}{ticketTail ? <span style={{ color: "var(--mut2)", fontSize: "11px" }}>{ticketTail}</span> : null}</span>
                      );
                    })
                  )}
                </div>
                <div className="note" style={{ marginTop: "8px" }}>{isKWinnerTab
                    ? (fixedSurvivorNicknames.length > 0 ? `👑 고정 ${fixedSurvivorNicknames.length}/${survivorCount}명 — ${fixedSurvivorNicknames.join(", ")}` : "👑 아무도 고정 안 함 (전원 추첨)")
                    : (fixedWinnerNickname ? `👑 고정: ${fixedWinnerNickname}` : "👑 아무도 고정 안 함 (전원 추첨)")}</div>
              </div>

              {/* 제목 + 당첨 내용(선물) */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
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
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "12px" }}>
                <span className="note" style={{ flexShrink: 0 }}>방송 위젯주소</span>
                <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{widgetUrl || "준비중"}</span>
                <button className="btn rose" style={{ height: "auto", padding: "4px 12px" }} onClick={() => void copyText(widgetUrl)} disabled={!widgetUrl}>복사</button>
              </div>

              {/* [2026-09-08] 방송 위젯을 그대로 작게 — 시청자가 보는 화면(룰렛·인형뽑기). 읽기 전용 iframe */}
              {(eventTab === "roulette" || eventTab === "claw") && widgetUrl ? (
                <div style={{ marginBottom: "12px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--bd)", background: "#111" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", fontSize: "11px", color: "#ddd" }}>
                    <span>방송 화면 미리보기 (시청자가 보는 그대로)</span>
                    <a href={widgetUrl} target="_blank" rel="noreferrer" style={{ color: "#ffd166" }}>새 창으로 열기 ↗</a>
                  </div>
                  <iframe src={widgetUrl} title="방송 위젯 미리보기" style={{ width: "100%", height: "280px", border: 0, display: "block", background: "#111" }} />
                </div>
              ) : null}

              {/* [2026-08-12] 효과음 사운드보드 — 서바이벌/달리기 탭에서만. 재생 전용(추첨·지급 무관) */}
              {isKWinnerTab && <AdminLiveEventSoundboard kind={eventTab === "race" ? "race" : "survival"} />}

              {/* 이벤트 목록 */}
              <div style={{ borderTop: "1px solid var(--bd)", paddingTop: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span className="seclabel" style={{ margin: 0 }}>이벤트 목록 <span className="note">지난 기록</span></span>
                  {periodChips.map((chip) => (
                    <span key={chip.key} className="badge" style={{ cursor: "pointer", padding: "4px 8px", border: "1px solid var(--bd)", background: listPeriod === chip.key ? "var(--rose)" : "var(--color-surface)", color: listPeriod === chip.key ? "#fff" : "var(--mut)" }} onClick={() => setListPeriod(chip.key)}>{chip.label}</span>
                  ))}
                  {listPeriod === "date" ? (
                    <input type="date" className="ipt" style={{ height: "26px" }} value={listDate} onChange={(e) => setListDate(e.target.value)} />
                  ) : null}
                  <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                    <button className="btn" style={{ height: "26px", padding: "0 8px" }} onClick={() => void loadEventsAndWinners()}>새로고침</button>
                    <button className="btn" style={{ height: "26px", padding: "0 8px" }} onClick={() => void deleteAllTestRecords()}>테스트정리</button>
                  </span>
                </div>
                {filteredWinners.length === 0 ? (
                  <div className="note" style={{ textAlign: "center", padding: "20px 0" }}>해당 기간 당첨 기록이 없습니다. 위 기간 버튼을 「이번달」로 바꿔보세요.</div>
                ) : (
                  filteredWinners.map((w) => (
                    <div key={`winner-${w.id}`} className="row">
                      <span className="note" style={{ width: "120px", flexShrink: 0 }}>{dateTimeFull(w.winner_at)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.is_test ? "테스트" : "운영"} · {(() => { const ev = events.find((e) => e.id === w.event_id); const token = ev?.overlay_token || ""; return token.startsWith("roulette") ? "🎡룰렛" : token.startsWith("claw") ? "🪆인형뽑기" : token.startsWith("survival") ? "⛈️서바이벌" : token.startsWith("race") ? "🏁달리기" : "이벤트"; })()} · 당첨 <b>{w.nickname}</b> · {w.winner_note || "이벤트 당첨"}</span>
                      <button type="button" className={`badge ${w.is_reward_done ? "b-ok" : "b-card"}`} style={{ cursor: "pointer", flexShrink: 0, border: "1px solid transparent" }} onClick={() => markRewardDone(w, !w.is_reward_done)} title={w.is_reward_done ? "누르면 지급대기로 되돌립니다(확인창)" : "누르면 지급완료로 표시합니다"}>{w.is_reward_done ? "✓ 지급완료" : "지급대기 → 완료로"}</button>
                      {/* [2026-09-08 전수감사] 예전엔 <span> 텍스트라 자주 누르는 「지급완료」 배지 바로 옆에서 오클릭되기 쉬웠다.
                            → 버튼으로 바꾸고 사이를 띄운다. (확인창은 원래 있었다) */}
                        <button type="button" className="btn" style={{ flexShrink: 0, marginLeft: "8px", color: "var(--color-danger-tx)", borderColor: "var(--color-danger-tx)" }} onClick={() => void deleteWinnerRecord(w)}>삭제</button>
                    </div>
                  ))
                )}
              </div>
              </>
              )}

            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
