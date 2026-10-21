export type SettingsTab = "shop" | "payment" | "combine" | "point" | "order" | "photo" | "screen" | "sound" | "youtube" | "telegram" | "notice" | "notices" | "notes" | "security";
export type SettingsDestination = {tab: SettingsTab; section?: "bank" | "payster"};
export type SettingsNavItem = {label: string; destination: SettingsDestination};
export const SETTINGS_NAV_GROUPS: readonly {id: string; label: string; collapsedByDefault: boolean; items: readonly SettingsNavItem[]}[] = [
  {id:"money",label:"돈·결제",collapsedByDefault:false,items:[{label:"입금계좌",destination:{tab:"shop",section:"bank"}},{label:"카드결제",destination:{tab:"shop",section:"payster"}},{label:"수수료·배송비",destination:{tab:"payment"}},{label:"합배송",destination:{tab:"combine"}},{label:"포인트 적립",destination:{tab:"point"}}]},
  {id:"customer",label:"손님 화면",collapsedByDefault:false,items:[{label:"주문서 표시",destination:{tab:"order"}},{label:"상품사진 문구",destination:{tab:"photo"}},{label:"손님 공지·구매동의",destination:{tab:"notice"}},{label:"공지사항",destination:{tab:"notices"}},{label:"쪽지",destination:{tab:"notes"}}]},
  {id:"broadcast",label:"방송·알림",collapsedByDefault:false,items:[{label:"방송 화면",destination:{tab:"screen"}},{label:"알림음",destination:{tab:"sound"}},{label:"유튜브 알림",destination:{tab:"youtube"}},{label:"텔레그램 알림",destination:{tab:"telegram"}}]},
  {id:"shop",label:"상점·보안",collapsedByDefault:false,items:[{label:"상점 정보",destination:{tab:"shop"}},{label:"관리자 보안",destination:{tab:"security"}}]},
];
export function searchSettingsNavigation(query: string): SettingsNavItem[] {
  const needle = query.trim().replace(/\s/g, "").toLocaleLowerCase();
  return SETTINGS_NAV_GROUPS.flatMap(group=>group.items).filter(item=>item.label.replace(/\s/g, "").toLocaleLowerCase().includes(needle));
}
