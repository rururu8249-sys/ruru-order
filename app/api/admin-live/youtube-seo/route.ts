// 유튜브 SEO 생성기 보조 API (DB 접근 없음 · 돈/입금/정산/배송 로직과 무관)
// GET  ?q=키워드  → 유튜브 자동완성 연관검색어 (실시간)
// POST { brand, item, deal }  → Claude API로 제목/설명 보강 (ANTHROPIC_API_KEY 없으면 ok:false 반환)

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim();

  if (!q) {
    return Response.json({ ok: true, suggestions: [] });
  }

  try {
    const url =
      "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=ko&gl=kr&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // 자동완성은 실시간 데이터라 캐시하지 않음
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ ok: false, suggestions: [] });
    }

    const data = (await res.json()) as unknown;
    const suggestions =
      Array.isArray(data) && Array.isArray(data[1])
        ? (data[1] as unknown[]).map((v) => String(v)).slice(0, 10)
        : [];

    return Response.json({ ok: true, suggestions });
  } catch {
    return Response.json({ ok: false, suggestions: [] });
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // 키 미설정이어도 에러가 아니라 "AI 꺼짐" 상태로 응답 → 페이지는 템플릿 결과 사용
    return Response.json({ ok: false, reason: "NO_API_KEY" });
  }

  try {
    const body = (await request.json()) as {
      brand?: string;
      item?: string;
      deal?: string;
      keywords?: string[];
    };

    const brand = String(body.brand || "").slice(0, 100);
    const item = String(body.item || "").slice(0, 100);
    const deal = String(body.deal || "").slice(0, 100);
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k) => String(k)).slice(0, 10)
      : [];

    const prompt = [
      "당신은 유튜브 라이브커머스 SEO 전문가입니다.",
      "채널: 루루동이LIVE (여성 35~54세 대상, 패션/신발/명품 라이브 판매)",
      "검증된 제목 패턴: 브랜드+아이템+LIVE 특가｜루루동이LIVE",
      "",
      `브랜드: ${brand}`,
      `아이템: ${item}`,
      `특가/포인트: ${deal}`,
      keywords.length ? `실시간 연관검색어: ${keywords.join(", ")}` : "",
      "",
      "위 정보로 유튜브 라이브 방송용 SEO를 만들어주세요.",
      "규칙: 제목은 60자 이내, 핵심 키워드를 앞쪽에, 이모지 1~2개.",
      "반드시 아래 JSON 형식으로만 답하세요:",
      '{"titles":["제목1","제목2","제목3"],"description":"설명문(방송 소개 3~4문장, 키워드 포함)","hashtags":["#태그1","#태그2"]}',
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({ ok: false, reason: "AI_ERROR" });
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.find((c) => c.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return Response.json({ ok: false, reason: "AI_PARSE_ERROR" });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      titles?: string[];
      description?: string;
      hashtags?: string[];
    };

    return Response.json({
      ok: true,
      titles: Array.isArray(parsed.titles) ? parsed.titles.slice(0, 5) : [],
      description: String(parsed.description || ""),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 15) : [],
    });
  } catch {
    return Response.json({ ok: false, reason: "AI_ERROR" });
  }
}
