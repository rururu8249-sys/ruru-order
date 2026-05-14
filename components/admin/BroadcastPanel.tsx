"use client";

type BroadcastPanelProps = {
  broadcastTitle: string;
  adminMemo: string;
  shippingFee: number;
  cardFeeRate: number;
  startedAt?: string | null;

  setBroadcastTitle: (value: string) => void;
  setAdminMemo: (value: string) => void;
  setShippingFee: (value: number) => void;
  setCardFeeRate: (value: number) => void;

  onStartBroadcast: () => void;
  onEndBroadcast: () => void;
  onSaveSettings: () => void;

  isBroadcasting: boolean;
};

export default function BroadcastPanel({
  broadcastTitle,
  adminMemo,
  shippingFee,
  cardFeeRate,
  startedAt,

  setBroadcastTitle,
  setAdminMemo,
  setShippingFee,
  setCardFeeRate,

  onStartBroadcast,
  onEndBroadcast,
  onSaveSettings,

  isBroadcasting,
}: BroadcastPanelProps) {
  const formattedDate = startedAt
    ? new Date(startedAt).toLocaleString("ko-KR")
    : "-";

  return (
    <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-2xl font-extrabold text-black">
            현재 방송 상태
          </div>

          <div className="text-sm text-gray-500 mt-1">
            방송 정보 / 배송비 / 카드수수료 실시간 관리
          </div>
        </div>

        <button
          onClick={onSaveSettings}
          className="bg-black text-white px-5 py-3 rounded-2xl font-bold hover:opacity-90"
        >
          현재 방송 수정 저장
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div>
          <div className="text-sm font-bold mb-2 text-gray-700">
            고객용 방송제목
          </div>

          <input
            value={broadcastTitle}
            onChange={(e) => setBroadcastTitle(e.target.value)}
            placeholder="예) 0515 신발 방송"
            className="w-full border rounded-2xl px-4 py-3"
          />
        </div>

        <div>
          <div className="text-sm font-bold mb-2 text-gray-700">
            관리자용 부제목
          </div>

          <input
            value={adminMemo}
            onChange={(e) => setAdminMemo(e.target.value)}
            placeholder="예) 아지트1 / 1차"
            className="w-full border rounded-2xl px-4 py-3"
          />
        </div>

        <div>
          <div className="text-sm font-bold mb-2 text-gray-700">
            배송비
          </div>

          <input
            type="number"
            value={shippingFee}
            onChange={(e) => setShippingFee(Number(e.target.value))}
            className="w-full border rounded-2xl px-4 py-3"
          />
        </div>

        <div>
          <div className="text-sm font-bold mb-2 text-gray-700">
            카드수수료 %
          </div>

          <input
            type="number"
            value={cardFeeRate}
            onChange={(e) => setCardFeeRate(Number(e.target.value))}
            className="w-full border rounded-2xl px-4 py-3"
          />
        </div>
      </div>

      <div className="mt-5 bg-gray-50 rounded-3xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              방송 상태
            </div>

            <div
              className={`text-2xl font-extrabold ${
                isBroadcasting
                  ? "text-green-600"
                  : "text-red-500"
              }`}
            >
              {isBroadcasting ? "방송중" : "방송종료"}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">
              방송 시작시간
            </div>

            <div className="text-xl font-bold text-black">
              {formattedDate}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">
              현재 적용 정보
            </div>

            <div className="text-base font-bold text-gray-800 leading-7">
              배송비 {shippingFee.toLocaleString()}원
              <br />
              카드수수료 {cardFeeRate}%
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onStartBroadcast}
            className="bg-green-600 text-white px-6 py-4 rounded-2xl font-extrabold hover:opacity-90"
          >
            방송시작
          </button>

          <button
            onClick={onEndBroadcast}
            className="bg-red-500 text-white px-6 py-4 rounded-2xl font-extrabold hover:opacity-90"
          >
            방송종료
          </button>
        </div>
      </div>
    </section>
  );
}