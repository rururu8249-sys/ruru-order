// 실제 Postgres(PGlite)에서 계좌 라우팅 migration을 적용하고 동작을 검증한다.
// 실행: node scripts/test-bank-account-routing-sql.mjs
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationName = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
  .find((name) => name.endsWith("_bank_account_routing.sql"));
assert.ok(migrationName, "bank account routing migration이 필요하다");
const migrationSql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const hotfixMigrationName = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
  .find((name) => name.endsWith("_remove_missing_payment_status_reference.sql"));
assert.ok(hotfixMigrationName, "payment_status 누락 스키마용 핫픽스 migration이 필요하다");
const hotfixMigrationSql = await readFile(
  new URL(`../supabase/migrations/${hotfixMigrationName}`, import.meta.url),
  "utf8",
);
const cartOverrideMigrationSql = await readFile(
  new URL("../supabase/migrations/20261002180000_cart_bank_account_override.sql", import.meta.url),
  "utf8",
);
const verificationSql = await readFile(new URL("../supabase/sql/check/bank_account_routing_verification.sql", import.meta.url), "utf8");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.settings (
    key text primary key,
    value text
  );

  create table public.orders (
    id bigserial primary key,
    order_group_id text,
    broadcast_id uuid,
    customer_phone text,
    phone text,
    kakao_id text,
    is_deleted boolean default false,
    is_test_order boolean default false,
    order_manage_status text,
    order_status text,
    admin_status text,
    admin_order_status_v2 text,
    created_at timestamptz default now()
  );

  create table public.customers (
    id bigserial primary key,
    kakao_id text,
    customer_phone text,
    youtube_nickname text,
    customer_name text
  );

  create table public.cart_reservations (
    session_key text not null,
    product_id text not null,
    color text not null default '',
    size text not null default '',
    qty integer not null default 1,
    customer_phone text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '4 hours',
    primary key (session_key, product_id, color, size)
  );

  create or replace function public.submit_customer_order_with_points(
    p_order_rows jsonb,
    p_point_use_amount integer default 0,
    p_customer_phone text default null,
    p_youtube_nickname text default null,
    p_customer_name text default null,
    p_session_key text default null
  ) returns jsonb
  language plpgsql
  as $$
  declare
    v_group text := nullif(p_order_rows->0->>'order_group_id', '');
    v_ids bigint[];
    v_count integer;
  begin
    select array_agg(id order by id), count(*) into v_ids, v_count
      from public.orders where order_group_id = v_group;
    if coalesce(v_count, 0) > 0 then
      return jsonb_build_object('ok', true, 'duplicate', true, 'inserted_count', v_count, 'order_ids', to_jsonb(v_ids));
    end if;

    insert into public.orders(order_group_id, broadcast_id, customer_phone, phone, kakao_id, is_test_order, order_manage_status, order_status)
    select row_value->>'order_group_id', nullif(row_value->>'broadcast_id', '')::uuid, p_customer_phone, p_customer_phone,
           nullif(row_value->>'kakao_id', ''),
           coalesce((row_value->>'is_test_order')::boolean, false),
           coalesce(row_value->>'order_manage_status', '주문확인전'),
           coalesce(row_value->>'order_status', '주문완료')
      from jsonb_array_elements(p_order_rows) as source(row_value)
    returning array[id] into v_ids;

    return jsonb_build_object('ok', true, 'duplicate', false, 'inserted_count', jsonb_array_length(p_order_rows), 'order_ids', to_jsonb(v_ids));
  end;
  $$;
