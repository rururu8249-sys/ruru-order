// components/order/OrderSavedCustomerSummary.tsx
// UI-only hidden component.
// No order save, payment, delivery fee, Supabase, or money logic.

type OrderSavedCustomerSummaryProps = {
  customerLabel?: string;
  nickname?: string;
  name?: string;
  phone?: string;
  address?: string;
  showDetail?: boolean;
  onToggleDetail?: () => void;
};

export default function OrderSavedCustomerSummary(_props: OrderSavedCustomerSummaryProps) {
  return null;
}
