import { NextRequest, NextResponse } from "next/server";

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

function getProvidedSecret(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

  return (
    bearer ||
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();
}

function assertAuthorized(request: NextRequest) {
  const expectedSecret = String(process.env.BANKDA_CRON_SECRET || "").trim();
  const providedSecret = getProvidedSecret(request);

  if (!expectedSecret) {
    return {
      ok: false,
      status: 500,
      message: "BANKDA_CRON_SECRET 환경변수가 설정되지 않았습니다.",
    };
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return {
      ok: false,
      status: 401,
      message: "Bankda cron 인증 실패",
    };
  }

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

  const syncResponse = await fetch(`${origin}/api/bankda/sync-and-auto-match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
