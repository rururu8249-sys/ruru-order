// app/terms/page.tsx
// 신규 파일 — 이용약관 (표시 전용)
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/terms/page.tsx
//
// 만든 이유:
// - 유튜브 Data API 감사 시 서비스 약관 URL 제출 가능(권장)
// - 전자상거래법상 쇼핑몰 필수 게시물
//
// ⚠️ SHOP_INFO 값만 실제 사업자 정보로 채우면 됩니다.
// ⚠️ 돈/주문/재고/입금 로직과 무관한 표시 전용 페이지입니다.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | 루루동이 집구석LIVE",
  description: "루루동이 집구석LIVE 이용약관",
};

// ───────────────────────────────────────────────
// ✏️ 여기만 채우세요 (privacy 페이지와 동일하게)
// ───────────────────────────────────────────────
// 빈 문자열("")로 두면 화면에 표시되지 않습니다.
const SHOP_INFO = {
  serviceName: "루루동이 집구석LIVE",
  siteUrl: "https://ruru-order.vercel.app",
  companyName: "",
  ownerName: "",
  email: "rururu8249@gmail.com",
  effectiveDate: "2026년 8월 14일",
  revisedDate: "2026년 9월 27일",
};

const FOOT_PARTS = [
  SHOP_INFO.serviceName,
  SHOP_INFO.ownerName ? `대표 ${SHOP_INFO.ownerName}` : "",
  SHOP_INFO.email,
].filter((v) => v.trim().length > 0);
// ───────────────────────────────────────────────

const S = {
  page: { minHeight: "100vh", background: "#FBF8F9", padding: "28px 18px 80px" } as const,
  wrap: { maxWidth: 820, margin: "0 auto" } as const,
  head: {
    background: "#fff",
    border: "1px solid #E7D3DB",
    borderRadius: 16,
    padding: "24px 22px",
    marginBottom: 18,
  } as const,
  h1: { fontSize: 22, fontWeight: 900, color: "#7A1E47", letterSpacing: "-0.5px", margin: 0 } as const,
  sub: { fontSize: 13, color: "#68575E", marginTop: 10, lineHeight: 1.7 } as const,
  card: {
    background: "#fff",
    border: "1px solid #EDE4E8",
    borderRadius: 16,
    padding: "22px",
    marginBottom: 14,
  } as const,
  h2: { fontSize: 16, fontWeight: 800, color: "#7A1E47", margin: "0 0 10px" } as const,
  p: { fontSize: 14, color: "#3A2F34", lineHeight: 1.85, margin: "0 0 10px" } as const,
  ul: { margin: "6px 0 10px 18px", padding: 0, fontSize: 14, color: "#3A2F34", lineHeight: 1.9 } as const,
  a: { color: "#7A1E47", fontWeight: 700 } as const,
  note: {
    background: "#FAF0F4",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13,
    color: "#5C4B52",
    lineHeight: 1.8,
    marginTop: 8,
  } as const,
  foot: { fontSize: 12.5, color: "#68575E", textAlign: "center" as const, marginTop: 22, lineHeight: 1.8 } as const,
};

