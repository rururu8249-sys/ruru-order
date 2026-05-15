// app/notice/page.tsx
// 전체 생성용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/notice/page.tsx
//
// 역할:
// 고객이 상단 메뉴 [공지] 클릭 시 보는 공지사항 페이지
//
// 현재 버전:
// 관리자 공지 작성 기능 붙이기 전 임시 공지 페이지
// 다음 단계에서 Supabase 공지 테이블 + 관리자 공지관리와 연결 예정

export default function NoticePage() {
  const notices = [
    {
      category: "주문공지",
      title: "💁🏻‍♀ 방송 댓글 주문 후 주문서작성 입금 진행 해주세요!",
      content:
        "방송 댓글만으로는 주문 접수가 완료되지 않습니다. 라이브 방송에서 접수되신 분만 주문서를 작성해 주세요.",
    },
    {
      category: "결제공지",
      title: "⚠️ 주문서 작성 후 10분 이내 입금해주세요",
      content:
        "입금 후 카톡채널에 입금내역 캡처와 유튜브 닉네임을 남겨주셔야 최종 주문확인이 완료됩니다.",
    },
    {
      category: "배송공지",
      title: "📦 배송 및 송장 안내",
      content:
        "평균 출고까지 평일 영업일 기준 2~3일 정도 소요됩니다. 송장은 루루동이 밴드에서 확인 가능합니다.",
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <section className="max-w-4xl mx-auto">

        <div className="mb-8">
          <div className="text-sm font-extrabold text-gray-500 mb-2">
            RURU NOTICE
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-950">
            공지사항
          </h1>

          <p className="mt-3 text-gray-500 font-bold">
            주문 전 꼭 확인해야 하는 안내입니다.
          </p>
        </div>

        <div className="space-y-4">
          {notices.map((notice) => (
            <article
              key={notice.title}
              className="rounded-3xl border border-gray-200 bg-white p-6 md:p-7 shadow-sm"
            >
              <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-700 mb-4">
                {notice.category}
              </div>

              <h2 className="text-xl md:text-2xl font-extrabold text-gray-950 leading-snug">
                {notice.title}
              </h2>

              <p className="mt-4 text-base md:text-lg text-gray-600 leading-relaxed font-semibold">
                {notice.content}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-black text-white p-6 md:p-7">
          <div className="text-xl font-extrabold">
            문의가 필요하신가요?
          </div>

          <p className="mt-3 text-white/70 font-semibold leading-relaxed">
            주문 관련 문의는 카톡채널로 유튜브 닉네임과 주문자 이름을 함께 남겨주세요.
          </p>
        </div>

      </section>
    </main>
  );
}
