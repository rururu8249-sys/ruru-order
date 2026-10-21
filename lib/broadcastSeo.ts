// lib/broadcastSeo.ts
// [2026-10-22 AI 비서 6단계] 유튜브 방송 SEO — 그날 방송에 담은 상품으로 제목 3개·설명란·태그, 「소개」 기록으로 다시보기 챕터(순수 함수).
//   - AI(Gemini)는 제목·설명·태그 «문장»만 만든다. 챕터(시각)는 우리 서버가 chat_current_product 기록으로 계산한다.
//   - 상품명·가격만 보내고 손님 정보는 보내지 않는다. 돈·주문 무접촉.

export type SeoProduct = { name: string; price: number; category: string };
export type Chapter = { seconds: number; label: string };
export type SeoResult = { titles: string[]; description: string; tags: string[] };

const KST = 9 * 3600 * 1000;

export function kstDateLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + KST);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 「소개」 기록(set_at·product_name·cleared) → 유튜브 챕터. 같은 상품 연속은 합치고, 10초 미만 간격은 건너뛴다(유튜브 규칙: 00:00 시작·10초 이상). */
export function buildChapters(
  startedAtIso: string,
  endedAtIso: string | null,
  records: { set_at: string; product_name: string | null; detail_name?: string | null; cleared?: boolean | null }[],
): Chapter[] {
  const start = Date.parse(startedAtIso);
  if (!Number.isFinite(start)) return [];
  const end = endedAtIso ? Date.parse(endedAtIso) : Number.POSITIVE_INFINITY;
  const inRange = [...records]
    .filter((r) => { const t = Date.parse(r.set_at); return Number.isFinite(t) && t >= start && t <= end; })
    .sort((a, b) => Date.parse(a.set_at) - Date.parse(b.set_at));
  const out: Chapter[] = [{ seconds: 0, label: "오프닝" }];
  let lastLabel = "";
  for (const r of inRange) {
    if (r.cleared) continue;
    const label = [String(r.product_name || "").trim(), String(r.detail_name || "").trim()].filter(Boolean).join(" ");
    if (!label || label === lastLabel) continue;
    const seconds = Math.floor((Date.parse(r.set_at) - start) / 1000);
    const prev = out[out.length - 1];
    if (seconds - prev.seconds < 10) {
      // 10초 안에 바뀐 건 앞 챕터를 이 상품으로 교체(단 오프닝은 유지)
      if (prev.seconds === 0) continue;
      prev.label = label;
    } else {
      out.push({ seconds, label });
    }
    lastLabel = label;
  }
  return out.length >= 3 ? out : out; // 3개 미만이면 유튜브가 챕터로 안 쓰지만 목록은 그대로 보여 준다
}

export function chapterTime(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function chaptersText(chapters: Chapter[]): string {
  return chapters.map((c) => `${chapterTime(c.seconds)} ${c.label}`).join("\n");
}

export function seoPrompt(opts: { channel: string; title: string; dateLabel: string; products: SeoProduct[]; extra: string }): string {
  const list = opts.products.slice(0, 60).map((p) => `- ${p.name}${p.category ? ` (${p.category})` : ""}${p.price > 0 ? ` ${p.price.toLocaleString("ko-KR")}원` : ""}`).join("\n");
  return `너는 유튜브 라이브 쇼핑 채널 「${opts.channel}」의 SEO 담당자다. 아래 방송 정보로 유튜브에 올릴 제목·설명·태그를 JSON 으로만 만든다.
모양: {"titles":["제목1","제목2","제목3"],"description":"설명란 글(줄바꿈 \\n 포함)","tags":["태그1","태그2",...]}
- 제목 3개: 각 60자 안, 검색에 잘 걸리게 핵심 상품·브랜드·「라이브」「라방」「특가」 같은 말 섞기, 서로 다른 스타일(상품 나열형 / 혜택 강조형 / 궁금증형). 낚시성 과장·없는 혜택 금지.
- 설명란: 첫 두 줄에 핵심 요약(검색 결과에 보임), 그 다음 판매 상품 목록(줄마다 「· 상품명 가격」), 주문 방법 한 줄(「주문은 고정 댓글 주문서 링크로」), 해시태그 5~8개. 400~900자.
- 태그: 15~25개, 한국어 위주(브랜드·상품 종류·「라이브커머스」「쇼핑라이브」 등), 쉼표 없이 배열로.
- 손님 이름·전화번호는 절대 넣지 않는다. 설명 없이 JSON 하나만.

채널: ${opts.channel}
방송 제목: ${opts.title}
방송 날짜: ${opts.dateLabel}
${opts.extra ? `사장님 메모: ${opts.extra}\n` : ""}판매 상품:
${list || "(상품 없음)"}`;
}

export function parseSeoJson(text: string): SeoResult | null {
  try {
    const body = String(text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body) as { titles?: unknown; description?: unknown; tags?: unknown };
    const titles = (Array.isArray(obj.titles) ? obj.titles : []).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 3);
    const description = String(obj.description ?? "").trim().slice(0, 4000);
    const tags = [...new Set((Array.isArray(obj.tags) ? obj.tags : []).map((t) => String(t ?? "").replace(/^#/, "").trim()).filter(Boolean))].slice(0, 30);
    if (titles.length === 0 || !description) return null;
    return { titles, description, tags };
  } catch {
    return null;
  }
}

/** AI 없이 만드는 기본 제목·설명·태그(상품명 나열) */
export function seoByRule(opts: { channel: string; title: string; dateLabel: string; products: SeoProduct[] }): SeoResult {
  const names = opts.products.map((p) => p.name).filter(Boolean);
  const top = names.slice(0, 3).join(" · ");
  const cats = [...new Set(opts.products.map((p) => p.category).filter(Boolean))];
  const titles = [
    `${opts.title || "라이브 판매"} | ${top}${names.length > 3 ? ` 외 ${names.length - 3}개` : ""}`,
    `[${opts.channel}] ${opts.dateLabel} 라이브 특가 — ${top}`,
    `${top} 라방에서만 이 가격! ${opts.channel} 라이브`,
  ].map((t) => t.slice(0, 100));
  const lines = [
    `${opts.channel} ${opts.dateLabel} 라이브 방송입니다.`,
    `이번 방송 상품: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` 외 ${names.length - 5}개` : ""}`,
    "",
    ...opts.products.map((p) => `· ${p.name}${p.price > 0 ? ` ${p.price.toLocaleString("ko-KR")}원` : ""}`),
    "",
    "주문은 고정 댓글의 주문서 링크로 해 주세요.",
    "",
    ["#라이브커머스", "#쇼핑라이브", "#라방", ...cats.map((c) => `#${c.replace(/\s+/g, "")}`)].slice(0, 8).join(" "),
  ];
  const tags = [...new Set(["라이브커머스", "쇼핑라이브", "라방", opts.channel, ...cats, ...names.map((n) => n.split(/\s+/)[0])])].filter(Boolean).slice(0, 25);
  return { titles, description: lines.join("\n"), tags };
}
