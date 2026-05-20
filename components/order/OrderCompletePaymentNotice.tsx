"use client";

// components/order/OrderCompletePaymentNotice.tsx
// 목적: 주문완료 후 입금계좌 최상단 안내 UI
// 주의: UI 전용. 주문 저장, 주문번호 생성, 금액 계산, 입금매칭, Supabase 로직 없음.

import Link from "next/link";
import { useState } from "react";

type OrderCompletePaymentNoticeProps = {
  nickname: string;
  name: string;
  paymentMethod: "무통장입금" | "카드결제";
  totalAmount: number;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

export default function OrderCompletePaymentNotice({
  nickname,
  name,
  paymentMethod,
  totalAmount,
  bankName,
  bankAccount,
  bankHolder,
}: OrderCompletePaymentNoticeProps) {
  const [copyDone, setCopyDone] = useState(false);
  const depositName = String(nickname || name || "").trim() || "현재 닉네임";

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
            입금자명은 <span className="font-black text-blue-700">{depositName}</span>
            <br />
            이번 주문서 결제금액은 <span className="font-black text-blue-700">{won(totalAmount)}</span>
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
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[22px] text-blue-600 ring-1 ring-blue-100">
            ▣
          </div>

          <h2 className="text-[21px] font-black tracking-[-0.06em] text-[#151923]">
            주문 정보 요약
          </h2>
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">입금자명</span>
            <span className="text-right text-[16px] font-black text-blue-600">
              {depositName}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">
              이번 주문서 결제금액
            </span>
            <span className="text-right text-[18px] font-black text-[#151923]">
              {won(totalAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[15px] font-bold text-slate-600">결제방식</span>
            <span className="text-right text-[16px] font-black text-blue-600">
              {paymentMethod}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/myorder"
          className="rounded-2xl border border-blue-500 bg-white px-2 py-4 text-center text-[14px] font-black text-blue-600 shadow-sm active:scale-[0.99]"
        >
          주문조회
        </Link>

        <a
          href="https://pf.kakao.com/_RMxaqX"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-white px-2 py-4 text-center text-[14px] font-black text-[#151923] shadow-sm ring-1 ring-slate-100 active:scale-[0.99]"
        >
          카톡문의
        </a>

        <Link
          href="/"
          className="rounded-2xl bg-blue-600 px-2 py-4 text-center text-[14px] font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] active:scale-[0.99]"
        >
          HOME
        </Link>
      </div>
    </section>
  );
}
