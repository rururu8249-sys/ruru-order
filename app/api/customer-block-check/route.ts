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

  const variants = phoneVariants(phoneDigits);

  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_phone, is_blocked")
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

  const blocked = Array.isArray(data) && data.some((row) => isBlockedValue(row?.is_blocked));

  return NextResponse.json({
    ok: true,
    blocked,
    phone: phoneDigits,
  });
}
