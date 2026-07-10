import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";
import { createClient } from "@supabase/supabase-js";
import {
  buildRouletteParticipants,
  buildRoulettePreviewParticipants,
  calculateRouletteSpinDurationMs,
  normalizeEventRouletteMode,
  pickRouletteWinner,
  type EventRouletteMode,
  type EventRouletteOrderLike,
  type EventRouletteParticipant,
} from "@/lib/eventRoulette";

export const dynamic = "force-dynamic";

const DEFAULT_TITLE = "🎁 루루동이룰렛";
const FIXED_OVERLAY_TOKEN = "roulette_luludongi_live";

type RouletteBroadcastRow = Record<string, unknown> & {
  id: string | number;
  title?: string | null;
  broadcast_title?: string | null;
  name?: string | null;
  label?: string | null;
  status?: string | null;
  state?: string | null;
  started_at?: string | null;
  start_at?: string | null;
  start_time?: string | null;
  ended_at?: string | null;
  end_at?: string | null;
  end_time?: string | null;
  closed_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
};

type RouletteEventRow = {
  id: string;
  title: string;
  overlay_token: string;
  mode: EventRouletteMode;
  is_test: boolean;
  status: "idle" | "spinning" | "result" | "closed";
  broadcast_id: string | null;
  event_date: string | null;
  source_date: string | null;
  participant_snapshot: EventRouletteParticipant[] | null;
  winner_nickname: string | null;
  winner_note: string | null;
  winner_order_ids: string[] | null;
  spin_started_at: string | null;
  spin_duration_ms: number | null;
  result_at: string | null;
  created_at: string;
  updated_at: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function todayKstDateText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return kst.toISOString().slice(0, 10);
}

function isValidDateText(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateText(value: unknown) {
  const raw = cleanText(value);

  if (isValidDateText(raw)) {
    return raw;
  }

  return todayKstDateText();
}

function kstDateRangeUtc(dateText: string) {
  return {
    start: new Date(`${dateText}T00:00:00+09:00`).toISOString(),
    end: new Date(`${dateText}T23:59:59.999+09:00`).toISOString(),
  };
}

function cleanBroadcastId(value: unknown) {
  return String(value ?? "").trim();
}

function getBroadcastTitle(row: RouletteBroadcastRow) {
  return cleanText(row.title || row.broadcast_title || row.name || row.label || "방송");
}

function getBroadcastStatus(row: RouletteBroadcastRow) {
  return cleanText(row.status || row.state || "");
}

function getBroadcastStart(row: RouletteBroadcastRow) {
  return cleanText(row.started_at || row.start_at || row.start_time || row.created_at);
}

function getBroadcastEnd(row: RouletteBroadcastRow) {
  return cleanText(row.ended_at || row.end_at || row.end_time || row.closed_at || row.finished_at);
}

function makeBroadcastLabel(row: RouletteBroadcastRow) {
  const title = getBroadcastTitle(row);
  const startedAt = getBroadcastStart(row);
  const dateLabel = startedAt ? new Date(startedAt).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }) : "시간 없음";

  return `${dateLabel} · ${title}`;
}

function sanitizeBroadcast(row: RouletteBroadcastRow) {
  return {
    id: String(row.id),
    title: getBroadcastTitle(row),
    label: makeBroadcastLabel(row),
    status: getBroadcastStatus(row),
    started_at: getBroadcastStart(row) || null,
    ended_at: getBroadcastEnd(row) || null,
  };
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

async function requireAdmin(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);

  if (adminSession) return null;

  return json({ ok: false, message: "관리자 로그인이 필요합니다. /admin-login에서 다시 로그인 후 새로고침해주세요." }, 401);
}

function sanitizeParticipantForAdmin(participant: EventRouletteParticipant) {
  return {
    nickname: participant.nickname,
    order_count: participant.orderCount,
    qty_sum: participant.qtySum,
    amount_sum: participant.amountSum,
    order_ids: participant.orderIds,
    weight: participant.weight,
  };
}

function sanitizeParticipantForOverlay(participant: EventRouletteParticipant) {
  return {
    nickname: participant.nickname,
  };
}

function sanitizeEventForAdmin(event: RouletteEventRow) {
  const participants = Array.isArray(event.participant_snapshot) ? event.participant_snapshot : [];

  return {
    id: event.id,
    title: event.title,
    overlay_token: event.overlay_token,
    overlay_api_path: `/api/event-roulette/overlay?token=${encodeURIComponent(FIXED_OVERLAY_TOKEN)}`,
    mode: event.mode,
    is_test: event.is_test,
    status: event.status,
    broadcast_id: event.broadcast_id,
    event_date: event.event_date,
    source_date: event.source_date,
    participants: participants.map(sanitizeParticipantForAdmin),
    participant_count: participants.length,
    winner_nickname: event.winner_nickname,
    winner_note: event.winner_note,
    winner_order_ids: event.winner_order_ids || [],
    spin_started_at: event.spin_started_at,
    spin_duration_ms: event.spin_duration_ms,
    result_at: event.result_at,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

function sanitizeEventForOverlayProbe(event: RouletteEventRow) {
  const participants = Array.isArray(event.participant_snapshot) ? event.participant_snapshot : [];

  return {
    title: event.title,
    mode: event.mode,
    is_test: event.is_test,
    status: event.status,
    participants: participants.map(sanitizeParticipantForOverlay),
    winner_nickname: event.winner_nickname,
    winner_note: event.winner_note,
    spin_started_at: event.spin_started_at,
    spin_duration_ms: event.spin_duration_ms,
    result_at: event.result_at,
  };
}

async function fetchBroadcastRows(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message || "방송리스트 조회 실패");
  }

  return (Array.isArray(data) ? data : []) as RouletteBroadcastRow[];
}

