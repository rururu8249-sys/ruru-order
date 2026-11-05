import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

// [2026-11-05] 해외 엑셀 일괄등록용 읽기 전용 확인 주소 — 관리자만, 쓰기 없음.
//   브랜드 묶음 상품(product_note.brand_group.enabled)과 대상 방송 연결 상태를 돌려준다.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 사진 193장 올리기

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Missing configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function noteOf(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
  return typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sb = db();
    const title = request.nextUrl.searchParams.get("broadcast") || "해외명품의류1";
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("products")
        .select("*")
        .order("id").range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const brands = rows.filter((r) => String(r.status || "") !== "deleted" && (noteOf(r.product_note).brand_group as Record<string, unknown> | undefined)?.enabled === true)
      .map((r) => ({ ...r, product_note: noteOf(r.product_note) }));
    const { data: allBc, error: bErr } = await sb.from("broadcasts").select("*").order("id", { ascending: false }).limit(80);
    if (bErr) throw bErr;
    const bcs = (allBc || []).filter((b) => Object.values(b).some((v) => typeof v === "string" && v.includes(title))).slice(0, 5);
    const links: Record<string, unknown[]> = {};
    for (const b of bcs || []) {
      const { data } = await sb.from("broadcast_products").select("product_id, sort_order, is_visible").eq("broadcast_id", b.id);
      links[String(b.id)] = data || [];
    }
    return NextResponse.json({ brands, broadcasts: bcs, links, productCount: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : JSON.stringify(e) }, { status: 500 });
  }
}

