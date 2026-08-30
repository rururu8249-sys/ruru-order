// scripts/test-customer-note.mjs
// 쪽지 발송 규칙 검증 — lib/customerNote.ts 의 실제 함수를 불러서 확인한다.
//
// 막으려는 사고
//   ① 두 번 눌러서 손님에게 팝업이 두 번 뜨는 것 (포인트 중복지급과 같은 형태)
//   ② 여러 명 발송에서 같은 사람이 두 번 들어가는 것
//   ③ 보낼 곳 없는 줄(번호도 세션키도 없음)이 섞여 들어가는 것
import {
  cleanNotePhone, cleanNoteSessionKey, cleanNoteText, noteHours,
  normalizeTargets, targetSessionKeyOf, buildNoteSourceKey, fingerprint,
} from "../lib/customerNote.ts";
import { NOTE_PRESETS, safeSearchTerm } from "../lib/customerNotePresets.ts";

let fail = 0;
const ok = (c, l) => { if (c) console.log(`✅ ${l}`); else { console.log(`❌ ${l}`); fail = 1; } };
const eq = (g, w, l) => ok(JSON.stringify(g) === JSON.stringify(w), `${l} → ${JSON.stringify(g)}`);

console.log("── 입력 정리 ──");
eq(cleanNotePhone("010-2849-5209"), "01028495209", "전화번호 하이픈 제거");
eq(cleanNotePhone("0212345678"), "0212345678", "일반전화(02) 10자리도 통과");
eq(cleanNotePhone("010284"), "", "자릿수 모자라면 버림");
eq(cleanNoteSessionKey("abc"), "", "세션키가 너무 짧으면 버림");
eq(cleanNoteText("  안녕하세요  ", 500), "안녕하세요", "앞뒤 공백 제거");
eq(cleanNoteText("가".repeat(600), 500).length, 500, "500자 넘으면 잘림");

console.log("\n── 보관 시간 ──");
eq(noteHours(12), 12, "정상값 그대로");
eq(noteHours(0), 12, "0이면 기본 12시간");
eq(noteHours(-5), 12, "음수면 기본 12시간");
eq(noteHours(999), 72, "너무 길면 72시간으로 자름");
eq(noteHours("이상한값"), 12, "숫자가 아니면 기본 12시간");

console.log("\n── 받는 사람 목록 ──");
eq(normalizeTargets([{ phone: "01028495209" }, { phone: "010-2849-5209" }]).length, 1,
   "같은 사람이 두 형태로 들어와도 한 번만 (하이픈/숫자)");
eq(normalizeTargets([{}, { phone: "" }, { sessionKey: "abc" }]).length, 0,
   "보낼 곳 없는 줄은 전부 버림");
eq(normalizeTargets([{ phone: "01011112222" }, { phone: "01033334444" }]).length, 2,
   "다른 사람 둘이면 둘 다 남음");
eq(normalizeTargets("리스트아님"), [], "배열이 아니면 빈 목록");
{
  const t = normalizeTargets([{ sessionKey: "3f2a9c1e-0b44-4f2a-9d7e-1a2b3c4d5e6f" }])[0];
  eq(targetSessionKeyOf(t), "3f2a9c1e-0b44-4f2a-9d7e-1a2b3c4d5e6f", "세션키가 있으면 그대로 사용");
}
{
  const t = normalizeTargets([{ phone: "01028495209" }])[0];
  eq(targetSessionKeyOf(t), "phone:01028495209", "세션키가 없으면 phone: 형태 (기존 저장 방식 유지)");
}

console.log("\n── 중복 발송 차단 ──");
const T = normalizeTargets([{ phone: "01028495209" }])[0];
const T2 = normalizeTargets([{ phone: "01011112222" }])[0];
const now = Date.parse("2026-08-30T10:00:00Z");
ok(buildNoteSourceKey(T, "입금 부탁드려요", now) === buildNoteSourceKey(T, "입금 부탁드려요", now + 30_000),
   "같은 사람·같은 내용을 30초 뒤 또 보내면 같은 열쇠 → 두 번째는 막힌다");
ok(buildNoteSourceKey(T, "입금 부탁드려요", now) !== buildNoteSourceKey(T2, "입금 부탁드려요", now),
   "다른 사람에게는 다른 열쇠 → 정상 발송");
ok(buildNoteSourceKey(T, "입금 부탁드려요", now) !== buildNoteSourceKey(T, "품절되었어요", now),
   "같은 사람이라도 내용이 다르면 다른 열쇠 → 정상 발송");
ok(buildNoteSourceKey(T, "입금 부탁드려요", now) !== buildNoteSourceKey(T, "입금 부탁드려요", now + 11 * 60_000),
   "11분 뒤 같은 내용은 다른 열쇠 → 일부러 다시 보내는 건 된다");
ok(buildNoteSourceKey(T, "  입금 부탁드려요 ", now) === buildNoteSourceKey(T, "입금 부탁드려요", now),
   "앞뒤 공백만 다른 건 같은 글로 본다");
ok(buildNoteSourceKey(T, "가", now).length < 80, "열쇠값이 너무 길지 않다(인덱스 부담)");
ok(fingerprint("가나다") !== fingerprint("가나라"), "글이 한 글자만 달라도 지문이 다르다");
ok(fingerprint("") === fingerprint(""), "같은 글은 같은 지문");

console.log("\n── 손님 검색어 방어 ──");
// 쉼표·괄호가 그대로 들어가면 PostgREST or() 조건식이 깨져서 엉뚱한 손님이 나오거나 조회가 실패한다.
eq(safeSearchTerm("루루짱"), "루루짱", "평범한 닉네임은 그대로");
eq(safeSearchTerm("루루,짱"), "루루 짱", "쉼표 제거 (조건식 구분자)");
eq(safeSearchTerm("루루(짱)"), "루루 짱", "괄호 제거 (조건식 묶음)");
eq(safeSearchTerm("100%할인"), "100 할인", "퍼센트 제거 (ilike 와일드카드)");
eq(safeSearchTerm("루루*짱"), "루루 짱", "별표 제거");
eq(safeSearchTerm('루루"짱'), "루루 짱", "따옴표 제거");
eq(safeSearchTerm("  루루   짱  "), "루루 짱", "공백 정리");
eq(safeSearchTerm("가".repeat(60)).length, 40, "너무 길면 40자로 자름");
eq(safeSearchTerm(",,,"), "", "구분자만 있으면 빈 검색어 → 조회 안 함");
eq(safeSearchTerm(null), "", "값이 없으면 빈칸");

console.log("\n── 자주 쓰는 문구 ──");
ok(NOTE_PRESETS.length >= 6, `프리셋 ${NOTE_PRESETS.length}개 (고객카드·공지쪽지 화면이 같은 목록 사용)`);
ok(NOTE_PRESETS.every((p) => p.label && p.text.trim().length > 0), "빈 프리셋이 없다");
ok(NOTE_PRESETS.every((p) => p.text.length <= 500), "프리셋이 500자 제한을 넘지 않는다");

console.log(fail ? "\n쪽지 발송 규칙 테스트 실패" : "\n쪽지 발송 규칙 테스트 통과");
process.exit(fail);
