// 대표사진 1:1 맞춤 계산 검수 — 「자르지도 늘리지도 않는다」를 고정한다
import assert from "node:assert/strict";
import { squarePlacement, SQUARE_TARGET_PX } from "../lib/imageSquare.ts";

const ratio = (p, w, h) => Math.abs((p.dw / p.dh) - (w / h)) < 0.01;

// 세로로 긴 옷 사진 (1200×1600) → 1000 캔버스, 좌우 흰 여백
{
  const p = squarePlacement(1200, 1600);
  assert.equal(p.size, 1000);
  assert.equal(p.dh, 1000, "긴 변(세로)이 캔버스에 꽉 찬다");
  assert.equal(p.dw, 750);
  assert.equal(p.dx, 125, "좌우 여백이 같아야 한다");
  assert.equal(p.dy, 0);
  assert.equal(p.padded, true);
  assert.ok(ratio(p, 1200, 1600), "비율이 그대로 = 안 찌그러진다");
}

// 가로로 긴 사진 (1600×900) → 위아래 여백
{
  const p = squarePlacement(1600, 900);
  assert.equal(p.size, 1000);
  assert.equal(p.dw, 1000);
  assert.equal(p.dh, 563);
  assert.equal(p.dx, 0);
  assert.equal(p.dy, 219);
  assert.ok(ratio(p, 1600, 900));
}

// 이미 정사각형 → 여백 없음
{
  const p = squarePlacement(2000, 2000);
  assert.equal(p.size, 1000);
  assert.deepEqual([p.dx, p.dy, p.dw, p.dh], [0, 0, 1000, 1000]);
  assert.equal(p.padded, false);
}

// 작은 원본은 «억지로 키우지 않는다»(흐려짐 방지)
{
  const p = squarePlacement(400, 600);
  assert.equal(p.size, 600, "원본 긴 변보다 크게 만들지 않는다");
  assert.equal(p.dh, 600);
  assert.equal(p.dw, 400);
  assert.equal(p.dx, 100);
}

// 목표 크기를 바꿔도 규칙은 같다
{
  const p = squarePlacement(1000, 500, 200);
  assert.equal(p.size, 200);
  assert.equal(p.dw, 200);
  assert.equal(p.dh, 100);
  assert.equal(p.dy, 50);
}

// 망가진 값
assert.equal(squarePlacement(0, 100), null);
assert.equal(squarePlacement(NaN, 100), null);
assert.equal(squarePlacement(-5, -5), null);

assert.equal(SQUARE_TARGET_PX, 1000, "실무 표준 1000×1000");
console.log("✅ image-square 통과");
