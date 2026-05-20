// components/home/CustomerHomePage.tsx
// 목적: 고객 첫 HOME 화면
// 주의:
// - UI/문구/배치만 정리
// - 주문 저장, 금액, 카드수수료, 배송비, 입금, 정산, 송장 로직 없음

"use client";

import { useEffect, useState } from "react";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import CustomerHomeHero from "@/components/home/CustomerHomeHero";
import CustomerHomeMenu from "@/components/home/CustomerHomeMenu";
import {
  getCustomerGreetingName,
  hasSavedCustomerInfo,
  readSavedCustomerInfo,
  type SavedCustomerInfo,
} from "@/lib/customer/customerSession";

const initialInfo: SavedCustomerInfo = {
  youtubeNickname: "",
  customerName: "",
  customerPhone: "",
  zipcode: "",
  address: "",
  detailAddress: "",
};

export default function CustomerHomePage() {
  const [customerInfo, setCustomerInfo] = useState<SavedCustomerInfo>(initialInfo);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setCustomerInfo(readSavedCustomerInfo());
    setIsReady(true);
  }, []);

  const isLoggedIn = isReady && hasSavedCustomerInfo(customerInfo);
  const greetingName = getCustomerGreetingName(customerInfo);

  return (
    <main className="min-h-screen bg-[#f5f8ff] text-[#151923]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] px-5 pb-8 pt-5">
        <CustomerTopNav />

        <CustomerHomeHero isLoggedIn={isLoggedIn} greetingName={greetingName} />

        <CustomerHomeMenu />

        <section className="mt-5 rounded-[28px] bg-white px-5 py-5 shadow-[0_10px_22px_rgba(30,64,175,0.06)] ring-1 ring-blue-100">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[26px] ring-1 ring-blue-100">
              🚚
            </div>

            <div>
              <p className="text-[18px] font-black tracking-[-0.06em] text-[#151923]">
                배송 안내
              </p>
              <p className="mt-1 break-keep text-[13px] font-semibold leading-relaxed tracking-[-0.04em] text-slate-500">
                택배 송장은 출고 당일 밴드에서 확인 가능하며, 택배사 문자도 함께 발송됩니다.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-[12px] font-bold tracking-[-0.03em] text-slate-400">
          Copyright since 2024 LULUDONGI. All rights reserved.
        </p>
      </section>
    </main>
  );
}
