// app/api/admin-live/live-chat-emoji/route.ts
// [2026-11-10 06:26 사장님] 사이트 채팅 이모티콘 관리 — 관리자만(미들웨어 + 여기서 한 번 더).
//   GET            → 설정(이모티콘 전체·규칙) + 직접 넣은/막은 손님(닉네임·이름·가린 번호·누적 구매·지금 쓸 수 있는지) + ?q= 손님 찾기
//   POST(사진 파일) → 이모티콘 하나 올림(브라우저가 128×128 로 줄여 보냄, 1MB 이하만) → 목록 끝에 붙임
//   POST JSON
//     { action:"save", items?, access?, minAmount?, period? } → 이름·켬끔·순서·규칙 저장
//     { action:"delete", id }                                 → 이모티콘 지우기(그림 파일도)
//     { action:"list", list:"allow"|"deny", key, add }        → 직접 넣기/막기 명단(비공개 저장소)
//   주문·돈·포인트 무접촉(주문은 누적 구매 금액 «읽기»만).
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import {
  EMOJI_ALWAYS_PHONES,
  EMOJI_MAX_BYTES,
  EMOJI_MAX_ITEMS,
  LIVE_CHAT_EMOJI_KEY,
  emojiAllowed,
  isEmojiName,
  newEmojiId,
  parseChatEmojiSetting,
  serializeChatEmojiSetting,
  uniqueEmojiName,
  type ChatEmojiSetting,
} from "@/lib/liveChatEmoji";
import {
  EMOJI_PUBLIC_BUCKET,
  alwaysEmojiPhones,
  clearEmojiAccessCache,
  paidTotalOf,
  readEmojiAccessLists,
  readEmojiSetting,
  sinceOf,
  writeEmojiAccessLists,
  type EmojiAccessLists,
} from "@/lib/liveChatEmojiServer";
import { koreanPhoneVariants } from "@/lib/order/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sb = ReturnType<typeof getServiceClient>;
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const mask = (p: string) => (p.length >= 8 ? `${p.slice(0, 3)}-****-${p.slice(-4)}` : p);

type Person = { key: string; phone: string; nickname: string; name: string; total: number | null; canUse: boolean; always: boolean; allowed: boolean; denied: boolean };

async function saveSetting(sb: Sb, s: ChatEmojiSetting) {
  const { error } = await sb.from("settings").upsert([{ key: LIVE_CHAT_EMOJI_KEY, value: serializeChatEmojiSetting(s) }], { onConflict: "key" });
  if (error) throw new Error(error.message);
  clearEmojiAccessCache();
}

async function describe(sb: Sb, phones: string[], setting: ChatEmojiSetting, lists: EmojiAccessLists, always: Set<string>): Promise<Person[]> {
  const uniq = Array.from(new Set(phones)).slice(0, 40);
  if (!uniq.length) return [];
  const all = Array.from(new Set(uniq.flatMap((p) => [p, ...koreanPhoneVariants(p)])));
  const { data } = await sb.from("customers").select("customer_phone, customer_name, youtube_nickname, kakao_nickname, kakao_id").in("customer_phone", all).order("created_at", { ascending: true });
  const byPhone = new Map<string, { customer_name?: string; youtube_nickname?: string; kakao_nickname?: string; kakao_id?: string }>();
  for (const r of (data ?? []) as Array<{ customer_phone?: string; customer_name?: string; youtube_nickname?: string; kakao_nickname?: string; kakao_id?: string }>) byPhone.set(digits(r.customer_phone), r);
  const since = sinceOf(setting);
  return Promise.all(uniq.map(async (p) => {
    const c = byPhone.get(p);
    const total = await paidTotalOf(sb, { kakaoId: c?.kakao_id || "", phone: p }, since).catch(() => null);
    const isAlways = always.has(p);
    const allowed = lists.allow.includes(p);
    const denied = lists.deny.includes(p);
    return {
      key: p,
      phone: mask(p),
      nickname: String(c?.youtube_nickname || c?.kakao_nickname || ""),
      name: String(c?.customer_name || ""),
      total,
      always: isAlways,
      allowed,
      denied,
      canUse: emojiAllowed({ setting, always: isAlways, allowed, denied, paidTotal: total }),
    };
  }));
}

async function state(sb: Sb, q: string) {
  const [setting, lists, always] = await Promise.all([readEmojiSetting(sb), readEmojiAccessLists(sb), alwaysEmojiPhones(sb)]);
  const [allow, deny, owners] = await Promise.all([
    describe(sb, lists.allow, setting, lists, always),
    describe(sb, lists.deny, setting, lists, always),
    describe(sb, EMOJI_ALWAYS_PHONES, setting, lists, always),
  ]);
  let results: Person[] = [];
  if (q) {
    const d = digits(q);
    const safe = q.replace(/[,()*%\\]/g, " ").trim();
    const ors = [`customer_name.ilike.*${safe}*`, `youtube_nickname.ilike.*${safe}*`, `kakao_nickname.ilike.*${safe}*`];
    if (d.length >= 3) ors.push(`customer_phone.ilike.*${d}*`);
    const { data } = await sb.from("customers").select("customer_phone").or(ors.join(",")).order("last_login_at", { ascending: false, nullsFirst: false }).limit(20);
    const found = Array.from(new Set(((data ?? []) as Array<{ customer_phone?: string }>).map((r) => digits(r.customer_phone)).filter((p) => p.length >= 9))).slice(0, 8);
    results = await describe(sb, found, setting, lists, always);
  }
  return { setting, allow, deny, owners, results };
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const q = String(request.nextUrl.searchParams.get("q") || "").trim().slice(0, 30);
    return NextResponse.json({ ok: true, ...(await state(getServiceClient(), q)) });
  } catch (e) {
    return fail(e instanceof Error ? `못 불러왔어요: ${e.message}` : "못 불러왔어요.", 500);
  }
}

