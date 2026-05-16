// app/admin/broadcasts/page.tsx
// 새 파일 생성용
// 방송 전 안전패치 버전
// 기능: 방송목록 확인, 방송 삭제(주문 유지)

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PASSWORD = "8249";

const formatDate = (value?: string) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return "-";
  }
};

const won = (value: any) => `${Number(value || 0).toLocaleString()}원`;

export default function AdminBroadcastsPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem("ruru_admin_login");
    if (saved === "Y") {
      setIsAuthed(true);
      loadAll();
    } else {
      setLoading(false);
    }
  }, []);

  const login = () => {
    if (password !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 틀렸습니다.");
      return;
    }

    sessionStorage.setItem("ruru_admin_login", "Y");
    setIsAuthed(true);
    loadAll();
  };

  const loadAll = async () => {
    setLoading(true);

    const [broadcastResult, orderResult] = await Promise.all([
      supabase
        .from("broadcasts")
        .select("*")
        .neq("is_deleted", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("*")
        .neq("is_permanently_deleted", true)
        .order("created_at", { ascending: false }),
    ]);

    if (broadcastResult.error) {
      alert("방송목록 불러오기 오류: " + broadcastResult.error.message);
    }

    if (orderResult.error) {
      alert("주문목록 불러오기 오류: " + orderResult.error.message);
    }

    setBroadcasts(broadcastResult.data || []);
    setOrders(orderResult.data || []);
    setLoading(false);
  };

  const getBroadcastOrders = (broadcastId: string) => {
    return orders.filter((order) => String(order.broadcast_id || "") === String(broadcastId));
  };

  const getBroadcastSales = (broadcastId: string) => {
    return getBroadcastOrders(broadcastId)
      .filter((order) => order.is_deleted !== true)
      .reduce((sum, order) => sum + Number(order.adjusted_total_price || order.total_price || 0), 0);
  };

  const deleteBroadcastOnly = async (broadcast: any) => {
    const count = getBroadcastOrders(broadcast.id).length;
    const title = `${broadcast.public_title || "방송제목 없음"} ${broadcast.admin_subtitle ? "/ " + broadcast.admin_subtitle : ""}`;

    if (
      !confirm(
        `방송을 목록에서 삭제할까요?\n\n${title}\n\n연결 주문 ${count}건은 삭제되지 않고 유지됩니다.`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("broadcasts")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        delete_memo: `관리자 방송 삭제 / 연결 주문 ${count}건`,
      })
      .eq("id", broadcast.id);

    if (error) {
      alert("방송 삭제 오류: " + error.message);
      return;
    }

    await loadAll();
    alert("방송을 목록에서 삭제했습니다. 주문은 유지됩니다.");
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
        <section className="w-full max-w-sm rounded-3xl bg-white border border-gray-200 p-6 shadow-sm">
          <h1 className="text-3xl font-extrabold mb-4">방송관리 로그인</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
            placeholder="관리자 비밀번호"
            className="w-full rounded-2xl border border-gray-300 p-4 font-bold"
          />
          <button
            onClick={login}
            className="mt-3 w-full rounded-2xl bg-black p-4 font-extrabold text-white"
          >
            로그인
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-5 text-gray-950">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-gray-500">RURU BROADCAST</div>
            <h1 className="text-4xl font-extrabold">방송관리</h1>
            <p className="mt-2 font-bold text-gray-500">
              방송목록, 주문건수, 매출, 방송삭제를 관리합니다.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/admin"
              className="rounded-2xl bg-white border border-gray-300 px-5 py-3 font-extrabold"
            >
              관리자 홈
            </a>
            <button
              onClick={loadAll}
              className="rounded-2xl bg-black px-5 py-3 font-extrabold text-white"
            >
              새로고침
            </button>
          </div>
        </div>

        <section className="rounded-3xl bg-white border border-gray-200 p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-2xl font-extrabold">방송목록</div>
            <div className="text-sm font-bold text-gray-500">
              삭제해도 연결된 주문은 유지됩니다.
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-sm">
                  <th className="p-3">방송일</th>
                  <th className="p-3">방송제목</th>
                  <th className="p-3">관리자 부제</th>
                  <th className="p-3">상태</th>
                  <th className="p-3">주문건수</th>
                  <th className="p-3">매출</th>
                  <th className="p-3">관리</th>
                </tr>
              </thead>

              <tbody>
                {broadcasts.map((broadcast) => {
                  const count = getBroadcastOrders(broadcast.id).length;
                  const sales = getBroadcastSales(broadcast.id);

                  return (
                    <tr key={broadcast.id} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="p-3 font-bold">
                        {formatDate(broadcast.started_at || broadcast.created_at)}
                      </td>
                      <td className="p-3 font-extrabold">
                        {broadcast.public_title || "-"}
                      </td>
                      <td className="p-3 font-bold text-gray-600">
                        {broadcast.admin_subtitle || "-"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                            broadcast.status === "ON"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {broadcast.status === "ON" ? "방송중" : "종료"}
                        </span>
                      </td>
                      <td className="p-3 font-extrabold">{count}건</td>
                      <td className="p-3 font-extrabold">{won(sales)}</td>
                      <td className="p-3">
                        <button
                          onClick={() => deleteBroadcastOnly(broadcast)}
                          className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-extrabold text-red-700"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {broadcasts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center font-bold text-gray-500">
                      표시할 방송이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
