// lib/geminiJson.ts
// [2026-10-22 AI 비서] Gemini(무료) 호출 한 곳 — 「JSON 글자」만 받아 온다. 서버 전용(GEMINI_API_KEY).
//   - 모델: 2026-10 Google 목록 기준(2.5 계열은 「예전 사용자만」, 2.0 은 종료). 가벼운 Lite 먼저, 붐비면 다음 모델.
//   - «생각» 토큰 때문에 답이 비지 않게 thinkingLevel(3 계열)·thinkingBudget(2.5 계열)을 차례로, 모르는 설정(400)이면 다음.
//   - 어떤 경우에도 예외를 던지지 않는다: 실패하면 text=null + note(이유, 비밀값 없음).
//   - [2026-11-13] 부르기 전마다 lib/geminiGate 에서 무료 한도 자리를 받음(다시 시도·다른 모델 포함). 표에 없는 모델은 안 부름.
import { acquireGemini, blockGemini, GEMINI_DEFAULT_MODELS, GEMINI_FREE_LIMITS } from "@/lib/geminiGate";

function freeModels(list: (string | undefined)[]): string[] {
  return Array.from(new Set(list.filter((m): m is string => Boolean(m) && Boolean(GEMINI_FREE_LIMITS[m as string]))));
}
export type GeminiJsonResult = { text: string | null; note: string };
/** 글자 또는 사진(base64) 조각 — 사진은 응대 문구(AI-4)에서만 */
export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function callGeminiJson(prompt: string | GeminiPart[], opts: { timeoutMs?: number; maxTokens?: number; temperature?: number; models?: string[] } = {}): Promise<GeminiJsonResult> {
  const parts: GeminiPart[] = typeof prompt === "string" ? [{ text: prompt }] : prompt;
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) return { text: null, note: "no_key" };
  const timeoutMs = opts.timeoutMs ?? 6000;
  const maxTokens = opts.maxTokens ?? 1024;
  const models = freeModels(opts.models?.length ? opts.models : [process.env.GEMINI_MODEL, ...GEMINI_DEFAULT_MODELS]);
  const temperature = opts.temperature ?? 0;
  const configs = [
    { temperature, responseMimeType: "application/json", maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "minimal" } },
    { temperature, responseMimeType: "application/json", maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    { temperature, responseMimeType: "application/json", maxOutputTokens: maxTokens * 2 },
  ];
  let note = "";
  for (const model of models) {
    for (const generationConfig of configs) {
      if (!(await acquireGemini(model))) { note = `${note ? `${note},` : ""}${model}:quota`; break; } // 무료 한도 보호 — 다음 모델
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
          signal: controller.signal,
        });
        if (res.status === 404) { note = `${model}:404`; break; } // 모델 이름이 없으면 다음 모델
        if (res.status === 400) { note = `${model}:400`; continue; } // 설정을 모르면 다음 설정
        if (res.status === 429) await blockGemini(model, await res.text().catch(() => ""));
        if (!res.ok) { note = `${note ? `${note},` : ""}${model}:http_${res.status}`; break; } // 503(붐빔)·429(한도) → 다음 모델
        const data = await res.json().catch(() => null);
        const out = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text || "").join("") || "";
        if (!out) { note = `${model}:empty_${data?.candidates?.[0]?.finishReason || "none"}`; continue; }
        return { text: out, note: model };
      } catch (e) {
        return { text: null, note: `${model}:${e instanceof Error && e.name === "AbortError" ? "timeout" : "fetch_error"}` };
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { text: null, note };
}

// ───────────────────────── [2026-10-22 AI 비서 8단계] 도구 호출(function calling) ─────────────────────────
/** 대화 한 칸: role user/model, parts 는 text·inline_data·functionCall·functionResponse */
export type GeminiContent = { role: "user" | "model"; parts: GeminiAnyPart[] };
export type GeminiAnyPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export type GeminiToolDecl = { name: string; description: string; parameters?: Record<string, unknown> };
export type GeminiChatResult = { parts: GeminiAnyPart[] | null; note: string };

/** 도구 선언과 대화 전체를 보내고, 모델이 돌려준 조각(글/도구 호출)을 그대로 받는다. 예외 없음(실패 = parts null + note). */
export async function callGeminiChat(
  contents: GeminiContent[],
  opts: { tools?: GeminiToolDecl[]; systemInstruction?: string; timeoutMs?: number; maxTokens?: number } = {},
): Promise<GeminiChatResult> {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) return { parts: null, note: "no_key" };
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxTokens = opts.maxTokens ?? 1536;
  const models = freeModels([process.env.GEMINI_MODEL, ...GEMINI_DEFAULT_MODELS]);
  const configs = [
    { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "minimal" } },
    { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    { temperature: 0.2, maxOutputTokens: maxTokens * 2 },
  ];
  let note = "";
  for (const model of models) {
    for (const generationConfig of configs) {
      if (!(await acquireGemini(model))) { note = `${note ? `${note},` : ""}${model}:quota`; break; } // 무료 한도 보호 — 다음 모델
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body: Record<string, unknown> = { contents, generationConfig };
        if (opts.systemInstruction) body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
        if (opts.tools && opts.tools.length > 0) body.tools = [{ functionDeclarations: opts.tools }];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.status === 404) { note = `${model}:404`; break; }
        if (res.status === 400) { note = `${model}:400`; continue; }
        if (res.status === 429) await blockGemini(model, await res.text().catch(() => ""));
        if (!res.ok) { note = `${model}:http_${res.status}`; break; }
        const data = await res.json().catch(() => null);
        const parts = (data?.candidates?.[0]?.content?.parts || []) as GeminiAnyPart[];
        if (!parts.length) { note = `${model}:empty_${data?.candidates?.[0]?.finishReason || "none"}`; continue; }
        return { parts, note: model };
      } catch (e) {
        return { parts: null, note: `${model}:${e instanceof Error && e.name === "AbortError" ? "timeout" : "fetch_error"}` };
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { parts: null, note };
}