async function fetchBroadcastById(supabase: SupabaseAdminClient, broadcastId: string) {
  if (!broadcastId) return null;

  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "선택한 방송 조회 실패");
  }

  return data ? (data as RouletteBroadcastRow) : null;
}

async function fetchOrderRowsForBroadcast(supabase: SupabaseAdminClient, broadcastId: string) {
  const broadcast = await fetchBroadcastById(supabase, broadcastId);

  if (!broadcast) {
    return [];
  }

  const start = getBroadcastStart(broadcast);
  const end = getBroadcastEnd(broadcast) || new Date().toISOString();

  if (!start) {
    return [];
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      [
        "id",
        "created_at",
        "youtube_nickname",
        "customer_name",
        "qty",
        "total_price",
        "adjusted_total_price",
        "final_amount",
        "admin_order_status_v2",
        "order_manage_status",
        "is_test_order",
      ].join(", ")
    )
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(error.message || "방송 기준 룰렛 참여자 주문 조회 실패");
  }

  return (Array.isArray(data) ? data : []) as EventRouletteOrderLike[];
}

async function fetchOrderRowsForDate(supabase: SupabaseAdminClient, sourceDate: string) {
  const range = kstDateRangeUtc(sourceDate);

  const { data, error } = await supabase
    .from("orders")
    .select(
      [
        "id",
        "created_at",
        "youtube_nickname",
        "customer_name",
        "qty",
        "total_price",
        "adjusted_total_price",
        "final_amount",
        "admin_order_status_v2",
        "order_manage_status",
        "is_test_order",
      ].join(", ")
    )
    .gte("created_at", range.start)
    .lte("created_at", range.end)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(error.message || "룰렛 참여자 주문 조회 실패");
  }

  return (Array.isArray(data) ? data : []) as EventRouletteOrderLike[];
}

