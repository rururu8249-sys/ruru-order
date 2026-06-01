import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { EventRouletteParticipant } from "@/lib/eventRoulette";

export const dynamic = "force-dynamic";

const FIXED_CLAW_OVERLAY_TOKEN = "claw_luludongi_live";

type OverlayEventRow = {
  title: string;
  mode: "live" | "test" | "preview";
  is_test: boolean;
  status: "idle" | "spinning" | "result" | "closed";
  participant_snapshot: EventRouletteParticipant[] | null;
  winner_nickname: string | null;
  winner_note: string | null;
  spin_started_at: string | null;
  spin_duration_ms: number | null;
  result_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeParticipants(input: EventRouletteParticipant[] | null) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => ({
    nickname: cleanText(item.nickname) || "참여자",
  }));
}

export async function GET(request: NextRequest) {
  try {
    const token = cleanText(request.nextUrl.searchParams.get("token"));

    if (!token) {
      return json({ ok: false, message: "인형뽑기 위젯주소 token이 없습니다." }, 400);
    }

    if (token !== FIXED_CLAW_OVERLAY_TOKEN) {
      return json({ ok: false, message: "인형뽑기 위젯주소 token이 올바르지 않습니다." }, 403);
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("event_roulette_events")
      .select(
        "title, mode, is_test, status, participant_snapshot, winner_nickname, winner_note, spin_started_at, spin_duration_ms, result_at, created_at, updated_at"
      )
      .like("overlay_token", "claw_%")
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return json({ ok: false, message: error.message || "인형뽑기 overlay 조회 실패" }, 500);
    }

    if (!data) {
      return json({ ok: false, message: "표시할 인형뽑기 이벤트가 없습니다." }, 404);
    }

    const event = data as OverlayEventRow;

    return json({
      ok: true,
      event: {
        title: cleanText(event.title) || "🎁 선물이모티콘이벤트",
        mode: event.mode,
        is_test: event.is_test,
        status: event.status,
        participants: sanitizeParticipants(event.participant_snapshot),
        winner_nickname: cleanText(event.winner_nickname),
        winner_note: cleanText(event.winner_note),
        spin_started_at: event.spin_started_at,
        spin_duration_ms: event.spin_duration_ms || 5000,
        result_at: event.result_at,
        updated_at: event.updated_at,
      },
    });
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
}
