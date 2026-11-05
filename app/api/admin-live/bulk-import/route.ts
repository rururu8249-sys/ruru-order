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
    // [2026-11-05] 브랜드 묶음 썸네일 바꾸기 — products.image_url 한 칸만 쓴다(옛 주소는 응답에 돌려줌 = 되돌리기용).
    if (body?.mode === "thumb") {
      const dir = String(body?.dir || "");
      if (!/^\/_import\/[a-z0-9_-]+\/$/i.test(dir)) return NextResponse.json({ error: "dir 확인" }, { status: 400 });
      const list = (Array.isArray(body?.items) ? body.items : []) as { id: number; file: string }[];
      if (!list.length || list.some((x) => !(Number(x.id) > 0) || !/^[a-z0-9_-]+\.jpg$/i.test(String(x.file)))) return NextResponse.json({ error: "items 확인" }, { status: 400 });
      const sb = db();
      const origin = request.nextUrl.origin;
      const now = new Date();
      const done: { id: number; oldUrl: string | null; newUrl: string }[] = [];
      for (const x of list) {
        const { data: row, error: re } = await sb.from("products").select("id, image_url").eq("id", x.id).single();
        if (re || !row) throw new Error(`상품 ${x.id} 없음`);
        const res = await fetch(origin + dir + x.file, { cache: "no-store" });
        if (!res.ok) throw new Error(`사진 못 읽음 ${x.file}`);
        const key = `products/cover/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-brand-${x.id}.jpg`;
        const { error: ue } = await sb.storage.from("product-images").upload(key, new Uint8Array(await res.arrayBuffer()), { contentType: "image/jpeg", upsert: false });
        if (ue) throw new Error(`사진 올리기 실패 ${x.file}: ${ue.message}`);
        const newUrl = sb.storage.from("product-images").getPublicUrl(key).data.publicUrl;
        const { error: pe } = await sb.from("products").update({ image_url: newUrl }).eq("id", x.id);
        if (pe) throw new Error(`상품 ${x.id} 저장 실패: ${pe.message}`);
        done.push({ id: x.id, oldUrl: (row.image_url as string | null) ?? null, newUrl });
      }
      return NextResponse.json({ mode: "thumb", done });
    }
    // [2026-11-05] 세부상품을 다른 브랜드 묶음으로 옮기기(예: 기타브랜드 MX-1 → 막스마라). run 아니면 계산만.
    if (body?.mode === "movedetail") {
      const from = Number(body?.from), to = Number(body?.to);
      const name = String(body?.name || ""), newName = String(body?.newName || name);
      if (!(from > 0) || !(to > 0) || !name || newName.includes("/")) return NextResponse.json({ error: "from/to/name 확인" }, { status: 400 });
      const sb = db();
      const lib = await import("@/lib/bulkImportMerge");
      const { data: rows, error } = await sb.from("products").select("*").in("id", [from, to]);
      if (error) throw error;
      const src = (rows || []).find((r) => Number(r.id) === from), dst = (rows || []).find((r) => Number(r.id) === to);
      if (!src || !dst) throw new Error("상품 없음");
      const item = lib.readBrandDetail(src, name);
      if (!item || !item.photoUrl) throw new Error(`${name}: 사이즈·사진을 못 읽음`);
      const rm = lib.removeDetailsFromBrandRow(src, [name]);
      const add = lib.mergeImportIntoBrandRow(dst, [{ ...item, code: newName, title: newName, category: "" }]);
      const { data: ord } = await sb.from("orders").select("id, status, payment_status").eq("product_id", from).ilike("product_name", `%${name.replace(/[%_]/g, "")}%`).limit(50);
      const { data: holds } = await sb.from("cart_reservations").select("id").eq("product_id", from).limit(50);
      const info = { item, srcBase: [rm.basePriceBefore, rm.basePriceAfter], dstBase: [add.basePriceBefore, add.basePriceAfter], srcKept: rm.untouchedChecked, dstChecked: add.untouchedChecked, pastOrders: (ord || []).length, holdsOnSource: (holds || []).length };
      if (body?.run !== true) return NextResponse.json({ mode: "movedetail", check: true, ...info });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const { error: be } = await sb.storage.from("admin-private").upload(`backups/move-detail-${stamp}.json`, new Blob([JSON.stringify({ rows })], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (be) throw new Error("백업 실패 — 안 옮김: " + be.message);
      const { error: e1 } = await sb.from("products").update(add.values).eq("id", to);
      if (e1) throw new Error("넣기 실패(아무것도 안 바뀜): " + e1.message);
      const { error: e2 } = await sb.from("products").update(rm.values).eq("id", from);
      if (e2) throw new Error("넣기는 됐는데 원래 묶음에서 빼기 실패: " + e2.message);
      return NextResponse.json({ mode: "movedetail", done: true, backup: `admin-private/backups/move-detail-${stamp}.json`, ...info });
    }
    // [2026-11-05] 묶음 나누기 — 한 묶음(예: 기타브랜드)의 같은 브랜드 세부상품 여러 개를 새 브랜드 묶음으로 옮기고 방송에 연결.
    //   실제 판매가·사이즈·사진 그대로(이름만 newName), 남는 세부상품 판매가 고정 검사. run 아니면 계산만.
    if (body?.mode === "splitbrand") {
      const from = Number(body?.from);
      const brandKo = String(body?.brandKo || "").trim(), brandEn = String(body?.brandEn || "").trim();
      const broadcastId = String(body?.broadcastId || "");
      const moves = (Array.isArray(body?.moves) ? body.moves : []) as { name: string; newName: string }[];
      if (!(from > 0) || !brandKo || moves.length < 1 || moves.some((m) => !m?.name || !m?.newName || String(m.newName).includes("/"))) return NextResponse.json({ error: "from/brandKo/moves 확인" }, { status: 400 });
      if (!/^[0-9a-f-]{36}$/.test(broadcastId)) return NextResponse.json({ error: "방송 id 확인" }, { status: 400 });
      const sb = db();
      const lib = await import("@/lib/bulkImportMerge");
      const { data: src, error } = await sb.from("products").select("*").eq("id", from).single();
      if (error || !src) throw new Error("원래 묶음 없음");
      const items = moves.map((m) => {
        const it = lib.readBrandDetail(src, m.name);
        if (!it || !it.photoUrl) throw new Error(`${m.name}: 사이즈·사진을 못 읽음`);
        return { ...it, code: m.newName, title: m.newName, category: "" };
      });
      const rm = lib.removeDetailsFromBrandRow(src, moves.map((m) => m.name));
      const blank = lib.blankBrandRowFrom(src, brandKo, brandEn || brandKo);
      const add = lib.mergeImportIntoBrandRow(blank, items);
      const names = moves.map((m) => m.name);
      const { data: ord } = await sb.from("orders").select("id, product_name").eq("product_id", from).limit(2000);
      const pastOrders = (ord || []).filter((o) => names.some((n) => String(o.product_name || "").includes(n))).length;
      const { data: holds } = await sb.from("cart_reservations").select("id, color").eq("product_id", from).limit(500);
      const holdsOnMoved = (holds || []).filter((h) => names.some((n) => String(h.color || "").startsWith(n))).length;
      const info = { brandKo, items: items.map((i) => ({ title: i.title, price: i.price, sizes: i.sizes })), srcBase: [rm.basePriceBefore, rm.basePriceAfter], srcKept: rm.untouchedChecked, newBase: add.basePriceAfter, pastOrders, holdsOnMoved };
      if (body?.run !== true) return NextResponse.json({ mode: "splitbrand", check: true, ...info });
      if (holdsOnMoved > 0) return NextResponse.json({ error: `장바구니에 담긴 줄 ${holdsOnMoved}개 — 안 옮김` }, { status: 409 });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const { error: be } = await sb.storage.from("admin-private").upload(`backups/split-brand-${stamp}.json`, new Blob([JSON.stringify({ src })], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (be) throw new Error("백업 실패 — 안 옮김: " + be.message);
      const { data: created, error: ie } = await sb.from("products").insert({ ...blank, ...add.values }).select("id").single();
      if (ie || !created) throw new Error("새 묶음 만들기 실패(아무것도 안 바뀜): " + (ie?.message || ""));
      const newId = Number(created.id);
      const { error: e2 } = await sb.from("products").update(rm.values).eq("id", from);
      if (e2) {
        await sb.from("products").delete().eq("id", newId);
        throw new Error("원래 묶음에서 빼기 실패 — 새 묶음 지움: " + e2.message);
      }
      const { data: have } = await sb.from("broadcast_products").select("product_id, sort_order").eq("broadcast_id", broadcastId);
      const srcLink = (have || []).find((h) => Number(h.product_id) === from);
      const sort = srcLink ? Number(srcLink.sort_order) || 0 : Math.max(0, ...(have || []).map((h) => Number(h.sort_order) || 0)) + 1;
      const { error: le } = await sb.from("broadcast_products").insert({ broadcast_id: broadcastId, product_id: newId, sort_order: sort, is_visible: true });
      if (le) throw new Error(`새 묶음(${newId})은 만들고 옮겼는데 방송 연결 실패: ` + le.message);
      return NextResponse.json({ mode: "splitbrand", done: true, newId, backup: `admin-private/backups/split-brand-${stamp}.json`, ...info });
    }
    // [2026-11-05] 세부상품 사진 바꾸기(예전 사진 한자 정리) — 지금 칸의 주소가 oldUrl 과 같을 때만 바꿈. run 아니면 계산만.
    if (body?.mode === "replacephoto") {
      const dir = String(body?.dir || "");
      if (!/^\/_import\/[a-z0-9_-]+\/$/i.test(dir)) return NextResponse.json({ error: "dir 확인" }, { status: 400 });
      const list = (Array.isArray(body?.items) ? body.items : []) as { id: number; name: string; index: number; oldUrl: string; file: string }[];
      if (!list.length || list.some((x) => !(Number(x.id) > 0) || !x.name || !(Number(x.index) >= 0) || !x.oldUrl || !/^[a-z0-9_-]+\.jpg$/i.test(String(x.file)))) return NextResponse.json({ error: "items 확인" }, { status: 400 });
      const run = body?.run === true;
      const sb = db();
      const { noteObject } = await import("@/lib/bulkImportMerge");
      const ids = [...new Set(list.map((x) => Number(x.id)))];
      const { data: rows, error } = await sb.from("products").select("*").in("id", ids);
      if (error) throw error;
      const problems: string[] = [];
      for (const x of list) {
        const r = (rows || []).find((p) => Number(p.id) === Number(x.id));
        const set = r ? noteObject(r.product_note).detail_photo_sets as Record<string, string[]> | undefined : undefined;
        if (!set || set[x.name]?.[x.index] !== x.oldUrl) problems.push(`${x.id} ${x.name} ${x.index}`);
      }
      if (problems.length) return NextResponse.json({ error: "지금 사진 주소가 달라요 — 안 바꿈", problems }, { status: 409 });
      if (!run) return NextResponse.json({ mode: "replacephoto", check: true, items: list.length, rows: ids.length });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const { error: be } = await sb.storage.from("admin-private").upload(`backups/replace-photo-${stamp}.json`, new Blob([JSON.stringify({ rows })], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (be) throw new Error("백업 실패 — 안 바꿈: " + be.message);
      const now = new Date();
      const uploaded = new Map<string, string>();
      for (const file of [...new Set(list.map((x) => x.file))]) {
        const res = await fetch(request.nextUrl.origin + dir + file, { cache: "no-store" });
        if (!res.ok) throw new Error(`사진 못 읽음 ${file}`);
        const key = `products/detail/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-ko-${file}`;
        const { error: ue } = await sb.storage.from("product-images").upload(key, new Uint8Array(await res.arrayBuffer()), { contentType: "image/jpeg", upsert: false });
        if (ue) throw new Error(`사진 올리기 실패 ${file}: ${ue.message}`);
        uploaded.set(file, sb.storage.from("product-images").getPublicUrl(key).data.publicUrl);
      }
      const changed: { id: number; name: string; oldUrl: string; newUrl: string }[] = [];
      for (const id of ids) {
        const r = (rows || []).find((p) => Number(p.id) === id)!;
        const note = noteObject(r.product_note);
        const sets = { ...(note.detail_photo_sets as Record<string, string[]>) };
        const photos = { ...((note.detail_photos as Record<string, string>) || {}) };
        const swap = new Map<string, string>();
        for (const x of list.filter((y) => Number(y.id) === id)) {
          const nu = uploaded.get(x.file)!;
          const arr = [...sets[x.name]]; arr[x.index] = nu;
          sets[x.name] = [...new Set(arr)];
          if (photos[x.name] === x.oldUrl) photos[x.name] = nu;
          swap.set(x.oldUrl, nu);
          changed.push({ id, name: x.name, oldUrl: x.oldUrl, newUrl: nu });
        }
        const urls = [...new Set((Array.isArray(r.detail_image_urls) ? r.detail_image_urls as string[] : []).map((u) => swap.get(u) || u))];
        const merged = { ...note, detail_photo_sets: sets, detail_photos: photos };
        const { error: pe } = await sb.from("products").update({ product_note: typeof r.product_note === "string" ? JSON.stringify(merged) : merged, detail_image_urls: urls }).eq("id", id);
        if (pe) throw new Error(`${id} 저장 실패: ${pe.message}`);
      }
      return NextResponse.json({ mode: "replacephoto", done: changed.length, backup: `admin-private/backups/replace-photo-${stamp}.json`, changed });
    }
    // [2026-11-05] 세부상품 구분(패딩·의류) 비우기 — 손님 화면 구분 칩 없애기. 백업 후 product_note 의 detail_categories 만 비움.
    if (body?.mode === "clearcat") {
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((n: number) => n > 0);
      if (!ids.length) return NextResponse.json({ error: "ids 확인" }, { status: 400 });
      const sb = db();
      const { clearDetailCategories } = await import("@/lib/bulkImportMerge");
      const { data: rows, error } = await sb.from("products").select("id, product_note").in("id", ids);
      if (error) throw error;
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const { error: be } = await sb.storage.from("admin-private").upload(`backups/clear-cat-${stamp}.json`, new Blob([JSON.stringify({ rows })], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (be) throw new Error("백업 실패 — 안 바꿈: " + be.message);
      for (const r of rows || []) {
        const { error: ue } = await sb.from("products").update({ product_note: clearDetailCategories(r) }).eq("id", r.id);
        if (ue) throw new Error(`${r.id} 저장 실패: ${ue.message}`);
      }
      return NextResponse.json({ mode: "clearcat", done: (rows || []).length, backup: `admin-private/backups/clear-cat-${stamp}.json` });
    }
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
      for (const it of list) withUrls.push({ code: it.code, title: it.title, price: it.price, sizes: it.sizes, category: "", photoUrl: await upload(it.images[0], it.code) });
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