// 주문서 화면 필터로 현재 보이는 주문(order_group_id 목록)의 raw 행을 가져온다.
//   → 룰렛 참가자를 "화면 필터 기준"으로 잡기 위함. select 필드는 위 fetch들과 동일(빌더 호환).
async function fetchOrderRowsByGroupIds(supabase: SupabaseAdminClient, groupIds: string[]) {
  const ids = Array.from(new Set(groupIds.map((v) => String(v || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [] as EventRouletteOrderLike[];

  const cols = [
    "id",
    "order_group_id",
    "order_lookup_code",
    "created_at",
    "youtube_nickname",
    "customer_name",
    "qty",
    "total_price",
    "adjusted_total_price",
    "final_amount",
    "admin_order_status_v2",
    "order_manage_status",
    "is_test_order",
  ].join(", ");

  // ⚠️ 클라 어댑터는 주문을 order_group_id || order_lookup_code || id 로 묶는다(getGroupId).
  //   서버도 그 3개 키를 모두 매칭해야 누락이 없다(예: order_group_id가 빈 주문). id로 dedup.
  const numericIds = ids.filter((s) => /^\d+$/.test(s));
  const byId = new Map<string, EventRouletteOrderLike>();
  const add = (rows: unknown) => {
    if (Array.isArray(rows)) for (const r of rows as EventRouletteOrderLike[]) byId.set(String((r as { id?: unknown }).id ?? ""), r);
  };

  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const g = await supabase.from("orders").select(cols).in("order_group_id", slice).limit(2000);
    if (g.error) throw new Error(g.error.message || "필터 기준 룰렛 참여자 주문 조회 실패");
    add(g.data);
    const l = await supabase.from("orders").select(cols).in("order_lookup_code", slice).limit(2000);
    if (l.error) throw new Error(l.error.message || "필터 기준 룰렛 참여자 주문 조회 실패");
    add(l.data);
  }
  for (let i = 0; i < numericIds.length; i += chunk) {
    const slice = numericIds.slice(i, i + chunk);
    const d = await supabase.from("orders").select(cols).in("id", slice).limit(2000);
    if (d.error) throw new Error(d.error.message || "필터 기준 룰렛 참여자 주문 조회 실패");
    add(d.data);
  }
  return Array.from(byId.values());
}

// "입금완료한 사람만" 필터용 결제완료 상태값 — 앱 정식 기준(PAID_STATUS_VALUES)과 동일하게 통일.
//   (기존 3개만 보던 것 → 입금확인·결제완료·출고대기·출고완료·킵·픽업 포함. 주문서 결제완료와 동일 집합)
const ROULETTE_PAID_STATUSES = new Set(PAID_STATUS_VALUES);

function isPaidOrderRowForRoulette(row: EventRouletteOrderLike): boolean {
  const a = String((row as { admin_order_status_v2?: unknown }).admin_order_status_v2 || "").trim();
  const b = String((row as { order_manage_status?: unknown }).order_manage_status || "").trim();
  return ROULETTE_PAID_STATUSES.has(a) || ROULETTE_PAID_STATUSES.has(b);
}

async function buildParticipantsForRequest(
  supabase: SupabaseAdminClient,
  mode: EventRouletteMode,
  sourceDate: string,
  broadcastId = "",
  paidOnly = false,
  orderGroupIds: string[] | null = null
) {
  if (mode === "preview") {
    return buildRoulettePreviewParticipants();
  }

  // orderGroupIds가 배열이면(빈 배열 포함) "주문서 화면 필터 기준" → 그 주문들만 사용(0건이면 참가자 0명).
  //   null이면 기존 방식(방송 전체 또는 날짜) fallback.
  const rows =
    orderGroupIds !== null
      ? await fetchOrderRowsByGroupIds(supabase, orderGroupIds)
      : broadcastId
        ? await fetchOrderRowsForBroadcast(supabase, broadcastId)
        : await fetchOrderRowsForDate(supabase, sourceDate);

  // 입금완료한 사람만: admin_order_status_v2/order_manage_status가 결제완료 상태인 주문만 남긴다.
  const targetRows = paidOnly ? rows.filter(isPaidOrderRowForRoulette) : rows;

  return buildRouletteParticipants(targetRows, mode);
}

function normalizeWinnerNicknameForDedupe(value: unknown) {
  return cleanText(value).replace(/\s+/g, "");
}

function filterParticipantsExcludingWinnerNicknames(
  participants: EventRouletteParticipant[],
  winnerNicknames: Set<string>
) {
  if (winnerNicknames.size <= 0) {
    return participants;
  }

  return participants.filter((participant) => !winnerNicknames.has(normalizeWinnerNicknameForDedupe(participant.nickname)));
}

async function fetchPriorWinnerNicknameSet(
  supabase: SupabaseAdminClient,
  params: {
    mode: EventRouletteMode;
    isTest: boolean;
    sourceDate: string | null;
    broadcastId: string;
    excludeEventId?: string;
  }
) {
  const result = new Set<string>();

  if (params.mode === "preview") {
    return result;
  }

  let eventQuery = supabase
    .from("event_roulette_events")
    .select("id")
    .eq("mode", params.mode)
    .eq("is_test", params.isTest)
    .in("status", ["result", "closed"])
    .limit(300);

  if (params.broadcastId) {
    eventQuery = eventQuery.eq("broadcast_id", params.broadcastId);
  } else if (params.sourceDate) {
    eventQuery = eventQuery.eq("source_date", params.sourceDate).is("broadcast_id", null);
  } else {
    return result;
  }

  if (params.excludeEventId) {
    eventQuery = eventQuery.neq("id", params.excludeEventId);
  }

  const { data: eventRows, error: eventError } = await eventQuery;

  if (eventError) {
    throw new Error(eventError.message || "같은 방송 기존 룰렛 이벤트 조회 실패");
  }

  const eventIds = (Array.isArray(eventRows) ? eventRows : [])
    .map((row) => cleanText((row as { id?: unknown }).id))
    .filter(Boolean);

  if (eventIds.length <= 0) {
    return result;
  }

  const { data: winnerRows, error: winnerError } = await supabase
    .from("event_roulette_winners")
    .select("nickname, event_id, is_test")
    .in("event_id", eventIds)
    .eq("is_test", params.isTest)
    .limit(1000);

  if (winnerError) {
    throw new Error(winnerError.message || "같은 방송 기존 당첨자 조회 실패");
  }

  for (const row of Array.isArray(winnerRows) ? winnerRows : []) {
    const nickname = normalizeWinnerNicknameForDedupe((row as { nickname?: unknown }).nickname);

    if (nickname) {
      result.add(nickname);
    }
  }

  return result;
}

async function applyNoDuplicateWinnerRule(
  supabase: SupabaseAdminClient,
  participants: EventRouletteParticipant[],
  params: {
    mode: EventRouletteMode;
    isTest: boolean;
    sourceDate: string | null;
    broadcastId: string;
    excludeEventId?: string;
  }
) {
  const priorWinnerNicknames = await fetchPriorWinnerNicknameSet(supabase, params);
  const filteredParticipants = filterParticipantsExcludingWinnerNicknames(participants, priorWinnerNicknames);

  return {
    participants: filteredParticipants,
    excludedWinnerCount: participants.length - filteredParticipants.length,
  };
}


function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.floor(number));
}

function normalizeParticipantOrderIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => cleanText(item)).filter(Boolean);
}

function normalizeManualParticipantsForEvent(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: EventRouletteParticipant[] = [];

  for (const raw of value) {
    const row = raw as Record<string, unknown>;
    const nickname = cleanText(row.nickname);

    if (!nickname) continue;

    const dedupeKey = normalizeWinnerNicknameForDedupe(nickname);
    if (!dedupeKey || seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);

    const orderIds = normalizeParticipantOrderIds(row.orderIds || row.order_ids);
    const orderCount = safeNumber(row.orderCount ?? row.order_count, orderIds.length);
    const qtySum = safeNumber(row.qtySum ?? row.qty_sum, 0);
    const amountSum = safeNumber(row.amountSum ?? row.amount_sum, 0);
    const weightValue = Number(row.weight ?? 1);
    const weight = Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1;

    result.push({
      nickname,
      orderCount,
      qtySum,
      amountSum,
      orderIds,
      weight,
    });
  }

  return result;
}

function findRequestedWinner(
  participants: EventRouletteParticipant[],
  requestedWinnerNickname: string
) {
  const target = normalizeWinnerNicknameForDedupe(requestedWinnerNickname);

  if (!target) {
    return null;
  }

  return participants.find((participant) => normalizeWinnerNicknameForDedupe(participant.nickname) === target) || null;
}

function calculateTotalParticipantWeight(participants: EventRouletteParticipant[]) {
  return participants.reduce((sum, participant) => {
    const weight = Number(participant.weight || 1);

    if (!Number.isFinite(weight) || weight <= 0) {
      return sum + 1;
    }

    return sum + weight;
  }, 0);
}


async function handleBroadcasts(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const rows = await fetchBroadcastRows(supabase);

  return json({
    ok: true,
    broadcasts: rows.map(sanitizeBroadcast),
  });
}

