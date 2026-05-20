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
      <section className="mx-auto min-h-screen w-full max-w-[480px] px-5 pb-8 pt-5">
        <CustomerTopNav />

        <CustomerHomeHero isLoggedIn={isLoggedIn} greetingName={greetingName} />

        <CustomerHomeMenu />

        <p className="mt-6 text-center text-[12px] font-bold tracking-[-0.03em] text-slate-400">
          Copyright since 2024 LULUDONGI. All rights reserved.
        </p>
      </section>
    </main>
  );
}
