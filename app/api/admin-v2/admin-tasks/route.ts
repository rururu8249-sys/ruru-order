// app/api/admin-v2/admin-tasks/route.ts
// 목적: 고객 이슈/오늘할일 admin_tasks를 서버 권한으로 조회/등록/완료 처리
// 주의: 브라우저에 service_role 키 노출 없음. 주문/입금/배송/정산 상태 변경 없음.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeTaskType(value: unknown) {
  const raw = cleanText(value, 80) || "general";
  const allowed = new Set([
    "product",
    "payment",
    "shipping",
    "address",
    "exchange",
    "refund",
    "return",
    "complaint",
    "general",
  ]);

  return allowed.has(raw) ? raw : "general";
}

function normalizePriority(value: unknown) {
  const raw = cleanText(value, 40) || "normal";
  return ["low", "normal", "high", "urgent"].includes(raw) ? raw : "normal";
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("admin_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(240);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tasks: data || [],
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
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const taskType = normalizeTaskType(body?.task_type);
    const title = cleanText(body?.title, 300);
    const bodyText = cleanText(body?.body, 8000);
    const customerName = cleanText(body?.customer_name, 200);
    const customerNickname = cleanText(body?.customer_nickname, 200);
    const relatedProduct = cleanText(body?.related_product, 500);
    const source = cleanText(body?.source, 80) || "manual";
    const priority = normalizePriority(body?.priority);
    const customerId =
      Number.isFinite(Number(body?.customer_id)) && Number(body?.customer_id) > 0
        ? Number(body?.customer_id)
        : null;

    if (!title) {
      return NextResponse.json(
        { ok: false, message: "제목이 없어 고객 이슈를 등록할 수 없습니다." },
        { status: 400 }
      );
    }

    if (!bodyText) {
      return NextResponse.json(
        { ok: false, message: "메모 또는 이슈 내용이 없어 등록할 수 없습니다." },
        { status: 400 }
      );
    }

    const insertPayload = {
      task_type: taskType,
      title,
      body: bodyText,
      customer_id: customerId,
      customer_name: customerName || null,
      customer_nickname: customerNickname || null,
      related_product: relatedProduct || null,
      source,
      status: "open",
      priority,
      raw_payload:
        body?.raw_payload && typeof body.raw_payload === "object"
          ? body.raw_payload
          : {},
    };

    const { data, error } = await supabase
      .from("admin_tasks")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: data,
      message: "고객 이슈 등록 완료",
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

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const id = Number(body?.id || 0);
    const action = cleanText(body?.action, 80);
    const resolvedNote = cleanText(body?.resolved_note, 2000);

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "처리할 고객 이슈 ID가 없습니다." },
        { status: 400 }
      );
    }

    if (action !== "resolve") {
      return NextResponse.json(
        { ok: false, message: "지원하지 않는 처리 방식입니다." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("admin_tasks")
      .update({
        status: "done",
        resolved_at: nowIso,
        updated_at: nowIso,
        resolved_note: resolvedNote || "관리자 해결완료 처리",
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: data,
      message: "고객 이슈 해결완료 처리",
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
