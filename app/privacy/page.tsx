// app/privacy/page.tsx
// 신규 파일 — 개인정보처리방침 (표시 전용)
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/privacy/page.tsx
//
// 만든 이유:
// - 유튜브 Data API 감사·쿼터 증설 신청 시 개인정보처리방침 URL이 필수
// - YouTube API 서비스 약관상 "YouTube API Services 사용 고지 + Google 개인정보처리방침 링크"가 의무
// - 전자상거래법·개인정보보호법상 쇼핑몰 필수 게시물
//
// ⚠️ 아래 SHOP_INFO 의 값만 실제 사업자 정보로 채우면 됩니다. 그 외는 수정 불필요.
// ⚠️ 돈/주문/재고/입금 로직과 무관한 표시 전용 페이지입니다.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 루루동이 집구석LIVE",
  description: "루루동이 집구석LIVE 개인정보처리방침",
};

// ───────────────────────────────────────────────
// ✏️ 여기만 채우세요
// ───────────────────────────────────────────────
// 빈 문자열("")로 두면 그 줄은 화면에 아예 표시되지 않습니다.
const SHOP_INFO = {
  serviceName: "루루동이 집구석LIVE",
  siteUrl: "https://ruru-order.vercel.app",
  companyName: "더블에이치",
  ownerName: "유혜원",
  bizNumber: "473-02-03285",
  mailOrderNumber: "",     // 통신판매업 신고번호 ← 확인되면 여기 채우면 자동 표시됨
  address: "경기도 부천시 오정구 수주로25, 가동 B02호",
  privacyOfficer: "유혜원",
  email: "rururu8249@gmail.com",
  phone: "010-9999-2420",
  effectiveDate: "2026년 8월 14일",
};

// 값이 있는 항목만 표 행으로 렌더링
const CONTACT_ROWS: Array<[string, string]> = (
  [
    ["상호", SHOP_INFO.companyName],
    ["대표자", SHOP_INFO.ownerName],
    ["사업자등록번호", SHOP_INFO.bizNumber],
    ["통신판매업 신고번호", SHOP_INFO.mailOrderNumber],
    ["주소", SHOP_INFO.address],
    ["개인정보 보호책임자", SHOP_INFO.privacyOfficer],
    ["이메일", SHOP_INFO.email],
    ["연락처", SHOP_INFO.phone],
  ] as Array<[string, string]>
).filter(([, v]) => v.trim().length > 0);
// ───────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100vh",
    background: "#FBF8F9",
    padding: "28px 18px 80px",
  } as const,
  wrap: { maxWidth: 820, margin: "0 auto" } as const,
  head: {
    background: "#fff",
    border: "1px solid #E7D3DB",
    borderRadius: 16,
    padding: "24px 22px",
    marginBottom: 18,
  } as const,
  h1: {
    fontSize: 22,
    fontWeight: 900,
    color: "#7A1E47",
    letterSpacing: "-0.5px",
    margin: 0,
  } as const,
  sub: { fontSize: 13, color: "#68575E", marginTop: 10, lineHeight: 1.7 } as const,
  card: {
    background: "#fff",
    border: "1px solid #EDE4E8",
    borderRadius: 16,
    padding: "22px",
    marginBottom: 14,
  } as const,
  h2: {
    fontSize: 16,
    fontWeight: 800,
    color: "#7A1E47",
    margin: "0 0 10px",
  } as const,
  p: { fontSize: 14, color: "#3A2F34", lineHeight: 1.85, margin: "0 0 10px" } as const,
  ul: { margin: "6px 0 10px 18px", padding: 0, fontSize: 14, color: "#3A2F34", lineHeight: 1.9 } as const,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13.5,
    marginTop: 8,
  } as const,
  th: {
    background: "#FAF0F4",
    color: "#7A1E47",
    fontWeight: 800,
    padding: "10px 12px",
    textAlign: "left" as const,
    border: "1px solid #EDE4E8",
  } as const,
  td: {
    padding: "10px 12px",
    border: "1px solid #EDE4E8",
    color: "#3A2F34",
    lineHeight: 1.7,
  } as const,
  note: {
    background: "#FAF0F4",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13,
    color: "#5C4B52",
    lineHeight: 1.8,
    marginTop: 8,
  } as const,
  a: { color: "#7A1E47", fontWeight: 700 } as const,
  foot: {
    fontSize: 12.5,
    color: "#68575E",
    textAlign: "center" as const,
    marginTop: 22,
    lineHeight: 1.8,
  } as const,
};

