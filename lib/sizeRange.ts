// lib/sizeRange.ts
// ─────────────────────────────────────────────────────────────────────────────
// 사이즈 목록을 «짧게» 보여주는 규칙 (방송 위젯용 · 표시 전용)
//
// [2026-09-11 사장님 지침]
//   「S M L XL XXL 이렇게 있으면 S ~ XXL 이런식으로, 중간에 사이즈가 없으면 S, M, XXL 처럼 따로따로」
//
// 규칙
//   · «이어진다»의 기준
//       - 알파벳: 표준 사다리 XXS < XS < S < M < L < XL < XXL(=2XL) < XXXL(=3XL) < 4XL < 5XL 에서 한 칸씩
//       - 숫자:   간격이 일정(등차)  예) 225 230 235 (5씩) · 4 6 8 10 12 (2씩) · 36 38 40 (2씩)
//         (한국 신발 mm 5단위, 정장 85/90/95 5단위, 아동 4/6/8 2단위 — 전부 등차)
//   · 이어진 게 3개 이상이면 「처음 ~ 끝」 한 토막으로. 2개면 그냥 둘 다 적는다(줄어들지 않으니까).
//   · 이어지지 않으면 따로따로.  「S · M · XXL」
//   · 사다리에 없는 값(FREE, XS-S, S/44 …)은 그대로 한 개씩.
//   · 저장된 순서를 바꾸지 않는다. 내림차순(XL L M S)으로 저장돼 있으면 「XL ~ S」로 그대로 보여준다.
//   · 괄호 꼬리는 무시하고 판단, 표시는 원문:  225(US5.5) 230(US6) 235(US6.5) → 「225(US5.5) ~ 235(US6.5)」
//
// 실측 근거 (2026-09-11 products.size_options 상위 형태)
//   ["36","38","40"]×122  ["S","M","L"]×46  ["S","M","L","XL"]×35  ["4","6","8","10","12"]×7
//   ["S","M","L","XL","2XL"]×5  ["M","L","XL","XXL"]×5  ["XS-S","M-L","XL-XXL"]×2  ["55","66"]×9  ["FREE"]×8
//
// ⚠ 표시만 바꾼다. 저장값·주문·재고·옵션 선택은 무관.

const LETTER_LADDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];
const LETTER_ALIAS: Record<string, string> = { "2XL": "XXL", "3XL": "XXXL", "XXXXL": "4XL", "XXXXXL": "5XL" };

type Token =
  | { kind: "letter"; index: number; label: string }
  | { kind: "number"; value: number; label: string }
  | { kind: "other"; label: string };

/** 「S(2)」「225(US5.5)」처럼 괄호 꼬리가 붙은 건 앞부분으로 판단, 표시는 원문 */
function core(label: string): string {
  const m = label.match(/^([^()]+?)\s*\(.*\)$/);
  return (m ? m[1] : label).trim();
}

function tokenize(label: string): Token {
  const c = core(label).toUpperCase();
  const letter = LETTER_ALIAS[c] || c;
  const li = LETTER_LADDER.indexOf(letter);
  if (li >= 0) return { kind: "letter", index: li, label };
  if (/^\d+(\.\d+)?$/.test(c)) return { kind: "number", value: Number(c), label };
  return { kind: "other", label };
}

/** 두 토큰의 «간격» — 같은 종류일 때만 숫자, 아니면 null */
function stepBetween(a: Token, b: Token): number | null {
  if (a.kind === "letter" && b.kind === "letter") return b.index - a.index;
  if (a.kind === "number" && b.kind === "number") return b.value - a.value;
  return null;
}

/**
 * 사이즈 목록 → 짧은 토막 목록.
 *   ["S","M","L","XL"]        → ["S ~ XL"]
 *   ["S","M","XXL"]           → ["S", "M", "XXL"]
 *   ["36","38","40","S","M"]  → ["36 ~ 40", "S", "M"]
 *   ["225","230","235","FREE"]→ ["225 ~ 235", "FREE"]
 * @param labels 표시할 라벨 목록(이미 "없음" 등은 걸러진 상태). 표시용 변환(36→36(S))은 부른 쪽이 한다.
 */
export function compressSizeList(labels: string[]): string[] {
  const tokens = labels.map((l) => String(l ?? "").trim()).filter(Boolean).map(tokenize);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = tokens[i];
    let end = i;
    if (start.kind !== "other" && i + 1 < tokens.length) {
      const step = stepBetween(start, tokens[i + 1]);
      // 알파벳은 정확히 한 칸(±1), 숫자는 0이 아닌 일정 간격
      const ok = step !== null && step !== 0 && (start.kind === "number" || Math.abs(step) === 1);
      if (ok) {
        end = i + 1;
        while (end + 1 < tokens.length && stepBetween(tokens[end], tokens[end + 1]) === step) end += 1;
      }
    }
    const runLength = end - i + 1;
    if (runLength >= 3) {
      out.push(`${tokens[i].label} ~ ${tokens[end].label}`);
      i = end + 1;
    } else {
      out.push(tokens[i].label);
      i += 1;
    }
  }
  return out;
}
