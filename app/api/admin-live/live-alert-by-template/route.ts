// app/api/admin-live/live-alert-by-template/route.ts
// [2026-11-09] 알림톡 종류별 비교 — 발송 한 번마다: 받은 사람 중 보낸 뒤 30분 안에 사이트를 «새로» 연 사람(닉네임 기준),
//   + 그 30분 전/후 사이트 새 접속 수(모든 사람). 관리자만 · 읽기만(SELECT).
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { allLiveAlertTemplates, liveAlertTemplateName, parseLiveAlertTemplates, LIVE_ALERT_TEMPLATES_KEY } from "@/lib/liveAlertTemplates";
import { ALERT_VISIT_WINDOW_MS, countVisitedRecipients, summarizeByTemplate, type AlertSend } from "@/lib/liveAlertByTemplate";

export const maxDuration = 60;

function svc(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const hyphen = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

async function readPaged<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0, p = 0; p < 20; p++, from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });
    const sb = svc();
    const days = Math.min(120, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 60));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const envId = process.env.SOLAPI_TEMPLATE_ID || "";
    const { data: tplRows } = await sb.from("settings").select("value").eq("key", LIVE_ALERT_TEMPLATES_KEY).limit(1);
    const tplCfg = parseLiveAlertTemplates(Array.isArray(tplRows) && tplRows[0] ? (tplRows[0] as { value?: unknown }).value : null);
    const knownIds = new Set(allLiveAlertTemplates(tplCfg, envId).map((t) => t.id));

    const { data: logs, error: logErr } = await sb.from("live_alert_logs").select("broadcast_id,template_code,success_count,created_at").gte("created_at", since).gt("success_count", 0).not("broadcast_id", "is", null).order("created_at", { ascending: true }).limit(300);
    if (logErr) throw new Error(`발송 기록을 못 읽었어요: ${logErr.message}`);
    const logRows = (logs || []) as Array<{ broadcast_id: string; template_code: string | null; success_count: number; created_at: string }>;

    const baseIds = [...new Set(logRows.map((l) => String(l.broadcast_id).split("#")[0]))];
    const { data: bcs } = baseIds.length ? await sb.from("broadcasts").select("id,public_title").in("id", baseIds) : { data: [] };
    const titleOf = new Map(((bcs || []) as Array<{ id: string; public_title: string | null }>).map((b) => [String(b.id), String(b.public_title || "방송")]));

    const sends: AlertSend[] = [];
    let prevByBc = new Map<string, number>();
    for (const l of logRows) {
      const bcKey = String(l.broadcast_id);
      const logAt = Date.parse(l.created_at);
      const from = Math.max(prevByBc.get(bcKey) ?? 0, logAt - 15 * 60_000);
      prevByBc = new Map(prevByBc).set(bcKey, logAt + 60_000);
      const rec = await readPaged<{ customer_phone: string; sent_at: string }>((f, t) => sb.from("live_alert_recipients").select("customer_phone,sent_at").eq("broadcast_id", bcKey).eq("status", "success").gte("sent_at", new Date(from).toISOString()).lte("sent_at", new Date(logAt + 60_000).toISOString()).range(f, t));
      const phones = [...new Set(rec.map((r) => digits(r.customer_phone)).filter(Boolean))];
      const times = rec.map((r) => Date.parse(r.sent_at)).filter(Number.isFinite);
      const sentAt = times.length ? Math.min(...times) : logAt;

      const nicksByPhone = new Map<string, string[]>();
      for (let i = 0; i < phones.length; i += 150) {
        const chunk = phones.slice(i, i + 150);
        const { data: cs } = await sb.from("customers").select("customer_phone,youtube_nickname").in("customer_phone", [...chunk, ...chunk.map(hyphen)]);
        for (const c of (cs || []) as Array<{ customer_phone: string; youtube_nickname: string | null }>) {
          const p = digits(c.customer_phone);
          if (c.youtube_nickname) nicksByPhone.set(p, [...(nicksByPhone.get(p) || []), String(c.youtube_nickname)]);
        }
      }

      const winEnd = new Date(sentAt + ALERT_VISIT_WINDOW_MS).toISOString();
      const winBefore = new Date(sentAt - ALERT_VISIT_WINDOW_MS).toISOString();
      const visits = await readPaged<{ visitor_key: string | null; nickname: string | null; page_type: string | null; started_at: string }>((f, t) => sb.from("visitor_visits").select("visitor_key,nickname,page_type,started_at").gte("started_at", winBefore).lte("started_at", winEnd).range(f, t));
      const site = visits.filter((v) => v.page_type !== "admin");
      const after = site.filter((v) => Date.parse(v.started_at) >= sentAt);
      const before = site.filter((v) => Date.parse(v.started_at) < sentAt);
      const keyOf = (v: { visitor_key: string | null; nickname: string | null }) => String(v.nickname || v.visitor_key || "");
      const tid = String(l.template_code || envId || "");
      sends.push({
        key: `${bcKey}|${l.created_at}`,
        templateId: tid,
        templateName: knownIds.has(tid) || tid === envId ? liveAlertTemplateName(tplCfg, envId, tid) : tid ? `템플릿 ${tid.slice(0, 8)}…` : "알 수 없음",
        title: titleOf.get(bcKey.split("#")[0]) || "방송",
        sentAt,
        people: phones.length,
        visited: countVisitedRecipients(phones.map((p) => nicksByPhone.get(p) || []), after.map((v) => String(v.nickname || ""))),
        siteBefore: new Set(before.map(keyOf).filter(Boolean)).size,
        siteAfter: new Set(after.map(keyOf).filter(Boolean)).size,
      });
    }
    return NextResponse.json({ ok: true, days, sends: sends.reverse(), templates: summarizeByTemplate(sends) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