async function runParticipants(opts: {
  mode: EventRouletteMode;
  sourceDate: string;
  broadcastId: string;
  paidOnly: boolean;
  excludeDailyDup: boolean;
  orderGroupIds: string[] | null;
}) {
  const supabase = getSupabaseAdmin();
  const { mode, sourceDate, broadcastId, paidOnly, excludeDailyDup, orderGroupIds } = opts;
  const rawParticipants = await buildParticipantsForRequest(supabase, mode, sourceDate, broadcastId, paidOnly, orderGroupIds);
  const deduped = excludeDailyDup
    ? await applyNoDuplicateWinnerRule(supabase, rawParticipants, {
        mode,
        isTest: mode === "test",
        sourceDate,
        broadcastId,
      })
    : { participants: rawParticipants, excludedWinnerCount: 0 };
  const participants = deduped.participants;

  return json({
    ok: true,
    mode,
    source_date: sourceDate,
    broadcast_id: broadcastId || null,
    participant_count: participants.length,
    excluded_winner_count: deduped.excludedWinnerCount,
    participants: participants.map(sanitizeParticipantForAdmin),
  });
}

async function handleParticipants(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  return runParticipants({
    mode: normalizeEventRouletteMode(request.nextUrl.searchParams.get("mode")),
    sourceDate: normalizeDateText(request.nextUrl.searchParams.get("sourceDate")),
    broadcastId: cleanBroadcastId(request.nextUrl.searchParams.get("broadcastId")),
    paidOnly: request.nextUrl.searchParams.get("paidOnly") === "true",
    excludeDailyDup: request.nextUrl.searchParams.get("excludeDailyDup") !== "false",
    orderGroupIds: null,
  });
}

// POST 버전: 주문서 화면 필터로 보이는 주문 group_id 목록(orderGroupIds)을 받아 참가자를 그 기준으로 만든다.
//   (group_id가 많아 URL 길이 초과 위험이 있어 POST 사용. 인증은 POST 디스패처에서 이미 처리.)
async function handleParticipantsPost(body: Record<string, unknown>) {
  // orderGroupIds가 배열로 오면(빈 배열 포함) 필터 기준, 아니면 null(방송 fallback).
  const orderGroupIds = Array.isArray(body.orderGroupIds) ? body.orderGroupIds.map((v) => String(v ?? "")) : null;
  return runParticipants({
    mode: normalizeEventRouletteMode(typeof body.mode === "string" ? body.mode : ""),
    sourceDate: normalizeDateText(typeof body.sourceDate === "string" ? body.sourceDate : ""),
    broadcastId: cleanBroadcastId(typeof body.broadcastId === "string" ? body.broadcastId : ""),
    paidOnly: body.paidOnly === true || body.paidOnly === "true",
    excludeDailyDup: body.excludeDailyDup !== false && body.excludeDailyDup !== "false",
    orderGroupIds,
  });
}

async function handleEvents(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const includeTest = request.nextUrl.searchParams.get("includeTest") === "true";

  let query = supabase
    .from("event_roulette_events")
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (!includeTest) {
    query = query.eq("is_test", false);
  }

  const { data, error } = await query;

  if (error) {
    return json({ ok: false, message: error.message || "룰렛 이벤트 조회 실패" }, 500);
  }

  return json({
    ok: true,
    events: (Array.isArray(data) ? data : []).map((event) => sanitizeEventForAdmin(event as RouletteEventRow)),
  });
}

async function handleWinners(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const includeTest = request.nextUrl.searchParams.get("includeTest") === "true";

  let query = supabase
    .from("event_roulette_winners")
    .select("id, event_id, nickname, winner_note, winner_at, is_reward_done, reward_done_at, is_test, memo, created_at, updated_at")
    .order("winner_at", { ascending: false })
    .limit(100);

  if (!includeTest) {
    query = query.eq("is_test", false);
  }

  const { data, error } = await query;

  if (error) {
    return json({ ok: false, message: error.message || "룰렛 당첨자 조회 실패" }, 500);
  }

  return json({ ok: true, winners: data || [] });
}