`);

await db.exec(migrationSql);
await db.exec(hotfixMigrationSql);
await db.exec(cartOverrideMigrationSql);

const primary = { id: "primary", enabled: true, label: "기존 계좌", bankName: "국민은행", bankAccount: "111-222-333333", bankHolder: "홍길동" };
const secondary = { id: "secondary", enabled: true, label: "추가 계좌", bankName: "신한은행", bankAccount: "444-555-666666", bankHolder: "김루루" };

async function setConfig({
  first = "secondary",
  existing = "primary",
  all = "primary",
  mode = "split",
  window = { enabled: false, startDate: "", endDate: "" },
} = {}) {
  const value = JSON.stringify({
    version: 1,
    accounts: [primary, secondary],
    routing: {
      mode,
      allAccountId: all,
      existingAccountId: existing,
      firstOrderAccountId: first,
      firstOrderWindow: window,
    },
  });
  await db.query(
    "insert into public.settings(key,value) values ('shop_bank_config_v1',$1) on conflict(key) do update set value=excluded.value",
    [value],
  );
}

let serial = 0;
const broadcastA = "11111111-1111-4111-8111-111111111111";
const broadcastB = "22222222-2222-4222-8222-222222222222";
const broadcastC = "33333333-3333-4333-8333-333333333333";
const clock = await db.query(`
  select
    (now() at time zone 'Asia/Seoul')::date::text as today,
    ((now() at time zone 'Asia/Seoul')::date - 1)::text as yesterday,
    ((now() at time zone 'Asia/Seoul')::date + 1)::text as tomorrow
