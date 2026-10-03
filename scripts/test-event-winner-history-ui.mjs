import assert from "node:assert/strict";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {
  location: { origin: "http://localhost:3000" },
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem() {} },
};

const db = {
  from() {
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return query;
  },
};

globalThis.fetch = async (url) => {
  const text = String(url);
  const payload = text.includes("action=winners")
    ? {
        ok: true,
        winners: [{
          id: "winner-1",
          event_id: "event-1",
          nickname: "용이월드",
          customer_name: "이소윤",
          customer_ref: { kakao: "kakao-1", phone: "01012345678", nick: "용이월드" },
          identity_status: "resolved",
          winner_note: "포인트 1,000P",
          winner_at: new Date().toISOString(),
          is_reward_done: true,
          is_test: false,
        }],
      }
    : text.includes("action=events")
      ? { ok: true, events: [{ id: "event-1", overlay_token: "survival_luludongi_live" }] }
      : text.includes("action=broadcasts")
        ? { ok: true, broadcasts: [] }
        : { ok: true, participants: [] };
  return { ok: true, json: async () => payload };
};

const Panel = createUiLoader({
  "@/lib/supabase": { supabase: db },
  "./AdminLiveEventSoundboard": { default: () => null },
  "@/lib/adminToast": { showAdminToast() {} },
  "@/lib/adminConfirm": { showAdminConfirm: async () => true },
})("components/admin-live/AdminLiveEventRoulettePanel.tsx").default;

const opened = [];
let tree;
await act(async () => {
  tree = Renderer.create(React.createElement(Panel, {
    controlledOpen: true,
    embedded: true,
    renderTrigger: false,
    onOpenCustomer: (ref) => opened.push(ref),
  }));
  await Promise.resolve();
});

const identityButton = tree.root.findAllByType("button").find((node) =>
  node.children.join("").includes("용이월드 · 이소윤"),
);
assert.ok(identityButton, "winner nickname and real name must be one compact clickable identity");
await act(async () => identityButton.props.onClick());
assert.deepEqual(opened, [{ kakao: "kakao-1", phone: "01012345678", nick: "용이월드" }]);

await act(async () => tree.unmount());
console.log("PASS event history shows nickname and real name and opens the exact customer");
