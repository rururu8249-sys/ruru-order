import assert from "node:assert/strict";
import { judgeSubscribeShot, subscribeChannelList, subscribeChannelLabel, buildSubscribeCheckPrompt } from "../lib/subscribeFreeShip.ts";
const cfg = "나야루루, 루루동이#3";
assert.deepEqual(subscribeChannelList(cfg), ["나야루루", "루루동이#3"]);
assert.equal(subscribeChannelLabel(cfg), "「나야루루」 또는 「루루동이#3」");
assert.match(buildSubscribeCheckPrompt(cfg), /나야루루.*루루동이#3/);
const ok = (name, btn = "구독중") => judgeSubscribeShot({ is_youtube: true, channel_name: name, button_text: btn, button_belongs: true, clear: true }, cfg).ok;
assert.equal(ok("루루동이#3"), true);
assert.equal(ok("@루루동이3"), true);
assert.equal(ok("나야루루"), true);
assert.equal(ok("패션언니TV"), false);
assert.equal(ok("루루동이#3", "구독"), false);
// 채널 하나만 적은 예전 설정은 그대로
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "나야루루", button_text: "구독중", button_belongs: true, clear: true }, "나야루루").ok, true);
assert.equal(judgeSubscribeShot({ is_youtube: true, channel_name: "루루동이#3", button_text: "구독중", button_belongs: true, clear: true }, "나야루루").ok, false);
console.log("subscribe multi-channel tests passed");
