/** The visitor's Vercel IP-derived city/region. This is NOT a residential address.
 * Never send a customer's IP to a third-party geo API. No raw IP-to-city guessing.
 */
const COUNTRY: Record<string,string>={KR:'대한민국',US:'미국',JP:'일본',CN:'중국',TW:'대만',HK:'홍콩',VN:'베트남',TH:'태국'};
const KR_REGION:Record<string,string>={
  '11':'서울','26':'부산','27':'대구','28':'인천','29':'광주','30':'대전','31':'울산',
  '36':'세종','41':'경기','42':'강원','43':'충북','44':'충남','45':'전북',
  '46':'전남','47':'경북','48':'경남','49':'제주','50':'세종',
};
const KOREAN_CITY:Record<string,string>={
  seoul:'서울',busan:'부산',incheon:'인천',daegu:'대구',daejeon:'대전',
  gwangju:'광주',ulsan:'울산',sejong:'세종',suwon:'수원',yongin:'용인',
  seongnam:'성남',goyang:'고양',bucheon:'부천',ansan:'안산',anyang:'안양',
  cheongju:'청주',cheonan:'천안',jeonju:'전주',pohang:'포항',changwon:'창원',
  jeju:'제주',gimhae:'김해',gimpo:'김포',pyeongtaek:'평택',namyangju:'남양주',
};
export function regionFromVercelHeaders(headers: Pick<Headers,'get'>|null|undefined):string {
  if(!headers)return '';
  const country=String(headers.get('x-vercel-ip-country')||'').trim().toUpperCase();
  const region=String(headers.get('x-vercel-ip-country-region')||'').trim();
  const raw=String(headers.get('x-vercel-ip-city')||'').trim();
  let city='';
  try{city=decodeURIComponent(raw);}catch{city='';}
  city=city.replace(/[\r\n\t<>]/g,'').slice(0,45).trim();
  if(city)city=KOREAN_CITY[city.toLowerCase()]||city;
  if(country==='KR')return (city||KR_REGION[region]||'대한민국').slice(0,55);
  if(!country)return '';
  const countryName=COUNTRY[country]||country;
  return (city?`${countryName} · ${city}`:countryName).slice(0,55);
}
