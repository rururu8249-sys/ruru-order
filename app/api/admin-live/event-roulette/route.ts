import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
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

async function buildParticipantsForRequest(
  supabase: SupabaseAdminClient,
  mode: EventRouletteMode,
  sourceDate: string,
  broadcastId = ""
) {
  if (mode === "preview") {
    return buildRoulettePreviewParticipants();
  }

  const rows = broadcastId
    ? await fetchOrderRowsForBroadcast(supabase, broadcastId)
    : await fetchOrderRowsForDate(supabase, sourceDate);

  return buildRouletteParticipants(rows, mode);
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

async function handleParticipants(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const mode = normalizeEventRouletteMode(request.nextUrl.searchParams.get("mode"));
  const sourceDate = normalizeDateText(request.nextUrl.searchParams.get("sourceDate"));
  const broadcastId = cleanBroadcastId(request.nextUrl.searchParams.get("broadcastId"));
  const rawParticipants = await buildParticipantsForRequest(supabase, mode, sourceDate, broadcastId);
  const deduped = await applyNoDuplicateWinnerRule(supabase, rawParticipants, {
    mode,
    isTest: mode === "test",
    sourceDate,
    broadcastId,
  });
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
  const eventKind = cleanText(body.eventKind) === "claw" ? "claw" : "roulette";
  const requestedCreateParticipants = normalizeManualParticipantsForEvent(body.participants);
  const rawParticipants = requestedCreateParticipants.length > 0
    ? requestedCreateParticipants
    : await buildParticipantsForRequest(supabase, mode, sourceDate, broadcastId);
  const deduped = await applyNoDuplicateWinnerRule(supabase, rawParticipants, {
    mode,
    isTest: mode === "test",
    sourceDate,
    broadcastId,
  });
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
    eventKind === "roulette" ? "roulette_luludongi_live" : "claw_luludongi_live";
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
  // [임시 디버그] 지정당첨 추적 - 확인 후 제거 예정
  console.log("[ROULETTE_DEBUG] fixedWinnerNickname=", JSON.stringify(fixedWinnerNickname));
  console.log("[ROULETTE_DEBUG] eligible nicknames=", JSON.stringify(eligibleParticipants.map((p:any)=>p.nickname)));
  console.log("[ROULETTE_DEBUG] all participants nicknames=", JSON.stringify(participants.map((p:any)=>p.nickname)));
  // 지정 당첨자는 관리자가 명시적으로 고른 것이므로, 중복제외(eligible) 필터에 휘둘리지 않고
  // 원본 참가자 명단(participants)에서 직접 찾아 무조건 당첨시킨다.
  const fixedWinner = fixedWinnerNickname
    ? (findRequestedWinner(eligibleParticipants, fixedWinnerNickname)
        || findRequestedWinner(participants, fixedWinnerNickname))
    : null;

  if (fixedWinnerNickname && !fixedWinner) {
    return json({
      ok: false,
      message: "지정한 당첨자가 참가자 명단에 없습니다. 닉네임을 확인해주세요.",
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

  if (!existingWinner) {
    const { error: winnerError } = await supabase.from("event_roulette_winners").insert({
      event_id: eventId,
      nickname: picked.winner.nickname,
      winner_note: winnerNote,
      winner_at: now,
      is_reward_done: false,
      is_test: event.is_test,
    });

    if (winnerError) {
      return json({ ok: false, message: winnerError.message || "룰렛 당첨자 저장 실패" }, 500);
    }
  }

  return json({
    ok: true,
    event: sanitizeEventForAdmin(updatedEvent as RouletteEventRow),
    overlay_event: sanitizeEventForOverlayProbe(updatedEvent as RouletteEventRow),
    picked: {
      nickname: picked.winner.nickname,
      total_weight: picked.totalWeight,
      random_value: picked.randomValue,
    },
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

    if (action === "create_event") return createEvent(body);
    if (action === "spin_event") return spinEvent(body);
    if (action === "mark_reward_done") return markRewardDone(body);
    if (action === "delete_winner") return deleteWinnerRecord(body);
    if (action === "delete_event") return deleteRouletteEvent(body);
    if (action === "delete_test_records") return deleteTestRecords();

    return json({ ok: false, message: "지원하지 않는 action입니다." }, 400);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
}
