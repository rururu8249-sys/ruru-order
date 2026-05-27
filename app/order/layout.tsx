import type { ReactNode } from "react";
import ProductNameSuggestionLayer from "@/components/order/ProductNameSuggestionLayer";

export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ProductNameSuggestionLayer />
    </>
  );
}
