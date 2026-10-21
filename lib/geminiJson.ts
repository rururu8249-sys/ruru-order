// lib/geminiJson.ts
// [2026-10-22 AI 비서] Gemini(무료) 호출 한 곳 — 「JSON 글자」만 받아 온다. 서버 전용(GEMINI_API_KEY).
//   - 모델: 2026-10 Google 목록 기준(2.5 계열은 「예전 사용자만」, 2.0 은 종료). 가벼운 Lite 먼저, 붐비면 다음 모델.
//   - «생각» 토큰 때문에 답이 비지 않게 thinkingLevel(3 계열)·thinkingBudget(2.5 계열)을 차례로, 모르는 설정(400)이면 다음.
//   - 어떤 경우에도 예외를 던지지 않는다: 실패하면 text=null + note(이유, 비밀값 없음).
export type GeminiJsonResult = { text: string | null; note: string };

export async function callGeminiJson(prompt: string, opts: { timeoutMs?: number; maxTokens?: number } = {}): Promise<GeminiJsonResult> {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) return { text: null, note: "no_key" };
  const timeoutMs = opts.timeoutMs ?? 6000;
  const maxTokens = opts.maxTokens ?? 1024;
  const models = [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest"].filter(Boolean) as string[];
  const configs = [
    { temperature: 0, responseMimeType: "application/json", maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "minimal" } },
    { temperature: 0, responseMimeType: "application/json", maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    { temperature: 0, responseMimeType: "application/json", maxOutputTokens: maxTokens * 2 },
  ];
  let note = "";
  for (const model of models) {
    for (const generationConfig of configs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }),
          signal: controller.signal,
        });
        if (res.status === 404) { note = `${model}:404`; break; } // 모델 이름이 없으면 다음 모델
        if (res.status === 400) { note = `${model}:400`; continue; } // 설정을 모르면 다음 설정
        if (!res.ok) { note = `${model}:http_${res.status}`; break; } // 503(붐빔)·429(한도) → 다음 모델
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
