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

function isBlockedValue(value: unknown) {
  return value === true || value === "true" || value === "Y" || value === "y" || value === 1 || value === "1";
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

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        blocked: false,
        message: "Supabase 관리자 환경변수가 없습니다.",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const phoneDigits = digitsOnly(searchParams.get("phone"));

  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    return NextResponse.json({
      ok: true,
      blocked: false,
      phone: phoneDigits,
    });
  }

  const { data: directData, error: directError } = await supabase
    .from("customer_phone_blocks")
    .select("phone, reason, is_blocked")
    .eq("phone", phoneDigits)
    .eq("is_blocked", true)
    .limit(1);

  if (directError && !isMissingPhoneBlockTableError(directError)) {
    return NextResponse.json(
      {
        ok: false,
        blocked: false,
        message: directError.message,
      },
      { status: 500 }
    );
  }

  if (Array.isArray(directData) && directData.some((row) => isBlockedValue(row?.is_blocked))) {
    const reason = clean(directData[0]?.reason);

    return NextResponse.json({
      ok: true,
      blocked: true,
      phone: phoneDigits,
      reason,
      source: "phone_block",
      message: "현재 주문서 작성이 제한되어 있습니다.",
    });
  }

  const variants = phoneVariants(phoneDigits);

  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_phone, is_blocked, block_reason")
    .in("customer_phone", variants)
    .limit(20);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        blocked: false,
        message: error.message,
      },
      { status: 500 }
    );
  }

  const blockedRow = Array.isArray(data) ? data.find((row) => isBlockedValue(row?.is_blocked)) : null;
  const blocked = Boolean(blockedRow);

  return NextResponse.json({
    ok: true,
    blocked,
    phone: phoneDigits,
    reason: blocked ? clean(blockedRow?.block_reason) : "",
    source: blocked ? "customer" : "none",
    message: blocked ? "현재 주문서 작성이 제한되어 있습니다." : "",
  });
}
