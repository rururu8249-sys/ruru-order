"use client";

// 유튜브 SEO/썸네일 생성기 (독립 툴 페이지)
// - DB 접근 없음: 방송시작/종료, 주문, 입금, 정산, 포인트, 배송 로직과 완전히 무관
// - 템플릿 기반 제목/설명/해시태그/태그 생성 + 유튜브 실시간 연관검색어(클릭 시 SEO 반영) + 캔버스 썸네일(1280x720)
// - ANTHROPIC_API_KEY 설정 시 AI 보강 버튼 활성화 (없어도 전체 기능 동작)

import { useCallback, useEffect, useRef, useState } from "react";

const TITLE_MAX_GOOD = 60;
const TITLE_MAX_WARN = 70;

const FIXED_HASHTAGS = ["#루루동이LIVE", "#라이브쇼핑", "#유튜브라이브"];
const FIXED_TAGS = ["루루동이", "루루동이LIVE", "라이브쇼핑", "라이브커머스"];

const THUMB_BG_PRESETS = [
  { key: "rose", label: "딥로즈", bg: "#7B2D43", bg2: "#45101F", text: "#FFFFFF", accent: "#FFD84D", accentText: "#231200" },
  { key: "black", label: "블랙", bg: "#1F1F26", bg2: "#08080B", text: "#FFFFFF", accent: "#FF5A5A", accentText: "#FFFFFF" },
  { key: "cream", label: "크림", bg: "#F8ECF1", bg2: "#EBCBD8", text: "#3A1220", accent: "#7B2D43", accentText: "#FFFFFF" },
] as const;

type ThumbBgKey = (typeof THUMB_BG_PRESETS)[number]["key"];

type ThumbTemplate = "impact" | "split" | "clean";

const THUMB_TEMPLATES: { key: ThumbTemplate; label: string; desc: string }[] = [
  { key: "impact", label: "포토 임팩트", desc: "사진 풀화면+큰 글씨" },
  { key: "split", label: "반반 스플릿", desc: "좌 텍스트+우 사진" },
  { key: "clean", label: "심플", desc: "중앙 정렬 깔끔형" },
];

function splitTerms(raw: string): string[] {
  return raw
    .split(/[,·、/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function coreLabel(brand: string, item: string): string {
  const b = splitTerms(brand).join("·");
  return [b, item.trim()].filter(Boolean).join(" ");
}

function buildTitles(brand: string, item: string, deal: string, picked: string[]): string[] {
  const core = coreLabel(brand, item);
  const d = deal.trim();
  if (!core) return [];

  const base = [
    `🔥 ${core} LIVE 특가${d ? `｜${d}` : ""}｜루루동이LIVE`,
    `✅ ${core} 판매 LIVE｜인기 상품 특가 방송｜루루동이LIVE`,
    `${core} LIVE🔥${d ? `${d}·` : ""}사이즈·디테일 실시간 안내`,
    `${core} 라이브 특가전 👟 오늘 방송에서만｜루루동이LIVE`,
    d ? `⏰ ${d}｜${core} LIVE｜루루동이LIVE` : "",
  ];

  // 선택한 연관검색어를 제목 앞쪽 키워드로 반영한 후보 추가
  const kwTitles = picked.slice(0, 3).map(
    (kw) => `🔥 ${kw}｜${core} LIVE 특가｜루루동이LIVE`
  );

  return [...kwTitles, ...base].filter(Boolean);
}

function buildHashtags(brand: string, item: string, picked: string[]): string[] {
  const terms = [...splitTerms(brand), ...splitTerms(item), ...picked];
  const tags = terms
    .map((t) => "#" + t.replace(/\s+/g, ""))
    .filter((t) => t.length > 1);
  return Array.from(new Set([...tags, ...FIXED_HASHTAGS])).slice(0, 15);
}

function buildTagString(brand: string, item: string, picked: string[]): string {
  const terms = [...splitTerms(brand), ...splitTerms(item), ...picked, ...FIXED_TAGS];
  return Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean))).join(", ");
}

