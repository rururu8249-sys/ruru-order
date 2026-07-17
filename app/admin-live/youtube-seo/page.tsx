"use client";

// 유튜브 SEO/썸네일 생성기 (독립 툴 페이지)
// - DB 접근 없음: 방송시작/종료, 주문, 입금, 정산, 포인트, 배송 로직과 완전히 무관
// - 템플릿 기반 제목/설명/해시태그 생성 + 유튜브 실시간 연관검색어 + 캔버스 썸네일(1280x720)
// - ANTHROPIC_API_KEY 설정 시 AI 보강 버튼 활성화 (없어도 전체 기능 동작)

import { useCallback, useEffect, useRef, useState } from "react";

const TITLE_MAX_GOOD = 60;
const TITLE_MAX_WARN = 70;

const FIXED_HASHTAGS = ["#루루동이LIVE", "#라이브쇼핑", "#유튜브라이브"];

const THUMB_BG_PRESETS = [
  { key: "rose", label: "딥로즈", bg: "#7B2D43", text: "#FFFFFF", accent: "#FFD84D" },
  { key: "black", label: "블랙", bg: "#111111", text: "#FFFFFF", accent: "#FF5A5A" },
  { key: "cream", label: "크림", bg: "#F5E6EB", text: "#3A1220", accent: "#7B2D43" },
] as const;

type ThumbBgKey = (typeof THUMB_BG_PRESETS)[number]["key"];

