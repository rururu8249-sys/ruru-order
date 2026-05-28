import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_COOKIE_NAME = "ruru_admin_session";
const DEFAULT_VISITOR_NOTE = "방문 로그 설정 후 표시";

type BroadcastEndReportRequestBody = {
  broadcastId?: string | null;
  broadcastTitle?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;

  orderCount?: number | null;
  activeOrderCount?: number | null;
  canceledCount?: number | null;

  paidCount?: number | null;
  paidAmount?: number | null;

  bankPaidCount?: number | null;
  bankPaidAmount?: number | null;

  cardPaidCount?: number | null;
  cardPaidAmount?: number | null;

  unpaidCount?: number | null;
  unpaidAmount?: number | null;

  buyerCount?: number | null;
  existingMemberCount?: number | null;
  newMemberCount?: number | null;

  visitorCount?: number | null;
  visitorNote?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function toNonNegativeInteger(value: unknown) {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.round(numberValue));
}

function toNullableIso(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function toSeoulDateKey(value: unknown) {
  const iso = toNullableIso(value);
  if (!iso) return null;

  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}

function durationMinutes(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return 0;

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;

  return Math.max(0, Math.round((end - start) / 60000));
}

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertAdminSession(request: NextRequest) {
  const expectedToken = process.env.ADMIN_SESSION_TOKEN;

  if (!expectedToken) {
    return {
      ok: false,
      status: 500,
      message: "ADMIN_SESSION_TOKEN 환경변수가 없습니다.",
    };
  }

  const cookieToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value || "";

  if (!cookieToken || cookieToken !== expectedToken) {
    return {
      ok: false,
      status: 401,
      message: "관리자 로그인 정보가 없습니다. 다시 로그인해주세요.",
    };
  }

  return { ok: true, status: 200, message: "" };
}

export async function GET(request: NextRequest) {
  const auth = assertAdminSession(request);

  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  try {
    const supabase = createAdminSupabase();

    const { data, error } = await supabase
      .from("broadcast_end_reports")
      .select("*")
      .order("ended_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reports: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = assertAdminSession(request);

  if (!auth.ok) {
    return jsonError(auth.message, auth.status);
  }

  let body: BroadcastEndReportRequestBody;

  try {
    body = (await request.json()) as BroadcastEndReportRequestBody;
  } catch {
    return jsonError("요청 본문을 읽지 못했습니다.", 400);
  }

  const broadcastId = cleanText(body.broadcastId);

  if (!broadcastId) {
    return jsonError("broadcastId가 없습니다.", 400);
  }

  const endedAt = toNullableIso(body.endedAt) || new Date().toISOString();
  const startedAt = toNullableIso(body.startedAt);
  const broadcastDate = toSeoulDateKey(startedAt || endedAt);
  const visitorCount =
    body.visitorCount === null || body.visitorCount === undefined
      ? null
      : toNonNegativeInteger(body.visitorCount);

  const payload = {
    broadcast_id: broadcastId,
    broadcast_title: cleanText(body.broadcastTitle) || null,
    broadcast_date: broadcastDate,
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: durationMinutes(startedAt, endedAt),

    order_count: toNonNegativeInteger(body.orderCount),
    active_order_count: toNonNegativeInteger(body.activeOrderCount),
    canceled_count: toNonNegativeInteger(body.canceledCount),

    paid_count: toNonNegativeInteger(body.paidCount),
    paid_amount: toNonNegativeInteger(body.paidAmount),

    bank_paid_count: toNonNegativeInteger(body.bankPaidCount),
    bank_paid_amount: toNonNegativeInteger(body.bankPaidAmount),

    card_paid_count: toNonNegativeInteger(body.cardPaidCount),
    card_paid_amount: toNonNegativeInteger(body.cardPaidAmount),

    unpaid_count: toNonNegativeInteger(body.unpaidCount),
    unpaid_amount: toNonNegativeInteger(body.unpaidAmount),

    buyer_count: toNonNegativeInteger(body.buyerCount),
    existing_member_count: toNonNegativeInteger(body.existingMemberCount),
    new_member_count: toNonNegativeInteger(body.newMemberCount),

    visitor_count: visitorCount,
    visitor_note: cleanText(body.visitorNote) || DEFAULT_VISITOR_NOTE,
    report_note: "방송종료 시점 읽기 전용 요약 저장",
  };

  try {
    const supabase = createAdminSupabase();

    const { data, error } = await supabase
      .from("broadcast_end_reports")
      .upsert(payload, { onConflict: "broadcast_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      report: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
