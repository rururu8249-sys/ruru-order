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

  if (!data || data.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "해당 전화번호로 등록된 고객을 찾지 못했습니다. 미주문 번호까지 차단하려면 차단전용 테이블 추가가 필요합니다.",
        phone: phoneDigits,
        matchedCount: 0,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    phone: phoneDigits,
    blocked,
    reason: blocked ? reason : "",
    matchedCount: data.length,
    customers: data,
  });
}
