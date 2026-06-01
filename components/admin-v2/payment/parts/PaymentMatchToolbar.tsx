"use client";

type PaymentMatchView = "unmatched" | "paid" | "deposits" | "all";

type PaymentMatchToolbarProps = {
  view: PaymentMatchView;
  keyword: string;
  onChangeView: (view: PaymentMatchView) => void;
  onChangeKeyword: (value: string) => void;
};

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[13px] font-black ${
        active ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function PaymentMatchToolbar({
  view,
  keyword,
  onChangeView,
  onChangeKeyword,
}: PaymentMatchToolbarProps) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="grid gap-2 lg:grid-cols-[460px_1fr] lg:items-center">
        <div className="flex flex-wrap gap-1.5">
          <TabButton active={view === "unmatched"} onClick={() => onChangeView("unmatched")}>
            입금대기 주문
          </TabButton>

          <TabButton active={view === "paid"} onClick={() => onChangeView("paid")}>
            결제완료 주문
          </TabButton>

          <TabButton active={view === "deposits"} onClick={() => onChangeView("deposits")}>
            입금내역
          </TabButton>

          <TabButton active={view === "all"} onClick={() => onChangeView("all")}>
            전체 주문
          </TabButton>
        </div>

        <input
          value={keyword}
          onChange={(event) => onChangeKeyword(event.target.value)}
          placeholder="닉네임 / 이름 / 전화번호 / 입금자명 / 금액 검색"
          className="h-10 rounded-lg border border-neutral-200 px-3 text-[14px] font-bold outline-none focus:border-neutral-950"
        />
      </div>
    </section>
  );
}
