import assert from "node:assert/strict";
import * as identity from "../lib/eventCustomGift.ts";

assert.equal(
  typeof identity.resolveEventWinnerIdentity,
  "function",
  "event history must resolve the winner from the exact orders used for the draw",
);

const exact = identity.resolveEventWinnerIdentity({
  winner: {
    nickname: "용이월드",
    winnerOrderIds: ["order-2"],
    broadcastId: "broadcast-old",
  },
  orders: [
    {
      id: "order-1",
      broadcastId: "broadcast-old",
      nickname: "용이월드",
      customerId: "11",
      customerName: "다른사람",
      phone: "01011111111",
      kakaoId: "kakao-wrong",
      createdAt: "2026-10-01T00:00:00Z",
    },
    {
      id: "order-2",
      broadcastId: "broadcast-new",
      nickname: "용이월드",
      customerId: "22",
      customerName: "이소윤",
      phone: "01022222222",
      kakaoId: "kakao-right",
      createdAt: "2026-10-03T00:00:00Z",
    },
  ],
});

assert.deepEqual(exact, {
  status: "resolved",
  customerName: "이소윤",
  customerRef: {
    kakao: "kakao-right",
    phone: "01022222222",
    nick: "용이월드",
  },
});

const fallback = identity.resolveEventWinnerIdentity({
  winner: {
    nickname: "보라해쥬",
    winnerOrderIds: [],
    broadcastId: "broadcast-1",
  },
  orders: [
    {
      id: "order-3",
      broadcastId: "broadcast-1",
      nickname: "보라해쥬",
      customerId: "33",
      customerName: "김보라",
      phone: "01033333333",
      kakaoId: "",
      createdAt: "2026-10-02T00:00:00Z",
    },
    {
      id: "order-4",
      broadcastId: "broadcast-2",
      nickname: "보라해쥬",
      customerId: "44",
      customerName: "다른방송고객",
      phone: "01044444444",
      kakaoId: "",
      createdAt: "2026-10-04T00:00:00Z",
    },
  ],
});

assert.equal(fallback.status, "resolved");
assert.equal(fallback.customerName, "김보라");
assert.equal(fallback.customerRef.phone, "01033333333");

const ambiguous = identity.resolveEventWinnerIdentity({
  winner: {
    nickname: "같은닉네임",
    winnerOrderIds: ["order-5", "order-6"],
    broadcastId: "broadcast-1",
  },
  orders: [
    {
      id: "order-5",
      broadcastId: "broadcast-1",
      nickname: "같은닉네임",
      customerId: "55",
      customerName: "첫번째",
      phone: "01055555555",
      kakaoId: "",
      createdAt: "2026-10-03T00:00:00Z",
    },
    {
      id: "order-6",
      broadcastId: "broadcast-1",
      nickname: "같은닉네임",
      customerId: "66",
      customerName: "두번째",
      phone: "01066666666",
      kakaoId: "",
      createdAt: "2026-10-03T00:01:00Z",
    },
  ],
});

assert.deepEqual(ambiguous, {
  status: "ambiguous",
  customerName: null,
  customerRef: null,
});

assert.equal(identity.formatEventWinnerLabel("용이월드", "이소윤"), "용이월드 · 이소윤");
assert.equal(identity.formatEventWinnerLabel("용이월드", ""), "용이월드");

console.log("PASS event winner identity: exact order, broadcast fallback, ambiguity, readable label");