function splitTerms(raw: string): string[] {
  return raw
    .split(/[,·、/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTitles(brand: string, item: string, deal: string): string[] {
  const b = brand.trim();
  const i = item.trim();
  const d = deal.trim();
  if (!b && !i) return [];

  const core = [b, i].filter(Boolean).join(" ");
  const titles = [
    `🔥 ${core} LIVE 특가${d ? `｜${d}` : ""}｜루루동이LIVE`,
    `✅ ${core} 판매 LIVE｜인기 상품 특가 방송｜루루동이LIVE`,
    `${core} LIVE🔥${d ? `${d}·` : ""}사이즈·디테일 실시간 안내`,
    `${core} 라이브 특가전 👟 오늘 방송에서만｜루루동이LIVE`,
    d ? `⏰ ${d}｜${core} LIVE｜루루동이LIVE` : "",
  ];
  return titles.filter(Boolean);
}

function buildDescription(brand: string, item: string, deal: string, hashtags: string[]): string {
  const core = [brand.trim(), item.trim()].filter(Boolean).join(" ");
  return [
    `${core}을(를) 라이브 특가로 소개해드립니다✨`,
    deal.trim() ? `오늘 방송 포인트: ${deal.trim()}` : "",
    "",
    `✅ ${core} 실물 디테일·사이즈 실시간 안내`,
    "✅ 방송 중 한정수량 특가 진행",
    "✅ 인기 상품은 조기 품절될 수 있습니다",
    "✅ 구매 전 방송 안내사항을 꼭 확인해 주세요",
    "",
    "📌 주문 방법",
    "방송 중 안내되는 주문 방법을 확인해 주세요.",
    "유튜브 닉네임과 사이트 닉네임은 동일하게 맞춰주세요.",
    "",
    "💬 카톡채널 문의 https://pf.kakao.com/_RMxaqX",
    "🚚 배송공지 밴드 https://band.us/@ruru8249",
    "",
    "🔔 구독과 알림 설정을 해두시면 다음 방송도 빠르게 확인하실 수 있습니다.",
    "",
    hashtags.join(" "),
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");
}

function buildHashtags(brand: string, item: string): string[] {
  const terms = [...splitTerms(brand), ...splitTerms(item)];
  const tags = terms
    .map((t) => "#" + t.replace(/\s+/g, ""))
    .filter((t) => t.length > 1);
  const merged = [...tags, ...FIXED_HASHTAGS];
  return Array.from(new Set(merged)).slice(0, 12);
}

function titleCountColor(len: number): string {
  if (len <= TITLE_MAX_GOOD) return "text-emerald-600";
  if (len <= TITLE_MAX_WARN) return "text-amber-600";
  return "text-red-600";
}

export default function YoutubeSeoPage() {
  const [brand, setBrand] = useState("");
  const [item, setItem] = useState("");
  const [deal, setDeal] = useState("");

  const [titles, setTitles] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);

  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const [copiedKey, setCopiedKey] = useState("");

  // ---------- 썸네일 상태 ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbLine1, setThumbLine1] = useState("");
  const [thumbLine2, setThumbLine2] = useState("");
  const [thumbBadge, setThumbBadge] = useState("LIVE 특가");
  const [thumbBg, setThumbBg] = useState<ThumbBgKey>("rose");
  const [thumbImage, setThumbImage] = useState<HTMLImageElement | null>(null);

  const generate = useCallback(() => {
    const tags = buildHashtags(brand, item);
    setTitles(buildTitles(brand, item, deal));
    setHashtags(tags);
    setDescription(buildDescription(brand, item, deal, tags));
    if (!thumbLine1) setThumbLine1([brand, item].filter(Boolean).join(" "));
    if (deal && thumbBadge === "LIVE 특가") setThumbBadge(deal);
  }, [brand, item, deal, thumbLine1, thumbBadge]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      // clipboard 권한 실패 시 무시 (사용자가 직접 드래그 복사 가능)
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    const q = suggestQuery.trim() || [brand, item].filter(Boolean).join(" ");
    if (!q) return;
    setSuggestLoading(true);
    try {
      const res = await fetch(
        `/api/admin-live/youtube-seo?q=${encodeURIComponent(q)}`
      );
      const data = (await res.json()) as { suggestions?: string[] };
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [suggestQuery, brand, item]);

  const runAi = useCallback(async () => {
    setAiLoading(true);
    setAiNote("");
    try {
      const res = await fetch("/api/admin-live/youtube-seo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand, item, deal, keywords: suggestions }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        titles?: string[];
        description?: string;
        hashtags?: string[];
      };

      if (!data.ok) {
        setAiNote(
          data.reason === "NO_API_KEY"
            ? "AI 미설정 상태입니다 (Vercel 환경변수 ANTHROPIC_API_KEY 등록 시 활성화). 템플릿 결과를 사용하세요."
            : "AI 생성에 실패했습니다. 템플릿 결과를 사용하세요."
        );
        return;
      }

      if (data.titles?.length) setTitles((prev) => [...data.titles!, ...prev].slice(0, 8));
      if (data.hashtags?.length) {
        setHashtags((prev) => Array.from(new Set([...prev, ...data.hashtags!])).slice(0, 15));
      }
      if (data.description) {
        setDescription((prev) => data.description + "\n\n" + prev);
      }
      setAiNote("AI 보강 완료 — 제목 후보 맨 위에 추가됐습니다.");
    } catch {
      setAiNote("AI 생성에 실패했습니다. 템플릿 결과를 사용하세요.");
    } finally {
      setAiLoading(false);
    }
  }, [brand, item, deal, suggestions]);

  const onThumbImageChange = useCallback((file: File | null) => {
    if (!file) {
      setThumbImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setThumbImage(img);
    img.src = url;
  }, []);

  // ---------- 썸네일 그리기 ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1280;
    const H = 720;
    const preset = THUMB_BG_PRESETS.find((p) => p.key === thumbBg) || THUMB_BG_PRESETS[0];

    // 배경
    ctx.fillStyle = preset.bg;
    ctx.fillRect(0, 0, W, H);

    // 우측 이미지 영역
    if (thumbImage) {
      const areaX = 640;
      const areaW = 640;
      const scale = Math.max(areaW / thumbImage.width, H / thumbImage.height);
      const dw = thumbImage.width * scale;
      const dh = thumbImage.height * scale;
      const dx = areaX + (areaW - dw) / 2;
      const dy = (H - dh) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(areaX, 0, areaW, H);
      ctx.clip();
      ctx.drawImage(thumbImage, dx, dy, dw, dh);
      // 좌측 그라데이션으로 텍스트 영역과 자연스럽게 연결
      const grad = ctx.createLinearGradient(areaX, 0, areaX + 220, 0);
      grad.addColorStop(0, preset.bg);
      grad.addColorStop(1, preset.bg + "00");
      ctx.fillStyle = grad;
      ctx.fillRect(areaX, 0, 220, H);
      ctx.restore();
    }

    const fontStack =
      "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

    // LIVE 배지
    ctx.fillStyle = "#E53935";
    const badgeY = 64;
    roundRect(ctx, 64, badgeY, 150, 62, 16);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `900 38px ${fontStack}`;
    ctx.textBaseline = "middle";
    ctx.fillText("LIVE", 92, badgeY + 34);

    // 메인 문구 (2줄까지 자동 줄바꿈)
    ctx.fillStyle = preset.text;
    ctx.font = `900 88px ${fontStack}`;
    const line1 = thumbLine1.trim() || "브랜드 아이템";
    wrapText(ctx, line1, 64, 240, 560, 100, 2);

    // 서브 문구
    if (thumbLine2.trim()) {
      ctx.font = `800 46px ${fontStack}`;
      ctx.fillStyle = preset.text + "CC";
      wrapText(ctx, thumbLine2.trim(), 64, 468, 560, 58, 2);
    }

    // 특가 배지
    if (thumbBadge.trim()) {
      ctx.font = `900 52px ${fontStack}`;
      const tw = ctx.measureText(thumbBadge.trim()).width;
      ctx.fillStyle = preset.accent;
      roundRect(ctx, 64, 580, tw + 64, 84, 20);
      ctx.fill();
      ctx.fillStyle = preset.key === "cream" ? "#FFFFFF" : "#1A1A1A";
      ctx.fillText(thumbBadge.trim(), 96, 580 + 45);
    }

    // 채널명
    ctx.font = `900 34px ${fontStack}`;
    ctx.fillStyle = preset.text;
    ctx.textAlign = "right";
    ctx.fillText("루루동이LIVE", W - 40, H - 44);
    ctx.textAlign = "left";
  }, [thumbLine1, thumbLine2, thumbBadge, thumbBg, thumbImage]);

  const downloadThumb = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `thumbnail_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, []);

  const inputCls =
    "h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50";
  const btnPrimary =
    "h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-40";
  const btnGhost =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50";

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-950">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black tracking-[0.18em] text-blue-600">
                DB SAFE TOOL
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.05em]">
                유튜브 SEO · 썸네일 생성기
              </h1>
              <p className="mt-2 text-sm font-bold text-slate-500">
                이 페이지는 방송시작/종료, 주문, 입금, 정산 DB를 전혀 수정하지 않습니다.
              </p>
            </div>
            <a
              href="/admin-live"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              ← 컨트롤타워로 돌아가기
            </a>
          </div>

          {/* 입력 */}
          <div className="mt-5 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_1fr_150px]">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="브랜드 (예: 룰루레몬·ALO)"
              className={inputCls}
            />
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="아이템 (예: 레깅스·탑·팬츠)"
              className={inputCls}
            />
            <input
              value={deal}
              onChange={(e) => setDeal(e.target.value)}
              placeholder="특가 포인트 (예: 오늘만 59,000원)"
              className={inputCls}
            />
            <button onClick={generate} className={btnPrimary}>
              생성하기
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* 좌: SEO 결과 */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">제목 후보</h2>
              <button onClick={runAi} disabled={aiLoading} className={btnGhost}>
                {aiLoading ? "AI 생성 중..." : "🤖 AI 보강"}
              </button>
            </div>
            {aiNote && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {aiNote}
              </p>
            )}
            <div className="mt-3 grid gap-2">
              {titles.length === 0 && (
                <p className="text-sm font-bold text-slate-400">
                  브랜드·아이템 입력 후 생성하기를 눌러주세요.
                </p>
              )}
              {titles.map((t, i) => (
                <div
                  key={`${i}-${t}`}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{t}</p>
                    <p className={`text-xs font-bold ${titleCountColor(t.length)}`}>
                      {t.length}자 {t.length > TITLE_MAX_GOOD ? "· 60자 이내 권장" : ""}
                    </p>
                  </div>
                  <button onClick={() => copyText(`title-${i}`, t)} className={btnGhost}>
                    {copiedKey === `title-${i}` ? "복사됨✓" : "복사"}
                  </button>
                </div>
              ))}
            </div>

            {/* 연관검색어 */}
            <div className="mt-6">
              <h2 className="text-xl font-black">실시간 연관검색어</h2>
              <div className="mt-2 flex gap-2">
                <input
                  value={suggestQuery}
                  onChange={(e) => setSuggestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchSuggestions()}
                  placeholder="키워드 (비우면 브랜드+아이템으로 검색)"
                  className={inputCls}
                />
                <button
                  onClick={fetchSuggestions}
                  disabled={suggestLoading}
                  className={btnPrimary}
                >
                  {suggestLoading ? "..." : "조회"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => copyText(`sug-${s}`, s)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
                    title="클릭하면 복사됩니다"
                  >
                    {copiedKey === `sug-${s}` ? "복사됨✓" : s}
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <p className="text-xs font-bold text-slate-400">
                    조회하면 지금 유튜브에서 사람들이 검색하는 연관어가 표시됩니다.
                  </p>
                )}
              </div>
            </div>

            {/* 설명문 */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">설명문</h2>
                <button onClick={() => copyText("desc", description)} className={btnGhost}>
                  {copiedKey === "desc" ? "복사됨✓" : "전체 복사"}
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={12}
                className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-sm font-bold leading-relaxed outline-none focus:border-blue-500"
                placeholder="생성하기를 누르면 검증된 형식의 설명문이 만들어집니다."
              />
            </div>

            {/* 해시태그 */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">해시태그</h2>
                <button
                  onClick={() => copyText("tags", hashtags.join(" "))}
                  className={btnGhost}
                >
                  {copiedKey === "tags" ? "복사됨✓" : "전체 복사"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600"
                  >
                    {h}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs font-bold text-slate-400">
                제목 위에는 앞 3개만 노출됩니다. 전체는 설명문 맨 아래에 붙여 넣으세요.
              </p>
            </div>
          </section>

          {/* 우: 썸네일 */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">썸네일 (1280×720)</h2>
              <button onClick={downloadThumb} className={btnPrimary}>
                PNG 다운로드
              </button>
            </div>

            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="mt-3 w-full rounded-2xl border border-slate-200"
            />

            <div className="mt-4 grid gap-2">
              <input
                value={thumbLine1}
                onChange={(e) => setThumbLine1(e.target.value)}
                placeholder="메인 문구 (예: 룰루레몬 특가)"
                className={inputCls}
              />
              <input
                value={thumbLine2}
                onChange={(e) => setThumbLine2(e.target.value)}
                placeholder="서브 문구 (예: 레깅스·탑·팬츠 한번에)"
                className={inputCls}
              />
              <input
                value={thumbBadge}
                onChange={(e) => setThumbBadge(e.target.value)}
                placeholder="특가 배지 (예: 오늘만 59,000원)"
                className={inputCls}
              />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-500">배경:</span>
                {THUMB_BG_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setThumbBg(p.key)}
                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                      thumbBg === p.key
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <label className={`${btnGhost} cursor-pointer`}>
                  사진 업로드 (상품/얼굴)
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onThumbImageChange(e.target.files?.[0] || null)}
                  />
                </label>
                {thumbImage && (
                  <button onClick={() => setThumbImage(null)} className={btnGhost}>
                    사진 제거
                  </button>
                )}
              </div>

              <p className="text-xs font-bold text-slate-400">
                팁: 얼굴이 들어간 썸네일이 클릭률이 더 높습니다. 사진은 우측 절반에 배치됩니다.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

// ---------- 캔버스 유틸 ----------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      lineCount++;
      if (lineCount >= maxLines) return;
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}
