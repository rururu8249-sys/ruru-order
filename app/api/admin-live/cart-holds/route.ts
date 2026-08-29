import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { checkoutReminderCopy } from "@/lib/cartHoldDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const cleanKey = (v: unknown) => String(v ?? "").trim().slice(0, 80);

async function activeBroadcastProductIds(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: bcs } = await supabase
    .from("broadcasts")
    .select("id,public_title,started_at,status,is_deleted")
    .order("started_at", { ascending: false })
    .limit(20);
  const active = ((bcs || []) as Record<string, unknown>[]).find(
    (b) => b.is_deleted !== true && String(b.status || "").toUpperCase() === "ON",
  );
  if (!active?.id) return { title: "", ids: null as Set<string> | null };
  const { data: bps } = await supabase
    .from("broadcast_products")
    .select("product_id,is_visible")
    .eq("broadcast_id", active.id)
    .limit(500);
  return {
    title: String(active.public_title ?? "").trim(),
    ids: new Set(((bps || []) as Record<string, unknown>[])
      .filter((b) => b.is_visible !== false)
      .map((b) => String(b.product_id ?? ""))
      .filter(Boolean)),
  };
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const scopeAll = new URL(request.url).searchParams.get("scope") === "all";
    let broadcastTitle = "";
    let allowedProductIds: Set<string> | null = null;
    if (!scopeAll) {
      const active = await activeBroadcastProductIds(supabase);
      broadcastTitle = active.title;
      allowedProductIds = active.ids;
    }

    const { data, error } = await supabase
      .from("cart_reservations")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(2000);
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });

    let rows = (data || []) as Record<string, unknown>[];
    if (allowedProductIds) rows = rows.filter((r) => allowedProductIds!.has(String(r.product_id ?? "")));

    const ids = Array.from(new Set(rows.map((r) => String(r.product_id ?? "")).filter(Boolean)));
    const names: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: prods, error: prodErr } = await supabase.from("products").select("id, product_name").in("id", ids);
      if (prodErr) return NextResponse.json({ ok: false, error: { message: "상품명 조회 실패: " + prodErr.message } }, { status: 500 });
      for (const p of (prods || []) as Record<string, unknown>[]) names[String(p.id)] = String(p.product_name ?? "").trim();
    }

    const phones = Array.from(new Set(rows.map((r) => String(r.customer_phone ?? "")).filter(Boolean)));
    const who: Record<string, { nickname: string; name: string }> = {};
    if (phones.length > 0) {
      const { data: ords } = await supabase.from("orders").select("*").in("customer_phone", phones).limit(500);
      for (const o of (ords || []) as Record<string, unknown>[]) {
        const ph = String(o.customer_phone ?? "").trim();
        if (!ph) continue;
        const prev = who[ph] || { nickname: "", name: "" };
        who[ph] = {
          nickname: prev.nickname || String((o.youtube_nickname as string) || (o.nickname as string) || "").trim(),
          name: prev.name || String((o.customer_name as string) || (o.name as string) || "").trim(),
        };
      }
      const hyph = (d: string) => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
      const phoneVariants = Array.from(new Set(phones.flatMap((p) => [p, hyph(p)])));
      const { data: custs } = await supabase.from("customers").select("customer_phone,youtube_nickname,customer_name").in("customer_phone", phoneVariants).limit(500);
      for (const c of (custs || []) as Record<string, unknown>[]) {
        const ph = String(c.customer_phone ?? "").replace(/[^0-9]/g, "");
        if (!ph) continue;
        const prev = who[ph] || { nickname: "", name: "" };
        who[ph] = { nickname: prev.nickname || String(c.youtube_nickname ?? "").trim(), name: prev.name || String(c.customer_name ?? "").trim() };
      }
    }

    const holds = rows.map((r) => {
      const ph = String(r.customer_phone ?? "");
      const fallbackProductName = names[String(r.product_id ?? "")] || "상품";
      const snapshotName = String(r.product_name ?? "").trim();
      const rawPrice = r.unit_price;
      const unitPrice = rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === "" ? null : Math.max(0, Math.floor(Number(rawPrice) || 0));
      return {
        sessionKey: String(r.session_key ?? ""),
        phone: ph,
        nickname: String(r.nickname ?? "").trim() || who[ph]?.nickname || "",
        name: String(r.customer_name ?? "").trim() || who[ph]?.name || "",
        productId: String(r.product_id ?? ""),
        productName: snapshotName || fallbackProductName,
        fallbackProductName,
        detailName: String(r.detail_name ?? "").trim(),
        unitPrice,
        legacySnapshot: !snapshotName,
        color: String(r.color ?? ""),
        size: String(r.size ?? ""),
        qty: Number(r.qty) || 0,
        expiresAt: String(r.expires_at ?? ""),
        createdAt: String(r.created_at ?? ""),
      };
    });

    // [2026-08-30 사장님 지적] "클릭해도 아무 반응없음" — 실제로는 발송됐는데
    //   보냈는지·손님이 봤는지 화면에서 확인할 방법이 없어 안 된 것처럼 보였다.
    //   → 장바구니마다 마지막 알림의 발송/확인 상태를 같이 내려준다. (읽기 전용)
    const alertBySession: Record<string, { sentAt: string; seenAt: string }> = {};
    try {
      const sessionKeys = Array.from(new Set(rows.map((r) => String(r.session_key ?? "")).filter(Boolean))).slice(0, 250);
      if (sessionKeys.length > 0) {
        const { data: alertRows } = await supabase
          .from("customer_site_alerts")
          .select("target_session_key, created_at, seen_at")
          .in("target_session_key", sessionKeys)
          .eq("kind", "checkout_reminder")
          .order("created_at", { ascending: false })
          .limit(1000);
        for (const a of (alertRows || []) as Record<string, unknown>[]) {
          const k = String(a.target_session_key ?? "");
          if (!k || alertBySession[k]) continue;   // 최신순이라 첫 줄이 마지막 알림
          alertBySession[k] = { sentAt: String(a.created_at ?? ""), seenAt: String(a.seen_at ?? "") };
        }
      }
    } catch {
      /* 알림 상태 표시는 보조 기능 — 실패해도 담김 목록은 정상 표시 */
    }

    return NextResponse.json({
      ok: true,
      holds,
      alerts: alertBySession,
      scope: allowedProductIds ? "broadcast" : "all",
      broadcastTitle,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message ?? e) } }, { status: 500 });
  }
}

