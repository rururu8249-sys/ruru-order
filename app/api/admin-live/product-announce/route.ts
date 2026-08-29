// [2026-08-29 사장님 요청] "상품 소개" 버튼 한 번 → 봇이 유튜브 채팅에 직접 올린다
//
// 예전: [📢 채팅] 을 누르면 클립보드에 복사만 됐다.
//       사장님이 유튜브 창으로 옮겨가서 붙여넣고 엔터까지 쳐야 했다.
//       방송 중에 상품을 바꿀 때마다 이걸 반복 → "왔다 갔다 복사하고 정신없다"
// 지금: 서버가 상품 정보를 DB에서 확인하고 문구를 만들어 봇으로 바로 올린다.
//
// 안전
//   · 관리자 세션 필수
//   · products 는 읽기만 한다. 주문·입금·정산·배송·재고 무접촉
//   · 문구는 서버가 만든다 (화면이 보낸 문장을 그대로 쓰지 않는다)
//   · 유튜브 쿼터: 글 1개 = 50 units. 봇 안내와 같은 일일 집계에 기록하고 상한을 지킨다
//   · 같은 상품을 20초 안에 두 번 올리지 않는다 (연타 방지)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { postLiveChatMessage, readSetting, writeSetting } from "@/lib/youtube";
import { detailProducts } from "@/lib/productDetailModel";
import { buildProductAnnounceLine } from "@/lib/productAnnounce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 유튜브 쿼터 보호
//   봇이 채팅에 글을 쓰는 것(liveChatMessages.insert)은 읽기보다 훨씬 비싸다.
//   그래서 봇 글은 하루 60건으로 묶어 관리한다(lib/chatOrderPipeline.ts 의 BOT_DAILY_CAP 과 같은 기준).
//
//   ⚠️ 여기가 중요하다 — 그 60건은 아래 넷이 **같이 나눠 쓴다**:
//        ① 채팅주문 안내(다시 적어달라)  ② 주문 접수확인  ③ 카드결제 링크 안내  ④ 상품 소개(이 파일)
//      상품 소개를 마구 누르면 **손님 주문 접수확인이 안 나가는 사고**가 생긴다.
//      → 상품 소개는 하루 25건까지만 쓰게 따로 묶어, 나머지 35건을 주문 쪽에 남겨둔다.
const DAILY_CAP = 60;              // 봇 채팅 전체 상한 (모든 종류 합산)
const ANNOUNCE_DAILY_CAP = 25;     // 그중 "상품 소개" 가 쓸 수 있는 몫
const SAME_PRODUCT_GAP_MS = 20 * 1000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const productId = clean(body?.productId);
    const detailName = clean(body?.detailName);
    if (!productId) return NextResponse.json({ ok: false, error: "상품 번호가 없습니다." }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data: rows, error: readError } = await sb
      .from("products")
      .select("id, product_name, price, color_options, size_options, product_note")
      .eq("id", productId)
      .limit(1);

    if (readError) return NextResponse.json({ ok: false, error: `상품 조회 실패: ${readError.message}` }, { status: 500 });

    const product = (rows || [])[0] as Record<string, unknown> | undefined;
    if (!product) return NextResponse.json({ ok: false, error: "상품을 찾지 못했습니다." }, { status: 404 });

    // 세부상품이 지정됐으면 그 세부상품의 실제 판매가·색상·사이즈를 쓴다.
    let line = "";
    if (detailName) {
      const found = detailProducts(product, { includeHidden: true }).find((d) => d.detailName === detailName);
      if (!found) return NextResponse.json({ ok: false, error: "세부상품을 찾지 못했습니다." }, { status: 404 });
      line = buildProductAnnounceLine({
        name: found.detailName,
        price: found.price,
        colors: found.colors,
        sizes: found.sizes,
      });
    } else {
      line = buildProductAnnounceLine({
        name: product.product_name,
        price: product.price,
        colors: product.color_options,
        sizes: product.size_options,
      });
    }

    // 연타 방지
    const dedupeKey = `product_announce_${productId}_${detailName || "__base__"}`;
    const lastMs = Number(await readSetting(sb, dedupeKey)) || 0;
    if (lastMs && Date.now() - lastMs < SAME_PRODUCT_GAP_MS) {
      return NextResponse.json({ ok: false, error: "방금 이 상품을 올렸어요. 잠시 뒤에 다시 눌러 주세요.", message: line }, { status: 429 });
    }

    // 유튜브 쿼터 상한
    const day = new Date().toISOString().slice(0, 10);
    const { data: usage } = await sb
      .from("youtube_api_usage")
      .select("calls")
      .eq("day", day)
      .eq("method", "liveChatMessages.insert")
      .limit(1)
      .maybeSingle();

    const sentToday = Number((usage as Record<string, unknown> | null)?.calls || 0);
    if (sentToday >= DAILY_CAP) {
      return NextResponse.json(
        { ok: false, error: `오늘 봇 채팅 상한(${DAILY_CAP}건)에 도달했어요. 복사해서 직접 올려 주세요.`, message: line },
        { status: 429 },
      );
    }

    // 상품 소개 몫 확인 — 주문 접수확인이 밀리지 않게
    const announceKey = `product_announce_count_${day}`;
    const announcedToday = Number(await readSetting(sb, announceKey)) || 0;
    if (announcedToday >= ANNOUNCE_DAILY_CAP) {
      return NextResponse.json(
        {
          ok: false,
          error: `오늘 상품 소개는 ${ANNOUNCE_DAILY_CAP}건까지만 자동으로 올려요.\n(손님 주문 접수확인 안내를 위해 남겨둡니다)\n문구를 복사해 뒀으니 채팅에 붙여넣어 주세요.`,
          message: line,
        },
        { status: 429 },
      );
    }

    const botChatId = await readSetting(sb, "chat_order_chat_id");
    const result = await postLiveChatMessage(line, { forceEvenIfDisabled: true, liveChatId: botChatId });

    if (!result.ok) {
      // 실패해도 문구는 돌려준다 — 화면에서 복사해 직접 올릴 수 있게.
      return NextResponse.json(
        { ok: false, error: clean((result as Record<string, unknown>).reason) || "채팅 발송 실패", message: line },
        { status: 502 },
      );
    }

    await writeSetting(sb, dedupeKey, String(Date.now()));
    await writeSetting(sb, announceKey, String(announcedToday + 1));
    if (usage) {
      await sb.from("youtube_api_usage").update({ calls: sentToday + 1 }).eq("day", day).eq("method", "liveChatMessages.insert");
    } else {
      await sb.from("youtube_api_usage").insert({ day, method: "liveChatMessages.insert", calls: 1 });
    }

    return NextResponse.json({
      ok: true,
      message: line,
      announceUsed: announcedToday + 1,
      announceCap: ANNOUNCE_DAILY_CAP,
      botUsed: sentToday + 1,
      botCap: DAILY_CAP,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
