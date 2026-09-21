// lib/issueBodyMeta.ts
// 고객이슈(admin_tasks.body) 는 «메타줄 + 메모» 가 한 덩어리 글로 저장된다.
//   자동날짜: 2026. 09. 21. 월요일
//   이슈유형: 반품(환불)
//   닉네임: 빛나리
//   이름: 홍미라
//   전화번호: 01071609281      ← 컬럼엔 없고 여기에만 있다(order-return/route.ts 129행)
//   주문번호: RURU-MU464IS3
//   대상상품: 알로 뮬 2컬러(회베이지/240)×1
//
//   반품(환불)                 ← 여기부터가 «메모»
//
// [2026-09-21 데이터 손실 사고] 사장님: 「수정하면 전화번호가 삭제됨」
//   수정창은 «메타줄을 걷어낸 메모»만 보여주는데, 저장할 때 body 를 그 메모로
//   통째로 덮어써서 전화번호·닉네임·이름·자동날짜가 영구히 지워졌다.
//   (「주문번호:」「대상상품:」은 아래 목록에 없어 살아남았다 — 그래서 번호만 사라져 보였다)
//   → 자르고 합치는 규칙을 이 파일 한 곳에 두고, scripts/test-issue-body-meta.mjs 가 지킨다.

/** 메모가 «아닌» 줄. 수정해도 절대 사라지면 안 되는 줄들이다. */
export const ISSUE_META_PREFIXES = [
  "자동날짜:",
  "이슈유형:",
  "닉네임:",
  "이름:",
  "전화번호:",
  "고객ID:",
  "수정날짜:",
  "주문내용:",
  // [2026-09-21] 주문번호·대상상품도 «자동으로 적힌 사실»이지 사장님이 쓴 메모가 아니다.
  //   예전엔 메모 쪽으로 딸려가서 수정창에 그대로 노출됐고, 사장님이 지우면 같이 사라졌다.
  "주문번호:",
  "대상상품:",
] as const;

export function isIssueMetaLine(line: string): boolean {
  const t = String(line ?? "").trim();
  return ISSUE_META_PREFIXES.some((prefix) => t.startsWith(prefix));
}

/** 본문을 «메타줄»과 «메모»로 가른다. */
export function splitIssueBody(body: unknown): { metaLines: string[]; memo: string } {
  const lines = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const metaLines = lines.filter(isIssueMetaLine);
  const memo = lines
    .filter((l) => !isIssueMetaLine(l))
    .map((l) => l.replace(/^(내용|메모):\s*/, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return { metaLines, memo };
}

/** 메타줄을 앞에 되살려 본문을 다시 만든다. 메모만 바뀌고 나머지는 보존된다. */
export function mergeIssueBody(metaLines: string[], memo: string): string {
  const keep = (metaLines || []).map((l) => String(l ?? "").trim()).filter(Boolean);
  const text = String(memo ?? "").trim();
  if (keep.length === 0) return text;
  return text ? `${keep.join("\n")}\n\n${text}` : keep.join("\n");
}

/** 본문에서 한 항목 값 뽑기 — 예: fieldFromIssueBody(body, "전화번호:") */
export function fieldFromIssueBody(body: unknown, prefix: string): string {
  const line = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}
