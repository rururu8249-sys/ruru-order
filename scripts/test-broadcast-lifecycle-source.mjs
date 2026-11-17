// Source guards for the single-source broadcast lifecycle. Does not contact the DB.
import assert from "node:assert/strict";
import fs from "node:fs";
const controller = fs.readFileSync("components/admin-live/liveBroadcastController.ts", "utf8");
const dashboard = fs.readFileSync("components/admin-live/AdminLiveDashboard.tsx", "utf8");
const modal = fs.readFileSync("components/admin-live/LiveBroadcastStartModal.tsx", "utf8");
const api = fs.readFileSync("app/api/admin-live/broadcast-lifecycle/route.ts", "utf8");
assert.ok(!dashboard.includes("await startAdminLiveBroadcast(input)"));
assert.ok(dashboard.includes("confirmInput.broadcastId"));
assert.ok(dashboard.includes("await activateBroadcast(target.id)"));
assert.ok(!dashboard.includes(".sort((a, b) => String(b.created_at || b.id)"));
assert.ok(modal.includes("selectedBroadcastId"));
assert.ok(modal.includes("disabled={saving || !selectedDraft}"));
assert.ok(controller.includes('broadcastLifecycle("activate", { broadcastId })'));
assert.ok(controller.includes('broadcastLifecycle("end", { broadcastId })'));
assert.ok(controller.includes('broadcastLifecycle("createDraft", { title: cleanTitle })'));
assert.ok(api.includes("verifyAdminSessionFromRequest"));
assert.ok(api.includes("ruru_admin_activate_broadcast"));
console.log("PASS: broadcast creation/start/end UI & API source checks");