async function sendReminders(supabase: ReturnType<typeof getSupabaseAdmin>, requestedKeys: string[], sentBy: string) {
  const keys = Array.from(new Set(requestedKeys.map(cleanKey).filter((k) => k.length >= 6))).slice(0, 250);
  if (keys.length === 0) return { sent: 0, skipped: 0 };
  const nowIso = new Date().toISOString();
  const { data: holdRows, error } = await supabase
    .from("cart_reservations")
    .select("session_key,customer_phone,expires_at")
    .in("session_key", keys)
    .gt("expires_at", nowIso)
    .limit(4000);
  if (error) throw new Error(error.message);

  const targets = new Map<string, { phone: string | null; expiresAt: string }>();
  for (const row of (holdRows || []) as Record<string, unknown>[]) {
    const key = cleanKey(row.session_key);
    if (!key) continue;
    const expiresAt = String(row.expires_at ?? "");
    const prev = targets.get(key);
    if (!prev || new Date(expiresAt).getTime() < new Date(prev.expiresAt).getTime()) {
      targets.set(key, { phone: String(row.customer_phone ?? "").replace(/[^0-9]/g, "") || null, expiresAt });
    }
  }
  if (targets.size === 0) return { sent: 0, skipped: keys.length };

  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const targetKeys = Array.from(targets.keys());
  const { data: recent } = await supabase
    .from("customer_site_alerts")
    .select("target_session_key")
    .in("target_session_key", targetKeys)
    .eq("kind", "checkout_reminder")
    .gte("created_at", cutoff);
  const recentlySent = new Set(((recent || []) as Record<string, unknown>[]).map((r) => cleanKey(r.target_session_key)).filter(Boolean));
  const copy = checkoutReminderCopy();
  const rows = targetKeys.filter((key) => !recentlySent.has(key)).map((key) => ({
    target_session_key: key,
    customer_phone: targets.get(key)?.phone || null,
    kind: "checkout_reminder",
    title: copy.title,
    message: copy.message,
    is_active: true,
    expires_at: targets.get(key)?.expiresAt || new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
    sent_by: sentBy,
  }));
  if (rows.length > 0) {
    await supabase.from("customer_site_alerts").update({ is_active: false }).in("target_session_key", rows.map((r) => r.target_session_key)).eq("kind", "checkout_reminder").eq("is_active", true);
    const { error: insertError } = await supabase.from("customer_site_alerts").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  return { sent: rows.length, skipped: keys.length - rows.length };
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = String(body?.action || "").trim();
    const supabase = getSupabaseAdmin();

    if (action === "remind" || action === "remind-all") {
      const requested = action === "remind" ? [body?.sessionKey] : (Array.isArray(body?.sessionKeys) ? body.sessionKeys : []);
      const result = await sendReminders(supabase, requested, String((session as any)?.username || (session as any)?.id || "admin").slice(0, 80));
      return NextResponse.json({ ok: true, ...result });
    }

    const sessionKey = cleanKey(body?.sessionKey);
    if (action !== "clear") return NextResponse.json({ ok: false, error: { message: "알 수 없는 action" } }, { status: 400 });
    if (!sessionKey) return NextResponse.json({ ok: false, error: { message: "sessionKey 없음" } }, { status: 400 });

    const { error } = await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
    try {
      const rk = `cart_revoke_${sessionKey}`.slice(0, 250);
      const { data: ex } = await supabase.from("settings").select("key").eq("key", rk).limit(1);
      if (Array.isArray(ex) && ex.length > 0) await supabase.from("settings").update({ value: new Date().toISOString() }).eq("key", rk);
      else await supabase.from("settings").insert({ key: rk, value: new Date().toISOString() });
    } catch { /* 회수 지시 실패해도 해제 자체는 유지 */ }
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message ?? e) } }, { status: 500 });
  }
}
