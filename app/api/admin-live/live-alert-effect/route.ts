// app/api/admin-live/live-alert-effect/route.ts
// [2026-11-09 사장님 「알림톡 돈값」] 최근 알림 보낸 방송마다: 받은 사람 → 사이트 접속(닉네임 기준) → 주문 → 결제완료 금액.
//   관리자만 · 읽기만(SELECT). 주문·입금·포인트 쓰기 0. 결제완료 판정은 lib/liveSummary 그대로.
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { fetchOrders, groupOrders, MONTH_COLS } from "@/lib/liveSummary";
import { computeAlertEffect, computeAlertSegments, normNick, type AlertedPerson, type AlertEffect, type AlertSegments, type SegmentPerson } from "@/lib/liveAlertEffect";

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
  for (let from = 0, p = 0; p < 40; p++, from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type AlertEffectRow = AlertEffect & { broadcastId: string; title: string; startedAt: string; endedAt: string; segments: AlertSegments | null };

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });
    const sb = svc();
    const limit = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 6));
    const offset = Math.min(200, Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0));

    // 1) 알림 보낸 방송(발송 기록 성공 수 합)
    const { data: logs, error: logErr } = await sb.from("live_alert_logs").select("broadcast_id,success_count,created_at").not("broadcast_id", "is", null).order("created_at", { ascending: false }).limit(1000);
    if (logErr) throw new Error(`발송 기록을 못 읽었어요: ${logErr.message}`);
    const sentBy = new Map<string, number>();
    for (const l of (logs || []) as Record<string, unknown>[]) {
      const id = String(l.broadcast_id || "");
      if (!id) continue;
      sentBy.set(id, (sentBy.get(id) || 0) + (Number(l.success_count) || 0));
    }
    const ids = [...sentBy.entries()].filter(([, n]) => n > 0).map(([id]) => id);
    if (ids.length === 0) return NextResponse.json({ ok: true, rows: [] });

    const { data: bcs, error: bcErr } = await sb.from("broadcasts").select("id,public_title,started_at,ended_at,status").in("id", ids.slice(0, 200));
    if (bcErr) throw new Error(`방송을 못 읽었어요: ${bcErr.message}`);
    const list = ((bcs || []) as Record<string, unknown>[])
      .filter((b) => b.started_at)
      .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
      .slice(offset, offset + limit);

    // 회원 전부(가입 시각·닉네임) — 한 번만 읽음. 「알림 보낼 때 이미 회원이었나」 판정용
    const allCustomers = await readPaged<Record<string, unknown>>((f, t) => sb.from("customers").select("kakao_id,customer_phone,youtube_nickname,created_at,first_login_at").order("created_at", { ascending: true }).range(f, t));

    const rows: AlertEffectRow[] = [];
    for (const b of list) {
      const id = String(b.id);
      const start = String(b.started_at);
      const live = String(b.status || "").toUpperCase() === "ON";
      const end = live || !b.ended_at ? new Date().toISOString() : String(b.ended_at);

      // 2) 받은 사람(성공만)
      const rec = await readPaged<{ customer_phone: string; sent_at: string }>((f, t) => sb.from("live_alert_recipients").select("customer_phone,sent_at").eq("broadcast_id", id).eq("status", "success").range(f, t));
      const phones = [...new Set(rec.map((r) => digits(r.customer_phone)).filter(Boolean))];
      const sendTimes = rec.map((r) => Date.parse(r.sent_at)).filter((n) => Number.isFinite(n));
      const sendAt = sendTimes.length ? Math.min(...sendTimes) : Date.parse(start);

      // 3) 받은 사람의 카카오 계정·지금 닉네임
      const info = new Map<string, { kakao: string; nicks: string[] }>();
      for (let i = 0; i < phones.length; i += 150) {
        const chunk = phones.slice(i, i + 150);
        const { data: cs } = await sb.from("customers").select("kakao_id,customer_phone,youtube_nickname").in("customer_phone", [...chunk, ...chunk.map(hyphen)]);
        for (const c of (cs || []) as Record<string, unknown>[]) {
          const p = digits(c.customer_phone);
          const cur = info.get(p) || { kakao: "", nicks: [] };
          if (c.kakao_id && !cur.kakao) cur.kakao = String(c.kakao_id);
          if (c.youtube_nickname) cur.nicks.push(String(c.youtube_nickname));
          info.set(p, cur);
        }
      }

      // 4) 그 방송 시간 주문(결산과 같은 범위·같은 판정)
      const groups = groupOrders(await fetchOrders(sb, start, end, `${MONTH_COLS},kakao_id`));
      for (const g of groups) {
        const cur = g.phone ? info.get(g.phone) : undefined;
        if (cur && g.name) cur.nicks.push(g.name); // 주문에 찍힌 닉네임도 같은 사람으로
      }
      const alerted: AlertedPerson[] = phones.map((p) => ({ phone: p, kakao: info.get(p)?.kakao || "", nicks: info.get(p)?.nicks || [] }));

      // 5) 그 방송 시간에 사이트 들어온 닉네임(관리자 화면 제외)
      const visits = await readPaged<{ nickname: string | null; page_type: string | null }>((f, t) => sb.from("visitor_visits").select("nickname,page_type").lte("started_at", end).gte("last_seen_at", start).not("nickname", "is", null).range(f, t));
      const visitNicks = new Set(visits.filter((v) => v.page_type !== "admin").map((v) => normNick(v.nickname)).filter(Boolean));

      // 7) 알림 보낸 시각 기준 세 무리(방송 끝난 뒤 가입한 사람은 뺌)
      const endMs = Date.parse(end);
      const phoneSet = new Set(phones);
      const orderNicksByPhone = new Map<string, string[]>();
      for (const g of groups) if (g.phone && g.name) orderNicksByPhone.set(g.phone, [...(orderNicksByPhone.get(g.phone) || []), g.name]);
      const people: SegmentPerson[] = [];
      for (const c of allCustomers) {
        const p = digits(c.customer_phone);
        const joined = Date.parse(String(c.first_login_at || c.created_at || ""));
        const joinedAt = Number.isFinite(joined) ? joined : 0;
        if (joinedAt && joinedAt > endMs) continue;
        people.push({ phone: p, kakao: String(c.kakao_id || ""), nicks: [String(c.youtube_nickname || ""), ...(orderNicksByPhone.get(p) || [])], joinedAt, alerted: !!p && phoneSet.has(p) });
      }
      const segments = computeAlertSegments({ people, sendAt, groups, visitNicks });

      rows.push({
        segments,
        broadcastId: id,
        title: String(b.public_title || "방송"),
        startedAt: start,
        endedAt: live ? "" : String(b.ended_at || ""),
        ...computeAlertEffect({ alerted, sentCount: sentBy.get(id) || phones.length, groups, visitNicks }),
      });
    }
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
