import type { OrderRow } from "@/lib/admin-v2/types";

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function getRosenRecipientNickname(row: Pick<OrderRow, "youtube_nickname" | "customer_name">) {
  // 로젠 송장 수하인명은 고객 이름이 아니라 유튜브 닉네임을 사용합니다.
  // 닉네임이 비어 있는 예외 데이터만 안전하게 고객명으로 대체합니다.
  return cleanText(row.youtube_nickname || row.customer_name || "");
}

export function getRosenBaseAddress(row: Pick<OrderRow, "address" | "detail_address">) {
  return [row.address, row.detail_address].map(cleanText).filter(Boolean).join(" ").trim();
}

export function buildRosenRecipientAddress(
  row: Pick<OrderRow, "address" | "detail_address" | "youtube_nickname" | "customer_name">
) {
  const baseAddress = getRosenBaseAddress(row);
  const nickname = getRosenRecipientNickname(row);

  if (!nickname) return baseAddress;
  if (!baseAddress) return `/${nickname}`;

  return `${baseAddress} /${nickname}`;
}

export function buildRosenItemTextFromOrderRow(
  row: Pick<OrderRow, "product_name" | "color" | "size" | "qty">
) {
  const productName = cleanText(row.product_name) || "상품명없음";
  const optionText = [row.color, row.size].map(cleanText).filter(Boolean).join(" / ");
  const qty = Math.max(1, Number(row.qty || 0));

  return optionText ? `${productName}(${optionText}) x${qty}개` : `${productName} x${qty}개`;
}
