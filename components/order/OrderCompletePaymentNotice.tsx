"use client";

import Link from "next/link";
// components/order/OrderCompletePaymentNotice.tsx
// 목적: 주문완료 후 입금계좌 최상단 안내 + 주문상품/배송비/총액 확인 UI
// 주의: UI 전용. 주문 저장, 주문번호 생성, 금액 계산, 입금매칭, Supabase 로직 없음.

import { useState } from "react";

type OrderDoneItem = {
  product_name?: string;
  color?: string;
  size?: string;
  qty?: string | number;
  product_price?: string | number;
};

type OrderCompletePaymentNoticeProps = {
  nickname: string;
  name: string;
  paymentMethod: "무통장입금" | "카드결제";
  productAmount: number;
  shippingFee: number;
  totalAmount: number;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  items?: OrderDoneItem[];
};

const toNumber = (value: string | number | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;
const clean = (value: unknown) => String(value || "").trim();

const itemTitle = (item: OrderDoneItem) => {
  const name = clean(item.product_name) || "상품명 확인";
  const optionText = [clean(item.color), clean(item.size)].filter(Boolean).join(" / ");
  return optionText ? `${name} (${optionText})` : name;
};

export default function OrderCompletePaymentNotice({
  nickname,
  name,
  paymentMethod,
  productAmount,
  shippingFee,
  totalAmount,
  bankName,
  bankAccount,
  bankHolder,
  items = [],
}: OrderCompletePaymentNoticeProps) {
  const [copyDone, setCopyDone] = useState(false);
  const depositName = clean(nickname || name) || "현재 닉네임";
  const totalQty = items.reduce((sum, item) => sum + toNumber(item.qty), 0);

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(bankAccount);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 1800);
    } catch {
      alert(bankAccount);
    }
  };

  return (
    <section className="mt-4 grid gap-4">
      <section className="px-2 pt-2 text-center">
        <h1 className="text-[31px] font-black leading-tight tracking-[-0.08em] text-[#151923]">
          주문 완료 / 입금 안내
        </h1>
        <p className="mt-2 text-[15px] font-bold tracking-[-0.04em] text-slate-600">
          입금 정보를 먼저 확인해주세요.
        </p>
      </section>

      {paymentMethod === "무통장입금" ? (
        <section className="rounded-[30px] bg-blue-50 p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[27px] text-blue-600 shadow-sm ring-1 ring-blue-100">
                🏦
              </div>

              <div>
                <div className="text-[12px] font-black text-red-500">
                  입금정보를 확인해주세요
                </div>
                <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-[#151923]">
                  입금계좌 안내
                </h2>
              </div>
            </div>

            <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1.5 text-[12px] font-black text-blue-700">
              입금 확인 후 준비
            </span>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <div className="grid gap-3 text-[15px] font-bold text-slate-700">
              <div className="flex items-center justify-between gap-4">
                <span>은행명</span>
                <span className="text-right font-black text-[#151923]">{bankName}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>계좌번호</span>
                <span className="text-right text-[18px] font-black text-[#151923]">
                  {bankAccount}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>예금주</span>
                <span className="text-right font-black text-[#151923]">{bankHolder}</span>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-center text-[14px] font-black leading-relaxed tracking-[-0.04em] text-yellow-800">
              ⚠️ 반드시 <span className="text-orange-600">현재 닉네임</span>으로 입금해주세요
            </div>
          </div>

          <button
            type="button"
            onClick={copyAccount}
            className="mt-3 w-full rounded-2xl bg-[#071120] p-4 text-[15px] font-black text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)] active:scale-[0.99]"
          >
            {copyDone ? "✓ 계좌번호가 복사되었습니다" : "계좌번호 복사"}
          </button>

          <div className="mt-3 rounded-2xl bg-white/75 px-4 py-3 text-center text-[13px] font-bold leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
            입금자명 <span className="font-black text-blue-700">{depositName}</span>
            <br />
            이번 주문서 결제금액 <span className="font-black text-blue-700">{won(totalAmount)}</span>
          </div>

          <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-center text-[13px] font-black leading-relaxed tracking-[-0.04em] text-red-600 ring-1 ring-red-100">
            닉네임이나 금액이 다르면 자동입금확인이 늦어질 수 있어요.
            <br />
            입금 후 보통 10~30분 정도 걸릴 수 있습니다.
          </div>
        </section>
      ) : (
        <section className="rounded-[30px] bg-blue-50 p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[26px] text-blue-600 ring-1 ring-blue-100">
              💳
            </div>

            <h2 className="text-[24px] font-black tracking-[-0.07em] text-[#151923]">
              카드결제 안내
            </h2>
          </div>

          <div className="rounded-[24px] bg-white p-5 text-[14px] font-black leading-relaxed tracking-[-0.04em] text-blue-800 ring-1 ring-blue-100">
            카드결제는 카톡채널로 문의해주세요.
            <br />
            관리자 확인 후 결제 링크를 보내드립니다.
          </div>
        </section>
      )}

      <section className="rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[22px] text-blue-600 ring-1 ring-blue-100">
              🛍️
            </div>

            <h2 className="text-[21px] font-black tracking-[-0.06em] text-[#151923]">
              주문 상품
            </h2>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-black text-blue-700 ring-1 ring-blue-100">
            총 {totalQty || items.length}개
          </span>
        </div>

        <div className="grid gap-3">
          {items.length > 0 ? (
            items.map((item, index) => {
              const qty = toNumber(item.qty);
              const amount = toNumber(item.product_price) * qty;

              return (
                <div
                  key={`${itemTitle(item)}-${index}`}
                  className="rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-keep text-[15px] font-black leading-relaxed tracking-[-0.04em] text-[#151923]">
                        {itemTitle(item)}
                      </div>
                      <div className="mt-1 text-[13px] font-bold text-slate-500">
                        수량 {qty || 0}개
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-[15px] font-black text-blue-600">
                      {won(amount)}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[22px] bg-slate-50 px-4 py-4 text-center text-[14px] font-bold text-slate-500 ring-1 ring-slate-100">
              주문 상품 정보가 비어 있습니다.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-[24px] bg-blue-50 p-4 ring-1 ring-blue-100">
          <div className="flex items-center justify-between py-1 text-[14px] font-bold text-slate-600">
            <span>상품금액</span>
            <span>{won(productAmount)}</span>
          </div>

          <div className="flex items-center justify-between py-1 text-[14px] font-bold text-slate-600">
            <span>배송비</span>
            <span>{won(shippingFee)}</span>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-blue-100 pt-3 text-[18px] font-black text-[#151923]">
            <span>이번 주문서 결제금액</span>
            <span className="text-blue-600">{won(totalAmount)}</span>
          </div>
        </div>
      </section>
      <Link
        href="/myorder"
        className="mt-3 flex w-full items-center justify-center rounded-[24px] bg-blue-600 px-5 py-5 text-[18px] font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.30)] transition-all duration-150 active:scale-[0.98]"
      >
        확인하고 주문조회로 이동
      </Link>

    </section>
  );
}
