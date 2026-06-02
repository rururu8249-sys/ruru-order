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

function isVercelCronRequest(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const cronSchedule = request.headers.get("x-vercel-cron-schedule") || "";

  return userAgent.includes("vercel-cron/1.0") && Boolean(cronSchedule.trim());
}

function getInternalCronSecret() {
  return (
    String(process.env.CRON_SECRET || "").trim() ||
    String(process.env.BANKDA_CRON_SECRET || "").trim()
  );
}

function assertAuthorized(request: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const bankdaCronSecret = String(process.env.BANKDA_CRON_SECRET || "").trim();
  const providedSecret = getProvidedSecret(request);

  const allowedSecrets = [cronSecret, bankdaCronSecret].filter(Boolean);

  if (providedSecret && allowedSecrets.includes(providedSecret)) {
    return { ok: true, status: 200, message: "" };
  }

  // Vercel Cron 공식 호출은 user-agent: vercel-cron/1.0 과 x-vercel-cron-schedule 헤더를 포함합니다.
  // CRON_SECRET 헤더 반영이 꼬여도 Vercel Cron 자체는 통과시켜 Bankda 서버 자동동기화를 살립니다.
  if (isVercelCronRequest(request)) {
    return { ok: true, status: 200, message: "" };
  }

  if (allowedSecrets.length === 0) {
    return {
      ok: false,
      status: 500,
      message: "CRON_SECRET 또는 BANKDA_CRON_SECRET 환경변수가 설정되지 않았습니다.",
    };
  }

  return {
    ok: false,
    status: 401,
    message: "Bankda cron 인증 실패",
  };
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

  const internalCronSecret = getInternalCronSecret();

  const syncResponse = await fetch(`${origin}/api/bankda/sync-and-auto-match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ruru-internal-cron": internalCronSecret,
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
