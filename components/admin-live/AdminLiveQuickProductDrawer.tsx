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

  // 모달 본체(헤더·✕·560px)는 QuickProductFastForm이 시안③로 직접 렌더
  return (
    <QuickProductFastForm
      key={editingProduct ? String(editingProduct.id || "edit") : "new"}
      activeBroadcastId={activeBroadcastId}
      initialProduct={editingProduct}
      onClose={() => setIsOpen(false)}
    />
  );
}
