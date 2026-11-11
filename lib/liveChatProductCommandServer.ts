import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatAnnounceText } from "@/lib/chatAnnounce";
import { isExposedProductRow } from "@/lib/cartExposureServer";
import { buildDetailChatLine, detailCode, detailProducts, parseProductNote } from "@/lib/productDetailModel";
import { resolveBroadcastBrandProducts, type BrandProductLink } from "@/lib/productBrandLinks";
import { widgetRotationSettingKey, widgetTargetFromProduct, widgetTargetKey, type WidgetProductTarget } from "@/lib/widgetProductLibrary";
import { LIVE_CHAT_BOT_KAKAO, LIVE_CHAT_BOT_NICK, botRefOfProduct, productBotText, type BotCandidate } from "@/lib/liveChatBot";
import { matchChatProductCommand } from "@/lib/liveChatProductCommand";

const columns = "id, broadcast_id, nickname, body, created_at, hidden_at, badge, pinned_at, avatar_url, bot_ref";
const readFailure = () => new Error("방송 상품을 확인하지 못했어요. 잠시 후 다시 입력해 주세요.");

/** Fresh, read-only catalog, using the same legacy/linked product targets as the widget. No stale-cache fallback. */
export async function loadChatCommandProducts(sb: SupabaseClient, bc: string): Promise<BotCandidate[]> {
  const listedIds = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from("broadcast_products").select("product_id")
      .eq("broadcast_id", bc).order("product_id").range(offset, offset + 999);
    if (error) throw readFailure();
    for (const row of data ?? []) listedIds.add(String(row.product_id));
    if ((data ?? []).length < 1000) break;
  }
  const ids = [...listedIds];
  if (!ids.length) return [];
  const links = new Map<string, BrandProductLink>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100).join(",");
    for (let offset = 0; ; offset += 1000) {
      const { data, error: linkError } = await sb.from("product_brand_links")
        .select("source_id,parent_id,detail_name,original_name,moved_at")
        .or(`source_id.in.(${batch}),parent_id.in.(${batch})`).order("source_id").range(offset, offset + 999);
      if (linkError) throw readFailure();
      for (const row of data ?? []) links.set(String(row.source_id), {
        sourceId: String(row.source_id), parentId: String(row.parent_id), detailName: String(row.detail_name),
        originalName: String(row.original_name), movedAt: String(row.moved_at),
      });
      if ((data ?? []).length < 1000) break;
    }
  }
  const needed = [...new Set([...ids, ...[...links.values()].flatMap(link => [link.sourceId, link.parentId])])];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < needed.length; i += 100) {
    const { data, error: productError } = await sb.from("products").select("*").in("id", needed.slice(i, i + 100));
    if (productError) throw readFailure();
    rows.push(...(data ?? []));
  }
  const visible = rows.filter(isExposedProductRow);
  const allowedIds = new Set(visible.map(row => String(row.id)));
  const admittedLinks = [...links.values()].filter(link => allowedIds.has(link.sourceId) && allowedIds.has(link.parentId));
  const projected = resolveBroadcastBrandProducts(visible, admittedLinks, ids.filter(id => allowedIds.has(id)));
  return projected.map(row => {
    const target = widgetTargetFromProduct(row);
    const name = String(row.product_name ?? "");
    const parent = rows.find(p => String(p.id) === target.productId);
    const detail = target.detailName ? detailProducts(parent ?? {}).find(d => d.detailName === target.detailName) : null;
    const note = parseProductNote(row);
    // Same display availability as ProductWidgetClient; inventory is read only.
    const variants = Array.isArray(note.stock_variants) ? note.stock_variants as Record<string, unknown>[] : [];
    const stock = Number(row.stock ?? row.total_stock);
    const soldOut = row.is_soldout === true || (note.stock_management_enabled === true &&
      (variants.length ? variants.every(v => Number(v.stock ?? 0) <= 0) : Number.isFinite(stock) && stock <= 0));
    return { ...target, texts: [name, detailCode(name)], line: detail ? buildDetailChatLine(detail) : buildChatAnnounceText(row), soldOut, sizes: [] };
  });
}

/** Caller has checked the existing chat moderator role, ban, broadcast and rate limit. */
export async function runChatProductCommand(sb: SupabaseClient, bc: string, query: string, author: Record<string, unknown>, selected?: WidgetProductTarget) {
  const catalog = await loadChatCommandProducts(sb, bc);
  const matches = selected ? catalog.filter(p => widgetTargetKey(p) === widgetTargetKey(selected)) : matchChatProductCommand(query, catalog);
  if (!matches.length) throw new Error("현재 방송에서 해당 상품번호를 찾지 못했어요.");
  if (matches.length > 1) throw new Error("같은 번호의 상품이 여러 개예요. /mc335처럼 브랜드 코드까지 입력해 주세요.");
  const product = matches[0];
  if (product.soldOut) throw new Error("품절 상품은 위젯에 표시할 수 없어요.");
  const rotation = { mode: "selected", paused: false, targets: [{ productId: product.productId, detailName: product.detailName }] };
  const saved = await sb.from("settings").upsert({ key: widgetRotationSettingKey(bc), value: JSON.stringify(rotation), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (saved.error) throw new Error("위젯 순환을 바꾸지 못했어요. 다시 입력해 주세요.");
  // Clear the higher-priority manual pin. This also sends the existing catalog event
  // so open widgets reload without waiting for their 20-second fallback poll.
  const unpin = await sb.from("broadcasts").update({ widget_pin_mode: "auto", widget_pin_product_id: null, widget_pin_detail_name: null })
    .eq("id", bc).eq("status", "ON").select("id").maybeSingle();
  if (unpin.error || !unpin.data) throw new Error("순환 목록은 저장했지만 방송 화면에 반영하지 못했어요. 방송 상태를 확인한 뒤 다시 입력해 주세요.");
  // The command is private from the moment it is inserted: public realtime
  // redacts hidden rows. Keep the audit/rate-limit row and the public guide.
  const posted = await sb.from("live_chat_messages").insert([
    { ...author, ...(selected ? { body: `/${product.texts[0] || product.detailName}`.slice(0, 100) } : {}), broadcast_id: bc, hidden_at: new Date().toISOString(), hidden_by: "command", pinned_at: null },
    { broadcast_id: bc, kakao_id: LIVE_CHAT_BOT_KAKAO, customer_id: null, nickname: LIVE_CHAT_BOT_NICK, body: productBotText(product), badge: "bot", bot_ref: botRefOfProduct(product) },
  ]).select(columns);
  if (posted.error || !posted.data?.length) throw new Error("위젯은 변경됐지만 채팅 안내를 보내지 못했어요. 다시 입력하면 안내도 보낼 수 있어요.");
  return posted.data.find(row => row.badge !== "bot") ?? posted.data[0];
}
