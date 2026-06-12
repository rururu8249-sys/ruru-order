"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 정보수정 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useEffect, useRef, useState, type CSSProperties } from "react";

type CustomerInfoEditBottomSheetProps = {
  open: boolean;

  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  address: string;
  detailAddress: string;

  youtubeNicknameError?: string;

  onYoutubeNicknameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;

  onOpenAddressSearch: () => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;

  shippingAddresses?: any[];
  onSaveShippingAddresses?: (addresses: any[]) => Promise<void>;
  onSelectShippingAddress?: (address: string, detailAddress: string, name?: string, phone?: string) => void;
  onOpenAddressSearchForForm?: (onPicked: (addr: string, zipcode: string) => void) => void;

  saving?: boolean;
};

const inputStyle: CSSProperties = {
  height: "48px",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "12px",
  border: "1px solid #D9C5CC",
  background: "#fff",
  padding: "0 14px",
  fontSize: "15px",
  fontWeight: 800,
  color: "#222",
  outline: "none",
};

const textareaStyle: CSSProperties = {
  minHeight: "48px",
  maxHeight: "96px",
  width: "100%",
  boxSizing: "border-box",
  resize: "none",
  overflow: "hidden",
  borderRadius: "12px",
  border: "1px solid #D9C5CC",
  background: "#fff",
  padding: "12px 14px",
  fontSize: "15px",
  fontWeight: 800,
  lineHeight: 1.45,
  color: "#222",
  outline: "none",
};

const labelStyle: CSSProperties = { marginBottom: "6px", display: "block", fontSize: "12px", fontWeight: 800, color: "#888" };
const fieldBoxStyle: CSSProperties = { borderRadius: "16px", background: "#fff", padding: "12px", border: "1px solid #E8E2DD" };

const formatKoreanPhone = (raw: string) => {
  const d = (raw || "").replace(/[^0-9]/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
};

const resizeTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
};

