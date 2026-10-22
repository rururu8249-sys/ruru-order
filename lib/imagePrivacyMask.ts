// lib/imagePrivacyMask.ts
// [2026-10-22 AI 비서 4단계 보강] 캡처 사진 속 개인정보 자동 가리기 — 순수 판정 함수(브라우저·테스트 공용).
//   글자 인식(OCR)은 브라우저에서 tesseract.js 로 하고, 여기서는 「어떤 글자 상자를 검게 칠할지」만 정한다.
//   가리는 것: 전화번호·계좌번호 같은 숫자 덩어리(4자리 이상), 주소처럼 보이는 줄(시·구·동·로·길 + 숫자, 아파트·호).
//   안 가리는 것(실측 보정 10/22): 날짜 2026.10.18 · 시간 23:17 · 쉼표 금액 29,000 · 「원/개/년/월/일」 바로 앞 숫자 — 가격·날짜는 응대에 필요.
//   못 가리는 것: 이름·닉네임(일반 단어와 구분 불가) — 화면에 안내.

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number; line?: number; confidence?: number };
export type MaskBox = { x0: number; y0: number; x1: number; y1: number; reason: "number" | "address" };

const ADDRESS_WORD = /(특별시|광역시|자치시|자치도|[가-힣]{1,6}(시|군|구)$|[가-힣]{1,8}(동|읍|면|리)$|[가-힣0-9]{1,10}(로|길)$|아파트|빌라|오피스텔|\d+동$|\d+호$|번지)/;
/** 바로 뒤에 이 단위가 붙으면 가격·수량·날짜(OCR 이 「29,000」「원」으로 쪼개 읽는 경우) */
const UNIT_AFTER = /^(원|개|년|월|일|명|장|매|회|%|P|p|포인트)/;

function isPlainNumberWord(text: string): boolean {
  const t = text.trim();
  if (/^\d{1,3}(,\d{3})+원?$/.test(t)) return true; // 쉼표 금액 29,000 · 198,000원
  if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\.?$/.test(t)) return true; // 날짜 2026.10.18
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true; // 시간 23:17
  if (/[년월일원개]$/.test(t) || /^[\d,]+원$/.test(t)) return true; // 2026년 · 10월 · 39,000원 · 2개
  return false;
}

/** 글자 상자들 → 가릴 상자 목록. line 이 있으면 같은 줄 단위로 주소를 판단한다. */
export function pickMaskBoxes(words: OcrWord[]): MaskBox[] {
  const boxes: MaskBox[] = [];
  // ① 숫자 4자리 이상(전화·계좌·주민번호 조각). 날짜·시간·쉼표 금액·단위 앞 숫자는 제외
  words.forEach((w, i) => {
    const digits = w.text.replace(/\D/g, "");
    if (digits.length < 4) return;
    // 털·무늬 사진에서 글자 인식기가 지어낸 숫자(확신도 낮음)는 가리지 않는다(실측 10/22: 버버리 자수 사진 가운데 검은 띠)
    if (typeof w.confidence === "number" && (w.confidence < 40 || (w.confidence < 60 && digits.length < 7))) return;
    if (isPlainNumberWord(w.text)) return;
    const prevWord = words[i - 1];
    if (prevWord && /^(오전|오후)$/.test(prevWord.text.trim()) && digits.length <= 4) return; // 「오전 11:47」을 OCR 이 1147 로 읽어도 시각
    const next = words[i + 1];
    const sameLine = next && (w.line === undefined || next.line === undefined || next.line === w.line);
    if (sameLine && UNIT_AFTER.test(next.text.trim()) && /^[\d,.]+$/.test(w.text.trim())) return;
    boxes.push({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, reason: "number" });
  });
  // ② 주소 줄: 같은 줄에 주소 단어 2개 이상, 또는 주소 단어 1개 + 숫자 단어
  const byLine = new Map<number, OcrWord[]>();
  words.forEach((w, i) => { const k = w.line ?? i; byLine.set(k, [...(byLine.get(k) || []), w]); });
  for (const line of byLine.values()) {
    // 「230으로」「2번으로」 같은 조사 «으로»는 길 이름이 아니다(실측 10/22: 사이즈·횟수가 주소로 가려짐)
    //   OCR 이 「230 으로」로 쪼개면 「으로」 홀로, 「2개면」은 「…면」 — 전부 주소 아님
    const addrCount = line.filter((w) => { const t = w.text.trim(); if (typeof w.confidence === "number" && w.confidence < 50) return false; return ADDRESS_WORD.test(t) && !/(으로|번으로|쪽으로)$/.test(t) && !/^(으로|로|길)$/.test(t) && !/^\d+(개|번|명|장|매|회|켤레)[가-힣]*$/.test(t); }).length;
    // 「15,000원」「1개」 같은 가격·수량은 숫자로 안 쳐서(「우리 15,000원 보냈어요」 줄이 통째로 가려지지 않게)
    const hasNumber = line.some((w, i) => /\d/.test(w.text) && !isPlainNumberWord(w.text) && !(line[i + 1] && UNIT_AFTER.test(line[i + 1].text.trim())));
    if (addrCount >= 2 || (addrCount >= 1 && hasNumber)) {
      const x0 = Math.min(...line.map((w) => w.x0)), y0 = Math.min(...line.map((w) => w.y0));
      const x1 = Math.max(...line.map((w) => w.x1)), y1 = Math.max(...line.map((w) => w.y1));
      boxes.push({ x0, y0, x1, y1, reason: "address" });
    }
  }
  return boxes;
}

/** 전화번호가 OCR 에서 「010 1234 5678」처럼 3단어로 쪼개져도 잡히게, 숫자 단어가 이어지면 한 상자로 */
export function mergeAdjacentNumberWords(words: OcrWord[]): OcrWord[] {
  const out: OcrWord[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    const isNum = /^[\d\-().]+$/.test(w.text.trim()) && /\d/.test(w.text);
    const prevNum = prev ? /^[\d\-().\s]+$/.test(prev.text.trim()) && /\d/.test(prev.text) : false;
    const sameLine = prev && (prev.line === undefined || prev.line === w.line) && Math.abs(prev.y0 - w.y0) < Math.max(8, (prev.y1 - prev.y0) * 0.6);
    const close = prev && w.x0 - prev.x1 < (prev.y1 - prev.y0) * 1.5;
    if (isNum && prevNum && sameLine && close) {
      prev.text = `${prev.text} ${w.text}`;
      prev.x1 = Math.max(prev.x1, w.x1); prev.y0 = Math.min(prev.y0, w.y0); prev.y1 = Math.max(prev.y1, w.y1);
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

/**
 * [10/22 실측] 대화 위에 붙은 작은 주문서 사진 속 계좌번호는 1배로 읽으면 못 잡고, 4배로 키워 조각으로 읽으면 잡힌다.
 * 원본 크기를 받아 「몇 배로 키워 몇 조각으로 읽을지」 정한다. 조각은 40px 겹쳐 글자가 잘리지 않게.
 */
export type OcrStrip = { sy: number; sh: number };
export function ocrStripPlan(width: number, height: number): { scale: number; strips: OcrStrip[] } {
  const scale = Math.max(1, Math.min(4, Math.round((3000 / Math.max(1, width)) * 10) / 10));
  const stripH = Math.max(200, Math.ceil(1200 / scale));
  const overlap = 40;
  const strips: OcrStrip[] = [];
  for (let sy = 0; sy < height; sy += stripH) {
    const sh = Math.min(stripH + overlap, height - sy);
    strips.push({ sy, sh });
    if (sy + sh >= height) break;
  }
  return { scale, strips };
}
