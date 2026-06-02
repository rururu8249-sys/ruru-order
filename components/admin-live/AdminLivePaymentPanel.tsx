"use client";

import { useEffect, useRef } from "react";

import PaymentMatchPanel from "@/components/admin-v2/payment/PaymentMatchPanel";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";

type BankdaSyncResult = {
  fetchedCount?: number;
  insertedCount?: number;
  skippedCount?: number;
  rawCount?: number;
  bankdaDescription?: string;
};

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onRefresh?: () => Promise<void> | void;
  onBankdaSync?: () => Promise<BankdaSyncResult | void> | void;
  onOpenManualMatch: (orderGroup: OrderGroup) => void;
};

export default function AdminLivePaymentPanel({
  deposits,
  orderGroups,
  onRefresh,
  onBankdaSync,
  onOpenManualMatch,
}: Props) {
  const syncBankdaAndRefresh = async () => {
    if (onBankdaSync) {
      await onBankdaSync();
    }

    if (onRefresh) {
      await onRefresh();
    }
  };

  const autoBankdaSyncInFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const runPaymentPanelBankdaSync = async () => {
      if (!alive) return;
      if (autoBankdaSyncInFlightRef.current) return;

      autoBankdaSyncInFlightRef.current = true;

      try {
        // 입금관리 패널 실제 Bankda 자동동기화
        // 수동 [입금내역 새로고침]과 같은 부모 동기화 함수를 사용합니다.
        await syncBankdaAndRefresh();
      } catch (error) {
        console.warn("[admin-live] 입금관리 자동 Bankda 동기화 실패", error);
      } finally {
        autoBankdaSyncInFlightRef.current = false;
      }
    };

    void runPaymentPanelBankdaSync();

    const timer = window.setInterval(() => {
      void runPaymentPanelBankdaSync();
    }, 60_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // 입금관리 패널이 열려 있는 동안만 동작합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <PaymentMatchPanel
      deposits={deposits}
      orderGroups={orderGroups}
      onOpenManualMatch={onOpenManualMatch}
      onSyncBankdaDeposits={syncBankdaAndRefresh}
      variant="admin-live"
    />
  );
}
