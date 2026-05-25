function clean(value: unknown) {
  return String(value ?? "").trim();
}

function collectOrderGroupStatusTexts(group: any) {
  const rows = Array.isArray(group?.rows)
    ? group.rows
    : Array.isArray(group?.orders)
      ? group.orders
      : Array.isArray(group?.items)
        ? group.items
        : [];

  return [
    group?.status,
    group?.statusText,
    group?.orderStatus,
    group?.order_status,
    group?.adminOrderStatus,
    group?.admin_order_status_v2,
    group?.orderManageStatus,
    group?.order_manage_status,
    group?.paymentStatus,
    group?.payment_status,
    ...rows.flatMap((row: any) => [
      row?.status,
      row?.statusText,
      row?.orderStatus,
      row?.order_status,
      row?.adminOrderStatus,
      row?.admin_order_status_v2,
      row?.orderManageStatus,
      row?.order_manage_status,
      row?.paymentStatus,
      row?.payment_status,
    ]),
  ]
    .map(clean)
    .filter(Boolean);
}

export function canSoftHideOrderGroup(group: any) {
  return collectOrderGroupStatusTexts(group).some((value) =>
    /주문취소|주문서취소|canceled/i.test(value)
  );
}
