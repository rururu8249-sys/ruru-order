// 임시 시험 주소 — 시뮬레이션 끝나면 삭제. 알림톡을 실제로 보내지 않음(미리보기만), 제외 명단은 끝나면 원래대로 되돌림.
import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSession, getAdminAuthConfig, ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-auth";
import { readLiveAlertBlocks, writeLiveAlertBlocks } from "@/lib/liveAlertBlockServer";
import { POST as sendPOST } from "@/app/api/admin-live/live-alert-send/route";
import { GET as blockGET, POST as blockPOST } from "@/app/api/admin-live/live-alert-block/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const KEY = "rr-sim-7f3k2q9x";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("k") !== KEY) return NextResponse.json({ ok: false, why: "key" });
  const db0 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const save = async (obj: unknown) => { await db0.storage.createBucket("admin-private", { public: false }).catch(() => null); await db0.storage.from("admin-private").upload("zz-selftest.json", new Blob([JSON.stringify(obj)], { type: "application/json" }), { upsert: true, contentType: "application/json" }); };
  if (request.nextUrl.searchParams.get("m") === "result") {
    const { data, error } = await db0.storage.from("admin-private").download("zz-selftest.json");
    if (error || !data) return NextResponse.json({ none: error?.message || "없음" });
    return new NextResponse(await data.text(), { headers: { "content-type": "application/json" } });
  }
  const started = Date.now();
  await save({ running: true, startedAt: new Date().toISOString() });
  after(async () => {
    try {
      const res = await run(request);
      const j = await res.json();
      await save({ ...j, ms: Date.now() - started });
    } catch (e) {
      await save({ fatal: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - started });
    }
  });
  return NextResponse.json({ started: true });
}