export default function CustomerInfoEditBottomSheet({
  open,
  youtubeNickname,
  customerName,
  customerPhone,
  address,
  detailAddress,
  youtubeNicknameError,
  onYoutubeNicknameChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onDetailAddressChange,
  onOpenAddressSearch,
  onClose,
  onSave,
  shippingAddresses = [],
  onSaveShippingAddresses,
  onSelectShippingAddress,
  onOpenAddressSearchForForm,
  saving = false,
}: CustomerInfoEditBottomSheetProps) {
  const addressTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [editingAddrIndex, setEditingAddrIndex] = useState<number | null>(null);
  const [addrForm, setAddrForm] = useState({ name: "", phone: "", address: "", detailAddress: "" });
  const [addrFormOpen, setAddrFormOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    resizeTextareaHeight(addressTextareaRef.current);
  }, [open, address]);

  if (!open) return null;

  return (
    <>
    {addrFormOpen ? (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }} role="dialog" aria-modal="true" aria-label="배송지">
        <section style={{ width: "100%", maxWidth: "430px", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
          <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />
          <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #F0EBE6" }}>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#7A1E47" }}>{editingAddrIndex !== null ? "배송지 수정" : "배송지 추가"}</div>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <input value={addrForm.name} onChange={(e) => setAddrForm((f) => ({ ...f, name: e.target.value }))} placeholder="이름" style={{ ...inputStyle, height: "44px", fontSize: "14px" }} />
            <input value={addrForm.phone} onChange={(e) => setAddrForm((f) => ({ ...f, phone: formatKoreanPhone(e.target.value) }))} placeholder="전화번호" inputMode="numeric" style={{ ...inputStyle, height: "44px", fontSize: "14px" }} />
            <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
              <input value={addrForm.address} onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))} placeholder="주소" style={{ ...inputStyle, flex: 1, height: "44px", fontSize: "14px" }} />
              <button type="button" onClick={() => onOpenAddressSearchForForm?.((addr) => setAddrForm((f) => ({ ...f, address: addr })))} style={{ padding: "0 14px", height: "44px", background: "#7A1E47", color: "white", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>주소검색</button>
            </div>
            <input value={addrForm.detailAddress} onChange={(e) => setAddrForm((f) => ({ ...f, detailAddress: e.target.value }))} placeholder="상세주소" style={{ ...inputStyle, height: "44px", fontSize: "14px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
            <button type="button" onClick={() => { setAddrFormOpen(false); setEditingAddrIndex(null); }} style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "15px", fontWeight: 800, color: "#666", cursor: "pointer" }}>취소</button>
            <button type="button" onClick={() => { if (editingAddrIndex !== null) onSaveShippingAddresses?.(shippingAddresses.map((a, i) => (i === editingAddrIndex ? { ...addrForm } : a))); else onSaveShippingAddresses?.([...shippingAddresses, { ...addrForm, isDefault: shippingAddresses.length === 0 }]); setAddrFormOpen(false); setEditingAddrIndex(null); }} style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7A1E47", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}>저장</button>
          </div>
        </section>
      </div>
    ) : null}
    <div
      data-ruru-customer-info-edit-sheet="shell-v2"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}
      role="dialog"
      aria-modal="true"
      aria-label="정보수정"
    >
      <section style={{ width: "100%", maxWidth: "430px", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
        <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />

        <div style={{ display: "flex", maxHeight: "88dvh", flexDirection: "column" }}>
          <header style={{ flexShrink: 0, padding: "20px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", whiteSpace: "nowrap" }}>
              <h2 style={{ fontSize: "26px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.08em", color: "#7A1E47" }}>정보수정</h2>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#999" }}>배송정보 확인</span>
            </div>
            <p style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, color: "#999" }}>
              주문 전 닉네임, 연락처, 주소가 맞는지 확인해주세요.
            </p>
          </header>

          <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={fieldBoxStyle}>
                <label style={labelStyle} htmlFor="customerInfoEditNickname">유튜브 닉네임</label>
                <input
                  id="customerInfoEditNickname"
                  value={youtubeNickname}
                  onChange={(event) => onYoutubeNicknameChange(event.target.value)}
                  style={inputStyle}
                  placeholder="채팅창에 보이는 닉네임"
                  autoComplete="nickname"
                />
                {youtubeNicknameError ? (
                  <p style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#C0392B" }}>{youtubeNicknameError}</p>
                ) : (
                  <p style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#999" }}>현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.</p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: "8px" }}>
                <div style={fieldBoxStyle}>
                  <label style={labelStyle} htmlFor="customerInfoEditName">이름</label>
                  <input
                    id="customerInfoEditName"
                    value={customerName}
                    onChange={(event) => onCustomerNameChange(event.target.value)}
                    style={inputStyle}
                    placeholder="이름"
                    autoComplete="name"
                  />
                </div>

                <div style={fieldBoxStyle}>
                  <label style={labelStyle} htmlFor="customerInfoEditPhone">전화번호</label>
                  <input
                    id="customerInfoEditPhone"
                    value={customerPhone}
                    onChange={(event) => onCustomerPhoneChange(event.target.value)}
                    style={{ ...inputStyle, padding: "0 12px", fontSize: "14px" }}
                    placeholder="01012345678"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div style={fieldBoxStyle}>
                <div style={{ marginBottom: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#888" }} htmlFor="customerInfoEditAddress">주소</label>
                  <button
                    type="button"
                    onClick={onOpenAddressSearch}
                    style={{ borderRadius: "999px", border: "none", background: "#7A1E47", padding: "6px 14px", fontSize: "11px", fontWeight: 800, color: "#fff", cursor: "pointer" }}
                  >
                    주소검색
                  </button>
                </div>

                <textarea
                  id="customerInfoEditAddress"
                  ref={addressTextareaRef}
                  rows={1}
                  value={address}
                  onChange={(event) => {
                    onAddressChange(event.target.value);
                    resizeTextareaHeight(event.currentTarget);
                  }}
                  onInput={(event) => resizeTextareaHeight(event.currentTarget)}
                  style={textareaStyle}
                  placeholder="주소검색을 눌러 주소를 입력해주세요"
                  autoComplete="street-address"
                />

                <input
                  value={detailAddress}
                  onChange={(event) => onDetailAddressChange(event.target.value)}
                  style={{ ...inputStyle, marginTop: "8px" }}
                  placeholder="상세주소를 입력해주세요"
                  autoComplete="address-line2"
                />
              </div>

              {onSaveShippingAddresses ? (
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 800, color: "#888", marginBottom: "2px" }}>배송지 관리</div>

                  {shippingAddresses.map((a, index) => (
                    <div key={index} style={{ background: "#fff", border: "1px solid #E5E1DC", borderRadius: "10px", padding: "12px 14px", marginTop: "8px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A", display: "flex", alignItems: "center", gap: "6px" }}>
                        {a.name || "-"} · {a.phone || "-"}
                        {a.isDefault ? <span style={{ fontSize: "10px", fontWeight: 800, color: "#7A1E47", background: "#F9EEF3", borderRadius: "5px", padding: "2px 6px" }}>기본</span> : null}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B6460", marginTop: "3px" }}>{[a.address, a.detailAddress].filter(Boolean).join(" ") || "-"}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => { onSelectShippingAddress?.(a.address || "", a.detailAddress || "", a.name || "", a.phone || ""); }} style={{ border: "1px solid #7A1E47", color: "#7A1E47", background: "#F9EEF3", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>이 주소로 배송</button>
                        <button type="button" onClick={() => { setEditingAddrIndex(index); setAddrForm({ name: a.name || "", phone: a.phone || "", address: a.address || "", detailAddress: a.detailAddress || "" }); setAddrFormOpen(true); }} style={{ border: "1px solid #7A1E47", color: "#7A1E47", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>수정</button>
                        <button type="button" onClick={() => { const next = shippingAddresses.filter((_, i) => i !== index); if (a.isDefault && next.length > 0) next[0] = { ...next[0], isDefault: true }; onSaveShippingAddresses(next); }} style={{ border: "1px solid #FFCCCC", color: "#C0392B", background: "#FFF5F5", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>삭제</button>
                        {!a.isDefault ? (
                          <button type="button" onClick={() => onSaveShippingAddresses(shippingAddresses.map((x, i) => ({ ...x, isDefault: i === index })))} style={{ border: "1px solid #0F6E56", color: "#0F6E56", background: "#E7F3EE", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>기본으로 설정</button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={() => { setAddrFormOpen(true); setEditingAddrIndex(null); setAddrForm({ name: "", phone: "", address: "", detailAddress: "" }); }} style={{ width: "100%", padding: "11px", border: "1px dashed #E5E1DC", borderRadius: "10px", background: "#fff", fontSize: "13px", color: "#ABA5A0", marginTop: "8px", cursor: "pointer" }}>+ 배송지 추가</button>
                </div>
              ) : null}
            </div>
          </div>

          <footer style={{ display: "grid", flexShrink: 0, gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#666", cursor: saving ? "default" : "pointer", opacity: saving ? 0.45 : 1 }}
            >
              취소
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: saving ? "#cbd5e1" : "#7A1E47", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#fff", cursor: saving ? "default" : "pointer" }}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </footer>
        </div>
      </section>
    </div>
    </>
  );
}