export default function PrivacyPage() {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.head}>
          <h1 style={S.h1}>개인정보처리방침</h1>
          <p style={S.sub}>
            {SHOP_INFO.serviceName}(이하 &lsquo;회사&rsquo;)는 이용자의 개인정보를 중요하게
            생각하며, 「개인정보 보호법」 및 「정보통신망 이용촉진 및 정보보호 등에 관한
            법률」 등 관련 법령을 준수합니다. 본 방침은 회사가 제공하는 온라인 쇼핑몰
            서비스({SHOP_INFO.siteUrl})에 적용됩니다.
          </p>
        </div>

        {/* 1 */}
        <section style={S.card}>
          <h2 style={S.h2}>1. 수집하는 개인정보 항목 및 수집 방법</h2>
          <table style={S.table}>
            <tbody>
              <tr>
                <th style={S.th}>구분</th>
                <th style={S.th}>수집 항목</th>
              </tr>
              <tr>
                <td style={S.td}>카카오톡 간편 로그인</td>
                <td style={S.td}>카카오톡 회원번호, 카카오톡 닉네임, 프로필 이미지</td>
              </tr>
              <tr>
                <td style={S.td}>주문·배송</td>
                <td style={S.td}>이름, 휴대전화번호, 배송지 주소, 받는 분 정보, 배송 요청사항</td>
              </tr>
              <tr>
                <td style={S.td}>결제·정산</td>
                <td style={S.td}>입금자명, 입금 금액, 입금 일시, 결제 수단</td>
              </tr>
              <tr>
                <td style={S.td}>서비스 이용</td>
                <td style={S.td}>주문 내역, 적립 포인트 내역, 유튜브 채팅에서 사용하는 이름(닉네임)</td>
              </tr>
              <tr>
                <td style={S.td}>자동 생성</td>
                <td style={S.td}>접속 일시, 서비스 이용 기록</td>
              </tr>
            </tbody>
          </table>
          <p style={{ ...S.p, marginTop: 12 }}>
            회사는 이용자가 서비스 화면에서 직접 입력하거나, 카카오톡 간편 로그인을 통해
            동의한 정보를 수집합니다. 주민등록번호는 수집하지 않습니다.
          </p>
        </section>

        {/* 2 */}
        <section style={S.card}>
          <h2 style={S.h2}>2. 개인정보의 이용 목적</h2>
          <ul style={S.ul}>
            <li>회원 식별 및 로그인, 주문 내역 조회</li>
            <li>상품 주문 접수, 입금 확인, 배송 및 배송 조회</li>
            <li>교환·반품·환불 등 고객 문의 응대</li>
            <li>적립 포인트 지급 및 사용 관리</li>
            <li>주문 관련 안내 및 공지 전달</li>
            <li>부정 이용 방지 및 서비스 안정성 확보</li>
          </ul>
        </section>

        {/* 3 */}
        <section style={S.card}>
          <h2 style={S.h2}>3. 개인정보의 보유 및 이용 기간</h2>
          <p style={S.p}>
            회사는 원칙적으로 개인정보 수집·이용 목적이 달성된 후 지체 없이 파기합니다.
            다만 관계 법령에 따라 다음 정보는 아래 기간 동안 보관합니다.
          </p>
          <table style={S.table}>
            <tbody>
              <tr>
                <th style={S.th}>보존 항목</th>
                <th style={S.th}>보존 기간</th>
                <th style={S.th}>근거</th>
              </tr>
              <tr>
                <td style={S.td}>계약 또는 청약철회 등에 관한 기록</td>
                <td style={S.td}>5년</td>
                <td style={S.td}>전자상거래법</td>
              </tr>
              <tr>
                <td style={S.td}>대금 결제 및 재화 등의 공급에 관한 기록</td>
                <td style={S.td}>5년</td>
                <td style={S.td}>전자상거래법</td>
              </tr>
              <tr>
                <td style={S.td}>소비자 불만 또는 분쟁 처리에 관한 기록</td>
                <td style={S.td}>3년</td>
                <td style={S.td}>전자상거래법</td>
              </tr>
              <tr>
                <td style={S.td}>표시·광고에 관한 기록</td>
                <td style={S.td}>6개월</td>
                <td style={S.td}>전자상거래법</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 4 */}
        <section style={S.card}>
          <h2 style={S.h2}>4. 개인정보의 제3자 제공</h2>
          <p style={S.p}>
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 배송을 위해
            아래와 같이 최소한의 정보를 제공합니다.
          </p>
          <table style={S.table}>
            <tbody>
              <tr>
                <th style={S.th}>제공받는 자</th>
                <th style={S.th}>제공 항목</th>
                <th style={S.th}>목적</th>
              </tr>
              <tr>
                <td style={S.td}>배송 대행사(택배사)</td>
                <td style={S.td}>받는 분 이름, 휴대전화번호, 주소, 주문 상품 정보</td>
                <td style={S.td}>상품 배송</td>
              </tr>
            </tbody>
          </table>
          <p style={{ ...S.p, marginTop: 12 }}>
            그 밖에 법령에 근거하거나 수사기관의 적법한 요청이 있는 경우에 한해 제공될 수
            있습니다.
          </p>
        </section>

        {/* 5 */}
        <section style={S.card}>
          <h2 style={S.h2}>5. 개인정보 처리의 위탁</h2>
          <p style={S.p}>
            회사는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고
            있습니다.
          </p>
          <table style={S.table}>
            <tbody>
              <tr>
                <th style={S.th}>수탁 업체</th>
                <th style={S.th}>위탁 업무</th>
              </tr>
              <tr>
                <td style={S.td}>Supabase</td>
                <td style={S.td}>서비스 데이터 보관 및 관리</td>
              </tr>
              <tr>
                <td style={S.td}>Vercel</td>
                <td style={S.td}>웹 서비스 호스팅</td>
              </tr>
              <tr>
                <td style={S.td}>카카오톡</td>
                <td style={S.td}>간편 로그인 인증</td>
              </tr>
              <tr>
                <td style={S.td}>입금 내역 조회 서비스</td>
                <td style={S.td}>무통장 입금 확인 처리</td>
              </tr>
              <tr>
                <td style={S.td}>메시지 발송 서비스</td>
                <td style={S.td}>주문·배송 관련 알림 발송</td>
              </tr>
              <tr>
                <td style={S.td}>배송 대행사</td>
                <td style={S.td}>상품 배송 및 배송 조회</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 6 — YouTube API (필수) */}
        <section style={S.card}>
          <h2 style={S.h2}>6. YouTube API 서비스 이용에 관한 안내</h2>
          <p style={S.p}>
            본 서비스는 <strong>YouTube API Services</strong>를 이용합니다. 회사는 회사가
            직접 소유·운영하는 유튜브 채널의 라이브 방송에 한하여, 방송 중 게시된 라이브
            채팅 메시지와 작성자의 채널 식별 정보를 조회하고, 주문 접수 결과를 해당 라이브
            채팅에 게시할 수 있습니다.
          </p>
          <ul style={S.ul}>
            <li>수집 범위: 라이브 채팅 메시지 내용, 작성자 표시 이름, 작성자 채널 ID</li>
            <li>이용 목적: 방송 중 시청자의 주문 의사 확인 및 주문 접수 안내</li>
            <li>회사가 소유하지 않은 채널의 데이터는 수집하지 않습니다.</li>
            <li>수집된 정보는 주문 처리 목적으로만 이용하며, 제3자에게 제공하거나 판매하지 않습니다.</li>
            <li>보관 기간이 지난 채팅 관련 정보는 지체 없이 파기합니다.</li>
          </ul>
          <div style={S.note}>
            YouTube API Services를 이용함에 따라 Google의 개인정보처리방침이 함께
            적용됩니다.
            <br />
            ·{" "}
            <a
              style={S.a}
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 개인정보처리방침
            </a>
            <br />·{" "}
            <a
              style={S.a}
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube 서비스 약관
            </a>
            <br />
            이용자는{" "}
            <a
              style={S.a}
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 보안 설정 페이지
            </a>
            에서 본 서비스의 접근 권한을 언제든지 철회할 수 있습니다.
          </div>
        </section>

        {/* 7 */}
        <section style={S.card}>
          <h2 style={S.h2}>7. 이용자의 권리와 행사 방법</h2>
          <p style={S.p}>
            이용자는 언제든지 본인의 개인정보에 대한 열람, 정정, 삭제, 처리정지를 요청할 수
            있습니다. 서비스 내 &lsquo;내정보&rsquo; 화면에서 직접 확인·수정하거나, 아래
            연락처로 요청하시면 지체 없이 처리합니다.
          </p>
          <p style={S.p}>
            만 14세 미만 아동의 개인정보는 수집하지 않습니다.
          </p>
        </section>

        {/* 8 */}
        <section style={S.card}>
          <h2 style={S.h2}>8. 개인정보의 파기</h2>
          <p style={S.p}>
            보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.
            전자적 파일 형태의 정보는 복구할 수 없는 방법으로 삭제하며, 출력물은 분쇄하거나
            소각합니다.
          </p>
        </section>

        {/* 9 */}
        <section style={S.card}>
          <h2 style={S.h2}>9. 개인정보의 안전성 확보 조치</h2>
          <ul style={S.ul}>
            <li>관리자 페이지 접근 권한 제한 및 인증 절차 운영</li>
            <li>개인정보 처리 시스템에 대한 접근 통제</li>
            <li>전송 구간 암호화(HTTPS) 적용</li>
            <li>개인정보 취급자 최소화</li>
          </ul>
        </section>

        {/* 10 */}
        <section style={S.card}>
          <h2 style={S.h2}>10. 개인정보 보호책임자 및 문의처</h2>
          <table style={S.table}>
            <tbody>
              {CONTACT_ROWS.map(([label, value]) => (
                <tr key={label}>
                  <td style={S.td}>{label}</td>
                  <td style={S.td}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={S.note}>
            개인정보 침해에 관한 신고·상담이 필요하신 경우 아래 기관에 문의하실 수
            있습니다.
            <br />· 개인정보침해신고센터 (privacy.kisa.or.kr / 국번없이 118)
            <br />· 개인정보 분쟁조정위원회 (kopico.go.kr / 1833-6972)
            <br />· 대검찰청 사이버수사과 (spo.go.kr / 국번없이 1301)
            <br />· 경찰청 사이버수사국 (ecrm.police.go.kr / 국번없이 182)
          </div>
        </section>

        {/* 11 */}
        <section style={S.card}>
          <h2 style={S.h2}>11. 개인정보처리방침의 변경</h2>
          <p style={S.p}>
            본 방침의 내용 추가, 삭제 및 수정이 있을 경우 시행 7일 전부터 서비스 내 공지를
            통해 안내합니다. 다만 이용자 권리에 중대한 변경이 발생하는 경우에는 최소 30일
            전에 공지합니다.
          </p>
        </section>

        <p style={S.foot}>
          시행일: {SHOP_INFO.effectiveDate}
          <br />
          {SHOP_INFO.serviceName}
        </p>
      </div>
    </main>
  );
}
