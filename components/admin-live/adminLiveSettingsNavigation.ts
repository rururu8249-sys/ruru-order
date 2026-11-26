export type SettingsTab = "shop" | "payment" | "combine" | "point" | "order" | "photo" | "screen" | "sound" | "youtube" | "telegram" | "kakao" | "roles" | "notice" | "notices" | "notes" | "security";
export type SettingsSection = "bank" | "payster" | "subscribe";
export type SettingsDestination = {tab: SettingsTab; section?: SettingsSection};
export type SettingsNavItem = {label: string; destination: SettingsDestination};
// [2026-11-26 리뉴얼] 4묶음(18칸) → 6묶음 — «무엇을 바꾸려는지»로 찾게. 탭·저장 화면은 그대로, 메뉴 배치만.
export const SETTINGS_NAV_GROUPS: readonly {id: string; label: string; collapsedByDefault: boolean; items: readonly SettingsNavItem[]}[] = [
  {id:"money",label:"입금·결제",collapsedByDefault:false,items:[{label:"입금계좌",destination:{tab:"shop",section:"bank"}},{label:"카드결제",destination:{tab:"shop",section:"payster"}}]},
  {id:"ship",label:"배송",collapsedByDefault:false,items:[{label:"배송비·카드수수료",destination:{tab:"payment"}},{label:"합배송",destination:{tab:"combine"}}]},
  {id:"benefit",label:"혜택",collapsedByDefault:false,items:[{label:"포인트 적립",destination:{tab:"point"}},{label:"구독 무료배송",destination:{tab:"payment",section:"subscribe"}}]},
  {id:"customer",label:"손님 안내",collapsedByDefault:false,items:[{label:"주문서 표시",destination:{tab:"order"}},{label:"공지·구매동의",destination:{tab:"notice"}},{label:"공지사항",destination:{tab:"notices"}},{label:"쪽지",destination:{tab:"notes"}},{label:"상품사진 문구",destination:{tab:"photo"}},{label:"방송 화면",destination:{tab:"screen"}}]},
  {id:"alert",label:"알림",collapsedByDefault:false,items:[{label:"유튜브 알림",destination:{tab:"youtube"}},{label:"텔레그램 알림",destination:{tab:"telegram"}},{label:"카톡 알림",destination:{tab:"kakao"}},{label:"알림음",destination:{tab:"sound"}}]},
  {id:"shop",label:"상점·보안",collapsedByDefault:false,items:[{label:"상점 정보",destination:{tab:"shop"}},{label:"방송 화면 권한",destination:{tab:"roles"}},{label:"관리자 보안",destination:{tab:"security"}}]},
];
// [2026-11-26 사장님 「설정 메뉴 아직 그대로」] 왼쪽 메뉴 = 묶음 6개만. 묶음 안 항목은 내용 맨 위 칩으로 고른다.
function sameDestination(item: SettingsNavItem, tab: SettingsTab, section?: SettingsSection) {
  return item.destination.tab === tab && item.destination.section === section;
}
export function activeSettingsGroupId(tab: SettingsTab, section?: SettingsSection): string {
  const exact = SETTINGS_NAV_GROUPS.find(group=>group.items.some(item=>sameDestination(item, tab, section)));
  if (exact) return exact.id;
  return SETTINGS_NAV_GROUPS.find(group=>group.items.some(item=>item.destination.tab===tab))?.id ?? SETTINGS_NAV_GROUPS[0].id;
}
export function isActiveSettingsItem(item: SettingsNavItem, tab: SettingsTab, section?: SettingsSection) {
  return sameDestination(item, tab, section);
}
export function searchSettingsNavigation(query: string): SettingsNavItem[] {
  const needle = query.trim().replace(/\s/g, "").toLocaleLowerCase();
  return SETTINGS_NAV_GROUPS.flatMap(group=>group.items).filter(item=>item.label.replace(/\s/g, "").toLocaleLowerCase().includes(needle));
}
