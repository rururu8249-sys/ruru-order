// node --import ./scripts/_ts-resolve.mjs scripts/test-live-alert-block.mjs
import assert from "node:assert/strict";
import { parseLiveAlertBlocks, addLiveAlertBlocks, removeLiveAlertBlocks, viewLiveAlertBlocks, blockEntryId, blockPhoneSet } from "../lib/liveAlertBlock.ts";

assert.deepEqual(parseLiveAlertBlocks(null), []);
assert.deepEqual(parseLiveAlertBlocks("{망가짐"), []);
let list = parseLiveAlertBlocks(JSON.stringify({ v: 1, items: [{ phone: "010-1234-5678", name: "가" }, { phone: "01012345678", name: "중복" }, { phone: "" }] }));
assert.equal(list.length, 1);
assert.equal(list[0].phone, "01012345678");
list = addLiveAlertBlocks(list, [{ phone: "010 9999 0000", customerId: "c2", name: "나", nickname: "닉", at: "" }, { phone: "01012345678", customerId: "", name: "", nickname: "", at: "" }], new Date("2026-11-01T12:00:00Z"));
assert.equal(list.length, 2, "같은 번호는 한 번만");
assert.equal(list[0].phone, "01099990000");
assert.equal(list[0].at, "2026-11-01T12:00:00.000Z");
const view = viewLiveAlertBlocks(list);
assert.equal(view[0].phone, "010-****-0000", "화면엔 가린 번호만");
assert.ok(!JSON.stringify(view).includes("01099990000"));
assert.equal(view[0].id, blockEntryId("01099990000"));
assert.equal(removeLiveAlertBlocks(list, [view[0].id]).length, 1);
assert.equal(removeLiveAlertBlocks(list, ["c:c2"]).length, 1, "회원 id 로도 해제");
assert.ok(blockPhoneSet(list).has("01012345678"));
console.log("test-live-alert-block OK");

// 저장소 읽기: 처음(파일 없음)=빈 명단, 다른 오류=멈춤(throw), 정상=읽음
const { readLiveAlertBlocks, readLiveAlertBlockPhones } = await import("../lib/liveAlertBlockServer.ts");
const fake = (res) => ({ storage: { from: () => ({ download: async () => res }) } });
assert.deepEqual(await readLiveAlertBlocks(fake({ data: null, error: { message: "Object not found", statusCode: "404" } })), []);
await assert.rejects(() => readLiveAlertBlocks(fake({ data: null, error: { message: "timeout" } })));
const phones = await readLiveAlertBlockPhones(fake({ data: new Blob([JSON.stringify({ v: 1, items: [{ phone: "01055556666" }] })]), error: null }));
assert.ok(phones.has("01055556666"));
console.log("test-live-alert-block storage OK");
