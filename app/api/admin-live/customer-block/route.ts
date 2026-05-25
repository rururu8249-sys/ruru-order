import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function phoneVariants(phone: string) {
  const digits = digitsOnly(phone);
  const variants = new Set<string>();

  if (digits) variants.add(digits);

  if (digits.length === 11) {
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
  }

  if (digits.length === 10) {
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  }

  return Array.from(variants);
}

function isMissingPhoneBlockTableError(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  return code === "42P01" || message.includes("customer_phone_blocks") || message.includes("does not exist");
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        blocks: [],
        message: "Supabase 관리자 환경변수가 없습니다.",
      },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("customer_phone_blocks")
    .select("phone, reason, is_blocked, created_at, updated_at")
    .eq("is_blocked", true)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingPhoneBlockTableError(error)) {
      return NextResponse.json({
        ok: true,
        blocks: [],
        tableReady: false,
        message: "customer_phone_blocks 테이블이 아직 없습니다.",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        blocks: [],
        message: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    tableReady: true,
    blocks: Array.isArray(data) ? data : [],
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase 관리자 환경변수가 없습니다.",
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const phone = clean(body?.phone);
  const phoneDigits = digitsOnly(phone);
  const blocked = body?.blocked !== false;
  const reason = clean(body?.reason);

  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    return NextResponse.json(
      {
        ok: false,
        message: "전화번호는 숫자 기준 10~11자리로 입력해주세요.",
      },
      { status: 400 }
    );
  }

  if (blocked && !reason) {
    return NextResponse.json(
      {
        ok: false,
        message: "차단사유를 입력해주세요.",
      },
      { status: 400 }
    );
  }

  const variants = phoneVariants(phoneDigits);

  const patch = blocked
    ? {
        is_blocked: true,
        block_reason: reason,
      }
    : {
        is_blocked: false,
        block_reason: "",
      };

  const { data, error } = await supabase
    .from("customers")
    .update(patch)
    .in("customer_phone", variants)
    .select("id, customer_phone, youtube_nickname, customer_name, is_blocked, block_reason");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message,
      },
      { status: 500 }
    );
  }

  const matchedCount = Array.isArray(data) ? data.length : 0;
  let directBlockSaved = false;

  if (matchedCount === 0) {
    const { error: directError } = await supabase.from("customer_phone_blocks").upsert(
      {
        phone: phoneDigits,
        is_blocked: blocked,
        reason: blocked ? reason : "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    );

    if (directError) {
      if (isMissingPhoneBlockTableError(directError)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "전화번호 전용 차단 테이블이 없습니다. Supabase SQL Editor에서 supabase/sql/customer_phone_blocks.sql 내용을 먼저 실행해주세요.",
            phone: phoneDigits,
            matchedCount,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          message: directError.message,
          phone: phoneDigits,
          matchedCount,
        },
        { status: 500 }
      );
    }

    directBlockSaved = true;
  }

  if (matchedCount > 0 && !blocked) {
    await supabase
      .from("customer_phone_blocks")
      .upsert(
        {
          phone: phoneDigits,
          is_blocked: false,
          reason: "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone" }
      )
      .then(() => null);
  }

  return NextResponse.json({
    ok: true,
    phone: phoneDigits,
    blocked,
    reason: blocked ? reason : "",
    matchedCount,
    directBlockSaved,
    customers: data || [],
  });
}
