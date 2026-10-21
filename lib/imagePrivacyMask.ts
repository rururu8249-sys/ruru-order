// lib/imagePrivacyMask.ts
// [2026-10-22 AI 비서 4단계 보강] 캡처 사진 속 개인정보 자동 가리기 — 순수 판정 함수(브라우저·테스트 공용).
//   글자 인식(OCR)은 브라우저에서 tesseract.js 로 하고, 여기서는 「어떤 글자 상자를 검게 칠할지」만 정한다.
//   가리는 것: 전화번호·계좌번호 같은 숫자 덩어리(4자리 이상), 주소처럼 보이는 줄(시·구·동·로·길 + 숫자, 아파트·호).
//   못 가리는 것: 이름·닉네임(일반 단어와 구분 불가) — 화면에 안내.

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number; line?: number };
export type MaskBox = { x0: number; y0: number; x1: number; y1: number; reason: "number" | "address" };

const ADDRESS_WORD = /(특별시|광역시|자치시|자치도|[가-힣]{1,6}(시|군|구)$|[가-힣]{1,8}(동|읍|면|리)$|[가-힣0-9]{1,10}(로|길)$|아파트|빌라|오피스텔|\d+동$|\d+호$|번지)/;

/** 글자 상자들 → 가릴 상자 목록. line 이 있으면 같은 줄 단위로 주소를 판단한다. */
export function pickMaskBoxes(words: OcrWord[]): MaskBox[] {
  const boxes: MaskBox[] = [];
  // ① 숫자 4자리 이상(전화·계좌·주민번호 조각). 「2026년」「10월」 같은 날짜 단어·가격(원)은 제외
  for (const w of words) {
    const digits = w.text.replace(/\D/g, "");
    if (digits.length < 4) continue;
    if (/[년월일원개]$/.test(w.text.trim()) || /^[\d,]+원$/.test(w.text.trim())) continue;
    boxes.push({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, reason: "number" });
  }
  // ② 주소 줄: 같은 줄에 주소 단어 2개 이상, 또는 주소 단어 1개 + 숫자 단어
  const byLine = new Map<number, OcrWord[]>();
  words.forEach((w, i) => { const k = w.line ?? i; byLine.set(k, [...(byLine.get(k) || []), w]); });
  for (const line of byLine.values()) {
    const addrCount = line.filter((w) => ADDRESS_WORD.test(w.text.trim())).length;
    const hasNumber = line.some((w) => /\d/.test(w.text));
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
