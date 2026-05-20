// app/api/bankda/sync-deposits/route.ts
// 뱅크다 입금내역을 가져와 deposits 테이블에 저장

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchBankdaTransactions } from "@/lib/bankda/fetchBankdaTransactions";

const BANKDA_SYNC_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}



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

function toDepositDbTime(value: string | null | undefined) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{6}$/.test(raw)) {
    return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
  }

  const date = new Date(raw);

  if (Number.isFinite(date.getTime())) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mm = String(kst.getUTCMinutes()).padStart(2, "0");
    const ss = String(kst.getUTCSeconds()).padStart(2, "0");

    return `${hh}:${mm}:${ss}`;
  }

  return "00:00:00";
}

function sameDepositKey(item: {
  depositor_name: string;
  amount: number;
  deposited_time: string | null;
}) {
  return [
    String(item.depositor_name || "").trim(),
    String(Number(item.amount || 0)),
    String(toDepositDbTime(item.deposited_time) || ""),
  ].join("|");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => null);

    const { deposits, rawCount, raw } = await withTimeout(
      fetchBankdaTransactions({
        datefrom: body?.datefrom,
        dateto: body?.dateto,
        accountnum: body?.accountnum,
      }),
      BANKDA_SYNC_TIMEOUT_MS,
      "뱅크다 조회가 25초 이상 지연되어 중단했습니다. 잠시 후 다시 조회해주세요."
    );

    const bankdaDescription = String((raw as any)?.response?.description || "");

    const { data: existing, error: existingError } = await supabase
      .from("deposits")
      .select("id,depositor_name,amount,deposited_time")
      .limit(5000);

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: existingError.message },
        { status: 500 }
      );
    }

    const existingKeys = new Set(
      (existing || []).map((item) =>
        sameDepositKey({
          depositor_name: item.depositor_name,
          amount: item.amount,
          deposited_time: toDepositDbTime(item.deposited_time),
        })
      )
    );

    const insertRows = deposits
      .filter((item) => !existingKeys.has(sameDepositKey(item)))
      .map((item) => ({
        depositor_name: item.depositor_name,
        amount: item.amount,
        deposited_time: toDepositDbTime(item.deposited_time),
        match_order_group_id: null,
        match_customer_id: null,
        match_status: "미확인",
        confirmed_at: null,
        confirmed_note: item.confirmed_note,
      }));

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("deposits")
        .insert(insertRows);

      if (insertError) {
        return NextResponse.json(
          { ok: false, message: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      rawCount,
      bankdaDescription,
      fetchedCount: deposits.length,
      insertedCount: insertRows.length,
      skippedCount: deposits.length - insertRows.length,
      autoMatchedCount: 0,
      autoMatchScannedOrders: 0,
      autoMatchScannedDeposits: 0,
      autoMatchError: "자동입금확인은 관리자 확인 버튼에서만 실행됩니다.",
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
