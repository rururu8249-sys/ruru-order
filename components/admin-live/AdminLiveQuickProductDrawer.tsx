"use client";

import { useEffect, useState } from "react";
import QuickProductFastForm from "./quick-product/QuickProductFastForm";

type ProductRow = Record<string, unknown>;

type AdminLiveQuickProductDrawerProps = {
  activeBroadcastId: string | number | null;
};

export default function AdminLiveQuickProductDrawer({
  activeBroadcastId,
}: AdminLiveQuickProductDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);

  useEffect(() => {
    const openDrawer = () => {
      setEditingProduct(null);
      setIsOpen(true);
    };

    const closeDrawer = () => {
      setIsOpen(false);
    };

    const editDrawer = (event: Event) => {
      const customEvent = event as CustomEvent<ProductRow>;
      setEditingProduct(customEvent.detail || null);
      setIsOpen(true);
    };

    window.addEventListener("ruru-open-quick-product-panel", openDrawer);
    window.addEventListener("ruru-close-quick-product-panel", closeDrawer);
    window.addEventListener("ruru-edit-quick-product", editDrawer);

    return () => {
      window.removeEventListener("ruru-open-quick-product-panel", openDrawer);
      window.removeEventListener("ruru-close-quick-product-panel", closeDrawer);
      window.removeEventListener("ruru-edit-quick-product", editDrawer);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/35" />

      <aside className="absolute right-0 top-0 flex h-full min-h-0 w-full max-w-[960px] flex-col overflow-hidden bg-slate-50 shadow-2xl">
        <div className="flex h-[64px] shrink-0 items-center border-b border-slate-200 bg-white px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">
              {editingProduct ? "상품수정" : "빠른상품등록"}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              방송 중 상품 등록·수정을 한 화면에서 빠르게 처리합니다.
            </p>
          </div>
        </div>

        <QuickProductFastForm
          key={editingProduct ? String(editingProduct.id || "edit") : "new"}
          activeBroadcastId={activeBroadcastId}
          initialProduct={editingProduct}
          onClose={() => setIsOpen(false)}
        />
      </aside>
    </div>
  );
}
