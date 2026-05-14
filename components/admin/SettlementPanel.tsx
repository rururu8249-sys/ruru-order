// components/admin/SettlementPanel.tsx
"use client";

type SettlementPanelProps = {
  totalSales: number;
  warehouseCost: number;
  setWarehouseCost: (v: number) => void;

  cardSales: number;
  pgFee: number;
  setPgFee: (v: number) => void;

  extraIncome: number;
  setExtraIncome: (v: number) => void;

  extraIncomeMemo: string;
  setExtraIncomeMemo: (v: string) => void;

  expenses: {
    type: string;
    amount: number;
    memo: string;
  }[];

  addExpense: () => void;

  updateExpense: (
    index: number,
    key: string,
    value: any
  ) => void;
};

const expenseOptions = [
  "생활비",
  "주유비",
  "택배비",
  "알바비",
  "환불",
  "기타",
];

const won = (v: number) =>
  `${Number(v || 0).toLocaleString()}원`;

export default function SettlementPanel({
  totalSales,
  warehouseCost,
  setWarehouseCost,

  cardSales,
  pgFee,
  setPgFee,

  extraIncome,
  setExtraIncome,

  extraIncomeMemo,
  setExtraIncomeMemo,

  expenses,
  addExpense,
  updateExpense,
}: SettlementPanelProps) {

  const totalExpense = expenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const finalProfit =
    totalSales
    - warehouseCost
    - pgFee
    - totalExpense
    + extraIncome;

  return (
    <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">

      <div className="flex items-center justify-between mb-5">

        <div>
          <div className="text-2xl font-extrabold">
            방송 정산
          </div>

          <div className="text-sm text-gray-500 mt-1">
            방송별 정산 / 비용 / 순수익 관리
          </div>
        </div>

        <button
          className="bg-black text-white px-5 py-3 rounded-2xl font-bold"
        >
          프린트하기
        </button>

      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">

        <div className="bg-gray-50 rounded-2xl border p-5">
          <div className="text-sm text-gray-500">
            방송 매출
          </div>

          <div className="text-3xl font-extrabold mt-2">
            {won(totalSales)}
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl border p-5">
          <div className="text-sm text-gray-500">
            카드 매출
          </div>

          <div className="text-3xl font-extrabold mt-2">
            {won(cardSales)}
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl border p-5">
          <div className="text-sm text-gray-500">
            기타 매출
          </div>

          <div className="text-3xl font-extrabold mt-2">
            {won(extraIncome)}
          </div>
        </div>

        <div className="bg-black text-white rounded-2xl border p-5">
          <div className="text-sm opacity-70">
            최종 순수익
          </div>

          <div className="text-4xl font-extrabold mt-2">
            {won(finalProfit)}
          </div>
        </div>

      </div>

      <div className="grid xl:grid-cols-2 gap-5">

        <div className="border rounded-3xl p-5">

          <div className="text-xl font-extrabold mb-5">
            방송 정산 입력
          </div>

          <div className="space-y-4">

            <div>
              <div className="text-sm font-bold mb-2">
                창고 정산금액
              </div>

              <input
                type="number"
                value={warehouseCost}
                onChange={(e) =>
                  setWarehouseCost(Number(e.target.value))
                }
                className="w-full border rounded-2xl p-4"
              />
            </div>

            <div>
              <div className="text-sm font-bold mb-2">
                PG 수수료
              </div>

              <input
                type="number"
                value={pgFee}
                onChange={(e) =>
                  setPgFee(Number(e.target.value))
                }
                className="w-full border rounded-2xl p-4"
              />
            </div>

            <div>
              <div className="text-sm font-bold mb-2">
                기타 매출
              </div>

              <input
                type="number"
                value={extraIncome}
                onChange={(e) =>
                  setExtraIncome(Number(e.target.value))
                }
                className="w-full border rounded-2xl p-4"
              />
            </div>

            <div>
              <div className="text-sm font-bold mb-2">
                기타 매출 메모
              </div>

              <input
                value={extraIncomeMemo}
                onChange={(e) =>
                  setExtraIncomeMemo(e.target.value)
                }
                className="w-full border rounded-2xl p-4"
                placeholder="예) 방송외 판매"
              />
            </div>

          </div>

        </div>

        <div className="border rounded-3xl p-5">

          <div className="flex items-center justify-between mb-5">

            <div className="text-xl font-extrabold">
              기타 지출
            </div>

            <button
              onClick={addExpense}
              className="bg-black text-white px-4 py-2 rounded-2xl font-bold"
            >
              추가하기
            </button>

          </div>

          <div className="space-y-4">

            {expenses.map((expense, index) => (

              <div
                key={index}
                className="border rounded-2xl p-4 bg-gray-50"
              >

                <div className="grid md:grid-cols-3 gap-3">

                  <select
                    value={expense.type}
                    onChange={(e) =>
                      updateExpense(
                        index,
                        "type",
                        e.target.value
                      )
                    }
                    className="border rounded-2xl p-4"
                  >
                    {expenseOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    value={expense.amount}
                    onChange={(e) =>
                      updateExpense(
                        index,
                        "amount",
                        Number(e.target.value)
                      )
                    }
                    className="border rounded-2xl p-4"
                    placeholder="금액"
                  />

                  <input
                    value={expense.memo}
                    onChange={(e) =>
                      updateExpense(
                        index,
                        "memo",
                        e.target.value
                      )
                    }
                    className="border rounded-2xl p-4"
                    placeholder="메모"
                  />

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </section>
  );
}
