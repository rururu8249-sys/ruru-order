"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import AdminGate from "@/app/components/AdminGate";

type Order = {
  id: number;
  created_at: string;
  broadcast_name: string;
  order_group_id: string;
  youtube_nickname: string;
  product_name: string;
  color: string;
  size: string;
  qty: number;
  product_price: number;
  shipping_fee: number;
  total_price: number;
  payment_method: string;
  admin_status: string;
  order_status: string;
  member_memo: string;
};

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [broadcastList, setBroadcastList] = useState<string[]>([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState("전체");
  const [filterPayment, setFilterPayment] = useState("전체");
  const [memoOnly, setMemoOnly] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const [broadcastStatus, setBroadcastStatus] = useState("OFF");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastSubTitle, setBroadcastSubTitle] = useState("");
  const [broadcastStartedAt, setBroadcastStartedAt] = useState("");
  const [broadcastEndedAt, setBroadcastEndedAt] = useState("");
  const [broadcastDuration, setBroadcastDuration] = useState("");

  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingShippingId, setEditingShippingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const formatWon = (value: number) =>
    `${Number(value || 0).toLocaleString()}원`;

  const formatDateTime = (value: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const loadBroadcastList = async () => {
    const { data } = await supabase
      .from("orders")
      .select("broadcast_name")
      .order("created_at", { ascending: false });

    const names = Array.from(
      new Set(
        (data || [])
          .map((v) => v.broadcast_name)
          .filter((v) => v && v.trim())
      )
    );

    setBroadcastList(names);
  };

  const loadOrders = async () => {
    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (selectedBroadcast !== "전체") {
      query = query.eq("broadcast_name", selectedBroadcast);
    }

    if (filterPayment !== "전체") {
      query = query.eq("payment_method", filterPayment);
    }

    if (memberSearch.trim()) {
      query = query.ilike("youtube_nickname", `%${memberSearch}%`);
    }

    if (memoOnly) {
      query = query.neq("member_memo", "");
    }

    const { data, error } = await query;

    if (error) {
      alert(error.message);
      return;
    }

    setOrders(data || []);
  };

  const loadBroadcastSettings = async () => {
    const { data, error } = await supabase.from("settings").select("*");

    if (error) return;

    setBroadcastStatus(
      data.find((v) => v.key === "broadcast_status")?.value || "OFF"
    );
    setBroadcastTitle(
      data.find((v) => v.key === "current_broadcast_name")?.value || ""
    );
    setBroadcastSubTitle(
      data.find((v) => v.key === "current_broadcast_subtitle")?.value || ""
    );
    setBroadcastStartedAt(
      data.find((v) => v.key === "broadcast_started_at")?.value || ""
    );
    setBroadcastEndedAt(
      data.find((v) => v.key === "broadcast_ended_at")?.value || ""
    );
    setBroadcastDuration(
      data.find((v) => v.key === "broadcast_duration")?.value || ""
    );
  };

  const makeTodayBroadcastTitle = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const day = days[now.getDay()];

    return `${year}년 ${month}월 ${date}일 (${day}) 방송`;
  };

  const startBroadcast = async () => {
    const title = makeTodayBroadcastTitle();
    const startedAt = new Date().toISOString();

    await supabase.from("settings").update({ value: "ON" }).eq("key", "broadcast_status");
    await supabase.from("settings").update({ value: title }).eq("key", "current_broadcast_name");
    await supabase.from("settings").update({ value: broadcastSubTitle }).eq("key", "current_broadcast_subtitle");
    await supabase.from("settings").update({ value: startedAt }).eq("key", "broadcast_started_at");
    await supabase.from("settings").update({ value: "" }).eq("key", "broadcast_ended_at");
    await supabase.from("settings").update({ value: "" }).eq("key", "broadcast_duration");

    await loadBroadcastSettings();
    alert("방송 시작 완료");
  };

  const stopBroadcast = async () => {
    const endedAt = new Date();
    const startedDate = broadcastStartedAt ? new Date(broadcastStartedAt) : new Date();

    const diffMs = endedAt.getTime() - startedDate.getTime();
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const duration = `${hours}시간 ${minutes}분 ${seconds}초`;

    await supabase.from("settings").update({ value: "OFF" }).eq("key", "broadcast_status");
    await supabase.from("settings").update({ value: endedAt.toISOString() }).eq("key", "broadcast_ended_at");
    await supabase.from("settings").update({ value: duration }).eq("key", "broadcast_duration");

    await loadBroadcastSettings();
    alert("방송 종료 완료");
  };

  useEffect(() => {
    loadOrders();
  }, [selectedBroadcast, filterPayment, memoOnly]);

  useEffect(() => {
    loadOrders();
    loadBroadcastSettings();
    loadBroadcastList();
  }, []);

  const updateLocalOrder = (id: number, key: keyof Order, value: any) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id ? { ...order, [key]: value } : order
      )
    );
  };

  const saveOrder = async (order: Order) => {
    setSavingId(order.id);

    const productTotal = Number(order.product_price || 0) * Number(order.qty || 0);
    const shippingFee = Number(order.shipping_fee || 0);
    const baseTotal = productTotal + shippingFee;
    const vatAmount =
      order.payment_method === "카드결제" ? Math.ceil(baseTotal * 0.1) : 0;
    const finalTotal = baseTotal + vatAmount;

    const { error } = await supabase
      .from("orders")
      .update({
        product_price: Number(order.product_price),
        shipping_fee: shippingFee,
        payment_method: order.payment_method,
        admin_status: order.admin_status,
        order_status: order.order_status,
        vat_amount: vatAmount,
        total_price: finalTotal,
      })
      .eq("id", order.id);

    setSavingId(null);
    setEditingPriceId(null);
    setEditingShippingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    await loadOrders();
  };

  const saveMemberMemo = async (nickname: string, memo: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ member_memo: memo })
      .eq("youtube_nickname", nickname);

    if (error) {
      alert(error.message);
      return;
    }

    alert("회원 특이사항 저장 완료");
    await loadOrders();
  };

  const activeOrders = orders.filter(
    (order) => order.order_status !== "주문취소"
  );

  const totalSales = activeOrders.reduce(
    (sum, order) => sum + Number(order.total_price || 0),
    0
  );

  const totalQty = activeOrders.reduce(
    (sum, order) => sum + Number(order.qty || 0),
    0
  );

  const groupedByMember = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const key = order.youtube_nickname || "닉네임없음";
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {});

  return (
    <AdminGate>
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-6">관리자 주문관리</h1>

          <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-2xl font-bold">방송 관리</div>
                <div className="text-gray-400 mt-1">
                  고객용 날짜 제목 + 관리자용 부제목
                </div>
              </div>

              <div
                className={`px-4 py-2 rounded-full font-bold ${
                  broadcastStatus === "ON" ? "bg-green-600" : "bg-red-600"
                }`}
              >
                {broadcastStatus === "ON" ? "방송중" : "방송종료"}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <div>
                <div className="text-sm text-gray-400 mb-2">고객용 방송 제목</div>
                <div className="bg-black border border-zinc-700 rounded-xl p-4 font-bold">
                  {broadcastTitle || "방송 시작 전"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-400 mb-2">관리자용 부제목</div>
                <input
                  type="text"
                  placeholder="예) 아지트1 신발"
                  value={broadcastSubTitle}
                  onChange={(e) => setBroadcastSubTitle(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                />
              </div>
            </div>

            <div className="bg-black border border-zinc-700 rounded-2xl p-4 mb-4 space-y-2">
              <div><span className="text-gray-400">방송 시작시간 : </span>{formatDateTime(broadcastStartedAt)}</div>
              <div><span className="text-gray-400">방송 종료시간 : </span>{formatDateTime(broadcastEndedAt)}</div>
              <div><span className="text-gray-400">방송 진행시간 : </span>{broadcastDuration || "-"}</div>
            </div>

            <div className="flex gap-3">
              <button onClick={startBroadcast} className="bg-green-600 px-6 py-4 rounded-xl font-bold">
                방송 시작
              </button>
              <button onClick={stopBroadcast} className="bg-red-600 px-6 py-4 rounded-xl font-bold">
                방송 종료
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 p-5 rounded-2xl mb-6 grid gap-4 md:grid-cols-5">
            <select
              className="p-4 rounded-xl bg-black border border-zinc-700"
              value={selectedBroadcast}
              onChange={(e) => setSelectedBroadcast(e.target.value)}
            >
              <option value="전체">방송 전체보기</option>
              {broadcastList.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              className="p-4 rounded-xl bg-black border border-zinc-700"
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
            >
              <option>결제방식 전체</option>
              <option>무통장입금</option>
              <option>카드결제</option>
            </select>

            <label className="flex items-center gap-2 bg-black border border-zinc-700 rounded-xl p-4 font-bold">
              <input
                type="checkbox"
                checked={memoOnly}
                onChange={(e) => setMemoOnly(e.target.checked)}
              />
              특이사항 회원만
            </label>

            <input
              type="text"
              placeholder="회원검색"
              className="p-4 rounded-xl bg-black border border-zinc-700"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            <button
              onClick={loadOrders}
              className="bg-yellow-400 text-black font-bold rounded-xl p-4"
            >
              회원검색
            </button>
          </div>

          <div className="bg-zinc-900 rounded-2xl p-5 mb-6 grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-gray-400 text-sm">주문수</div>
              <div className="text-2xl font-bold">{activeOrders.length}건</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">회원수</div>
              <div className="text-2xl font-bold">{Object.keys(groupedByMember).length}명</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">총 주문수량</div>
              <div className="text-2xl font-bold">{totalQty}개</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">총 주문금액</div>
              <div className="text-2xl font-bold text-yellow-400">{formatWon(totalSales)}</div>
            </div>
          </div>

          <div className="grid gap-6">
            {Object.entries(groupedByMember).map(([nickname, memberOrders]) => {
              const memberActive = memberOrders.filter((o) => o.order_status !== "주문취소");
              const memberTotal = memberActive.reduce(
                (sum, order) => sum + Number(order.total_price || 0),
                0
              );
              const memberQty = memberActive.reduce(
                (sum, order) => sum + Number(order.qty || 0),
                0
              );
              const currentMemo = memberOrders[0]?.member_memo || "";

              return (
                <div key={nickname} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5">
                  <div className="flex flex-col md:flex-row md:justify-between gap-2 mb-5">
                    <div>
                      <div className="text-3xl font-bold">{nickname}</div>
                      <div className="text-gray-400 mt-1">
                        상품 {memberActive.length}건 · 총수량 {memberQty}개
                      </div>
                    </div>

                    <div className="text-yellow-400 text-2xl font-bold">
                      {formatWon(memberTotal)}
                    </div>
                  </div>

                  <div className="bg-black border border-zinc-700 rounded-2xl p-4 mb-5">
                    <div className="text-sm text-gray-400 mb-2">회원 특이사항</div>
                    <textarea
                      className="w-full min-h-[90px] p-3 rounded-xl bg-zinc-900 border border-zinc-700"
                      placeholder="예) 배송비 자주 문의 / 카드결제 선호 / 사이즈 민감"
                      defaultValue={currentMemo}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value !== currentMemo) {
                          saveMemberMemo(nickname, value);
                        }
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-2">
                      입력 후 다른 곳을 클릭하면 자동 저장됩니다.
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {memberOrders.map((order) => {
                      const productTotal =
                        Number(order.product_price || 0) * Number(order.qty || 0);
                      const shippingFee = Number(order.shipping_fee || 0);
                      const baseTotal = productTotal + shippingFee;
                      const vatAmount =
                        order.payment_method === "카드결제" ? Math.ceil(baseTotal * 0.1) : 0;
                      const finalTotal = baseTotal + vatAmount;
                      const isCanceled = order.order_status === "주문취소";

                      return (
                        <div
                          key={order.id}
                          className={`rounded-2xl p-5 border ${
                            isCanceled
                              ? "bg-zinc-950 border-red-900 opacity-60"
                              : "bg-zinc-900 border-zinc-800"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row gap-5 md:justify-between">
                            <div className="flex-1">
                              {isCanceled && (
                                <span className="inline-block bg-red-700 px-3 py-1 rounded-full text-sm font-bold mb-3">
                                  주문취소
                                </span>
                              )}

                              <div className="bg-black rounded-2xl border border-zinc-700 overflow-hidden">
                                {[
                                  ["방송", order.broadcast_name || "-"],
                                  ["상품명", order.product_name],
                                  ["색상", order.color],
                                  ["사이즈", order.size],
                                  ["주문수량", `${order.qty}개`],
                                ].map(([label, value]) => (
                                  <div key={label} className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                    <div className="p-3 text-gray-400 bg-zinc-950">{label}</div>
                                    <div className="p-3 font-bold">{value}</div>
                                  </div>
                                ))}

                                <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                  <div className="p-3 text-gray-400 bg-zinc-950">상품금액</div>
                                  <div className="p-3 flex items-center gap-2">
                                    {editingPriceId === order.id ? (
                                      <input
                                        type="number"
                                        className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 w-40"
                                        value={order.product_price || 0}
                                        onChange={(e) =>
                                          updateLocalOrder(order.id, "product_price", Number(e.target.value))
                                        }
                                      />
                                    ) : (
                                      <span>{formatWon(order.product_price)}</span>
                                    )}
                                    <button
                                      onClick={() =>
                                        setEditingPriceId(editingPriceId === order.id ? null : order.id)
                                      }
                                      className="bg-zinc-700 text-xs px-3 py-1 rounded-lg"
                                    >
                                      수정
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                  <div className="p-3 text-gray-400 bg-zinc-950">배송비</div>
                                  <div className="p-3 flex items-center gap-2">
                                    {editingShippingId === order.id ? (
                                      <input
                                        type="number"
                                        className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 w-40"
                                        value={order.shipping_fee || 0}
                                        onChange={(e) =>
                                          updateLocalOrder(order.id, "shipping_fee", Number(e.target.value))
                                        }
                                      />
                                    ) : (
                                      <span>{formatWon(order.shipping_fee)}</span>
                                    )}
                                    <button
                                      onClick={() =>
                                        setEditingShippingId(editingShippingId === order.id ? null : order.id)
                                      }
                                      className="bg-zinc-700 text-xs px-3 py-1 rounded-lg"
                                    >
                                      수정
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                  <div className="p-3 text-gray-400 bg-zinc-950">결제방식</div>
                                  <div className="p-3">{order.payment_method}</div>
                                </div>

                                <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                  <div className="p-3 text-gray-400 bg-zinc-950">관리자확인</div>
                                  <div className={`p-3 font-bold ${
                                    order.admin_status === "관리자 확인 완료"
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}>
                                    {order.admin_status || "관리자 확인 전"}
                                  </div>
                                </div>

                                <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                  <div className="p-3 text-gray-400 bg-zinc-950">주문상태</div>
                                  <div className={`p-3 font-bold ${
                                    isCanceled ? "text-red-400" : "text-green-400"
                                  }`}>
                                    {isCanceled ? "주문취소" : "주문진행"}
                                  </div>
                                </div>

                                {order.payment_method === "카드결제" && (
                                  <div className="grid grid-cols-[110px_1fr] border-b border-zinc-800">
                                    <div className="p-3 text-gray-400 bg-zinc-950">카드부가세</div>
                                    <div className="p-3 text-yellow-400">{formatWon(vatAmount)}</div>
                                  </div>
                                )}

                                <div className="grid grid-cols-[110px_1fr]">
                                  <div className="p-3 text-gray-400 bg-zinc-950">최종금액</div>
                                  <div className="p-3 text-yellow-400 text-xl font-bold">
                                    {formatWon(finalTotal)}
                                  </div>
                                </div>
                              </div>

                              <div className="text-sm text-gray-500 mt-3">
                                주문시간 : {new Date(order.created_at).toLocaleString("ko-KR")}
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 min-w-[230px]">
                              <select
                                className="p-4 rounded-xl bg-black border border-zinc-700 font-bold"
                                value={order.payment_method || "무통장입금"}
                                onChange={(e) =>
                                  updateLocalOrder(order.id, "payment_method", e.target.value)
                                }
                              >
                                <option value="무통장입금">무통장입금</option>
                                <option value="카드결제">카드결제</option>
                              </select>

                              <select
                                className="p-4 rounded-xl bg-black border border-zinc-700 font-bold"
                                value={order.admin_status || "관리자 확인 전"}
                                onChange={(e) =>
                                  updateLocalOrder(order.id, "admin_status", e.target.value)
                                }
                              >
                                <option value="관리자 확인 전">관리자 확인 전</option>
                                <option value="관리자 확인 완료">관리자 확인 완료</option>
                              </select>

                              <select
                                className={`p-4 rounded-xl bg-black border font-bold ${
                                  isCanceled
                                    ? "border-red-600 text-red-400"
                                    : "border-green-600 text-green-400"
                                }`}
                                value={isCanceled ? "주문취소" : "주문진행"}
                                onChange={(e) =>
                                  updateLocalOrder(
                                    order.id,
                                    "order_status",
                                    e.target.value === "주문취소"
                                      ? "주문취소"
                                      : "주문완료신청"
                                  )
                                }
                              >
                                <option value="주문진행">주문진행</option>
                                <option value="주문취소">주문취소</option>
                              </select>

                              <button
                                onClick={() => saveOrder(order)}
                                className="bg-yellow-400 text-black font-bold p-4 rounded-xl"
                              >
                                {savingId === order.id ? "저장중..." : "수정내용 저장"}
                              </button>

                              <div className="text-xs text-gray-400 leading-5">
                                금액·배송비·상태 변경 후<br />
                                노란색 저장 버튼을 눌러야 반영됩니다.
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {orders.length === 0 && (
              <div className="bg-zinc-900 rounded-2xl p-8 text-center text-gray-400">
                조회된 주문이 없습니다.
              </div>
            )}
          </div>
        </div>
      </main>
    </AdminGate>
  );
}