`);
const { today, yesterday, tomorrow } = clock.rows[0];

async function submit({ group, phone = "01012345678", kakao = "10001", broadcast = broadcastA, session = "session-key" } = {}) {
  serial += 1;
  const groupId = group || `group-${serial}`;
  const rows = [{
    order_group_id: groupId,
    broadcast_id: broadcast,
    order_manage_status: "주문확인전",
    order_status: "주문완료",
    is_test_order: false,
  }];
  const result = await db.query(
    `select public.submit_customer_order_with_bank_routing(
      $1::jsonb, 0, $2, '닉네임', '고객', $4, $3
    ) as result`,
    [JSON.stringify(rows), phone, kakao, session],
  );
  return result.rows[0].result;
}

// 유지기간을 쓰지 않으면 새 방송과 broadcast_id 없는 쇼핑몰 주문은 최신 설정·이력으로 즉시 재판정한다.
{
  await resetOrders();
  await setConfig();
  const first = await submit({ group: "no-window-first", kakao: "15001", broadcast: broadcastA });
  assert.equal(first.customer_order_segment, "first_order");
  assert.equal(first.bank_account.id, "secondary");

  await setConfig({ first: "secondary", existing: "primary" });
  const nextBroadcast = await submit({ group: "no-window-next", kakao: "15001", broadcast: broadcastB });
  assert.equal(nextBroadcast.customer_order_segment, "existing");
  assert.equal(nextBroadcast.bank_account.id, "primary");

  const shopping = await submit({ group: "no-window-shop", kakao: "15001", broadcast: null });
  assert.equal(shopping.customer_order_segment, "existing");
  assert.equal(shopping.bank_account.id, "primary");
}

// 활성 유지기간 안에 생애 첫 주문한 고객은 다른 방송·쇼핑몰에서도 first_order를 유지한다.
// 기간/계좌 선택 변경은 새 주문부터 즉시 적용되고, 같은 방송 스냅샷만 예외로 보존한다.
{
  await resetOrders();
  const activeWindow = { enabled: true, startDate: today, endDate: tomorrow };
  await setConfig({ window: activeWindow });
  const first = await submit({ group: "window-first", kakao: "16001", broadcast: broadcastA });
  assert.equal(first.customer_order_segment, "first_order");
  assert.equal(first.bank_account.id, "secondary");

  await setConfig({ first: "primary", existing: "secondary", window: activeWindow });
  const otherBroadcast = await submit({ group: "window-other", kakao: "16001", broadcast: broadcastB });
  assert.equal(otherBroadcast.customer_order_segment, "first_order");
  assert.equal(otherBroadcast.bank_account.id, "primary", "유지기간 중 계좌 선택 변경은 새 방송에 즉시 적용");

  const shopping = await submit({ group: "window-shop", kakao: "16001", broadcast: null });
  assert.equal(shopping.customer_order_segment, "first_order");
  assert.equal(shopping.bank_account.id, "primary");

  await setConfig({ first: "secondary", existing: "primary", window: { enabled: true, startDate: yesterday, endDate: yesterday } });
  const shortened = await submit({ group: "window-shortened", kakao: "16001", broadcast: broadcastC });
  assert.equal(shortened.customer_order_segment, "existing", "기간 단축은 다음 새 방송 주문부터 즉시 적용");
  assert.equal(shortened.bank_account.id, "primary");

  await setConfig({ first: "secondary", existing: "primary", window: activeWindow });
  const extended = await submit({ group: "window-extended", kakao: "16001", broadcast: "44444444-4444-4444-8444-444444444444" });
  assert.equal(extended.customer_order_segment, "first_order", "기간 재확장은 다음 새 방송 주문부터 즉시 적용");
  assert.equal(extended.bank_account.id, "secondary");

  await setConfig({ first: "secondary", existing: "primary", window: { enabled: false, startDate: "", endDate: "" } });
  const disabled = await submit({ group: "window-disabled", kakao: "16001", broadcast: "55555555-5555-4555-8555-555555555555" });
  assert.equal(disabled.customer_order_segment, "existing", "기간 끄기는 다음 새 방송 주문부터 즉시 적용");
  assert.equal(disabled.bank_account.id, "primary");
}

async function resetOrders() {
  await db.exec("truncate table public.orders restart identity");
}

// 아직 상점정보를 한 번도 저장하지 않은 기존 운영 상태도 예전 기본계좌로 주문이 막히지 않아야 한다.
{
  await db.exec("delete from public.settings");
  await resetOrders();
  const result = await submit({ group: "legacy-default", kakao: "90001", broadcast: broadcastA });
  assert.equal(result.customer_order_segment, "first_order");
  assert.equal(result.bank_account.id, "primary");
  assert.equal(result.bank_account.bankName, "새마을금고");
  assert.equal(result.bank_account.bankAccount, "9002186993725");
  assert.equal(result.bank_account.bankHolder, "유혜원");
}

await setConfig();

// 신규 고객의 첫 주문은 first_order + 신규 계좌.
{
  const result = await submit({ group: "first" });
  assert.equal(result.customer_order_segment, "first_order");
  assert.equal(result.bank_account.id, "secondary");
  assert.equal(result.bank_account.bankAccount, secondary.bankAccount);
}

// 같은 방송의 추가 주문은 자정이 지나도 첫 주문 때의 구분/계좌 스냅샷을 그대로 쓴다.
{
  await db.exec("update public.orders set created_at = now() - interval '1 day' where order_group_id = 'first'");
  await setConfig({ first: "primary", existing: "primary" });
  const result = await submit({ group: "same-broadcast" });
  assert.equal(result.customer_order_segment, "first_order");
  assert.equal(result.bank_account.id, "secondary", "현재 설정이 바뀌어도 같은 방송은 첫 스냅샷 유지");
  const nextBroadcast = await submit({ group: "next-broadcast", broadcast: broadcastB });
  assert.equal(nextBroadcast.customer_order_segment, "existing");
  assert.equal(nextBroadcast.bank_account.id, "primary");
}

// 취소/환불 이력과 테스트 주문만 있으면 여전히 첫 주문이다.
{
  await resetOrders();
  await setConfig();
  await db.query("insert into public.orders(order_group_id,broadcast_id,customer_phone,phone,kakao_id,order_manage_status,is_test_order) values ('cancelled',$1,$2,$2,$3,'주문취소',false)", [broadcastB, "01012345678", "20001"]);
  const cancelled = await submit({ kakao: "20001" });
  assert.equal(cancelled.customer_order_segment, "first_order");

  await resetOrders();
  await db.query("insert into public.orders(order_group_id,broadcast_id,customer_phone,phone,kakao_id,order_manage_status,is_test_order) values ('test',$1,$2,$2,$3,'주문확인전',true)", [broadcastB, "01012345678", "20002"]);
  const tested = await submit({ kakao: "20002" });
  assert.equal(tested.customer_order_segment, "first_order");
}

// 배포 전 같은 방송 주문처럼 스냅샷이 없는 유효 이력도 사라진 이력으로 취급하면 안 된다.
{
  await resetOrders();
  await setConfig();
  await db.query(
    "insert into public.orders(order_group_id,broadcast_id,customer_phone,phone,kakao_id,order_manage_status,is_test_order) values ('legacy-same',$1,$2,$2,$3,'주문확인전',false)",
    [broadcastA, "01012345678", "25001"],
  );
  const result = await submit({ group: "after-legacy-same", kakao: "25001", broadcast: broadcastA });
  assert.equal(result.customer_order_segment, "existing", "스냅샷 없는 같은 방송 유효 주문도 기존 이력");
  assert.equal(result.bank_account.id, "primary");
}

// 카카오 ID가 같으면 전화번호가 바뀌어도 기존회원. 카카오가 없으면 정규화 전화번호 폴백.
{
  await resetOrders();
  await submit({ kakao: "30001", phone: "01011112222", broadcast: broadcastA });
  const changedPhone = await submit({ kakao: "30001", phone: "01099998888", broadcast: broadcastB });
  assert.equal(changedPhone.customer_order_segment, "existing");

  await resetOrders();
  await submit({ kakao: "", phone: "010-3333-4444", broadcast: broadcastA });
  const phoneFallback = await submit({ kakao: "", phone: "01033334444", broadcast: broadcastB });
  assert.equal(phoneFallback.customer_order_segment, "existing");
}

// 멱등 재시도는 설정을 다시 판정하지 않고 저장된 스냅샷을 반환한다.
{
  await resetOrders();
  await setConfig();
  const first = await submit({ group: "duplicate", kakao: "40001" });
  await setConfig({ first: "primary", existing: "primary" });
  const duplicate = await submit({ group: "duplicate", kakao: "40001" });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.bank_account, first.bank_account);
  const count = await db.query("select count(*)::int as count from public.orders where order_group_id='duplicate'");
  assert.equal(count.rows[0].count, 1);
}

// split 양쪽이 같은 계좌여도 정상.
{
  await resetOrders();
  await setConfig({ first: "primary", existing: "primary" });
  const result = await submit({ kakao: "50001" });
  assert.equal(result.bank_account.id, "primary");
}

// 거의 동시에 들어온 서로 다른 방송 주문은 정확히 하나만 first_order가 된다.
{
  await resetOrders();
  await setConfig();
  const results = await Promise.all([
    submit({ group: "race-a", kakao: "60001", broadcast: broadcastA }),
    submit({ group: "race-b", kakao: "60001", broadcast: broadcastB }),
  ]);
  assert.deepEqual(results.map((item) => item.customer_order_segment).sort(), ["existing", "first_order"]);
}

// 관리자가 고른 계좌는 정확히 그 장바구니 주문 한 건에만 적용된다.
// 중복 클릭은 새 주문을 만들지 않고 최초 주문의 계좌를 그대로 돌려준다.
{
  await resetOrders();
  await db.exec("truncate table public.cart_reservations, public.cart_bank_account_overrides restart identity");
  await setConfig({ first: "secondary", existing: "primary" });
  const started = "2026-10-02T01:00:00.000Z";
  await db.query(
    "insert into public.cart_reservations(session_key,product_id,created_at,expires_at) values ($1,'product-a',$2::timestamptz,now()+interval '4 hours')",
    ["override-session", started],
  );
  await db.query(
    `insert into public.cart_bank_account_overrides(session_key,cart_started_at,account_id,bank_name,bank_account,bank_holder)
     values ($1,$2::timestamptz,'primary',$3,$4,$5)`,
    ["override-session", started, primary.bankName, primary.bankAccount, primary.bankHolder],
  );

  const first = await submit({ group: "cart-override", kakao: "70001", session: "override-session", broadcast: broadcastA });
  assert.equal(first.bank_assignment_source, "cart_override");
  assert.equal(first.bank_account.id, "primary");
  const saved = await db.query("select payment_bank_assignment_source,payment_bank_account_id from public.orders where order_group_id='cart-override'");
  assert.equal(saved.rows[0].payment_bank_assignment_source, "cart_override");
  assert.equal(saved.rows[0].payment_bank_account_id, "primary");
  const consumed = await db.query("select status,consumed_order_group_id from public.cart_bank_account_overrides where session_key='override-session'");
  assert.equal(consumed.rows[0].status, "consumed");
  assert.equal(consumed.rows[0].consumed_order_group_id, "cart-override");

  await setConfig({ first: "primary", existing: "secondary" });
  const retry = await submit({ group: "cart-override", kakao: "70001", session: "override-session", broadcast: broadcastA });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.bank_account.id, "primary", "재시도는 이미 저장한 계좌 스냅샷 유지");
  const oneOrder = await db.query("select count(*)::int as count from public.orders where order_group_id='cart-override'");
  assert.equal(oneOrder.rows[0].count, 1);

  await db.exec("delete from public.cart_reservations where session_key='override-session'");
  await db.query(
    "insert into public.cart_reservations(session_key,product_id,created_at,expires_at) values ('override-session','product-b',now(),now()+interval '4 hours')",
  );
  const next = await submit({ group: "same-broadcast-after-override", kakao: "70001", session: "override-session", broadcast: broadcastA });
  assert.equal(next.customer_order_segment, "existing");
  assert.equal(next.bank_account.id, "secondary", "일회성 지정계좌가 같은 방송의 다음 주문에 전파되면 안 됨");
}

// 다른 세션과 시작시각이 다른 새 장바구니에는 과거 지정계좌가 적용되지 않는다.
{
  await resetOrders();
  await db.exec("truncate table public.cart_reservations, public.cart_bank_account_overrides restart identity");
  await setConfig({ first: "secondary", existing: "primary" });
  await db.query(
    "insert into public.cart_reservations(session_key,product_id,created_at,expires_at) values ('new-cart','product-new',now(),now()+interval '4 hours')",
  );
  await db.query(
    `insert into public.cart_bank_account_overrides(session_key,cart_started_at,account_id,bank_name,bank_account,bank_holder)
     values ('new-cart',now()-interval '1 day','primary',$1,$2,$3)`,
    [primary.bankName, primary.bankAccount, primary.bankHolder],
  );
  const result = await submit({ group: "new-cart-default", kakao: "71001", session: "new-cart", broadcast: broadcastB });
  assert.equal(result.bank_account.id, "secondary", "시작시각이 다른 과거 장바구니 지정은 무시");
  assert.equal(result.bank_assignment_source, undefined);

  await db.query(
    "insert into public.cart_reservations(session_key,product_id,created_at,expires_at) values ('other-session','product-other',now(),now()+interval '4 hours')",
  );
  const other = await submit({ group: "other-session-default", kakao: "72001", session: "other-session", broadcast: broadcastC });
  assert.equal(other.bank_account.id, "secondary", "다른 고객 세션에는 영향 없음");
}

// 장바구니 회원 표시는 계좌 라우팅과 같은 유효 주문 기준(취소·테스트 제외)을 쓴다.
{
  await resetOrders();
  await db.exec("truncate table public.customers restart identity");
  await db.query("insert into public.customers(kakao_id,customer_phone) values ('80001','01080000001')");
  await db.query("insert into public.orders(order_group_id,kakao_id,customer_phone,order_manage_status,is_test_order) values ('valid','80001','01080000001','주문완료',false),('cancel','80002','01080000002','주문취소',false),('test','80003','01080000003','주문완료',true)");
  const meta = await db.query(
    `select * from public.admin_cart_customer_order_meta($1::jsonb) order by session_key`,
    [JSON.stringify([
      { sessionKey: "a-valid", phone: "01080000001", kakaoId: "80001" },
      { sessionKey: "b-cancel", phone: "01080000002", kakaoId: "80002" },
      { sessionKey: "c-test", phone: "01080000003", kakaoId: "80003" },
    ])],
  );
  assert.equal(meta.rows[0].is_registered, true);
  assert.equal(Number(meta.rows[0].valid_order_count), 1);
  assert.equal(Number(meta.rows[1].valid_order_count), 0);
  assert.equal(Number(meta.rows[2].valid_order_count), 0);
}

// Data API 역할은 실행할 수 없고 service_role만 호출할 수 있다.
{
  const signature = "public.submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text)";
  const privileges = await db.query(
    "select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as service_role",
    [signature],
  );
  assert.equal(privileges.rows[0].anon, false);
  assert.equal(privileges.rows[0].authenticated, false);
  assert.equal(privileges.rows[0].service_role, true);
}

await db.exec(verificationSql);
await db.close();
console.log("bank account routing SQL behavior tests passed");