function buildDescription(brand: string, item: string, deal: string, hashtags: string[]): string {
  const core = coreLabel(brand, item);
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
    "🛒 주문은 여기서 → https://ruru-order.vercel.app/order",
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
  const [tagString, setTagString] = useState("");
  const [generated, setGenerated] = useState(false);

  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [pickedKeywords, setPickedKeywords] = useState<string[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const [copiedKey, setCopiedKey] = useState("");

  // ---------- 썸네일 상태 ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbMain, setThumbMain] = useState("");
  const [thumbBrandLine, setThumbBrandLine] = useState("");
  const [thumbBadge, setThumbBadge] = useState("LIVE 특가");
  const [thumbBg, setThumbBg] = useState<ThumbBgKey>("rose");
  const [thumbImage, setThumbImage] = useState<HTMLImageElement | null>(null);
  const [template, setTemplate] = useState<ThumbTemplate>("impact");
  const [fontsReady, setFontsReady] = useState(false);

  // 썸네일 전용 디자인 폰트 로드 (Black Han Sans=헤드라인, Jua=서브)
  useEffect(() => {
    const id = "ruru-thumb-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Jua&display=swap";
      document.head.appendChild(link);
    }
    let alive = true;
    Promise.all([
      document.fonts.load("400 100px 'Black Han Sans'"),
      document.fonts.load("400 60px 'Jua'"),
    ])
      .then(() => {
        if (alive) setFontsReady(true);
      })
      .catch(() => {
        if (alive) setFontsReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const regenerate = useCallback(
    (picked: string[]) => {
      const tags = buildHashtags(brand, item, picked);
      setTitles(buildTitles(brand, item, deal, picked));
      setHashtags(tags);
      setTagString(buildTagString(brand, item, picked));
      setDescription(buildDescription(brand, item, deal, tags));
    },
    [brand, item, deal]
  );

  const generate = useCallback(() => {
    regenerate(pickedKeywords);
    setGenerated(true);
    // 썸네일 문구 자동 채움 (브랜드 줄 / 메인 줄 분리, 쉼표 → · 정리)
    setThumbMain(item.trim() || splitTerms(brand).join(" · "));
    setThumbBrandLine(splitTerms(brand).join(" · "));
    if (deal.trim()) setThumbBadge(deal.trim());
  }, [regenerate, pickedKeywords, brand, item, deal]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      // clipboard 권한 실패 시 무시 (직접 드래그 복사 가능)
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    // 직접 입력이 있으면 그것만, 없으면 브랜드·아이템을 쉼표로 나눠 "각각" 조회 후 합침
    // (통짜 문자열로 물어보면 맨 앞 브랜드 연관어만 나오는 문제 방지)
    const queries = suggestQuery.trim()
      ? [suggestQuery.trim()]
      : [...splitTerms(brand), ...splitTerms(item)].slice(0, 6);
    if (queries.length === 0) return;

    setSuggestLoading(true);
    try {
      const results = await Promise.all(
        queries.map(async (q) => {
          try {
            const res = await fetch(
              `/api/admin-live/youtube-seo?q=${encodeURIComponent(q)}`
            );
            const data = (await res.json()) as { suggestions?: string[] };
            return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 6) : [];
          } catch {
            return [];
          }
        })
      );
      // 브랜드별 결과를 번갈아 섞어서(라운드로빈) 상위 18개 — 특정 브랜드 쏠림 방지
      const merged: string[] = [];
      const maxLen = Math.max(...results.map((r) => r.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const r of results) {
          if (r[i]) merged.push(r[i]);
        }
      }
      setSuggestions(Array.from(new Set(merged)).slice(0, 18));
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [suggestQuery, brand, item]);

  // 연관검색어 클릭 = 선택/해제 토글 → 제목·태그·해시태그·설명문에 즉시 반영
  const toggleKeyword = useCallback(
    (kw: string) => {
      setPickedKeywords((prev) => {
        const next = prev.includes(kw)
          ? prev.filter((k) => k !== kw)
          : [...prev, kw].slice(0, 5);
        if (generated) regenerate(next);
        return next;
      });
    },
    [generated, regenerate]
  );

  const runAi = useCallback(async () => {
    setAiLoading(true);
    setAiNote("");
    try {
      const res = await fetch("/api/admin-live/youtube-seo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand, item, deal, keywords: pickedKeywords.length ? pickedKeywords : suggestions }),
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
  }, [brand, item, deal, suggestions, pickedKeywords]);

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

  // ---------- 썸네일 그리기 (디자인 템플릿 3종 + 전용 폰트) ----------
  useEffect(() => {
    void fontsReady; // 폰트 로드 완료 시 다시 그리기 위한 의존성

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1280;
    const H = 720;
    const preset = THUMB_BG_PRESETS.find((p) => p.key === thumbBg) || THUMB_BG_PRESETS[0];
    // Black Han Sans = 유튜브 썸네일 표준 헤드라인 폰트
    const HEAD = "'Black Han Sans','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
    const SUB = "'Jua','Apple SD Gothic Neo',sans-serif";

    const brandLine = thumbBrandLine.trim();
    const main = thumbMain.trim() || "상품명을 입력하세요";
    const badge = thumbBadge.trim();

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const drawCover = (x: number, y: number, w: number, h: number) => {
      if (!thumbImage) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "saturate(1.12) contrast(1.06)";
      const scale = Math.max(w / thumbImage.width, h / thumbImage.height);
      const dw = thumbImage.width * scale;
      const dh = thumbImage.height * scale;
      ctx.drawImage(thumbImage, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.filter = "none";
      ctx.restore();
    };

    const livePill = (x: number, y: number) => {
      ctx.save();
      ctx.fillStyle = "#E53935";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      roundRect(ctx, x, y, 168, 64, 32);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(x + 36, y + 32, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `400 36px ${HEAD}`;
      ctx.textBaseline = "middle";
      ctx.fillText("LIVE", x + 56, y + 34);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    };

    if (template === "impact") {
      // ===== 템플릿 1: 포토 임팩트 (사진 풀화면 + 3D 헤드라인 + 스타버스트) =====
      if (thumbImage) {
        drawCover(0, 0, W, H);
        const og = ctx.createLinearGradient(0, H, 0, H * 0.26);
        og.addColorStop(0, "rgba(0,0,0,0.85)");
        og.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = og;
        ctx.fillRect(0, 0, W, H);
        const tg = ctx.createLinearGradient(0, 0, 0, 170);
        tg.addColorStop(0, "rgba(0,0,0,0.45)");
        tg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, 170);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, preset.bg);
        bgGrad.addColorStop(1, preset.bg2);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.arc(W - 110, 110, 300, 0, Math.PI * 2);
        ctx.fill();
      }

      sparkle(ctx, 190, 210, 24, "rgba(255,255,255,0.85)");
      sparkle(ctx, 870, 140, 16, "rgba(255,255,255,0.65)");
      sparkle(ctx, 1215, 440, 13, "rgba(255,255,255,0.5)");

      livePill(56, 48);

      ctx.font = `400 128px ${HEAD}`;
      const lines = computeLines(ctx, main, 1140, 2);
      const lineH = 142;
      const bottomY = H - 58;
      const topY = bottomY - (lines.length - 1) * lineH;

      if (brandLine) {
        highlightBar(ctx, brandLine, 60, topY - 198, `400 44px ${SUB}`, "#FFE14D", "#181000", -0.018, 900);
      }

      lines.forEach((l, idx) => {
        const y = topY + idx * lineH;
        ctx.font = `400 128px ${HEAD}`;
        let size = 128;
        while (size > 40 && ctx.measureText(l).width > 1140) {
          size -= 4;
          ctx.font = `400 ${size}px ${HEAD}`;
        }
        // 3D 오프셋 → 검정 외곽선 → 흰색 본문 (디자이너식 입체 타이포)
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        ctx.fillText(l, 68, y + 10);
        ctx.lineWidth = 22;
        ctx.strokeStyle = "#000000";
        ctx.strokeText(l, 60, y);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(l, 60, y);
      });

      if (badge) {
        if (badge.replace(/\s/g, "").length <= 8) {
          drawStarBadge(ctx, 1104, 172, badge, HEAD);
        } else {
          const bw = measureBar(ctx, badge, `400 48px ${HEAD}`, 620);
          highlightBar(ctx, badge, W - 52 - bw, 88, `400 48px ${HEAD}`, "#FFE14D", "#181000", 0.03, 620);
        }
      }

      // 채널 칩 (우하단)
      ctx.save();
      ctx.font = `400 30px ${SUB}`;
      const cw = ctx.measureText("루루동이LIVE").width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, W - cw - 92, H - 84, cw + 48, 52, 26);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.fillText("루루동이LIVE", W - cw - 68, H - 57);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    } else if (template === "split") {
      // ===== 템플릿 2: 반반 스플릿 (좌 컬러패널+텍스트 / 우 사진, 대각선 컷) =====
      if (thumbImage) {
        drawCover(470, 0, W - 470, H);
      } else {
        const rg = ctx.createLinearGradient(470, 0, W, H);
        rg.addColorStop(0, preset.bg2);
        rg.addColorStop(1, "#141016");
        ctx.fillStyle = rg;
        ctx.fillRect(470, 0, W - 470, H);
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.arc(900, 360, 260, 0, Math.PI * 2);
        ctx.fill();
      }

      // 좌측 패널 (대각선 컷)
      const pg = ctx.createLinearGradient(0, 0, 0, H);
      pg.addColorStop(0, preset.bg);
      pg.addColorStop(1, preset.bg2);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(560, 0);
      ctx.lineTo(470, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // 흰 대각선 스트라이프 (패널-사진 경계)
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.moveTo(560, 0);
      ctx.lineTo(586, 0);
      ctx.lineTo(496, H);
      ctx.lineTo(470, H);
      ctx.closePath();
      ctx.fill();

      // 도트 패턴 (패널 하단 장식)
      ctx.fillStyle = thumbBg === "cream" ? "rgba(123,45,67,0.28)" : "rgba(255,255,255,0.25)";
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          ctx.beginPath();
          ctx.arc(48 + c * 26, H - 168 + r * 26, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      livePill(48, 44);

      if (brandLine) {
        ctx.font = `400 40px ${SUB}`;
        ctx.fillStyle = preset.accent;
        drawTextFit(ctx, brandLine, 48, 212, 420, false);
      }

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = preset.text;
      ctx.font = `400 96px ${HEAD}`;
      const lines = computeLines(ctx, main, 420, 3);
      lines.forEach((l, i) => {
        ctx.font = `400 96px ${HEAD}`;
        let s = 96;
        while (s > 36 && ctx.measureText(l).width > 420) {
          s -= 4;
          ctx.font = `400 ${s}px ${HEAD}`;
        }
        ctx.fillText(l, 48, 322 + i * 106);
      });
      ctx.restore();

      if (badge) {
        highlightBar(ctx, badge, 48, H - 260, `400 44px ${HEAD}`, preset.accent, preset.accentText, -0.02, 380);
      }

      sparkle(ctx, 646, 118, 18, "rgba(255,255,255,0.8)");
      sparkle(ctx, 1198, 596, 14, "rgba(255,255,255,0.6)");

      ctx.font = `400 28px ${SUB}`;
      ctx.fillStyle = preset.text;
      ctx.globalAlpha = 0.85;
      ctx.fillText("루루동이LIVE", 48, H - 40);
      ctx.globalAlpha = 1;
    } else {
      // ===== 템플릿 3: 심플 (중앙 정렬 — 사진은 톤 깔린 배경으로) =====
      if (thumbImage) {
        drawCover(0, 0, W, H);
        ctx.fillStyle = hexToRgba(preset.bg, 0.82);
        ctx.fillRect(0, 0, W, H);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, preset.bg);
        bgGrad.addColorStop(1, preset.bg2);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = thumbBg === "cream" ? "rgba(123,45,67,0.08)" : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(W - 100, 80, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(80, H - 50, 200, 0, Math.PI * 2);
      ctx.fill();

      sparkle(ctx, 160, 150, 18, hexToRgba(preset.accent, 0.8));
      sparkle(ctx, 1120, 560, 15, hexToRgba(preset.accent, 0.6));

      ctx.textAlign = "center";
      const cx = W / 2;

      // 브랜드 칩 (테두리 pill)
      if (brandLine) {
        ctx.save();
        ctx.font = `400 38px ${SUB}`;
        let s = 38;
        while (s > 20 && ctx.measureText(brandLine).width > 760) {
          s -= 2;
          ctx.font = `400 ${s}px ${SUB}`;
        }
        const tw = ctx.measureText(brandLine).width;
        ctx.strokeStyle = preset.accent;
        ctx.lineWidth = 3;
        roundRect(ctx, cx - tw / 2 - 32, 128, tw + 64, 66, 33);
        ctx.stroke();
        ctx.fillStyle = preset.accent;
        ctx.textBaseline = "middle";
        ctx.fillText(brandLine, cx, 163);
        ctx.restore();
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "center";
      }

      ctx.save();
      ctx.shadowColor = thumbBg === "cream" ? "rgba(123,45,67,0.2)" : "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = preset.text;
      ctx.font = `400 116px ${HEAD}`;
      const lines = computeLines(ctx, main, 1100, 2);
      const startY = lines.length > 1 ? 330 : 390;
      lines.forEach((l, i) => {
        ctx.font = `400 116px ${HEAD}`;
        let s = 116;
        while (s > 40 && ctx.measureText(l).width > 1100) {
          s -= 4;
          ctx.font = `400 ${s}px ${HEAD}`;
        }
        ctx.fillText(l, cx, startY + i * 130);
      });
      ctx.restore();
      ctx.textAlign = "center";

      if (badge) {
        const bw = measureBar(ctx, badge, `400 50px ${HEAD}`, 800);
        ctx.textAlign = "left";
        highlightBar(ctx, badge, cx - bw / 2, 540, `400 50px ${HEAD}`, preset.accent, preset.accentText, -0.012, 800);
        ctx.textAlign = "center";
      }

      ctx.font = `400 30px ${SUB}`;
      ctx.fillStyle = preset.text;
      ctx.globalAlpha = 0.8;
      ctx.fillText("루루동이LIVE", cx, H - 42);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  }, [thumbMain, thumbBrandLine, thumbBadge, thumbBg, thumbImage, template, fontsReady]);

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
              placeholder="브랜드 (예: 룰루레몬,ALO)"
              className={inputCls}
            />
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="아이템 (예: 레깅스)"
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
            {/* 연관검색어 (제목보다 위 — 먼저 골라서 제목에 반영하는 순서) */}
            <div>
              <h2 className="text-xl font-black">실시간 연관검색어</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">
                조회 후 칩을 클릭하면 제목·태그·해시태그에 자동 반영됩니다 (최대 5개).
              </p>
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
                {suggestions.map((s) => {
                  const picked = pickedKeywords.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleKeyword(s)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                        picked
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      }`}
                      title={picked ? "클릭하면 반영 해제" : "클릭하면 제목·태그에 반영"}
                    >
                      {picked ? "✓ " : "+ "}
                      {s}
                    </button>
                  );
                })}
                {suggestions.length === 0 && (
                  <p className="text-xs font-bold text-slate-400">
                    조회하면 지금 유튜브에서 사람들이 검색하는 연관어가 표시됩니다.
                  </p>
                )}
              </div>
            </div>

            {/* 제목 후보 */}
            <div className="mt-6">
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
            </div>

            {/* 설명문 */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">설명문</h2>
                <button onClick={() => copyText("desc", description)} className={btnGhost}>
                  {copiedKey === "desc" ? "복사됨✓" : "전체 복사"}
                </button>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-400">
                해시태그가 맨 아래에 이미 포함돼 있습니다 — 이대로 유튜브 설명란에 붙여넣으면 끝.
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={12}
                className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-sm font-bold leading-relaxed outline-none focus:border-blue-500"
                placeholder="생성하기를 누르면 검증된 형식의 설명문이 만들어집니다."
              />
            </div>

            {/* 태그 (유튜브 태그 입력칸용) */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">태그 (유튜브 태그 입력칸용)</h2>
                <button onClick={() => copyText("tagstr", tagString)} className={btnGhost}>
                  {copiedKey === "tagstr" ? "복사됨✓" : "복사"}
                </button>
              </div>
              <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                {tagString || "생성하기를 누르면 쉼표로 나열된 태그가 만들어집니다."}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                유튜브 스튜디오 → 세부정보 → 태그 칸에 통째로 붙여넣으세요.
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
                value={thumbBrandLine}
                onChange={(e) => setThumbBrandLine(e.target.value)}
                placeholder="브랜드 줄 (예: 휴먼메이드 · APC · 꼼데)"
                className={inputCls}
              />
              <input
                value={thumbMain}
                onChange={(e) => setThumbMain(e.target.value)}
                placeholder="메인 문구 — 크게 들어감 (예: 반팔 특가전)"
                className={inputCls}
              />
              <input
                value={thumbBadge}
                onChange={(e) => setThumbBadge(e.target.value)}
                placeholder="특가 배지 (예: 오늘만 59,000원)"
                className={inputCls}
              />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-500">템플릿:</span>
                {THUMB_TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTemplate(t.key)}
                    title={t.desc}
                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                      template === t.key
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

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
                팁: 사진을 올리면 화면 전체를 꽉 채우고, 하단이 어두워지면서 흰 글씨+검정
                외곽선이 올라갑니다(유튜브 썸네일 표준). 사장님 얼굴+상품이 같이 나온 사진이
                클릭률이 가장 높습니다. 사진 없이 쓰면 그라데이션 배경 템플릿으로 나옵니다.
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

// 폭이 넘치면 글자 크기를 줄여서 한 줄에 맞춰 그림 (stroke=true면 검정 외곽선 먼저)
function drawTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  stroke: boolean
) {
  const original = ctx.font;
  let size = parseInt(original.match(/(\d+)px/)?.[1] || "40", 10);
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = original.replace(/\d+px/, `${size}px`);
  }
  if (stroke) ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.font = original;
}

// 자동 줄바꿈 계산 (최대 maxLines줄, 그리지는 않음)
function computeLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [text];
}

// 4꼭지 반짝이 장식
function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
  ctx.restore();
}

// 스타버스트(톱니 원) 경로
function starburstPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  points: number
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / points;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// 빨간 스타버스트 특가 스티커 (짧은 문구용)
function drawStarBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  headFont: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.1);

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  starburstPath(ctx, 0, 0, 148, 112, 14);
  ctx.fillStyle = "#FF3B30";
  ctx.fill();
  ctx.shadowColor = "transparent";

  starburstPath(ctx, 0, 0, 130, 99, 14);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const words = text.split(" ");
  const lines =
    words.length > 1
      ? [
          words.slice(0, Math.ceil(words.length / 2)).join(" "),
          words.slice(Math.ceil(words.length / 2)).join(" "),
        ].filter(Boolean)
      : [text];

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const baseSize = lines.some((l) => l.length > 5) ? 40 : 48;
  lines.forEach((l, i) => {
    let s = baseSize;
    ctx.font = `400 ${s}px ${headFont}`;
    while (s > 22 && ctx.measureText(l).width > 185) {
      s -= 2;
      ctx.font = `400 ${s}px ${headFont}`;
    }
    ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * (baseSize + 8));
  });

  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// 색 박스 위 텍스트 (하이라이트 바) — 살짝 기울여 디자인 포인트
function highlightBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  bg: string,
  fg: string,
  rot: number,
  maxTextW: number
) {
  ctx.save();
  ctx.font = font;
  let size = parseInt(font.match(/(\d+)px/)?.[1] || "46", 10);
  while (size > 18 && ctx.measureText(text).width > maxTextW) {
    size -= 2;
    ctx.font = font.replace(/\d+px/, `${size}px`);
  }
  const tw = ctx.measureText(text).width;
  const h = Math.round(size * 1.7);

  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = bg;
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  roundRect(ctx, 0, 0, tw + 56, h, Math.min(18, h / 3));
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 28, h / 2 + 2);
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// 하이라이트 바 폭 사전 계산 (가운데/우측 정렬 배치용)
function measureBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxTextW: number
): number {
  const prev = ctx.font;
  ctx.font = font;
  let size = parseInt(font.match(/(\d+)px/)?.[1] || "46", 10);
  while (size > 18 && ctx.measureText(text).width > maxTextW) {
    size -= 2;
    ctx.font = font.replace(/\d+px/, `${size}px`);
  }
  const w = ctx.measureText(text).width + 56;
  ctx.font = prev;
  return w;
}

// #RRGGBB → rgba()
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