async function run(request: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const out: Record<string, unknown> = {};
  const checks: Array<[string, boolean, unknown?]> = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push([name, pass, detail]);
  const original = await readLiveAlertBlocks(db);
  out.originalCount = original.length;
  const token = await createAdminSession(getAdminAuthConfig().loginId || "admin");
  const base = request.nextUrl.origin;
  const call = async (handler: (r: NextRequest) => Promise<Response>, path: string, body?: unknown) => {
    const r = new NextRequest(`${base}${path}`, { method: body ? "POST" : "GET", headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const res = await handler(r);
    return { status: res.status, json: (await res.json()) as any };
  };
  try {
    // 1) 저장소 왕복(가짜 번호) → 원래대로
    await writeLiveAlertBlocks(db, [{ phone: "01000009999", customerId: "", name: "시험", nickname: "", at: new Date().toISOString() }, ...original]);
    const mid = await readLiveAlertBlocks(db);
    ok("저장소 쓰기·읽기", mid.length === original.length + 1 && mid[0].phone === "01000009999");
    await writeLiveAlertBlocks(db, original);
    ok("저장소 원래대로", (await readLiveAlertBlocks(db)).length === original.length);

    // 2) 진행 중 방송
    const { data: bc } = await db.from("broadcasts").select("id,title,status").eq("status", "ON").limit(1).maybeSingle();
    out.broadcastOn = Boolean(bc);
    // 시험 대상: 알림 신청 회원 1명(A) + 미신청 회원 1명(B) — 이 방송에서 아직 안 받은 휴대폰
    const received = new Set<string>();
    if (bc) {
      const { data: rec } = await db.from("live_alert_recipients").select("customer_phone").eq("broadcast_id", bc.id).limit(10000);
      for (const r of rec || []) received.add(String(r.customer_phone || "").replace(/\D/g, ""));
    }
    const pick = async (optin: boolean) => {
      let q = db.from("customers").select("id,customer_phone,customer_name,youtube_nickname,live_alert_optin").order("last_login_at", { ascending: false, nullsFirst: false }).limit(200);
      q = optin ? q.eq("live_alert_optin", true) : q.or("live_alert_optin.is.null,live_alert_optin.eq.false");
      const { data } = await q;
      const blocked = new Set(original.map((e) => e.phone));
      return (data || []).find((c) => { const p = String(c.customer_phone || "").replace(/\D/g, ""); return /^01[016789]\d{7,8}$/.test(p) && !received.has(p) && !blocked.has(p); });
    };
    const A = await pick(true), B = await pick(false);
    out.picked = { A: Boolean(A), B: Boolean(B) };
    if (!A || !B) throw new Error("시험 회원을 못 찾음");

    // 3) 회원 찾기(관리자 라우트)
    const searchName = String(A.youtube_nickname || A.customer_name || "").slice(0, 4);
    const s1 = await call(blockGET, `/api/admin-live/live-alert-block?q=${encodeURIComponent(searchName)}`);
    ok("회원 찾기 응답", s1.status === 200 && s1.json.ok, { status: s1.status, results: s1.json.results?.length });
    ok("찾기 결과에 전체 번호 없음", !JSON.stringify(s1.json).includes(String(A.customer_phone).replace(/\D/g, "")));
    ok("찾기 결과에 그 회원 있음", (s1.json.results || []).some((r: any) => r.customerId === String(A.id)));
    const sB = await call(blockGET, `/api/admin-live/live-alert-block?q=${encodeURIComponent(String(B.customer_phone).replace(/\D/g, "").slice(-4))}`);
    ok("알림 안 켠 회원도 찾힘(전화 뒤 4자리)", (sB.json.results || []).some((r: any) => r.customerId === String(B.id) && r.optin !== true));

    const inList = (j: any, id: unknown) => [...(j.sample || []), ...(j.members || [])].some((m: any) => m.cid === String(id));
    const inSample = (j: any, id: unknown) => (j.sample || []).some((m: any) => m.cid === String(id));
    let allBefore: any = null;
    if (bc) {
      allBefore = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "all" })).json;
      ok("[전체 회원] 제외 전: A·B 명단에 있음", inSample(allBefore, A.id) && inSample(allBefore, B.id), { ok: allBefore.ok, target: allBefore.targetCount, error: allBefore.error });
      const opt0 = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "optin" })).json;
      ok("[알림 신청자] 제외 전: A 있음·B 없음", inSample(opt0, A.id) && !inSample(opt0, B.id));
      out.before = { all: allBefore.targetCount, optin: opt0.targetCount, blocked: allBefore.blockedCount };
    }

    // 4) 계속 제외 넣기
    const add = await call(blockPOST, "/api/admin-live/live-alert-block", { action: "add", customerIds: [String(A.id), String(B.id)] });
    ok("계속 제외 넣기", add.status === 200 && add.json.added === 2, add.json.message);
    const addAgain = await call(blockPOST, "/api/admin-live/live-alert-block", { action: "add", customerIds: [String(A.id)] });
    ok("같은 회원 두 번 넣어도 한 번", addAgain.json.added === 0);
    const s2 = await call(blockGET, `/api/admin-live/live-alert-block?q=${encodeURIComponent(searchName)}`);
    ok("찾기 결과 「제외 중」 표시", (s2.json.results || []).some((r: any) => r.customerId === String(A.id) && r.blocked));

    if (bc) {
      const all1 = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "all" })).json;
      ok("[전체 회원] 제외 후: A·B 빠짐", all1.ok && !inList(all1, A.id) && !inList(all1, B.id), { target: all1.targetCount });
      ok("[전체 회원] 받을 사람 2명 줄어듦", all1.targetCount === allBefore.targetCount - 2, { before: allBefore.targetCount, after: all1.targetCount });
      ok("[전체 회원] 계속 제외 숫자 +2", all1.blockedCount === (allBefore.blockedCount || 0) + 2, all1.blockedCount);
      const opt1 = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "optin" })).json;
      ok("[알림 신청자] 제외 후: A 빠짐", opt1.ok && !inList(opt1, A.id));
      const pr1 = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "priority", limit: 300, orderDays: 90, recentDays: 30 })).json;
      ok("[단골·최근 신청자] 제외 후: A 빠짐(회원 추가 목록 포함)", pr1.ok && !inList(pr1, A.id), pr1.error);
      // 제외 전에 만든 명단(서명)으로 다시 미리보기 → 오류 없이 A·B 빠짐
      const old = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "all", selectionToken: allBefore.selectionToken, includeIds: [], excludeIds: [] })).json;
      ok("제외 전 명단으로 다시 봐도 A·B 빠짐(오류 없음)", old.ok && !inSample(old, A.id) && !inSample(old, B.id), old.error);
      // 직접 포함해도 빠짐
      const aId = (allBefore.sample || []).find((m: any) => m.cid === String(A.id))?.id;
      const inc = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "all", includeIds: [aId], excludeIds: [] })).json;
      ok("직접 포함해도 계속 제외 회원은 빠짐", inc.ok && !inSample(inc, A.id), inc.error);
    }

    // 5) 해제
    const list = (await call(blockGET, "/api/admin-live/live-alert-block")).json.items || [];
    const ids = list.filter((b: any) => b.customerId === String(A.id) || b.customerId === String(B.id)).map((b: any) => b.id);
    const rm = await call(blockPOST, "/api/admin-live/live-alert-block", { action: "remove", ids });
    ok("해제", rm.json.removed === 2);
    if (bc) {
      const all2 = (await call(sendPOST, "/api/admin-live/live-alert-send", { broadcastId: bc.id, dryRun: true, mode: "all" })).json;
      ok("해제 후 A·B 다시 들어옴", inSample(all2, A.id) && inSample(all2, B.id) && all2.targetCount === allBefore.targetCount);
    }
    // 6) 로그인 안 하면 막힘
    const noAuth = await blockGET(new NextRequest(`${base}/api/admin-live/live-alert-block`));
    ok("관리자 아니면 401", noAuth.status === 401);
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  } finally {
    await writeLiveAlertBlocks(db, original);
    out.restoredCount = (await readLiveAlertBlocks(db)).length;
  }
  out.checks = checks.map(([n, p, d]) => ({ n, p, d }));
  out.pass = checks.filter((c) => c[1]).length;
  out.fail = checks.filter((c) => !c[1]).length;
  return NextResponse.json(out);
}
