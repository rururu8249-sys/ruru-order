import assert from "node:assert/strict";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EventCustomGiftStatus = createUiLoader()("components/admin-live/EventCustomGiftStatus.tsx").default;

let tree;
await act(async () => {
  tree = Renderer.create(
    React.createElement(EventCustomGiftStatus, {
      retry: async () => {},
      states: {
        "winner-1": {
          status: "added",
          result: {
            ok: true,
            status: "added",
            winnerId: "winner-1",
            orderId: "123",
            orderGroupId: "group-1",
            lookupCode: "RURU-MUR3SWUD",
            productName: "머리끈",
            targetState: "active",
            nickname: "용이월드",
            customerName: "이소윤",
            customerRef: { kakao: "kakao-1", phone: "01012345678", nick: "용이월드" },
          },
        },
      },
    }),
  );
});

const rendered = JSON.stringify(tree.toJSON());
assert.match(rendered, /경품 추가 완료/);
assert.match(rendered, /용이월드 · 이소윤/, "completion must identify the winner before the order number");
assert.match(rendered, /머리끈/);
assert.match(rendered, /RURU-MUR3SWUD/);

await act(async () => tree.unmount());
console.log("PASS custom gift completion shows nickname, real name, gift, and order reference");