// ── POST: 엑셀 계획(plan.json)대로 브랜드 묶음 상품에 세부상품을 넣는다 ──
//   mode "check" = 계산만(쓰기 0) / "run" = 원본 백업 → 사진 올리기 → 상품 저장 → 방송 연결
//   돈·입금·주문·포인트 무접촉 — products / broadcast_products / storage(product-images) 만 쓴다.
type PlanItem = { code: string; title: string; price: number; sizes: string[]; category: string; images: string[]; target: string };

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "run" ? "run" : "check";
    const planPath = String(body?.plan || "");
    const broadcastId = String(body?.broadcastId || "");
    const maxmara = body?.maxmara === "etc" ? "etc" : "new";
    if (!/^\/_import\/[a-z0-9_-]+\/plan\.json$/i.test(planPath)) return NextResponse.json({ error: "plan 경로 확인" }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/.test(broadcastId)) return NextResponse.json({ error: "방송 id 확인" }, { status: 400 });
    const origin = request.nextUrl.origin;
    const dir = planPath.replace(/plan\.json$/, "");
    const items = (await fetch(origin + planPath, { cache: "no-store" }).then((r) => r.json())) as PlanItem[];
    const sb = db();
    const { mergeImportIntoBrandRow, blankBrandRowFrom } = await import("@/lib/bulkImportMerge");

    const TARGET: Record<string, string> = { bag: "753", NEW_MAXMARA: maxmara === "etc" ? "742" : "NEW_MAXMARA" };
    const groups = new Map<string, PlanItem[]>();
    for (const it of items) {
      const t = TARGET[it.target] || it.target;
      const title = t === "742" && it.code.startsWith("MX-") ? it.title.replace(it.code, `${it.code}(막스마라)`) : it.title;
      groups.set(t, [...(groups.get(t) || []), { ...it, title }]);
    }
    const ids = [...groups.keys()].filter((k) => /^\d+$/.test(k));
    const { data: rows, error } = await sb.from("products").select("*").in("id", ids);
    if (error) throw error;
    const byId = new Map((rows || []).map((r) => [String(r.id), r as Record<string, unknown>]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error("대상 상품 없음: " + missing.join(","));

    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const upload = async (file: string, code: string) => {
      if (mode === "check") return `check://${file}`;
      const res = await fetch(origin + dir + encodeURIComponent(file), { cache: "no-store" });
      if (!res.ok) throw new Error(`사진 못 읽음 ${file}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const now = new Date();
      const key = `products/detail/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${code.replace(/[^A-Za-z0-9_-]/g, "")}.jpg`;
      for (let a = 1; a <= 3; a++) {
        const { error: e } = await sb.storage.from("product-images").upload(key, bytes, { contentType: "image/jpeg", upsert: false });
        if (!e) return sb.storage.from("product-images").getPublicUrl(key).data.publicUrl;
        if (a === 3) throw new Error(`사진 올리기 실패 ${file}: ${e.message}`);
      }
      return "";
    };

    if (mode === "run") {
      const backup = JSON.stringify({ at: stamp, rows: rows || [] });
      // 사진 저장소는 JSON 을 안 받음 → 비공개 저장소(admin-private, 방송알림 제외 명단과 같은 곳)
      const { data: bk, error: gbe } = await sb.storage.getBucket("admin-private");
      if (gbe || !bk) {
        const { error: cbe } = await sb.storage.createBucket("admin-private", { public: false, fileSizeLimit: 2 * 1024 * 1024 });
        if (cbe && !String(cbe.message || "").toLowerCase().includes("already")) throw new Error("백업 저장소 만들기 실패 — 등록 안 함: " + cbe.message);
      }
      const { error: be } = await sb.storage.from("admin-private").upload(`backups/bulk-import-${stamp}.json`, new Blob([backup], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (be) throw new Error("백업 저장 실패 — 등록 안 함: " + be.message);
    }

    const summary: Record<string, unknown>[] = [];
    const touched: string[] = [];
    for (const [t, list] of groups) {
      let row: Record<string, unknown>;
      if (t === "NEW_MAXMARA") {
        const template = byId.get("751") || (await sb.from("products").select("*").eq("id", 751).single()).data;
        row = { ...blankBrandRowFrom(template as Record<string, unknown>, "막스마라", "MaxMara"), id: "NEW" };
      } else row = byId.get(t)!;
      const withUrls = [];
      for (const it of list) withUrls.push({ code: it.code, title: it.title, price: it.price, sizes: it.sizes, category: it.category, photoUrl: await upload(it.images[0], it.code) });
      const m = mergeImportIntoBrandRow(row, withUrls);
      let id = String(row.id);
      if (mode === "run") {
        if (t === "NEW_MAXMARA") {
          const { id: _x, ...ins } = row; void _x;
          const { data: created, error: ie } = await sb.from("products").insert({ ...ins, ...m.values }).select("id").single();
          if (ie) throw new Error("막스마라 만들기 실패: " + ie.message);
          id = String(created.id);
        } else {
          const { error: ue } = await sb.from("products").update(m.values).eq("id", row.id);
          if (ue) throw new Error(`${row.product_name} 저장 실패: ${ue.message}`);
        }
      }
      touched.push(id);
      summary.push({ id, name: row.product_name, added: m.added.length, replaced: m.removed, base: [m.basePriceBefore, m.basePriceAfter], untouchedChecked: m.untouchedChecked, finalDetails: m.finalDetails, sample: m.added.slice(0, 3) });
    }

    let linked = 0;
    if (mode === "run") {
      const { data: have } = await sb.from("broadcast_products").select("product_id, sort_order").eq("broadcast_id", broadcastId);
      const haveIds = new Set((have || []).map((h) => String(h.product_id)));
      let sort = Math.max(0, ...(have || []).map((h) => Number(h.sort_order) || 0));
      const links = touched.filter((id) => !haveIds.has(id)).map((id) => ({ broadcast_id: broadcastId, product_id: Number(id), sort_order: ++sort, is_visible: true }));
      if (links.length) {
        const { error: le } = await sb.from("broadcast_products").insert(links);
        if (le) throw new Error("방송 연결 실패(상품은 저장됨): " + le.message);
      }
      linked = links.length;
    }
    return NextResponse.json({ mode, items: items.length, summary, linked, backup: mode === "run" ? `admin-private/backups/bulk-import-${stamp}.json` : null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : JSON.stringify(e) }, { status: 500 });
  }
}
