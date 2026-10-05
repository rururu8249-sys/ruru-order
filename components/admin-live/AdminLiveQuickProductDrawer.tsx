"use client";

import { useEffect, useState, useRef } from "react";
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
  const editRequest=useRef(0);

  useEffect(() => {
    const openDrawer = () => {
      editRequest.current++;
      setEditingProduct(null);
      setEditingDetailName("");
      setIsOpen(true);
    };

    const closeDrawer = () => {
      editRequest.current++;
      setIsOpen(false);
    };

    const openEdit = async (product: ProductRow | null, detailName: string) => {
      if (!product?.id) {
        editRequest.current++;
        setEditingProduct(product);
        setEditingDetailName(detailName);
        setIsOpen(true);
        return;
      }
      const request=++editRequest.current;
      try {
        const response=await fetch(`/api/admin-live/catalog-write?productId=${encodeURIComponent(String(product.id))}`,{cache:'no-store'});
        const snapshot=await response.json();
        if(request!==editRequest.current) return;
        if(!response.ok || !snapshot?.product || !/^[a-f0-9]{32}$/.test(snapshot.version)) throw new Error(snapshot?.error || '최신 상품을 불러오지 못했습니다.');
        setEditingProduct({...snapshot.product,__catalog_edit_version:snapshot.version,...(snapshot.parent?{__linked_brand_parent:snapshot.parent}:{})});
        setEditingDetailName(detailName);
        setIsOpen(true);
      } catch(error) {
        if(request===editRequest.current) window.alert(error instanceof Error?error.message:'최신 상품을 불러오지 못했습니다. 다시 열어주세요.');
      }
    };
    const editDrawer = (event: Event) => {
      const customEvent = event as CustomEvent<ProductRow>;
      void openEdit(customEvent.detail || null, '');
    };

    const editDetailDrawer = (event: Event) => {
      const { product, detailName } = (event as CustomEvent<{ product: ProductRow; detailName: string }>).detail;
      if (!product || !detailName) return;
      void openEdit(product, detailName);
    };

    window.addEventListener("ruru-open-quick-product-panel", openDrawer);
    window.addEventListener("ruru-close-quick-product-panel", closeDrawer);
    window.addEventListener("ruru-edit-quick-product", editDrawer);
    window.addEventListener("ruru-edit-quick-product-detail", editDetailDrawer);

    return () => {
      editRequest.current++;
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
