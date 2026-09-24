// [2026-09-24] 상품사진 안내문구 — 계산·검사 부분만 돌린다(캔버스는 브라우저 것이라 여기서 못 돈다).
//   지키는 것: 설정이 비면 «꺼짐»(기존 운영 그대로) · 진하기 범위 · 띠가 사진 밖으로 안 나감 · 긴 문구는 글자를 줄임
import assert from "node:assert/strict";
import {
  parseProductImageNotice, toProductImageNoticeRows, validateProductImageNotice, clampNoticeOpacity,
  noticeBoxLayout, fitNoticeFontSize, noticeBoxRect,
  PRODUCT_IMAGE_NOTICE_DEFAULTS, PRODUCT_IMAGE_NOTICE_KEYS,
  NOTICE_OPACITY_MIN, NOTICE_OPACITY_MAX, NOTICE_FONT_MIN, NOTICE_TEXT_MAX,
} from "../lib/productImageNotice.ts";

// ── 1) 설정이 비어 있으면 «꺼짐» — 배포해도 아무것도 안 바뀐다 ──────────────
{
  const v = parseProductImageNotice([]);
  assert.equal(v.on, false, "설정이 없으면 꺼져 있어야 한다(기존 사진 업로드 그대로)");
  assert.equal(v.opacity, 0.45, "사장님 확정 진하기 45%");
  assert.ok(v.text.includes("연출 이미지"), "기본 문구가 들어 있어야 한다");
  assert.deepEqual(parseProductImageNotice(null), v, "null 도 기본값");
  assert.deepEqual(parseProductImageNotice(undefined), v, "undefined 도 기본값");
}

// ── 2) 저장된 값 읽기 — 문자열 "true"/1 도 켜짐으로 본다(설정 표에 뭐가 들어와도) ──
{
  const rows = [
    { key: "product_image_notice_on", value: "true" },
    { key: "product_image_notice_text", value: "  촬영 연출컷입니다  " },
    { key: "product_image_notice_opacity", value: 0.6 },
  ];
  const v = parseProductImageNotice(rows);
  assert.equal(v.on, true);
  assert.equal(v.text, "촬영 연출컷입니다", "앞뒤 공백은 지운다");
  assert.equal(v.opacity, 0.6);
  assert.equal(parseProductImageNotice([{ key: "product_image_notice_on", value: 1 }]).on, true);
  assert.equal(parseProductImageNotice([{ key: "product_image_notice_on", value: false }]).on, false);
  // 문구가 비면 기본 문구로 되돌린다 — 빈 띠가 사진에 박히면 안 된다
  assert.equal(parseProductImageNotice([{ key: "product_image_notice_text", value: "   " }]).text, PRODUCT_IMAGE_NOTICE_DEFAULTS.text);
}

// ── 3) 진하기는 범위를 벗어날 수 없다 ────────────────────────────────────
{
  assert.equal(clampNoticeOpacity(0), NOTICE_OPACITY_MIN);
  assert.equal(clampNoticeOpacity(5), NOTICE_OPACITY_MAX);
  assert.equal(clampNoticeOpacity("0.45"), 0.45);
  assert.equal(clampNoticeOpacity("이상한값"), PRODUCT_IMAGE_NOTICE_DEFAULTS.opacity);
}

// ── 4) 저장 전 검사 ──────────────────────────────────────────────────────
{
  assert.equal(validateProductImageNotice({ on: true, text: "문구", opacity: 0.45 }), "");
  assert.ok(validateProductImageNotice({ on: true, text: "   ", opacity: 0.45 }), "켜놓고 문구가 비면 막아야 한다");
  assert.equal(validateProductImageNotice({ on: false, text: "", opacity: 0.45 }), "", "꺼져 있으면 빈 문구도 괜찮다");
  assert.ok(validateProductImageNotice({ on: true, text: "가".repeat(NOTICE_TEXT_MAX + 1), opacity: 0.45 }), "너무 긴 문구는 막는다");
  assert.ok(validateProductImageNotice({ on: true, text: "문구", opacity: 0.95 }), "진하기 범위 밖은 막는다");
}

