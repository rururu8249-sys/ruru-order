/**
 * [2026-11-12 사장님] 방송 보며 주문 화면 채팅 위 「지금 소개하는 상품」 카드 켬/끔.
 *   settings 한 줄: 값 = 카드를 끈 방송 id(비어 있으면 켬). 방송이 바뀌면 저절로 다시 켜짐.
 *   유튜브(OBS) 상품 위젯·순환·채팅 명령은 그대로 — 사이트 카드만 숨김.
 */
export const SITE_PRODUCT_CARD_OFF_KEY = "live_site_product_card_off";

export function isSiteProductCardOff(value: unknown, broadcastId: string): boolean {
  return Boolean(broadcastId) && typeof value === "string" && value.trim() === broadcastId;
}

export function siteProductCardValue(broadcastId: string, off: boolean): string {
  return off ? broadcastId : "";
}
