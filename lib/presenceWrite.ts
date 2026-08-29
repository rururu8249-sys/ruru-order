// lib/presenceWrite.ts
// [2026-08-29] 접속 신호(하트비트) 기록 — 쓰기 전용
//
// 왜 따로 뺐나
//   예전에는 이 로직이 app/api/admin-live/presence/route.ts 안에만 있었다.
//   그런데 middleware.ts 가 "/api/admin-live/*" 를 통째로 관리자 전용으로 막고 있어서
//   손님(관리자 쿠키 없음)이 /order 를 열면 신호가 401 로 튕겨 나갔다.
//   → 그래서 관리자 브라우저 1개만 잡히고 "지금 접속 1명" 에서 멈춰 있었다.
//   이제 공개 주소 /api/presence 와 기존 주소가 같은 이 함수를 부른다.
//
// ⚠️ 쓰는 표는 visitor_presence / visitor_visits 둘뿐이다.
//    주문 · 입금 · 정산 · 배송 · 재고 · 포인트는 전혀 건드리지 않는다.

import { createClient } from "@supabase/supabase-js";

export function getPresenceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

type Supa = ReturnType<typeof getPresenceSupabase>;

const clean = (value: unknown) => String(value ?? "").trim();

// 손님도 부를 수 있는 주소가 되므로 들어오는 값을 좁힌다(가짜 접속 늘리기 방지).
const PAGE_TYPES = new Set(["order_form", "order_lookup", "group_buy", "admin", "page"]);
const VISITOR_KEY_RE = /^[A-Za-z0-9._:-]{8,80}$/;

export function normalizePresenceInput(body: Record<string, unknown>) {
  const visitorKey = clean(body.visitorKey);
  const rawType = clean(body.pageType) || "page";
  return {
    visitorKey,
    valid: VISITOR_KEY_RE.test(visitorKey),
    pageType: PAGE_TYPES.has(rawType) ? rawType : "page",
    path: clean(body.path).slice(0, 200),
    nickname: clean(body.nickname).slice(0, 40),
  };
}

// ── 접속 "기록" (날짜별·방송별) ──────────────────────────────────────────────
// 부하 보호 (방송 피크에 DB 터지지 않게)
//   · 진행 중인 방송 조회는 60초 캐시 — 손님 수와 무관하게 1분에 1번만 조회
//   · 신호는 30초마다 오지만, 같은 방문 기록은 5분에 한 번만 갱신
//   · 30분 이상 끊겼다 다시 오면 새 방문으로 본다
//   · 표가 아직 없거나 오류가 나면 조용히 넘어간다 (손님 화면에 영향 없음)
const VISIT_SESSION_GAP_MS = 30 * 60 * 1000;
const VISIT_TOUCH_MS = 5 * 60 * 1000;
const BROADCAST_CACHE_MS = 60 * 1000;

// ⚠️ broadcasts.id 는 UUID 다 (supabase/sql/broadcast_end_reports.sql: broadcast_id uuid references broadcasts(id)).
//    [2026-08-29 사고] 처음에 Number(id) 로 숫자 변환해서 UUID 가 NaN → null 이 됐다.
//    그래서 방송 중인데도 방송 번호가 안 붙고 "방송별 기록 없음 / 방송중 0" 으로만 나왔다.
//    숫자로 바꾸지 말고 문자열 그대로 쓴다.
let broadcastCache: { at: number; id: string | null } = { at: 0, id: null };

async function currentBroadcastId(supabase: Supa): Promise<string | null> {
  if (Date.now() - broadcastCache.at < BROADCAST_CACHE_MS) return broadcastCache.id;
  try {
    const { data } = await supabase
      .from("broadcasts")
      .select("id,status,is_deleted,started_at")
      .order("started_at", { ascending: false })
      .limit(20);
    const active = ((data || []) as Record<string, unknown>[]).find(
      (row) => row.is_deleted !== true && String(row.status || "").toUpperCase() === "ON",
    );
    const id = active?.id != null ? String(active.id).trim() : "";
    broadcastCache = { at: Date.now(), id: id || null };
  } catch {
    broadcastCache = { at: Date.now(), id: null };
  }
  return broadcastCache.id;
}

async function recordVisit(
  supabase: Supa,
  params: { visitorKey: string; nickname: string; pageType: string; path: string; nowIso: string },
) {
  try {
    const broadcastId = await currentBroadcastId(supabase);

    const { data, error } = await supabase
      .from("visitor_visits")
      .select("id,last_seen_at,nickname")
      .eq("visitor_key", params.visitorKey)
      .order("last_seen_at", { ascending: false })
      .limit(1);

    if (error) return;   // 표가 아직 없으면 여기서 조용히 끝

    const last = (data || [])[0] as { id?: number; last_seen_at?: string; nickname?: string | null } | undefined;
    const lastMs = last?.last_seen_at ? Date.parse(last.last_seen_at) : 0;
    const gap = Date.now() - lastMs;

    if (!last || !lastMs || gap > VISIT_SESSION_GAP_MS) {
      await supabase.from("visitor_visits").insert({
        visitor_key: params.visitorKey,
        nickname: params.nickname || null,
        page_type: params.pageType,
        path: params.path || null,
        broadcast_id: broadcastId,
        shop_mode: broadcastId ? "live" : "shop",
        started_at: params.nowIso,
        last_seen_at: params.nowIso,
      });
      return;
    }

    // [2026-08-30 사장님 지적] "카톡 로그인하면 닉네임이 넘어올 텐데 왜 비회원으로 잡히냐"
    //   원인: 손님이 사이트를 열자마자 신호가 먼저 간다. 그때는 아직 로그인 전이라 닉네임이 없어
    //         기록이 nickname=null 로 만들어졌다. 그 뒤 로그인해서 닉네임이 생겨도
    //         아래 갱신이 "5분 지났을 때"만 돌아서, 5분 안에 나간 손님은 영영 비회원으로 남았다.
    //   수정: 닉네임이 비어 있던 기록에 이름이 생기면 5분을 기다리지 않고 바로 채운다.
    const knownNickname = String(last.nickname ?? "").trim();
    const nicknameArrived = Boolean(params.nickname) && !knownNickname;

    if (gap > VISIT_TOUCH_MS || nicknameArrived) {
      await supabase
        .from("visitor_visits")
        .update({ last_seen_at: params.nowIso, ...(params.nickname ? { nickname: params.nickname } : {}) })
        .eq("id", last.id);
    }
  } catch {
    // 기록 실패는 접속 표시를 막지 않는다.
  }
}

/** 접속 신호 1건 저장. 성공/실패만 돌려준다. */
export async function writePresence(body: Record<string, unknown>): Promise<
  { ok: true; lastSeenAt: string } | { ok: false; status: number; message: string }
> {
  const input = normalizePresenceInput(body);
  if (!input.visitorKey) return { ok: false, status: 400, message: "visitorKey가 없습니다." };
  if (!input.valid) return { ok: false, status: 400, message: "visitorKey 형식이 올바르지 않습니다." };

  const supabase = getPresenceSupabase();
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from("visitor_presence").upsert(
    {
      visitor_key: input.visitorKey,
      nickname: input.nickname || null,
      page_type: input.pageType,
      path: input.path,
      last_seen_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "visitor_key" },
  );

  if (error) return { ok: false, status: 500, message: error.message };

  // 기록은 실패해도 응답을 막지 않는다.
  await recordVisit(supabase, {
    visitorKey: input.visitorKey,
    nickname: input.nickname,
    pageType: input.pageType,
    path: input.path,
    nowIso,
  });

  return { ok: true, lastSeenAt: nowIso };
}