// ── 5) 저장할 행 — product_image_notice_* 키 세 개만 나간다(다른 설정을 덮으면 안 된다) ──
{
  const rows = toProductImageNoticeRows({ on: true, text: " 문구 ", opacity: 2 });
  assert.equal(rows.length, 3);
  for (const r of rows) assert.ok(PRODUCT_IMAGE_NOTICE_KEYS.includes(r.key), `엉뚱한 키: ${r.key}`);
  assert.equal(rows.find((r) => r.key === "product_image_notice_text").value, "문구");
  assert.equal(rows.find((r) => r.key === "product_image_notice_opacity").value, NOTICE_OPACITY_MAX);
}

// ── 6) 띠 치수 — 사진이 커도 작아도 «같은 비율» ──────────────────────────
{
  for (const w of [400, 1000, 1100, 1546, 2400]) {
    const L = noticeBoxLayout(w);
    assert.equal(L.fontSize, Math.max(NOTICE_FONT_MIN, Math.round(w * 0.022)), `글자 비율: ${w}`);
    assert.equal(L.margin, Math.round(w * 0.02), `가장자리 여백 비율: ${w}`);
    assert.ok(L.maxTextWidth > 0 && L.maxTextWidth < w, `글자 칸이 사진보다 넓다: ${w}`);
  }
  // 아주 작은 사진에서도 글자가 10px 밑으로 안 내려간다
  assert.equal(noticeBoxLayout(100).fontSize, NOTICE_FONT_MIN);
}

// ── 7) 문구가 길면 글자를 줄인다(최소 10px) ──────────────────────────────
{
  const L = noticeBoxLayout(1000);   // maxTextWidth = 1000 - 40 - 40 = 920
  // 한글 한 글자를 글자크기만큼으로 치는 가짜 자
  const measureOf = (chars) => (size) => chars * size;
  assert.equal(fitNoticeFontSize(L, measureOf(20)), L.fontSize, "짧으면 안 줄인다");
  const shrunk = fitNoticeFontSize(L, measureOf(60));
  assert.ok(shrunk < L.fontSize, "길면 줄여야 한다");
  assert.ok(60 * shrunk <= L.maxTextWidth, `줄였는데도 넘친다: ${shrunk}px`);
  assert.ok(fitNoticeFontSize(L, measureOf(500)) >= NOTICE_FONT_MIN, "아무리 길어도 10px 밑으로는 안 간다");
}

// ── 8) 띠는 «사진이 그려진 사각형» 오른쪽 아래 안에 들어간다 ──────────────
{
  // 상세사진: 사진이 캔버스를 꽉 채움
  {
    const rect = { x: 0, y: 0, width: 1100, height: 1400 };
    const L = noticeBoxLayout(rect.width);
    const box = noticeBoxRect(rect, L, 700, L.fontSize);
    assert.ok(box.x >= rect.x && box.y >= rect.y, "왼쪽·위로 삐져나감");
    assert.ok(box.x + box.width <= rect.x + rect.width, "오른쪽으로 삐져나감");
    assert.ok(box.y + box.height <= rect.y + rect.height, "아래로 삐져나감");
    assert.equal(rect.x + rect.width - (box.x + box.width), L.margin, "오른쪽 여백이 기준과 달라졌다");
    assert.equal(rect.y + rect.height - (box.y + box.height), L.margin, "아래 여백이 기준과 달라졌다");
  }
  // 대표사진: 1:1 캔버스 안에 가로로 긴 사진이 «가운데»에 그려진 경우(위아래 흰 여백)
  {
    const rect = { x: 0, y: 200, width: 1000, height: 600 };   // 흰 여백 위 200 / 아래 200
    const L = noticeBoxLayout(rect.width);
    const box = noticeBoxRect(rect, L, 600, L.fontSize);
    assert.ok(box.y >= rect.y, "띠가 위쪽 흰 여백으로 올라갔다");
    assert.ok(box.y + box.height <= rect.y + rect.height, "띠가 아래쪽 흰 여백으로 내려갔다");
  }
}

console.log("✅ 상품사진 안내문구 테스트 통과");
