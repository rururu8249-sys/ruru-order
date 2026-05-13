"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isEditingNickname, setIsEditingNickname] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("무통장입금");
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedPaymentMethod, setCompletedPaymentMethod] =
    useState("무통장입금");

  const [broadcastStatus, setBroadcastStatus] = useState("OFF");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [isLoadingBroadcast, setIsLoadingBroadcast] = useState(true);

  const [items, setItems] = useState([
    {
      category: "",
      product: "",
      color: "",
      size: "",
      qty: "",
      price: "",
    },
  ]);

  const shipping = 4000;
  const bankAccount = "9002186993725";

  useEffect(() => {
    const savedNickname = localStorage.getItem("ruru_youtube_nickname");
    const savedName = localStorage.getItem("ruru_customer_name");
    const savedPhone = localStorage.getItem("ruru_customer_phone");

    if (savedNickname) {
      setNickname(savedNickname);
      setIsEditingNickname(false);
    }

    if (savedName) {
      setCustomerName(savedName);
    }

    if (savedPhone) {
      setCustomerPhone(savedPhone);
    }

    loadBroadcastSettings();
  }, []);

  const loadBroadcastSettings = async () => {
    const { data, error } = await supabase.from("settings").select("*");

    if (error) {
      console.error(error);
      setIsLoadingBroadcast(false);
      return;
    }

    const status =
      data.find((v) => v.key === "broadcast_status")?.value || "OFF";

    const title =
      data.find((v) => v.key === "current_broadcast_name")?.value || "";

    setBroadcastStatus(status);
    setBroadcastTitle(title);
    setIsLoadingBroadcast(false);
  };

  const formatWon = (value: number) => {
    return value.toLocaleString() + "원";
  };

  const onlyNumber = (value: string) => {
    return value.replace(/[^0-9]/g, "");
  };

  const formatPhone = (value: string) => {
    const numbers = onlyNumber(value);

    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    }

    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(
      7,
      11
    )}`;
  };

  const saveNickname = () => {
    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    localStorage.setItem("ruru_youtube_nickname", nickname.trim());
    setIsEditingNickname(false);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        category: "",
        product: "",
        color: "",
        size: "",
        qty: "",
        price: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("상품은 최소 1개 이상 작성해야 합니다.");
      return;
    }

    const copy = [...items];
    copy.splice(index, 1);
    setItems(copy);
  };

  const productTotal = items.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.qty || 0);
  }, 0);

  const cashTotal = productTotal + shipping;
  const vatAmount =
    paymentMethod === "카드결제" ? Math.ceil(cashTotal * 0.1) : 0;
  const total = cashTotal + vatAmount;

  const copyAccount = async () => {
    await navigator.clipboard.writeText(bankAccount);
    alert("계좌번호가 복사되었습니다.");
  };

  const handleSubmit = async () => {
    if (broadcastStatus !== "ON") {
      alert("현재 주문 접수 시간이 아닙니다.\n방송 시작 후 주문해주세요.");
      return;
    }

    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    if (!customerName.trim()) {
      alert("주문자 이름을 입력해주세요.");
      return;
    }

    const cleanPhone = onlyNumber(customerPhone);

    if (cleanPhone.length < 10) {
      alert("연락처를 정확히 입력해주세요.\n예) 01012345678");
      return;
    }

    const hasEmptyItem = items.some(
      (item) =>
        !item.category ||
        !item.product.trim() ||
        !item.color.trim() ||
        !item.size.trim() ||
        !item.qty ||
        !item.price
    );

    if (hasEmptyItem) {
      alert(
        "카테고리 · 상품명 · 색상 · 사이즈 · 수량 · 금액을 모두 입력해주세요.\n\n색상/사이즈가 없으면 '없음' 이라고 작성해주세요."
      );
      return;
    }

    localStorage.setItem("ruru_customer_name", customerName.trim());
    localStorage.setItem("ruru_customer_phone", cleanPhone);

    setIsSubmitting(true);

    const orderGroupId = crypto.randomUUID();

    const orderRows = items.map((item) => ({
      order_group_id: orderGroupId,
      broadcast_name: broadcastTitle || "방송명 미지정",
      youtube_nickname: nickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: cleanPhone,
      category: item.category,
      product_name: item.product,
      color: item.color,
      size: item.size,
      qty: Number(item.qty),
      product_price: Number(item.price),
      shipping_fee: shipping,
      total_price: total,
      shipping_status: "기본배송",
      admin_status: "관리자 확인 전",
      order_status: "주문완료신청",
      payment_method: paymentMethod,
      vat_amount: vatAmount,
    }));

    const { error } = await supabase.from("orders").insert(orderRows);

    setIsSubmitting(false);

    if (error) {
      alert("주문 저장 실패\n\n" + error.message);
      return;
    }

    setCompletedTotal(total);
    setCompletedPaymentMethod(paymentMethod);
    setIsCompleted(true);

    setItems([
      {
        category: "",
        product: "",
        color: "",
        size: "",
        qty: "",
        price: "",
      },
    ]);
  };

  if (isLoadingBroadcast) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-2xl font-bold mb-3">루루동이 주문서</div>
          <div className="text-gray-400">주문서 상태 확인중...</div>
        </div>
      </main>
    );
  }

  if (broadcastStatus !== "ON") {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-2xl mx-auto flex min-h-screen items-center">
          <div className="w-full bg-zinc-900 rounded-3xl p-6 border border-zinc-800 text-center">
            <div className="text-4xl font-bold mb-4">루루동이 주문서</div>

            <div className="bg-red-700 text-white rounded-2xl p-5 text-2xl font-bold mb-5">
              현재 주문 접수 시간이 아닙니다
            </div>

            <p className="text-gray-300 leading-7 mb-6">
              방송 시작 후 주문서 작성이 가능합니다.
              <br />
              방송 중 안내에 따라 다시 접속해주세요.
            </p>

            <button
              onClick={loadBroadcastSettings}
              className="w-full bg-yellow-400 text-black font-bold p-4 rounded-2xl"
            >
              주문서 다시 확인하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (isCompleted) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-zinc-900 rounded-3xl p-6 border border-yellow-400 mt-10">
            <h1 className="text-3xl font-bold text-yellow-400 mb-4">
              주문완료신청 완료
            </h1>

            <p className="text-lg mb-6">주문서가 정상 접수되었습니다.</p>

            {completedPaymentMethod === "무통장입금" ? (
              <div className="bg-black rounded-2xl p-5 mb-5 border border-zinc-700">
                <div className="text-red-400 text-xl font-bold mb-3">
                  ⚠️ 10분 이내 입금해주세요
                </div>

                <div className="text-gray-300 mb-4">
                  입금 후 카톡채널에
                  <br />
                  <b>[입금내역 캡처 + 유튜브닉네임]</b>
                  <br />
                  남겨주셔야 최종 주문확인 완료됩니다.
                </div>

                <div className="text-lg mb-2">새마을금고</div>
                <div className="text-3xl font-bold mb-2">{bankAccount}</div>
                <div className="text-lg mb-5">예금주 : 유혜원</div>

                <button
                  onClick={copyAccount}
                  className="w-full bg-yellow-400 text-black font-bold p-4 rounded-2xl text-xl"
                >
                  계좌번호 복사하기
                </button>
              </div>
            ) : (
              <div className="bg-black rounded-2xl p-5 mb-5 border border-zinc-700">
                <div className="text-yellow-400 text-xl font-bold mb-3">
                  카드결제 신청 완료
                </div>

                <p className="text-gray-300 leading-7">
                  카드결제는 부가세 10%가 추가됩니다.
                  <br />
                  관리자 확인 후 카톡채널로
                  <br />
                  카드결제 링크를 보내드립니다.
                </p>
              </div>
            )}

            <div className="bg-black rounded-2xl p-5 border border-zinc-700 mb-6">
              <div className="text-gray-400 mb-2">최종 결제금액</div>
              <div className="text-4xl font-bold">{formatWon(completedTotal)}</div>
            </div>

            <button
              onClick={() => setIsCompleted(false)}
              className="w-full bg-zinc-700 p-4 rounded-2xl font-bold"
            >
              주문서로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">루루동이 주문서</h1>

        <div className="bg-zinc-900 border border-yellow-400 rounded-2xl p-4 mt-4 mb-6">
          <div className="text-sm text-gray-400 mb-1">현재 방송</div>
          <div className="text-xl font-bold text-yellow-400">
            {broadcastTitle || "방송 주문 접수중"}
          </div>
        </div>

        <div className="bg-red-950 border border-red-500 rounded-2xl p-5 mb-6 leading-7">
          <div className="font-bold text-red-300 mb-3 text-lg">
            ⚠️ 주문 전 필수 확인
          </div>

          <div className="text-sm text-red-100">
            주문완료신청 후 취소/변경 불가
            <br />
            신중구매 해주세요!
            <br />
            <br />
            주문 전 방송에서
            <br />
            상품명 · 색상 · 사이즈 · 수량 · 금액을 꼭 확인해주세요.
            <br />
            <br />
            취소/변경이 꼭 필요한 경우에만
            <br />
            방송 중 루루언니에게 말씀해주세요.
          </div>
        </div>

        <div className="bg-zinc-900 p-5 rounded-2xl mb-6 border border-yellow-400">
          <div className="text-lg font-bold mb-3 text-yellow-400">
            내 유튜브 닉네임
          </div>

          {isEditingNickname ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="여기에 유튜브 닉네임을 작성해주세요"
                className="flex-1 p-4 rounded-xl bg-black border border-zinc-700"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />

              <button
                onClick={saveNickname}
                className="bg-yellow-400 text-black px-5 rounded-xl font-bold"
              >
                저장
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 p-4 rounded-xl bg-black border border-zinc-700 text-xl font-bold">
                {nickname}
              </div>

              <button
                onClick={() => setIsEditingNickname(true)}
                className="bg-zinc-700 px-5 rounded-xl font-bold"
              >
                수정
              </button>
            </div>
          )}

          <p className="text-sm text-yellow-400 mt-4 leading-6">
            ⚠️ 입금 시 유튜브 닉네임으로 입금해주시면 확인이 가장 빠릅니다.
            <br />
            ⚠️ 다른 이름으로 입금하신 경우 카톡채널에 꼭 남겨주세요.
          </p>
        </div>

        <div className="bg-zinc-900 p-5 rounded-2xl mb-6 border border-zinc-700">
          <div className="text-lg font-bold mb-4 text-yellow-400">
            주문자 정보
          </div>

          <div className="grid gap-4">
            <input
              type="text"
              placeholder="주문자 이름"
              className="w-full p-4 rounded-xl bg-black border border-zinc-700"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <input
              type="text"
              inputMode="numeric"
              placeholder="연락처 01012345678"
              className="w-full p-4 rounded-xl bg-black border border-zinc-700"
              value={formatPhone(customerPhone)}
              onChange={(e) => setCustomerPhone(onlyNumber(e.target.value))}
            />
          </div>
        </div>

        {items.map((item, index) => (
          <div
            key={index}
            className="border border-zinc-700 rounded-2xl p-5 mb-5"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-lg">상품 {index + 1}</div>

              {items.length > 1 && (
                <button
                  onClick={() => removeItem(index)}
                  className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm"
                >
                  ✕ 이 상품 삭제
                </button>
              )}
            </div>

            <div className="grid gap-4">
              <select
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.category}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].category = e.target.value;
                  setItems(copy);
                }}
              >
                <option value="">카테고리를 선택해주세요</option>
                <option value="의류">의류</option>
                <option value="신발">신발</option>
                <option value="잡화">잡화</option>
              </select>

              <input
                type="text"
                placeholder="상품명을 작성해주세요"
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.product}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].product = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="색상을 작성해주세요 / 없으면 없음"
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.color}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].color = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="사이즈를 작성해주세요 / 없으면 없음"
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.size}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].size = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="number"
                placeholder="주문수량 숫자만 입력해주세요"
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.qty}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].qty = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="상품금액 입력해주세요 / 배송비 제외"
                className="w-full p-4 rounded-xl bg-zinc-900"
                value={item.price ? formatWon(Number(item.price)) : ""}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].price = onlyNumber(e.target.value);
                  setItems(copy);
                }}
              />
            </div>
          </div>
        ))}

        <button
          onClick={addItem}
          className="w-full bg-zinc-800 hover:bg-zinc-700 p-5 rounded-2xl mb-6 text-lg font-bold"
        >
          + 다른 상품도 같이 주문하기
        </button>

        <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-700">
          <div className="text-xl font-bold mb-4">결제방식 선택</div>

          <label className="block bg-black rounded-xl p-4 mb-3 border border-zinc-700">
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "무통장입금"}
              onChange={() => setPaymentMethod("무통장입금")}
              className="mr-2"
            />
            무통장입금
          </label>

          <label className="block bg-black rounded-xl p-4 border border-zinc-700">
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "카드결제"}
              onChange={() => setPaymentMethod("카드결제")}
              className="mr-2"
            />
            카드결제 (+부가세 10%)
            <div className="text-sm text-yellow-400 mt-2">
              관리자 확인 후 카톡으로 결제링크 발송
            </div>
          </label>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 mb-6">
          <div className="flex justify-between mb-3 text-lg">
            <span>상품금액 합계</span>
            <span>{formatWon(productTotal)}</span>
          </div>

          <div className="flex justify-between mb-3 text-lg">
            <span>배송비</span>
            <span>{formatWon(shipping)}</span>
          </div>

          {paymentMethod === "카드결제" && (
            <div className="flex justify-between mb-3 text-lg text-yellow-400">
              <span>카드결제 부가세 10%</span>
              <span>{formatWon(vatAmount)}</span>
            </div>
          )}

          <div className="flex justify-between text-3xl font-bold mt-6">
            <span>최종 결제금액</span>
            <span>{formatWon(total)}</span>
          </div>
        </div>

        <button
          className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold p-5 rounded-2xl text-xl disabled:opacity-50"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "주문 저장중..." : "주문완료신청"}
        </button>
      </div>
    </main>
  );
}