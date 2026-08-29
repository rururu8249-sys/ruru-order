// scripts/test-note-time-format.mjs
// 쪽지·공지 시각 표기 검증 — lib/noteTime.ts 의 실제 함수를 그대로 불러서 확인한다.
import { noteTimeText, noteAgoText } from "../lib/noteTime.ts";

let fail = 0;
const eq = (got, want, label) => {
  if (got !== want) { console.log(`❌ ${label}\n   나온값: ${JSON.stringify(got)}\n   기대값: ${JSON.stringify(want)}`); fail = 1; }
  else console.log(`✅ ${label} → ${JSON.stringify(got)}`);
};

// --- 한국시간 변환 + 요일 ---
eq(noteTimeText("2026-08-29T21:33:00Z"), "2026.08.30(일) 06:33", "UTC → 한국시간(+9h) 변환과 요일");
eq(noteTimeText("2026-08-29T15:00:00Z"), "2026.08.30(일) 00:00", "자정 경계 — 날짜가 하루 넘어감");
eq(noteTimeText("2026-08-29T14:59:00Z"), "2026.08.29(토) 23:59", "자정 1분 전 — 요일이 안 넘어감");
eq(noteTimeText("2026-12-31T15:00:00Z"), "2027.01.01(금) 00:00", "연말 경계 — 연도가 넘어감");
eq(noteTimeText("2026-02-28T15:00:00Z"), "2026.03.01(일) 00:00", "2월 말 경계(평년)");
eq(noteTimeText("깨진값"), "", "깨진 값이면 빈칸(화면 안 깨짐)");
eq(noteTimeText(""), "", "빈 값이면 빈칸");

// --- 상대시간 ---
const now = Date.parse("2026-08-30T06:00:00Z");
eq(noteAgoText("2026-08-30T05:50:00Z", now), "10분 전", "10분 전");
eq(noteAgoText("2026-08-30T03:00:00Z", now), "3시간 전", "3시간 전");
eq(noteAgoText("2026-08-30T05:59:40Z", now), "방금", "1분 안이면 「방금」");
eq(noteAgoText("2026-08-29T06:00:00Z", now), "", "정확히 24시간이면 안 붙임");
eq(noteAgoText("2026-08-28T06:00:00Z", now), "", "하루 넘으면 안 붙임(날짜만으로 충분)");
eq(noteAgoText("2026-08-30T07:00:00Z", now), "", "미래 시각이면 안 붙임(시계 어긋남 방어)");
eq(noteAgoText("깨진값", now), "", "깨진 값이면 빈칸");

console.log(fail ? "\n쪽지 시각 표기 테스트 실패" : "\n쪽지 시각 표기 테스트 통과");
process.exit(fail);
