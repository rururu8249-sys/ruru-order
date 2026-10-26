// [2026-10-26 사장님 「방송 시작 재고 > 추가·수정 재고 표시」] 재고 흐름 읽기.
//   GET ?scope=bc:<방송id> | day:YYYY-MM-DD &ids=1,2,3(쇼핑몰은 화면의 상품 id)
//   지금 진행 중인 방송·오늘 쇼핑몰이면 기준 없는 상품은 이때 «지금 재고»로 기준을 찍는다(settings 한 줄).
//   재고·주문·돈 무접촉 — 읽기 + 기준 기록만. 관리자만(이중: middleware + verifyAdminSession).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { buildStockFlowLines, orderRowCountsAsSold, stockMapFromProductRow } from "@/lib/stockFlow";
import { ADMIN_STOCK_EDIT_REASON, ensureStockFlowBase, readProductStockRows, readStockFlowBase } from "@/lib/stockFlowServer";
import { kstDateKey } from "@/lib/orderPickingWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ORDER_COLS = "product_id,color,size,qty,created_at,is_deleted,inventory_deduction_status,inventory_restored_at,admin_order_status_v2,order_manage_status";

const ms = (v: unknown) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

async function fetchAll(q: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sp = new URL(request.url).searchParams;
    const scope = String(sp.get("scope") || "").trim();
    const extraIds = String(sp.get("ids") || "").split(",").map((v) => v.trim()).filter((v) => /^\d+$/.test(v)).slice(0, 400);
    const sb = admin();
    const nowIso = new Date().toISOString();

    let live = false;
    let windowStart = "";
    let windowEnd = nowIso;
    let pids: string[] = [...extraIds];
    let label = "";

    if (/^bc:[A-Za-z0-9-]{1,64}$/.test(scope)) {
      const bid = scope.slice(3);
      const { data: bc } = await sb.from("broadcasts").select("id,status,started_at,ended_at,public_title").eq("id", bid).limit(1);
      const b = (bc as any[])?.[0];
      if (!b) return NextResponse.json({ ok: false, message: "방송을 찾을 수 없어요." }, { status: 404 });
      live = String(b.status || "").toUpperCase() === "ON";
      windowStart = String(b.started_at || "");
      if (!live && b.ended_at) windowEnd = String(b.ended_at);
      label = String(b.public_title || "");
      const { data: bp } = await sb.from("broadcast_products").select("product_id").eq("broadcast_id", bid);
      pids = Array.from(new Set([...pids, ...((bp || []) as any[]).map((r) => String(r.product_id ?? ""))])).filter((v) => /^\d+$/.test(v));
    } else if (/^day:\d{4}-\d{2}-\d{2}$/.test(scope)) {
      const day = scope.slice(4);
      live = day === kstDateKey(new Date());
      windowStart = new Date(`${day}T00:00:00+09:00`).toISOString();
      if (!live) windowEnd = new Date(`${day}T23:59:59.999+09:00`).toISOString();
      label = day;
    } else {
      return NextResponse.json({ ok: false, message: "범위를 확인해 주세요." }, { status: 400 });
    }

    const base = live ? await ensureStockFlowBase(sb, scope, pids) : await readStockFlowBase(sb, scope);
    const items = base?.items || {};
    const withBase = pids.filter((id) => items[id]);
    if (!withBase.length) {
      return NextResponse.json({ ok: true, live, label, products: {}, note: live ? "기준을 못 찍었어요. 잠시 뒤 다시 열어 주세요." : "이 날은 기록이 없어요 — 재고 흐름은 2026-10-26 방송부터 남아요." });
    }
    const minAt = new Date(Math.min(...withBase.map((id) => ms(items[id].at)))).toISOString();
    const queryFrom = windowStart && ms(windowStart) < ms(minAt) ? new Date(ms(windowStart)).toISOString() : minAt;

    const [orders, edits, nowRows] = await Promise.all([
      fetchAll(() => sb.from("orders").select(ORDER_COLS).in("product_id", withBase.map(Number)).gte("created_at", queryFrom).lte("created_at", windowEnd).order("created_at", { ascending: true })),
      fetchAll(() => sb.from("inventory_ledger").select("product_id,color,size,change_qty,created_at").eq("reason", ADMIN_STOCK_EDIT_REASON).in("product_id", withBase.map(Number)).gte("created_at", minAt).lte("created_at", windowEnd).order("created_at", { ascending: true })),
      live ? readProductStockRows(sb, withBase) : Promise.resolve(new Map<string, any>()),
    ]);

    const products: Record<string, any> = {};
    for (const id of withBase) {
      const at = items[id].at;
      const atMs = ms(at);
      const startMs = windowStart ? ms(windowStart) : NaN;
      const mine = orders.filter((o) => String(o.product_id) === id && orderRowCountsAsSold(o));
      const sold = mine.filter((o) => ms(o.created_at) >= atMs);
      const soldBefore = Number.isFinite(startMs)
        ? mine.filter((o) => ms(o.created_at) < atMs && ms(o.created_at) >= startMs).reduce((s, o) => s + (Number(o.qty) || 0), 0)
        : 0;
      const myEdits = edits.filter((e) => String(e.product_id) === id && ms(e.created_at) >= atMs);
      const nowMap = live ? stockMapFromProductRow(nowRows.get(id)) : null;
      const lines = buildStockFlowLines({ base: items[id].stock, now: nowMap, edits: myEdits, sold });
      products[id] = {
        at,
        managed: items[id].stock !== null || nowMap !== null,
        soldBefore,
        lines: live ? lines : lines.map((l) => ({ ...l, now: null, diff: 0, end: (l.base ?? 0) + l.added - l.removed - l.sold })),
        edits: myEdits.slice(-20).map((e) => ({ color: e.color, size: e.size, delta: e.change_qty, at: e.created_at })),
      };
    }
    return NextResponse.json({ ok: true, live, label, windowStart, products });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 });
  }
}