export default function TermsPage() {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.head}>
          <h1 style={S.h1}>이용약관</h1>
          <p style={S.sub}>
            본 약관은 {SHOP_INFO.companyName || SHOP_INFO.serviceName}(이하 &lsquo;회사&rsquo;)가 제공하는 온라인
            쇼핑몰 서비스({SHOP_INFO.siteUrl})의 이용 조건과 절차, 회사와 이용자의 권리·의무를
            정합니다.
          </p>
          <div style={S.note}>
            카카오톡 간편 로그인 동의 화면의 「이용약관」 항목이 가리키는 문서는 본 문서입니다.
            동의 화면에서 링크가 열리지 않더라도 {SHOP_INFO.siteUrl}/terms 에서 언제든지 전문을
            확인하실 수 있으며, 로그인 화면과 주문서 화면 하단에도 같은 링크가 있습니다.
          </div>
        </div>

        <section style={S.card}>
          <h2 style={S.h2}>제1조 (목적)</h2>
          <p style={S.p}>
            본 약관은 회사가 운영하는 온라인 쇼핑몰에서 제공하는 서비스의 이용과 관련하여
            회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제2조 (정의)</h2>
          <ul style={S.ul}>
            <li>&lsquo;서비스&rsquo;란 회사가 제공하는 상품 판매 및 관련 부가 서비스를 말합니다.</li>
            <li>&lsquo;이용자&rsquo;란 본 약관에 따라 서비스를 이용하는 회원을 말합니다.</li>
            <li>&lsquo;회원&rsquo;이란 카카오톡 간편 로그인을 통해 서비스에 접속하여 이용하는 자를 말합니다.</li>
            <li>&lsquo;포인트&rsquo;란 회사가 정한 기준에 따라 회원에게 지급되어 상품 구매 시 사용할 수 있는 적립금을 말합니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제3조 (약관의 효력 및 변경)</h2>
          <p style={S.p}>
            본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 회사는 관련 법령을
            위배하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행 7일 전부터 서비스
            내 공지를 통해 안내합니다. 이용자에게 불리한 변경의 경우 최소 30일 전에
            공지합니다.
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제4조 (회원 가입 및 관리)</h2>
          <ul style={S.ul}>
            <li>회원 가입은 카카오톡 간편 로그인으로 이루어지며, 카카오 로그인 동의 화면에서 본 약관 및 개인정보처리방침에 동의한 때에 이용계약이 성립합니다.</li>
            <li>
              카카오톡 간편 로그인 시 카카오로부터 제공받는 정보(회원번호, 닉네임, 프로필 이미지, 이름, 전화번호, 배송지)는 주문서 자동 입력과 주문 조회에만 사용하며, 자세한 처리 내용은{" "}
              <a style={S.a} href="/privacy">
                개인정보처리방침
              </a>
              에 따릅니다.
            </li>
            <li>만 14세 미만은 회원 가입 및 서비스 이용을 할 수 없습니다. 만 19세 미만 미성년자는 법정대리인의 동의를 얻어 이용해야 하며, 동의 없이 체결한 계약은 미성년자 본인 또는 법정대리인이 취소할 수 있습니다.</li>
            <li>회원은 주문 및 배송을 위해 정확한 정보를 입력해야 하며, 허위 정보 입력으로 발생한 불이익은 회원이 부담합니다.</li>
            <li>회원은 언제든지 서비스 내 문의 채널 또는 개인정보처리방침에 안내된 연락처로 탈퇴를 요청할 수 있으며, 회사는 지체 없이 처리합니다. 카카오와의 연결은 카카오톡 [더보기] &gt; [MY] &gt; [카카오계정] &gt; [연결된 서비스 관리]에서 직접 끊을 수 있으나, 연결을 끊어도 회사에 보관된 회원 정보는 삭제되지 않으므로 삭제를 원하시면 탈퇴를 요청해 주세요.</li>
            <li>회사는 부정 주문, 타인 정보 도용, 서비스 운영 방해 행위가 확인된 경우 이용을 제한할 수 있습니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제5조 (주문 및 결제)</h2>
          <ul style={S.ul}>
            <li>이용자는 서비스 화면에서 상품을 선택하고 주문서를 제출하는 방식으로 주문합니다.</li>
            <li>주문은 주문서 제출이 완료된 시점에 접수되며, 결제(입금) 확인 시 확정됩니다.</li>
            <li>무통장 입금의 경우 안내된 계좌·금액·입금자명이 일치해야 자동으로 확인됩니다. 정보가 다를 경우 확인이 지연될 수 있습니다.</li>
            <li>카드 결제의 경우 회사가 안내하는 문자 결제 링크를 통해 진행되며, 카드 결제 시 적용되는 금액과 조건은 주문서 화면에 표시된 내용에 따릅니다.</li>
            <li>재고 부족, 상품 정보 오류 등 부득이한 사유가 있는 경우 회사는 주문을 취소할 수 있으며, 이 경우 지체 없이 안내하고 환불합니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제6조 (배송)</h2>
          <ul style={S.ul}>
            <li>회사는 결제 확인 후 상품을 발송합니다. 발송 시점은 상품 준비 상황에 따라 달라질 수 있으며 서비스 내 공지로 안내합니다.</li>
            <li>배송지 오류 또는 연락 두절로 발생한 배송 지연·반송에 대한 책임은 이용자에게 있습니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제7조 (교환·반품)</h2>
          {/* [2026-09-27] 사이트 공지 「🔄 교환 · 반품 안내」(05.16 게시) 내용 기준 — 공지가 바뀌면 여기도 같이 맞출 것 */}
          <p style={S.p}>
            교환·반품은 공지사항의{" "}
            <a style={S.a} href="/notice">
              「교환 · 반품 안내」
            </a>
            를 따르며, 주요 내용은 다음과 같습니다.
          </p>
          <p style={{ ...S.p, fontWeight: 700 }}>1. 교환·환불이 가능한 경우</p>
          <ul style={S.ul}>
            <li>중대한 하자</li>
            <li>오배송</li>
            <li>표시·광고 내용과 다른 경우</li>
          </ul>
          <p style={S.p}>→ 수령 후 7일 이내에 접수해 주세요. 교환·반품 요청은 서비스 내 문의 채널을 통해 접수합니다.</p>
          <p style={{ ...S.p, fontWeight: 700 }}>2. 제한될 수 있는 경우</p>
          <ul style={S.ul}>
            <li>사이즈 미스, 단순 변심</li>
            <li>공지에 미리 안내된 상품 특성(병행수입·B-grade 등) 관련 사유</li>
          </ul>
          <p style={{ ...S.p, fontWeight: 700 }}>3. 반품비</p>
          <p style={S.p}>국내상품 10,000원 / 해외상품 30,000원</p>
          <p style={{ ...S.p, fontWeight: 700 }}>4. 반품 상품 확인 기준</p>
          <p style={S.p}>
            반품 상품은 출고 상태 및 구성품 동일성 확인 후 환불됩니다. 아래의 경우 반품이 제한될 수
            있습니다.
          </p>
          <ul style={S.ul}>
            <li>세탁 / 착용 / 사용 흔적</li>
            <li>향수·섬유탈취제·체취 등 냄새</li>
            <li>구성품 누락 또는 다른 상품 반송</li>
            <li>포장 훼손 및 상품 가치 저하</li>
          </ul>
          <p style={S.p}>※ 의류·신발·악세사리 특성상 사용 시 재판매가 어려울 수 있습니다.</p>
          <p style={{ ...S.p, fontWeight: 700 }}>5. 구매 전 동의</p>
          <p style={S.p}>
            본 상품은 사용·착용 또는 포장 훼손 시 재판매가 어려운 상품으로, 구매 진행 시 본 페이지·방송·주문서에
            안내된 모든 내용을 확인 및 동의한 것으로 간주됩니다. 구매 후 거래는 관련 법령에 따라 유효하게
            진행됩니다.
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제8조 (포인트)</h2>
          <ul style={S.ul}>
            <li>포인트는 회사가 정한 기준에 따라 지급되며, 상품 구매 시 사용할 수 있습니다.</li>
            <li>포인트는 현금으로 환급되지 않으며, 타인에게 양도할 수 없습니다.</li>
            <li>포인트가 사용된 주문이 취소·반품되는 경우, 사용된 포인트는 회수 또는 재지급 처리됩니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제9조 (라이브 방송 및 채팅)</h2>
          <p style={S.p}>
            회사는 회사가 소유·운영하는 유튜브 채널에서 라이브 방송을 진행하며, 방송 중
            게시된 라이브 채팅 내용을 주문 접수 목적으로 이용할 수 있습니다. 이와 관련한
            개인정보 처리 사항은{" "}
            <a style={S.a} href="/privacy">
              개인정보처리방침
            </a>
            에서 확인하실 수 있습니다.
          </p>
          <div style={S.note}>
            본 서비스는 YouTube API Services를 이용합니다. 이용자에게는 Google의{" "}
            <a
              style={S.a}
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              개인정보처리방침
            </a>{" "}
            및{" "}
            <a
              style={S.a}
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube 서비스 약관
            </a>
            이 함께 적용됩니다.
          </div>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제10조 (이용자의 의무)</h2>
          <ul style={S.ul}>
            <li>타인의 정보를 도용하거나 허위 정보를 입력하는 행위를 하여서는 안 됩니다.</li>
            <li>서비스의 운영을 방해하거나 시스템에 부하를 유발하는 행위를 하여서는 안 됩니다.</li>
            <li>회사가 게시한 상품 이미지·설명 등 저작물을 무단으로 복제·배포하여서는 안 됩니다.</li>
          </ul>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제11조 (책임의 제한)</h2>
          <p style={S.p}>
            회사는 시스템 점검·교체 등 운영상 필요한 경우 서비스 제공을 일시 중단할 수
            있으며, 이 경우 서비스 내 공지로 안내합니다. 회사는 천재지변, 통신망 장애, 외부 서비스(호스팅·결제·배송 등)의 장애 등
            불가항력적 사유로 서비스를 제공할 수 없는 경우 그에 대한 책임이 면제됩니다.
            회사는 이용자의 귀책사유로 인한 손해에 대하여 책임을 지지 않습니다.
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>제12조 (분쟁 해결 및 준거법)</h2>
          <p style={S.p}>
            본 약관은 대한민국 법령에 따라 규율되고 해석됩니다. 서비스 이용과 관련하여
            분쟁이 발생한 경우 회사와 이용자는 성실히 협의하여 해결하며, 협의가 이루어지지
            않을 경우 관계 법령에 따른 관할 법원에 소를 제기할 수 있습니다.
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>부칙</h2>
          <ul style={S.ul}>
            <li>본 약관은 {SHOP_INFO.effectiveDate}부터 시행합니다.</li>
            <li>{SHOP_INFO.revisedDate} 개정 — 카카오 로그인 제공정보·미성년자·탈퇴(제4조), 카드 결제(제5조), 교환·반품 기준을 공지사항 「교환 · 반품 안내」와 일치(제7조), 서비스 중단 안내(제11조) 보강. 이용자에게 불리하지 않은 보완 개정으로 게시한 날부터 적용합니다.</li>
          </ul>
        </section>

        <p style={S.foot}>
          시행일: {SHOP_INFO.effectiveDate} · 최종 개정: {SHOP_INFO.revisedDate}
          <br />
          {FOOT_PARTS.join(" · ")}
        </p>
      </div>
    </main>
  );
}
