import { NextRequest, NextResponse } from "next/server";
import { authorizedInternalCronRequest, internalCronSecret } from "@/lib/internalCronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readJsonSafe(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assertAuthorized(request: NextRequest) {
  const configured = Boolean(String(process.env.CRON_SECRET || process.env.BANKDA_CRON_SECRET || "").trim());
  if (!configured) return { ok: false, status: 503, message: "Cron 인증 설정이 필요합니다." };
  if (!authorizedInternalCronRequest(request)) return { ok: false, status: 401, message: "Bankda cron 인증 실패" };
  return { ok: true, status: 200, message: "" };
}

async function handleBankdaCron(request: NextRequest) {
  const auth = assertAuthorized(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: "bankda_server_cron",
        message: auth.message,
      },
      { status: auth.status }
    );
  }

  const origin = new URL(request.url).origin;

  const internalSecret = internalCronSecret();

  const syncResponse = await fetch(`${origin}/api/bankda/sync-and-auto-match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ruru-internal-cron": internalSecret,
      Authorization: `Bearer ${internalSecret}`,
    },
    body: JSON.stringify({
      source: "bankda_server_cron",
      requestedAt: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  const syncResult = await readJsonSafe(syncResponse);

  return NextResponse.json(
    {
      ok: syncResponse.ok && syncResult?.ok !== false,
      mode: "bankda_server_cron",
      requestedAt: new Date().toISOString(),
      sync: syncResult,
    },
    { status: syncResponse.status || 200 }
  );
}

export async function GET(request: NextRequest) {
  return handleBankdaCron(request);
}

export async function POST(request: NextRequest) {
  return handleBankdaCron(request);
}