function storagePathOf(url: string): string {
  const m = /\/object\/public\/product-images\/(live-emoji\/[^?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  const sb = getServiceClient();
  try {
    // ── 사진 올리기 ──
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("사진 파일이 없어요.");
      if (!/^image\/(png|webp|jpeg)$/.test(file.type)) return fail("PNG·WEBP·JPG 만 올릴 수 있어요.");
      if (file.size > EMOJI_MAX_BYTES) return fail("1MB 이하로 줄여서 올려 주세요.");
      const setting = await readEmojiSetting(sb);
      if (setting.items.length >= EMOJI_MAX_ITEMS) return fail(`이모티콘은 ${EMOJI_MAX_ITEMS}개까지예요.`);
      const id = newEmojiId();
      const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      const path = `live-emoji/${id}.${ext}`;
      const { error: upErr } = await sb.storage.from(EMOJI_PUBLIC_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
      if (upErr) return fail(`사진을 못 올렸어요: ${upErr.message}`, 500);
      const url = sb.storage.from(EMOJI_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
      const name = uniqueEmojiName(String(form.get("name") || ""), setting.items.map((e) => e.name));
      // 올리는 사이 다른 창에서 바뀌었을 수 있으니 저장 직전에 다시 읽어 붙임
      const latest = await readEmojiSetting(sb);
      const next = { ...latest, items: [...latest.items, { id, name: uniqueEmojiName(name, latest.items.map((e) => e.name)), url, on: true }] };
      await saveSetting(sb, next);
      return NextResponse.json({ ok: true, setting: parseChatEmojiSetting(next) });
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(raw.action || "");

    if (action === "save") {
      const cur = await readEmojiSetting(sb);
      let items = cur.items;
      if (Array.isArray(raw.items)) {
        // 화면이 보낸 순서·이름·켬끔. 그림 주소는 서버에 있는 것만(새로 만들지 않음).
        const byId = new Map(cur.items.map((e) => [e.id, e]));
        const seen = new Set<string>();
        const names = new Set<string>();
        const next = [];
        for (const it of raw.items as Array<Record<string, unknown>>) {
          const old = byId.get(String(it?.id || ""));
          if (!old || seen.has(old.id)) continue;
          const name = String(it.name ?? old.name).trim();
          if (!isEmojiName(name)) return fail(`이름 「${name}」 — 한글·영어·숫자 1~10글자로 써 주세요.`);
          if (names.has(name)) return fail(`이름 「${name}」 이 두 번 있어요.`);
          seen.add(old.id);
          names.add(name);
          next.push({ ...old, name, on: it.on !== false });
        }
        // 화면에 없던 것(다른 창에서 막 올린 것)은 뒤에 그대로
        for (const e of cur.items) if (!seen.has(e.id)) { if (names.has(e.name)) continue; next.push(e); }
        items = next;
      }
      const next = parseChatEmojiSetting({
        items,
        access: raw.access ?? cur.access,
        minAmount: raw.minAmount ?? cur.minAmount,
        period: raw.period ?? cur.period,
      });
      await saveSetting(sb, next);
      return NextResponse.json({ ok: true, setting: next });
    }

    if (action === "delete") {
      const id = String(raw.id || "");
      const cur = await readEmojiSetting(sb);
      const target = cur.items.find((e) => e.id === id);
      if (!target) return fail("이모티콘을 못 찾았어요.", 404);
      const next = { ...cur, items: cur.items.filter((e) => e.id !== id) };
      await saveSetting(sb, next);
      const path = storagePathOf(target.url);
      if (path) await sb.storage.from(EMOJI_PUBLIC_BUCKET).remove([path]).catch(() => null);
      return NextResponse.json({ ok: true, setting: next });
    }

    if (action === "list") {
      const which = raw.list === "deny" ? "deny" : "allow";
      const phone = digits(raw.key);
      if (phone.length < 9 || phone.length > 11) return fail("전화번호가 이상해요.");
      const lists = await readEmojiAccessLists(sb);
      const add = raw.add === true;
      const other = which === "allow" ? "deny" : "allow";
      const next: EmojiAccessLists = { ...lists };
      next[which] = add ? Array.from(new Set([...lists[which], phone])) : lists[which].filter((p) => p !== phone);
      if (add) next[other] = lists[other].filter((p) => p !== phone); // 넣으면 막기에서 빠지고, 막으면 넣기에서 빠짐
      await writeEmojiAccessLists(sb, next);
      clearEmojiAccessCache();
      return NextResponse.json({ ok: true, ...(await state(sb, "")) });
    }

    return fail("모르는 동작이에요.");
  } catch (e) {
    return fail(e instanceof Error ? `저장 못 했어요: ${e.message}` : "저장 못 했어요.", 500);
  }
}
