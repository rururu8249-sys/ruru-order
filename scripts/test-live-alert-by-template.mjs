import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const { countVisitedRecipients, summarizeByTemplate } = createUiLoader()("lib/liveAlertByTemplate.ts");
assert.equal(countVisitedRecipients([["루루"], ["Abc "], ["없는사람"], []], ["abc", "루루", "다른"]), 2);
const s = summarizeByTemplate([
  { key: "1", templateId: "A", templateName: "1번", title: "", sentAt: 1, people: 100, visited: 5, siteBefore: 0, siteAfter: 0 },
  { key: "2", templateId: "A", templateName: "1번", title: "", sentAt: 3, people: 100, visited: 3, siteBefore: 0, siteAfter: 0 },
  { key: "3", templateId: "B", templateName: "2번", title: "", sentAt: 2, people: 200, visited: 2, siteBefore: 0, siteAfter: 0 },
  { key: "4", templateId: "B", templateName: "2번", title: "", sentAt: 4, people: 0, visited: 0, siteBefore: 0, siteAfter: 0 },
]);
assert.equal(s.length, 2);
const a = s.find((x) => x.templateId === "A"); const b = s.find((x) => x.templateId === "B");
assert.deepEqual([a.sends, a.people, a.visited, a.rate], [2, 200, 8, 4]);
assert.deepEqual([b.sends, b.people, b.visited, b.rate], [1, 200, 2, 1]);
console.log("test-live-alert-by-template PASS");
