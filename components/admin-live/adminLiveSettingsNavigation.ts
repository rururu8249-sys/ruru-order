export type SettingsTab = "shop" | "payment" | "combine" | "point" | "order" | "photo" | "screen" | "sound" | "youtube" | "telegram" | "trend" | "security";
export type SettingsDestination = {tab: SettingsTab; section?: "bank" | "payster"} | {menu: "notice" | "audit"};
export type SettingsNavItem = {label: string; destination: SettingsDestination};
export const SETTINGS_NAV_GROUPS: readonly {id: string; label: string; collapsedByDefault: boolean; items: readonly SettingsNavItem[]}[] = [
  {id:"payment",label:"결제·배송",collapsedByDefault:false,items:[{label:"입금계좌",destination:{tab:"shop",section:"bank"}},{label:"페이스터",destination:{tab:"shop",section:"payster"}},{label:"결제·배송",destination:{tab:"payment"}},{label:"합배송",destination:{tab:"combine"}}]},
  {id:"order",label:"주문·상품 안내",collapsedByDefault:false,items:[{label:"주문서 표시",destination:{tab:"order"}},{label:"상품사진 문구",destination:{tab:"photo"}},{label:"공지·구매동의",destination:{menu:"notice"}}]},
  {id:"benefit",label:"고객 혜택",collapsedByDefault:false,items:[{label:"포인트 적립",destination:{tab:"point"}}]},
  {id:"broadcast",label:"방송·알림",collapsedByDefault:false,items:[{label:"방송 화면",destination:{tab:"screen"}},{label:"알림음",destination:{tab:"sound"}},{label:"유튜브 알림",destination:{tab:"youtube"}},{label:"텔레그램 알림",destination:{tab:"telegram"}}]},
  {id:"shop",label:"상점·보안",collapsedByDefault:false,items:[{label:"상점 정보",destination:{tab:"shop"}},{label:"관리자 보안",destination:{tab:"security"}},{label:"시스템 점검",destination:{menu:"audit"}}]},
  {id:"extra",label:"추가 기능",collapsedByDefault:true,items:[{label:"트렌드 추천",destination:{tab:"trend"}}]},
];
export function searchSettingsNavigation(query: string): SettingsNavItem[] {
  const needle = query.trim().replace(/\s/g, "").toLocaleLowerCase();
  return SETTINGS_NAV_GROUPS.flatMap(group=>group.items).filter(item=>item.label.replace(/\s/g, "").toLocaleLowerCase().includes(needle));
}
