// app/api/subscribe-verify/route.ts
// [2026-11-01] 손님 「구독중」 캡처 인증 — GET: 인증돼 있나 / POST: 캡처 올려 AI 확인.
//   돈 계산은 하지 않는다(기록만). 배송비는 주문 제출 서버가 이 기록 + 설정 시간으로 다시 판단한다.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { callGeminiJson } from "@/lib/geminiJson";
import { buildSubscribeCheckPrompt, isSubscribeFreeShipActive, judgeSubscribeShot, parseAiJudge } from "@/lib/subscribeFreeShip";
import {
  SUBSCRIBE_PROOF_BUCKET,
  cleanKakaoId,
  ensureSubscribeProofBucket,
  isKakaoSubscribeVerified,
  readSubscribeFreeShipConfig,
} from "@/lib/subscribeFreeShipServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TRIES_PER_DAY = 8;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function GET(request: NextRequest) {
  try {
    const kakaoId = cleanKakaoId(new URL(request.url).searchParams.get("kakao_id"));
    if (!kakaoId) return NextResponse.json({ ok: true, verified: false });
    const verified = await isKakaoSubscribeVerified(db(), kakaoId);
    return NextResponse.json({ ok: true, verified });
  } catch {
    return NextResponse.json({ ok: true, verified: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kakaoId = cleanKakaoId(body?.kakao_id);
    if (!kakaoId) return fail("카카오 로그인 후 올려 주세요.");
    const supabase = db();

    const config = await readSubscribeFreeShipConfig(supabase);
    if (!isSubscribeFreeShipActive(config)) return fail("지금은 구독 인증 무료배송 시간이 아니에요.");
    if (await isKakaoSubscribeVerified(supabase, kakaoId)) return NextResponse.json({ ok: true, verified: true, reason: "" });

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabase
      .from("subscribe_verifications")
      .select("id", { count: "exact", head: true })
      .eq("kakao_id", kakaoId)
      .gte("created_at", since);
    if ((count || 0) >= MAX_TRIES_PER_DAY) return fail("오늘은 더 올릴 수 없어요. 카톡채널로 문의해 주세요.", 429);

    const image = String(body?.image || "");
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return fail("사진 파일만 올릴 수 있어요.");
    const mime = m[1];
    const base64 = m[2];
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 2000) return fail("사진을 읽지 못했어요. 다시 올려 주세요.");
    if (bytes.length > 4 * 1024 * 1024) return fail("사진이 너무 커요. 화면 캡처 그대로 올려 주세요.");
    const hash = createHash("sha256").update(bytes).digest("hex");

    // 같은 사진을 다른 손님이 이미 쓴 경우
    const { data: sameShot } = await supabase
      .from("subscribe_verifications")
      .select("kakao_id")
      .eq("image_hash", hash)
      .neq("kakao_id", kakaoId)
      .limit(1);
    const phone = String(body?.customer_phone || "").replace(/[^0-9]/g, "").slice(0, 11) || null;
    const nickname = String(body?.youtube_nickname || "").trim().slice(0, 60) || null;

    let ok = false;
    let reason = "";
    let aiNote = "";
    if (Array.isArray(sameShot) && sameShot.length > 0) {
      reason = "이미 다른 분이 올린 사진이에요. 직접 찍은 캡처를 올려 주세요.";
      aiNote = "duplicate_image";
    } else {
      const ai = await callGeminiJson(
        [{ text: buildSubscribeCheckPrompt(config.channelName) }, { inline_data: { mime_type: mime, data: base64 } }],
        { timeoutMs: 15000, maxTokens: 400 },
      );
      if (!ai.text) return fail("사진 확인이 잠시 안 돼요. 조금 뒤 다시 올려 주세요.", 503);
      const parsed = parseAiJudge(ai.text);
      const judged = judgeSubscribeShot(parsed, config.channelName);
      ok = judged.ok;
      reason = judged.reason;
      aiNote = parsed ? `채널:${parsed.channel_name || "-"} · 버튼:${parsed.button_text || "-"} · 소속:${parsed.button_belongs === false ? "아님" : "맞음"}` : "읽기 실패";
    }

    // 캡처 보관(사장님 확인용) — 실패해도 인증 결과는 그대로
    let imagePath: string | null = null;
    try {
      await ensureSubscribeProofBucket(supabase);
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const now = new Date();
      const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${kakaoId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(SUBSCRIBE_PROOF_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (!error) imagePath = path;
    } catch {
      imagePath = null;
    }

    const { error: insertError } = await supabase.from("subscribe_verifications").insert({
      kakao_id: kakaoId,
      customer_phone: phone,
      youtube_nickname: nickname,
      channel_name: config.channelName,
      status: ok ? "verified" : "rejected",
      reason: ok ? null : reason,
      ai_note: aiNote.slice(0, 300),
      image_path: imagePath,
      image_hash: hash,
    });
    if (insertError) return fail("인증 기록을 저장하지 못했어요. 잠시 뒤 다시 올려 주세요.", 500);

    return NextResponse.json({ ok: true, verified: ok, reason });
  } catch {
    return fail("사진 확인 중 문제가 생겼어요. 잠시 뒤 다시 올려 주세요.", 500);
  }
}
