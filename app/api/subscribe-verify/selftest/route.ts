// [2026-11-01 임시] 구독 인증 AI 판정 시험 — 고정 시험 사진 6장(public/subscribe-test)만 판정해 결과를 돌려준다.
//   손님 입력 없음·DB 쓰기 없음·돈 무관. 시험 끝나면 이 파일과 시험 사진을 지운다.
import { NextRequest, NextResponse } from "next/server";
import { callGeminiJson } from "@/lib/geminiJson";
import { buildSubscribeCheckPrompt, judgeSubscribeShot, parseAiJudge } from "@/lib/subscribeFreeShip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CASES = [
  { file: "pass-full.jpg", expect: true },
  { file: "pass-crop.jpg", expect: true },
  { file: "fail-unsub.jpg", expect: false },
  { file: "fail-other.jpg", expect: false },
  { file: "fail-button-only.jpg", expect: false },
  { file: "fail-not-youtube.jpg", expect: false },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== "ruru-selftest-1101") return NextResponse.json({ ok: false }, { status: 404 });
  const only = url.searchParams.get("only");
  const results = [];
  for (const c of CASES.filter((x) => !only || x.file === only)) {
    const res = await fetch(`${url.origin}/subscribe-test/${c.file}`, { cache: "no-store" });
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    const ai = await callGeminiJson(
      [{ text: buildSubscribeCheckPrompt("나야루루") }, { inline_data: { mime_type: "image/jpeg", data: base64 } }],
      { timeoutMs: 15000, maxTokens: 400 },
    );
    const parsed = parseAiJudge(ai.text);
    const judged = judgeSubscribeShot(parsed, "나야루루");
    results.push({ file: c.file, expect: c.expect, got: judged.ok, match: judged.ok === c.expect, reason: judged.reason, model: ai.note, ai: parsed });
  }
  return NextResponse.json({ ok: true, allMatch: results.every((r) => r.match), results });
}
