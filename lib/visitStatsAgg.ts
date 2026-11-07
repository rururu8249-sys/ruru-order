// lib/visitStatsAgg.ts
// [2026-11-07 사장님 「1인당 1회만 유효 카운트 · 실무에서 보기 쉽게」] 접속 기록 집계 — 순수 함수(DB 없음)
//
// 규칙
//   · «사람» = 닉네임이 있으면 닉네임(폰 2대여도 1명), 없으면 브라우저(visitor_key) 하나 = 비회원 1명
//   · «방문(회)» = 들어온 횟수(30분 넘게 끊겼다 다시 오면 1회 더) — 중복 포함 숫자
//   · 처음 온 사람 = customers.first_login_at(없으면 created_at) 날짜가 그날/그 방송 시작일과 같은 회원
//   · 주문한 사람 = 그날(또는 그 방송)에 주문한 닉네임 — 취소·테스트 주문 제외(판정은 부른 쪽이 넘김)
//   · 돈 계산 없음. 읽기 전용 표시 수치.

export type VisitRow = {
  visitor_key: string;
  nickname: string | null;
  broadcast_id: string | null;
  shop_mode: string | null;
  started_at: string;
  last_seen_at: string | null;
  ip?: string | null;
};

export type OrderMark = { nickname: string; date: string; broadcastId: string };

export type VisitPerson = {
  name: string;
  member: boolean;      // 닉네임 있는 손님
  visits: number;       // 이 날짜/방송 안에서 들어온 횟수
  lastAt: string;
  live: boolean;        // 방송 중 접속이 한 번이라도
  isNew: boolean;       // 처음 온 사람(회원 가입일 = 이 날)
  ordered: boolean;     // 이 날짜/방송에 주문함
  ip: string;
};

export type VisitBucket = {
  visitors: number;     // 사람 수(중복 제거)
  visits: number;       // 들어온 횟수(중복 포함)
  newcomers: number;
  liveVisitors: number; // 방송 중 들어온 사람 수
  buyers: number;
  people: VisitPerson[];
  peopleCapped: boolean;
};

export type DailyBucket = VisitBucket & { date: string };
export type BroadcastBucket = VisitBucket & { broadcastId: string; startedAt: string };

export const PEOPLE_PER_BUCKET = 400;

// 한국 날짜(YYYY-MM-DD)
export function seoulDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Acc = {
  people: Map<string, VisitPerson>;
  visits: number;
};

function newAcc(): Acc {
  return { people: new Map(), visits: 0 };
}

function touch(acc: Acc, key: string, name: string, member: boolean, lastAt: string, live: boolean, ip: string) {
  acc.visits += 1;
  const before = acc.people.get(key);
  if (!before) {
    acc.people.set(key, { name, member, visits: 1, lastAt, live, isNew: false, ordered: false, ip });
    return;
  }
  before.visits += 1;
  if (lastAt > before.lastAt) before.lastAt = lastAt;
  if (live) before.live = true;
  if (!before.ip && ip) before.ip = ip;
}

export function aggregateVisits(input: {
  rows: VisitRow[];
  /** 닉네임 → 처음 로그인한 날(YYYY-MM-DD, 서울). 없으면 처음 온 사람 판정 안 함 */
  firstDayByNick: Map<string, string>;
  /** 주문한 닉네임 표시(날짜·방송별) */
  orders: OrderMark[];
  /** 방송 id → 시작 시각(ISO). 처음 온 사람 판정에 씀 */
  broadcastStart?: Map<string, string>;
}): { daily: DailyBucket[]; broadcasts: BroadcastBucket[]; totalVisitors: number; totalVisits: number } {
  const { rows, firstDayByNick, orders } = input;

  // 같은 브라우저가 처음엔 비회원이었다가 로그인하면 이름이 생긴다 → 브라우저별 «알려진 이름»을 먼저 모음
  const nameByVisitor = new Map<string, string>();
  for (const r of rows) {
    const key = String(r.visitor_key || "").trim();
    const nick = String(r.nickname || "").trim();
    if (key && nick && !nameByVisitor.has(key)) nameByVisitor.set(key, nick);
  }

  const orderedByDay = new Map<string, Set<string>>();
  const orderedByBc = new Map<string, Set<string>>();
  for (const o of orders) {
    const nick = String(o.nickname || "").trim();
    if (!nick) continue;
    if (o.date) {
      const s = orderedByDay.get(o.date) || new Set<string>();
      s.add(nick);
      orderedByDay.set(o.date, s);
    }
    if (o.broadcastId) {
      const s = orderedByBc.get(o.broadcastId) || new Set<string>();
      s.add(nick);
      orderedByBc.set(o.broadcastId, s);
    }
  }

  const daily = new Map<string, Acc>();
  const bcs = new Map<string, Acc & { firstAt: string }>();
  const all = new Set<string>();

  for (const r of rows) {
    const vkey = String(r.visitor_key || "").trim();
    const startedAt = String(r.started_at || "");
    const date = seoulDate(startedAt);
    if (!vkey || !date) continue;
    const nick = String(r.nickname || "").trim() || nameByVisitor.get(vkey) || "";
    const member = Boolean(nick);
    // 사람 키: 회원은 닉네임, 비회원은 브라우저
    const pkey = member ? `n:${nick}` : `v:${vkey}`;
    const name = member ? nick : "비회원";
    const lastAt = String(r.last_seen_at || "") || startedAt;
    const live = String(r.shop_mode || "") === "live";
    const ip = String(r.ip || "").trim();
    all.add(pkey);

    const d = daily.get(date) || newAcc();
    touch(d, pkey, name, member, lastAt, live, ip);
    daily.set(date, d);

    const bid = r.broadcast_id ? String(r.broadcast_id) : "";
    if (bid) {
      const b = bcs.get(bid) || { ...newAcc(), firstAt: startedAt };
      touch(b, pkey, name, member, lastAt, live, ip);
      if (startedAt < b.firstAt) b.firstAt = startedAt;
      bcs.set(bid, b);
    }
  }

  const finish = (acc: Acc, dayForNew: string, ordered: Set<string> | undefined): VisitBucket => {
    let newcomers = 0, liveVisitors = 0, buyers = 0;
    const list: VisitPerson[] = [];
    for (const p of acc.people.values()) {
      if (p.member) {
        const fd = firstDayByNick.get(p.name);
        p.isNew = Boolean(fd && dayForNew && fd === dayForNew);
        p.ordered = Boolean(ordered && ordered.has(p.name));
      }
      if (p.isNew) newcomers += 1;
      if (p.live) liveVisitors += 1;
      if (p.ordered) buyers += 1;
      list.push(p);
    }
    list.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
    return {
      visitors: acc.people.size,
      visits: acc.visits,
      newcomers,
      liveVisitors,
      buyers,
      people: list.slice(0, PEOPLE_PER_BUCKET),
      peopleCapped: list.length > PEOPLE_PER_BUCKET,
    };
  };

  const dailyOut: DailyBucket[] = Array.from(daily.entries())
    .map(([date, acc]) => ({ date, ...finish(acc, date, orderedByDay.get(date)) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const bcOut: BroadcastBucket[] = Array.from(bcs.entries())
    .map(([broadcastId, acc]) => {
      const startedAt = input.broadcastStart?.get(broadcastId) || acc.firstAt;
      return { broadcastId, startedAt, ...finish(acc, seoulDate(startedAt), orderedByBc.get(broadcastId)) };
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return { daily: dailyOut, broadcasts: bcOut, totalVisitors: all.size, totalVisits: rows.length };
}
