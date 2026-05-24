"use client";

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
