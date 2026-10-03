import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { useState } from "react";
import Renderer, { act } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const root = path.resolve(".");
const cache = new Map();
const css = new Proxy({}, { get: (_, key) => String(key) });

function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (spec) => {
    if (spec.endsWith(".module.css")) return { __esModule: true, default: css };
    if (spec.startsWith("@/") || spec.startsWith(".")) {
      const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(filename), spec);
      const target = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      return load(target);
    }
    return require(spec);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

const Panel = load(path.join(root, "components/admin-live/WidgetProductLibraryPanel.tsx")).default;
const items = [
  { productId: "1", detailName: "", label: "BB-1", count: 5, lastAt: 500, image: "", priceLabel: "10,000원", available: true, inBroadcast: true },
  { productId: "2", detailName: "브라운", label: "MIU-2 브라운", count: 4, lastAt: 400, image: "", priceLabel: "20,000원", available: true, inBroadcast: true },
  { productId: "3", detailName: "", label: "품절", count: 3, lastAt: 300, image: "", priceLabel: "30,000원", available: false, inBroadcast: true, unavailableReason: "품절" },
  { productId: "4", detailName: "", label: "미진열", count: 2, lastAt: 200, image: "", priceLabel: "40,000원", available: true, inBroadcast: false },
  { productId: "5", detailName: "", label: "BB-5", count: 1, lastAt: 100, image: "", priceLabel: "50,000원", available: true, inBroadcast: true },
];
const rotation = { mode: "selected", paused: false, targets: [{ productId: "1", detailName: "" }, { productId: "2", detailName: "브라운" }] };
const applied = [];

function Harness({ manualPinLabel = "" }) {
  const [selectedKeys, setSelectedKeys] = useState(new Set(["1|", "2|브라운"]));
  const [draftMode, setDraftMode] = useState("selected");
  return React.createElement(Panel, {
    items,
    rotation,
    selectedKeys,
    draftMode,
    loading: false,
    busyKey: "",
    canManageRotation: true,
    manualPinLabel,
    onPreview() {},
    onPin() {},
    onRemove() {},
    onToggleSelected(target) {
      const key = `${target.productId}|${target.detailName}`;
      setSelectedKeys((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    },
    onDraftModeChange: setDraftMode,
    onReplaceSelected(targets) { setSelectedKeys(new Set(targets.map((target) => `${target.productId}|${target.detailName}`))); },
    onDiscardDraft() { setDraftMode(rotation.mode); setSelectedKeys(new Set(rotation.targets.map((target) => `${target.productId}|${target.detailName}`))); },
    onApplyDraft(mode) { applied.push(mode); },
    onTogglePause() {},
  });
}

let tree;
await act(async () => { tree = Renderer.create(React.createElement(Harness)); });
const button = (label) => tree.root.findAllByType("button").find((node) => node.props["aria-label"] === label);
const text = () => JSON.stringify(tree.toJSON());

assert(button("순환 상품 선택·변경"), "the panel must name the selected-product task directly");
assert(text().includes("방송화면 위젯 · 선택한 상품 2개 순환 중"), "the saved state must identify the broadcast widget rather than an ambiguous customer screen");
assert(text().includes("방송 화면 오른쪽 상품 카드에 적용된 상태입니다."), "the status hint must identify the exact customer-facing surface");
assert.equal(text().includes("손님 화면에 적용된 현재 상태입니다."), false, "the ambiguous customer-screen wording must be removed");
assert(tree.root.findByProps({ "aria-label": "자주 사용한 상품 검색" }), "search must remain visible without opening the editor");
assert.equal(tree.root.findAllByType("article").length, items.length, "every previously pinned product must be present in the default scrollable list");
assert(tree.root.findAll((node) => String(node.props.className || "").includes("historyGrid")).length > 0, "the full history must use a bounded internal scroll area");
assert.equal(tree.root.findAll((node) => node.props["aria-label"] === "순환 설정 변경사항").length, 0, "clean state must not show an apply bar");

await act(async () => button("순환 상품 선택·변경").props.onClick());
assert.equal(tree.root.findAll((node) => node.props.role === "radiogroup").length, 1, "all and selected rotation must be one exclusive mode control");
assert(tree.root.findByProps({ "aria-label": "원하는 상품만 순환" }), "the selected-product mode must use task language that operators understand");
assert(button("순환 가능 상품 전체 선택"), "expanded editor must expose bulk selection");
assert(button("선택 상품 모두 해제"), "expanded editor must expose bulk clear");

await act(async () => button("선택 상품 모두 해제").props.onClick());
assert.equal(tree.root.findAll((node) => node.props["aria-label"] === "순환 설정 변경사항").length, 1, "editing selection must reveal the contextual apply bar");
assert(text().includes("한 개 이상 선택"), "empty selected mode must explain why it cannot be applied");
assert.equal(button("순환 설정 적용").props.disabled, true, "empty selected rotation cannot be applied");

const search = tree.root.findByProps({ "aria-label": "자주 사용한 상품 검색" });
await act(async () => search.props.onChange({ target: { value: "MIU-2" } }));
assert(button("검색 결과 1개 선택"), "bulk selection must state when it is scoped to search results");
await act(async () => button("검색 결과 1개 선택").props.onClick());
assert.equal(button("순환 설정 적용").props.disabled, false);
await act(async () => button("순환 설정 적용").props.onClick());
assert.deepEqual(applied, ["selected"], "apply must use the explicitly chosen rotation mode");

const allMode = tree.root.findByProps({ "aria-label": "전체 진열상품 순환" });
await act(async () => allMode.props.onChange());
assert(text().includes("전체 진열상품으로 적용"), "switching modes must use an explicit apply label");

await act(async () => tree.update(React.createElement(Harness, { manualPinLabel: "BB-102" })));
assert(text().includes("BB-102 고정 표시 중"), "manual pin must replace the live rotation status");
assert(text().includes("고정 해제 시 자동 재개"), "manual pin must explain that the saved rotation is waiting");

await act(async () => tree.unmount());
console.log("widget product library panel UX tests passed");