async function createEvent(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const mode = normalizeEventRouletteMode(body.mode);
  const sourceDate = normalizeDateText(body.sourceDate);
  const broadcastId = cleanBroadcastId(body.broadcastId);
  const title = cleanText(body.title) || DEFAULT_TITLE;
  const rawEventKind = cleanText(body.eventKind);
  // 기존 동작 보존: claw가 아니면 roulette. survival은 명시적으로 보낼 때만 분기.
  const eventKind: "claw" | "survival" | "roulette" =
    rawEventKind === "claw" ? "claw" : rawEventKind === "survival" ? "survival" : "roulette";
  const requestedCreateParticipants = normalizeManualParticipantsForEvent(body.participants);
  const rawParticipants = requestedCreateParticipants.length > 0
    ? requestedCreateParticipants
    : await buildParticipantsForRequest(supabase, mode, sourceDate, broadcastId);
  const excludeDailyDup = body.excludeDailyDup !== false; // 기본 true(중복당첨 금지). false면 중복체크 건너뜀
  const deduped = excludeDailyDup
    ? await applyNoDuplicateWinnerRule(supabase, rawParticipants, {
        mode,
        isTest: mode === "test",
        sourceDate,
        broadcastId,
      })
    : { participants: rawParticipants, excludedWinnerCount: 0 };
  const participants = deduped.participants;

  if (rawParticipants.length > 0 && participants.length <= 0) {
    return json({ ok: false, message: "같은 방송에서 이미 모든 참여자가 당첨되었습니다. 중복당첨 방지를 위해 룰렛을 만들 수 없습니다." }, 400);
  }

  if (participants.length <= 0) {
    return json({ ok: false, message: "룰렛 참여자가 없습니다." }, 400);
  }

  if (mode === "preview") {
    return json({
      ok: true,
      mode,
      source_date: sourceDate,
      broadcast_id: broadcastId || null,
      event: {
        title,
        mode,
        is_test: true,
        status: "idle",
        broadcast_id: broadcastId || null,
        participants: participants.map(sanitizeParticipantForAdmin),
        participant_count: participants.length,
        spin_duration_ms: calculateRouletteSpinDurationMs(participants.length),
      },
      saved: false,
    });
  }

  const overlayBaseToken =
    eventKind === "roulette"
      ? "roulette_luludongi_live"
      : eventKind === "survival"
        ? "survival_luludongi_live"
        : "claw_luludongi_live";
  const overlayToken = `${overlayBaseToken}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const spinDurationMs = calculateRouletteSpinDurationMs(participants.length);

  const eventPayload = {
    title,
    overlay_token: overlayToken,
    mode,
    is_test: mode === "test",
    status: "idle",
    broadcast_id: broadcastId || null,
    event_date: sourceDate,
    source_date: sourceDate,
    participant_snapshot: participants,
    winner_nickname: null,
    winner_note: null,
    winner_order_ids: [],
    spin_started_at: null,
    result_at: null,
    spin_duration_ms: spinDurationMs,
  };

  const { data, error } = await supabase
    .from("event_roulette_events")
    .insert(eventPayload)
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .single();

  if (error) {
    return json({ ok: false, message: error.message || "룰렛 이벤트 생성 실패" }, 500);
  }

  return json({ ok: true, event: sanitizeEventForAdmin(data as RouletteEventRow), saved: true });
}

async function spinEvent(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const eventId = cleanText(body.eventId);
  const winnerNote = cleanText(body.winnerNote) || "룰렛 당첨";

  if (!eventId) {
    return json({ ok: false, message: "eventId가 없습니다." }, 400);
  }

  const { data: eventData, error: eventError } = await supabase
    .from("event_roulette_events")
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .eq("id", eventId)
    .single();

  if (eventError || !eventData) {
    return json({ ok: false, message: eventError?.message || "룰렛 이벤트를 찾지 못했습니다." }, 404);
  }

  const event = eventData as RouletteEventRow;
  const requestedSpinParticipants = normalizeManualParticipantsForEvent(body.participants);
  const participants = requestedSpinParticipants.length > 0
    ? requestedSpinParticipants
    : Array.isArray(event.participant_snapshot)
      ? event.participant_snapshot
      : [];

  if (participants.length <= 0) {
    return json({ ok: false, message: "룰렛 참여자가 없습니다." }, 400);
  }

  if (event.status === "result" && event.winner_nickname) {
    return json({ ok: true, event: sanitizeEventForAdmin(event), already_result: true });
  }

  const deduped = await applyNoDuplicateWinnerRule(supabase, participants, {
    mode: event.mode,
    isTest: event.is_test,
    sourceDate: event.source_date,
    broadcastId: cleanText(event.broadcast_id),
    excludeEventId: event.id,
  });
  const eligibleParticipants = deduped.participants;

  if (participants.length > 0 && eligibleParticipants.length <= 0) {
    return json({ ok: false, message: "같은 방송에서 이미 모든 참여자가 당첨되었습니다. 중복당첨 방지를 위해 룰렛을 시작할 수 없습니다." }, 400);
  }

  const fixedWinnerNickname = cleanText(body.fixedWinnerNickname);
  // 지정 당첨자는 관리자가 명시적으로 고른 것이므로, 중복제외(eligible) 필터에 휘둘리지 않고
  // 원본 참가자 명단(participants)에서 직접 찾아 무조건 당첨시킨다.
  const fixedWinner = fixedWinnerNickname
    ? (findRequestedWinner(eligibleParticipants, fixedWinnerNickname)
        || findRequestedWinner(participants, fixedWinnerNickname))
    : null;

  if (fixedWinnerNickname && !fixedWinner) {
    return json({
      ok: false,
      message: "고정한 당첨자가 현재 참여자 명단에 없습니다. 당첨 고정을 해제하거나 명단을 다시 확인해주세요.",
    }, 400);
  }

  const picked = fixedWinner
    ? {
        winner: fixedWinner,
        totalWeight: calculateTotalParticipantWeight(eligibleParticipants),
        randomValue: -1,
      }
    : pickRouletteWinner(eligibleParticipants);
  const now = new Date().toISOString();
  const spinDurationMs = calculateRouletteSpinDurationMs(participants.length);

  const { data: updatedEvent, error: updateError } = await supabase
    .from("event_roulette_events")
    .update({
      status: "result",
      winner_nickname: picked.winner.nickname,
      winner_note: winnerNote,
      winner_order_ids: picked.winner.orderIds || [],
      spin_started_at: now,
      spin_duration_ms: spinDurationMs,
      result_at: now,
      updated_at: now,
    
      participant_snapshot: participants,
    })
    .eq("id", eventId)
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .single();

  if (updateError || !updatedEvent) {
    return json({ ok: false, message: updateError?.message || "룰렛 결과 저장 실패" }, 500);
  }

  const { data: existingWinner } = await supabase
    .from("event_roulette_winners")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  // 당첨자 레코드 id를 응답에 직접 담아 클라가 재조회(race/RLS) 없이 mark_reward_done 하도록 한다.
  let winnerId = existingWinner ? String((existingWinner as { id?: unknown }).id ?? "") : "";

  if (!existingWinner) {
    const { data: insertedWinner, error: winnerError } = await supabase
      .from("event_roulette_winners")
      .insert({
        event_id: eventId,
        nickname: picked.winner.nickname,
        winner_note: winnerNote,
        winner_at: now,
        is_reward_done: false,
        is_test: event.is_test,
      })
      .select("id")
      .single();

    if (winnerError) {
      return json({ ok: false, message: winnerError.message || "룰렛 당첨자 저장 실패" }, 500);
    }
    winnerId = insertedWinner ? String((insertedWinner as { id?: unknown }).id ?? "") : "";
  }

  return json({
    ok: true,
    event: sanitizeEventForAdmin(updatedEvent as RouletteEventRow),
    overlay_event: sanitizeEventForOverlayProbe(updatedEvent as RouletteEventRow),
    winnerId,
    picked: {
      nickname: picked.winner.nickname,
      total_weight: picked.totalWeight,
      random_value: picked.randomValue,
    },
  });
}

// ── 서바이벌(생존게임) 전용 ────────────────────────────────────────────────
// 서버가 최종 생존자 K명을 확정한다. 고정 당첨자 우선 → 나머지는 가중치 랜덤(중복 없이).
//   * 룰렛/인형뽑기의 spinEvent(단일 당첨)와 완전히 분리된 별도 함수 — 기존 추첨/지급 로직 무변경.
//   * 여기서 포인트 지급은 하지 않는다(생존자 명단 확정·기록까지). 지급은 기존 grant 흐름이 담당.
async function resolveSurvivalEvent(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const eventId = cleanText(body.eventId);
  const winnerNote = cleanText(body.winnerNote) || "서바이벌 생존";

  if (!eventId) {
    return json({ ok: false, message: "eventId가 없습니다." }, 400);
  }

  const { data: eventData, error: eventError } = await supabase
    .from("event_roulette_events")
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .eq("id", eventId)
    .single();

  if (eventError || !eventData) {
    return json({ ok: false, message: eventError?.message || "서바이벌 이벤트를 찾지 못했습니다." }, 404);
  }

  const event = eventData as RouletteEventRow;
  const requestedParticipants = normalizeManualParticipantsForEvent(body.participants);
  const participants = requestedParticipants.length > 0
    ? requestedParticipants
    : Array.isArray(event.participant_snapshot)
      ? event.participant_snapshot
      : [];

  if (participants.length <= 0) {
    return json({ ok: false, message: "서바이벌 참여자가 없습니다." }, 400);
  }

  // 생존자 수 K — 최소 1명, 참가자 수보다 적어야 함(전원 생존이면 게임이 성립 안 함)
  const rawCount = Math.floor(safeNumber(body.winnerCount, 1)) || 1;
  const winnerCount = Math.max(1, Math.min(rawCount, participants.length - 1));

  const excludeDailyDup = body.excludeDailyDup !== false;
  const deduped = excludeDailyDup
    ? await applyNoDuplicateWinnerRule(supabase, participants, {
        mode: event.mode,
        isTest: event.is_test,
        sourceDate: event.source_date,
        broadcastId: cleanText(event.broadcast_id),
        excludeEventId: event.id,
      })
    : { participants, excludedWinnerCount: 0 };
  const eligible = deduped.participants;

  const survivors: EventRouletteParticipant[] = [];
  const takenKeys = new Set<string>();

  // 1) 고정 당첨자(미리 지정) 먼저 확정. 관리자가 명시적으로 고른 것이라 중복제외 필터에 휘둘리지 않게 원본에서도 찾는다.
  const fixedRaw = Array.isArray(body.fixedNicknames) ? body.fixedNicknames : [];
  for (const item of fixedRaw) {
    const nick = cleanText(item);
    if (!nick) continue;
    const key = normalizeWinnerNicknameForDedupe(nick);
    if (takenKeys.has(key)) continue;

    const found = findRequestedWinner(eligible, nick) || findRequestedWinner(participants, nick);
    if (!found) {
      return json({ ok: false, message: `고정한 당첨자 "${nick}" 가(이) 참여자 명단에 없습니다. 고정을 해제하거나 명단을 다시 확인해주세요.` }, 400);
    }
    if (survivors.length >= winnerCount) {
      return json({ ok: false, message: `고정 당첨자가 생존자 수(${winnerCount}명)보다 많습니다.` }, 400);
    }
    survivors.push(found);
    takenKeys.add(key);
  }

  // 2) 남은 자리는 가중치 랜덤으로 중복 없이 채운다(기존 pickRouletteWinner 재사용).
  let pool = eligible.filter((p) => !takenKeys.has(normalizeWinnerNicknameForDedupe(p.nickname)));
  while (survivors.length < winnerCount && pool.length > 0) {
    const picked = pickRouletteWinner(pool);
    const key = normalizeWinnerNicknameForDedupe(picked.winner.nickname);
    survivors.push(picked.winner);
    takenKeys.add(key);
    pool = pool.filter((p) => normalizeWinnerNicknameForDedupe(p.nickname) !== key);
  }

  if (survivors.length < winnerCount) {
    return json({ ok: false, message: `생존자 ${winnerCount}명을 뽑기에 참여자가 부족합니다. (뽑을 수 있는 인원 ${survivors.length}명)` }, 400);
  }

  const now = new Date().toISOString();
  const spinDurationMs = calculateRouletteSpinDurationMs(participants.length);
  const survivorNicknames = survivors.map((s) => s.nickname);

  const { data: updatedEvent, error: updateError } = await supabase
    .from("event_roulette_events")
    .update({
      status: "result",
      winner_nickname: survivorNicknames[0] || null, // 기존 단일 필드 호환(첫 생존자)
      winner_note: winnerNote,
      winner_order_ids: survivors[0]?.orderIds || [],
      survivor_nicknames: survivorNicknames, // 서바이벌 전용 신규 컬럼
      winner_count: winnerCount,
      spin_started_at: now,
      spin_duration_ms: spinDurationMs,
      result_at: now,
      updated_at: now,
      participant_snapshot: participants,
    })
    .eq("id", eventId)
    .select(
      "id, title, overlay_token, mode, is_test, status, broadcast_id, event_date, source_date, participant_snapshot, winner_nickname, winner_note, winner_order_ids, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
    )
    .single();

  if (updateError || !updatedEvent) {
    return json({
      ok: false,
      message:
        (updateError?.message || "서바이벌 결과 저장 실패") +
        " — survivor_nicknames 컬럼이 없다면 Supabase에서 supabase/sql/event_survival_columns.sql 을 먼저 실행하세요.",
    }, 500);
  }

  // 생존자 K명을 당첨자 테이블에 각각 기록. 이미 있으면 건너뜀(재실행해도 중복 생성 안 됨).
  const { data: existingRows } = await supabase
    .from("event_roulette_winners")
    .select("id, nickname")
    .eq("event_id", eventId);

  const existing = (Array.isArray(existingRows) ? existingRows : []) as { id?: unknown; nickname?: unknown }[];
  const existingKeys = new Set(existing.map((r) => normalizeWinnerNicknameForDedupe(r.nickname)));
  const toInsert = survivorNicknames.filter((n) => !existingKeys.has(normalizeWinnerNicknameForDedupe(n)));

  let insertedRows: { id?: unknown; nickname?: unknown }[] = [];

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("event_roulette_winners")
      .insert(
        toInsert.map((nickname) => ({
          event_id: eventId,
          nickname,
          winner_note: winnerNote,
          winner_at: now,
          is_reward_done: false,
          is_test: event.is_test,
        }))
      )
      .select("id, nickname");

    if (insertError) {
      return json({ ok: false, message: insertError.message || "서바이벌 당첨자 저장 실패" }, 500);
    }
    insertedRows = (Array.isArray(inserted) ? inserted : []) as { id?: unknown; nickname?: unknown }[];
  }

  const allRows = [...existing, ...insertedRows];
  // 클라가 재조회 없이 바로 지급/마킹할 수 있도록 당첨자 레코드 id를 닉네임과 짝지어 반환.
  const winners = survivorNicknames.map((nickname) => {
    const row = allRows.find(
      (r) => normalizeWinnerNicknameForDedupe(r.nickname) === normalizeWinnerNicknameForDedupe(nickname)
    );
    return { nickname, winnerId: row ? String(row.id ?? "") : "" };
  });

  return json({
    ok: true,
    event: sanitizeEventForAdmin(updatedEvent as RouletteEventRow),
    overlay_event: sanitizeEventForOverlayProbe(updatedEvent as RouletteEventRow),
    winner_count: winnerCount,
    survivors: survivorNicknames,
    winners,
  });
}

async function markRewardDone(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const winnerId = cleanText(body.winnerId);
  const done = body.isRewardDone !== false;
  const now = new Date().toISOString();

  if (!winnerId) {
    return json({ ok: false, message: "winnerId가 없습니다." }, 400);
  }

  const { data, error } = await supabase
    .from("event_roulette_winners")
    .update({
      is_reward_done: done,
      reward_done_at: done ? now : null,
      updated_at: now,
    })
    .eq("id", winnerId)
    .select("id, event_id, nickname, winner_note, winner_at, is_reward_done, reward_done_at, is_test, memo, created_at, updated_at")
    .single();

  if (error || !data) {
    return json({ ok: false, message: error?.message || "지급완료 처리 실패" }, 500);
  }

  return json({ ok: true, winner: data });
}

// [2026-07-10] 배지 마킹 폴백 — winnerId를 클라가 못 구했을 때 eventId(+닉네임)로 서버가 직접 찾아 마킹.
//   기존 markRewardDone(winnerId 기준)은 무변경. 실패 경로만 보완한다.
//   원인: 마킹 전 당첨자 행 조회를 브라우저 supabase로 하던 구조 → RLS/레이스로 실패하면
//         "돈은 나갔는데 is_reward_done=false" → 재실행 시 중복지급(2026-07-05 쥬쥬엉니 2,000P 실제 발생).
async function markRewardDoneByEvent(body: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const eventId = cleanText(body.eventId);
  const nickname = cleanText(body.nickname);
  const now = new Date().toISOString();

  if (!eventId) return json({ ok: false, message: "eventId가 없습니다." }, 400);

  let q = supabase.from("event_roulette_winners").select("id").eq("event_id", eventId);
  if (nickname) q = q.eq("nickname", nickname);
  const { data: rows, error: findError } = await q.order("created_at", { ascending: false }).limit(1);
  if (findError) return json({ ok: false, message: findError.message }, 500);
  const winnerId = String((rows as { id?: unknown }[] | null)?.[0]?.id ?? "");
  if (!winnerId) return json({ ok: false, message: "당첨자 레코드를 찾지 못했습니다." }, 404);

  const { error } = await supabase
    .from("event_roulette_winners")
    .update({ is_reward_done: true, reward_done_at: now, updated_at: now })
    .eq("id", winnerId);
  if (error) return json({ ok: false, message: error.message }, 500);
  return json({ ok: true, winnerId });
}

async function deleteRouletteEvent(body: Record<string, unknown>) {
  const eventId = cleanText(body.eventId);
  const allowLiveDelete = body.allowLiveDelete === true;
  const liveConfirmText = cleanText(body.liveConfirmText);

  if (!eventId) {
    return json({ ok: false, message: "삭제할 룰렛 이벤트 ID가 없습니다." }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: eventRow, error: lookupError } = await supabase
    .from("event_roulette_events")
    .select("id, is_test, mode, title, status, winner_nickname")
    .eq("id", eventId)
    .maybeSingle();

  if (lookupError) {
    return json({ ok: false, message: lookupError.message || "룰렛 이벤트 조회 실패" }, 500);
  }

  if (!eventRow) {
    return json({ ok: true, already_deleted: true, deleted_event_id: eventId });
  }

  const event = eventRow as {
    id: string;
    is_test: boolean;
    mode: string | null;
    title: string | null;
    status: string | null;
    winner_nickname: string | null;
  };

  if (!event.is_test && (!allowLiveDelete || liveConfirmText !== "운영이벤트삭제")) {
    return json({ ok: false, message: "운영 룰렛 이벤트 삭제 확인값이 없습니다." }, 400);
  }

  const { error: winnerDeleteError } = await supabase
    .from("event_roulette_winners")
    .delete()
    .eq("event_id", eventId)
    .eq("is_test", event.is_test);

  if (winnerDeleteError) {
    return json({ ok: false, message: winnerDeleteError.message || "연결 당첨자 기록 삭제 실패" }, 500);
  }

  const { error: eventDeleteError } = await supabase
    .from("event_roulette_events")
    .delete()
    .eq("id", eventId)
    .eq("is_test", event.is_test);

  if (eventDeleteError) {
    return json({ ok: false, message: eventDeleteError.message || "룰렛 이벤트 삭제 실패" }, 500);
  }

  return json({
    ok: true,
    deleted_event_id: eventId,
    is_test: event.is_test,
  });
}

async function deleteWinnerRecord(body: Record<string, unknown>) {
  const winnerId = cleanText(body.winnerId);
  const eventIdFromBody = cleanText(body.eventId);
  const allowLiveDelete = body.allowLiveDelete === true;
  const liveConfirmText = cleanText(body.liveConfirmText);

  if (eventIdFromBody) {
    return deleteRouletteEvent({
      eventId: eventIdFromBody,
      allowLiveDelete,
      liveConfirmText: allowLiveDelete ? "운영이벤트삭제" : "",
    });
  }

  if (!winnerId) {
    return json({ ok: false, message: "당첨 기록 ID 또는 이벤트 ID가 없습니다." }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: winnerRow, error: lookupError } = await supabase
    .from("event_roulette_winners")
    .select("id, event_id, nickname, is_test, is_reward_done")
    .eq("id", winnerId)
    .maybeSingle();

  if (lookupError) {
    return json({ ok: false, message: lookupError.message || "당첨 기록 조회 실패" }, 500);
  }

  if (!winnerRow) {
    return json({ ok: true, already_deleted: true, deleted_winner_id: winnerId });
  }

  const winner = winnerRow as {
    id: string;
    event_id: string | null;
    nickname: string | null;
    is_test: boolean;
    is_reward_done: boolean | null;
  };

  if (!winner.is_test && (!allowLiveDelete || liveConfirmText !== "운영기록삭제")) {
    return json({ ok: false, message: "운영 당첨 기록 삭제 확인값이 없습니다." }, 400);
  }

  const eventId = cleanText(winner.event_id);

  if (eventId) {
    return deleteRouletteEvent({
      eventId,
      allowLiveDelete,
      liveConfirmText: !winner.is_test ? "운영이벤트삭제" : "",
    });
  }

  const { error: deleteError } = await supabase
    .from("event_roulette_winners")
    .delete()
    .eq("id", winner.id)
    .eq("is_test", winner.is_test);

  if (deleteError) {
    return json({ ok: false, message: deleteError.message || "당첨 기록 삭제 실패" }, 500);
  }

  return json({
    ok: true,
    deleted_winner_id: winner.id,
    reset_event_id: null,
    is_test: winner.is_test,
  });
}


async function deleteTestRecords() {
  const supabase = getSupabaseAdmin();

  const { error: winnerError } = await supabase
    .from("event_roulette_winners")
    .delete()
    .eq("is_test", true);

  if (winnerError) {
    return json({ ok: false, message: winnerError.message || "테스트 당첨 기록 삭제 실패" }, 500);
  }

  const { error: eventError } = await supabase
    .from("event_roulette_events")
    .delete()
    .eq("is_test", true);

  if (eventError) {
    return json({ ok: false, message: eventError.message || "테스트 룰렛 이벤트 삭제 실패" }, 500);
  }

  return json({ ok: true });
}


export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action") || "participants";

    if (action === "participants") return handleParticipants(request);
    if (action === "broadcasts") return handleBroadcasts(request);
    if (action === "events") return handleEvents(request);
    if (action === "winners") return handleWinners(request);

    return json({ ok: false, message: "지원하지 않는 action입니다." }, 400);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanText(body.action);

    if (action === "participants") return handleParticipantsPost(body);
    if (action === "create_event") return createEvent(body);
    if (action === "spin_event") return spinEvent(body);
    if (action === "resolve_survival_event") return resolveSurvivalEvent(body);
    if (action === "mark_reward_done") return markRewardDone(body);
    if (action === "mark_reward_done_by_event") return markRewardDoneByEvent(body);
    if (action === "delete_winner") return deleteWinnerRecord(body);
    if (action === "delete_event") return deleteRouletteEvent(body);
    if (action === "delete_test_records") return deleteTestRecords();

    return json({ ok: false, message: "지원하지 않는 action입니다." }, 400);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
}
