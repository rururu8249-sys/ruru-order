// Admin only. Values are editable representative colors, not textile color standards.
// English values: color-name-list 14.51.0 (MIT, David Aerne), loaded on demand.
// Korean names below are application aliases to explicit English entries, not a KS color table.
export const koreanColorAliases: Record<string, string> = {
  블랙:'Black', 검정:'Black', 검정색:'Black', 검은색:'Black', 흑색:'Black', 먹색:'Ink Black',
  화이트:'White', 흰색:'White', 흰:'White', 백색:'White', 순백:'Snow White', 스노우화이트:'Snow White',
  아이보리:'Ivory', 크림:'Cream', 크림색:'Cream', 크림화이트:'Cream White', 밀크:'Milk', 에크루:'Ecru',
  베이지:'Beige', 베이지색:'Beige', 샌드:'Sand', 샌드베이지:'Sand', 오트밀:'Oatmeal', 오트:'Oatmeal',
  카멜:'Camel', 캐멀:'Camel', 모카:'Mocha', 토프:'Taupe', 타우페:'Taupe', 그레이지:'Greige',
  그레이:'Grey', 회색:'Grey', 회:'Grey', 차콜:'Charcoal', 챠콜:'Charcoal', 차콜그레이:'Charcoal',
  라이트그레이:'Light Grey', 연회색:'Light Grey', 다크그레이:'Dark Grey', 진회색:'Dark Grey',
  실버:'Silver', 은색:'Silver', 은회색:'Silver Grey', 스틸:'Steel', 애쉬:'Ash', 애쉬그레이:'Ash Grey',
  레드:'Red', 빨강:'Red', 빨간색:'Red', 빨강색:'Red', 적색:'Red', 스칼렛:'Scarlet', 주홍:'Vermilion',
  버건디:'Burgundy', 버건디색:'Burgundy', 버건디레드:'Burgundy', 와인:'Wine', 와인색:'Wine',
  마룬:'Maroon', 체리:'Cherry', 체리레드:'Cherry Red', 루비:'Ruby', 크림슨:'Crimson',
  핑크:'Pink', 분홍:'Pink', 분홍색:'Pink', 연분홍:'Light Pink', 연핑크:'Light Pink', 라이트핑크:'Light Pink',
  베이비핑크:'Baby Pink', 인디핑크:'Dusty Pink', 더스티핑크:'Dusty Pink', 로즈:'Rose', 로즈핑크:'Rose Pink',
  핫핑크:'Hot Pink', 진핑크:'Hot Pink', 푸시아:'Fuchsia', 퓨시아:'Fuchsia', 마젠타:'Magenta',
  피치:'Peach', 복숭아색:'Peach', 살구:'Apricot', 살구색:'Apricot', 코랄:'Coral', 산호색:'Coral',
  연어색:'Salmon', 살몬:'Salmon', 오렌지:'Orange', 주황:'Orange', 주황색:'Orange', 귤색:'Tangerine',
  탠저린:'Tangerine', 러스트:'Rust', 테라코타:'Terracotta', 벽돌색:'Brick Red', 브릭:'Brick Red',
  옐로우:'Yellow', 옐로:'Yellow', 노랑:'Yellow', 노란색:'Yellow', 노랑색:'Yellow', 황색:'Yellow',
  레몬:'Lemon', 레몬색:'Lemon', 머스타드:'Mustard', 머스터드:'Mustard', 겨자색:'Mustard',
  골드:'Gold', 금색:'Gold', 샴페인:'Champagne', 버터:'Butter', 버터옐로우:'Butter Yellow',
  그린:'Green', 초록:'Green', 초록색:'Green', 녹색:'Green', 연두:'Yellow Green', 연두색:'Yellow Green',
  라임:'Lime', 민트:'Mint', 민트색:'Mint', 민트그린:'Mint Green', 올리브:'Olive', 올리브그린:'Olive',
  카키:'Khaki', 카키색:'Khaki', 세이지:'Sage', 세이지그린:'Sage Green', 모스:'Moss', 모스그린:'Moss',
  에메랄드:'Emerald', 에메랄드그린:'Emerald Green', 포레스트:'Forest Green', 포레스트그린:'Forest Green',
  다크그린:'Dark Green', 진녹색:'Dark Green', 청록:'Teal', 청록색:'Teal', 틸:'Teal', 터쿼이즈:'Turquoise',
  블루:'Blue', 파랑:'Blue', 파란색:'Blue', 파랑색:'Blue', 청색:'Blue', 소라:'Sky Blue', 소라색:'Sky Blue',
  하늘:'Sky Blue', 하늘색:'Sky Blue', 스카이블루:'Sky Blue', 스카이:'Sky Blue', 연파랑:'Light Blue',
  라이트블루:'Light Blue', 베이비블루:'Baby Blue', 파우더블루:'Powder Blue', 아쿠아:'Aqua',
  코발트:'Cobalt', 코발트블루:'Cobalt', 로열블루:'Royal Blue', 로얄블루:'Royal Blue',
  네이비:'Navy Blue', 네이비블루:'Navy Blue', 남색:'Navy Blue', 곤색:'Navy Blue', 감색:'Navy Blue',
  인디고:'Indigo', 데님:'Denim', 데님블루:'Denim Blue', 미드나잇블루:'Midnight Blue',
  퍼플:'Purple', 보라:'Purple', 보라색:'Purple', 자주:'Purple', 바이올렛:'Violet',
  라벤더:'Lavender', 라일락:'Lilac', 연보라:'Lilac', 연보라색:'Lilac', 플럼:'Plum',
  모브:'Mauve', 가지색:'Aubergine', 오버진:'Aubergine', 오키드:'Orchid',
  브라운:'Brown', 갈색:'Brown', 밤색:'Chestnut', 체스트넛:'Chestnut', 초콜릿:'Chocolate', 초코:'Chocolate',
  초코브라운:'Chocolate', 커피:'Coffee', 커피색:'Coffee', 에스프레소:'Espresso', 코코아:'Cocoa',
  시나몬:'Cinnamon', 탄:'Tan', 탠:'Tan', 월넛:'Walnut', 호두색:'Walnut', 헤이즐넛:'Hazelnut',
  마호가니:'Mahogany', 코퍼:'Copper', 구리색:'Copper', 브론즈:'Bronze', 청동색:'Bronze',
};

function key(name: string) { return name.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, ''); }
let dictionary: Promise<Map<string, string>> | undefined;
function loadDictionary() {
  dictionary ??= import('color-name-list').then(({colornames}) => {
    const map = new Map<string, string>();
    for (const {name, hex} of colornames) {
      const normalized = key(name);
      // Do not silently choose between names that collide after normalization.
      if (map.has(normalized) && map.get(normalized) !== hex.toUpperCase()) map.set(normalized, '');
      else if (!map.has(normalized)) map.set(normalized, hex.toUpperCase());
    }
    return map;
  }).catch(error => { dictionary = undefined; throw error; });
  return dictionary;
}

export async function suggestColorName(name: string): Promise<string | null> {
  const normalized = key(name);
  if (!normalized) return null;
  const alias = Object.hasOwn(koreanColorAliases, normalized) ? koreanColorAliases[normalized] : normalized === 'gray' ? 'Grey' : name;
  return (await loadDictionary()).get(key(alias)) || null;
}
