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
  const [editingDetailName, setEditingDetailName] = useState("");

  useEffect(() => {
    const openDrawer = () => {
      setEditingProduct(null);
      setEditingDetailName("");
      setIsOpen(true);
    };

    const closeDrawer = () => {
      setIsOpen(false);
    };

    const editDrawer = (event: Event) => {
      const customEvent = event as CustomEvent<ProductRow>;
      setEditingProduct(customEvent.detail || null);
      setEditingDetailName("");
      setIsOpen(true);
    };

    const editDetailDrawer = (event: Event) => {
      const { product, detailName } = (event as CustomEvent<{ product: ProductRow; detailName: string }>).detail;
      if (!product || !detailName) return;
      setEditingProduct(product);
      setEditingDetailName(detailName);
      setIsOpen(true);
    };

    window.addEventListener("ruru-open-quick-product-panel", openDrawer);
    window.addEventListener("ruru-close-quick-product-panel", closeDrawer);
    window.addEventListener("ruru-edit-quick-product", editDrawer);
    window.addEventListener("ruru-edit-quick-product-detail", editDetailDrawer);

    return () => {
      window.removeEventListener("ruru-open-quick-product-panel", openDrawer);
      window.removeEventListener("ruru-close-quick-product-panel", closeDrawer);
      window.removeEventListener("ruru-edit-quick-product", editDrawer);
      window.removeEventListener("ruru-edit-quick-product-detail", editDetailDrawer);
    };
  }, []);

  if (!isOpen) return null;

  // 모달 본체(헤더·✕·560px)는 QuickProductFastForm이 시안③로 직접 렌더
  return (
    <QuickProductFastForm
      key={editingProduct ? JSON.stringify([editingProduct.id || "edit", editingDetailName]) : "new"}
      activeBroadcastId={activeBroadcastId}
      initialProduct={editingProduct}
      initialDetailName={editingDetailName}
      onClose={() => {
        setIsOpen(false);
        // 등록/수정 폼 닫힘(저장완료·취소 공통) → 상품관리 팝업 자동 복귀
        window.dispatchEvent(new CustomEvent("ruru-reopen-product-manage"));
      }}
    />
  );
}
