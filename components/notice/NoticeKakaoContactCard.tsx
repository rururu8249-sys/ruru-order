// components/notice/NoticeKakaoContactCard.tsx
// 목적: 공지사항 하단 카톡문의 안내 UI
// 주의: UI 전용. 카톡 연동/DB/API 로직 없음.

type NoticeKakaoContactCardProps = {
  kakaoUrl: string;
};

export default function NoticeKakaoContactCard({ kakaoUrl }: NoticeKakaoContactCardProps) {
  return (
    <section className="mt-5 rounded-[30px] bg-[#ffe04b] p-5 text-[#3b2517] shadow-[0_16px_32px_rgba(30,64,175,0.08)] ring-1 ring-yellow-200">
      <div className="text-[22px] font-black tracking-[-0.05em]">
        문의가 필요하신가요?
      </div>

      <p className="mt-2 break-keep text-[14px] font-bold leading-relaxed tracking-[-0.03em] text-[#5f4a17]">
        주문 관련 문의는 카톡채널로 유튜브 닉네임과 주문자 성함을 함께 남겨주세요.
      </p>

      <a
        href={kakaoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block rounded-2xl bg-white px-4 py-4 text-center text-[16px] font-black text-[#3b2517] transition active:scale-[0.98]"
      >
        카톡채널 문의하기
      </a>
    </section>
  );
}
