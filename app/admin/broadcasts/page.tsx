// app/admin/broadcasts/page.tsx
// 새 파일 생성용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/admin/broadcasts/page.tsx
//
// 기능:
// - 합배송 그룹 설정 전용 관리자 페이지
// - 방송 목록 체크박스 다중선택
// - 합배송 그룹 저장/삭제
// - 방송목록 / 방송일 삭제 기능
// - 방송 삭제 시 주문은 삭제하지 않고 방송 목록에서만 숨김 처리
//
// 접속 주소:
// http://localhost:3000/admin/broadcasts

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PASSWORD = "8249";

type Broadcast = {
  id: string;
  public_title?: string;
  admin_subtitle?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  created_at?: string;
  is_deleted?: boolean;
};

type CombineGroup = {
  id: string;
  group_name: string;
  memo: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type GroupLink = {
  id: string;
  group_id: string;
  broadcast_id: string;
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const getBroadcastTitle = (broadcast: Broadcast) => {
  const title = broadcast.public_title || "방송제목 없음";
  const subtitle = broadcast.admin_subtitle ? ` / ${broadcast.admin_subtitle}` : "";
  return `${title}${subtitle}`;
};

const getStatusLabel = (status?: string) => {
  if (status === "ON") return "방송중";
  if (status === "OFF") return "종료";
  return status || "-";
};

export default function AdminCombinePage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [groups, setGroups] = useState<CombineGroup[]>([]);
  const [links, setLinks] = useState<GroupLink[]>([]);

  const [groupName, setGroupName] = useState("");
  const [memo, setMemo] = useState("");
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [showAllBroadcasts, setShowAllBroadcasts] = useState(false);
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

    const [broadcastResult, groupResult, linkResult] = await Promise.all([
      supabase
        .from("broadcasts")
        .select("*")
        .neq("is_deleted", true)
        .order("started_at", { ascending: false }),
      supabase
        .from("combine_shipping_groups")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("combine_shipping_group_broadcasts")
        .select("*"),
    ]);

    if (broadcastResult.error) {
      alert("방송 목록 불러오기 실패\n" + broadcastResult.error.message);
    }

    if (groupResult.error) {
      alert("합배송 그룹 불러오기 실패\n" + groupResult.error.message);
    }

    if (linkResult.error) {
      alert("합배송 연결 목록 불러오기 실패\n" + linkResult.error.message);
    }

    setBroadcasts(broadcastResult.data || []);
    setGroups(groupResult.data || []);
    setLinks(linkResult.data || []);
    setLoading(false);
  };

  const visibleBroadcasts = useMemo(() => {
    if (showAllBroadcasts) return broadcasts;

    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    return broadcasts.filter((broadcast) => {
      if (broadcast.status === "ON") return true;

      const time = new Date(
        broadcast.started_at || broadcast.created_at || ""
      ).getTime();

      if (!time) return true;

      return now - time <= fourteenDays;
    });
  }, [broadcasts, showAllBroadcasts]);

  const groupMap = useMemo(() => {
    const map = new Map<string, string[]>();

    links.forEach((link) => {
      const prev = map.get(link.group_id) || [];
      map.set(link.group_id, [...prev, link.broadcast_id]);
    });

    return map;
  }, [links]);

  const toggleBroadcast = (broadcastId: string) => {
    setSelectedBroadcastIds((prev) => {
      if (prev.includes(broadcastId)) {
        return prev.filter((id) => id !== broadcastId);
      }

      return [...prev, broadcastId];
    });
  };

  const resetForm = () => {
    setEditingGroupId(null);
    setGroupName("");
    setMemo("");
    setSelectedBroadcastIds([]);
  };

  const editGroup = (group: CombineGroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.group_name || "");
    setMemo(group.memo || "");
    setSelectedBroadcastIds(groupMap.get(group.id) || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveGroup = async () => {
    if (!groupName.trim()) {
      alert("합배송 그룹명을 입력해주세요.");
      return;
    }

    if (selectedBroadcastIds.length < 2) {
      alert("합배송할 방송을 2개 이상 선택해주세요.");
      return;
    }

    let groupId = editingGroupId;

    if (editingGroupId) {
      const { error } = await supabase
        .from("combine_shipping_groups")
        .update({
          group_name: groupName.trim(),
          memo: memo.trim(),
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingGroupId);

      if (error) {
        alert("합배송 그룹 수정 실패\n" + error.message);
        return;
      }

      await supabase
        .from("combine_shipping_group_broadcasts")
        .delete()
        .eq("group_id", editingGroupId);
    } else {
      const { data, error } = await supabase
        .from("combine_shipping_groups")
        .insert({
          group_name: groupName.trim(),
          memo: memo.trim(),
          is_enabled: true,
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        alert("합배송 그룹 생성 실패\n" + (error?.message || ""));
        return;
      }

      groupId = data.id;
    }

    const insertLinks = selectedBroadcastIds.map((broadcastId) => ({
      group_id: groupId,
      broadcast_id: broadcastId,
    }));

    const { error: linkError } = await supabase
      .from("combine_shipping_group_broadcasts")
      .insert(insertLinks);

    if (linkError) {
      alert("방송 연결 저장 실패\n" + linkError.message);
      return;
    }

    resetForm();
    await loadAll();
    alert("합배송 그룹 저장 완료");
  };

  const deleteGroup = async (group: CombineGroup) => {
    if (!confirm(`합배송 그룹을 삭제할까요?\n\n${group.group_name}`)) return;

    const { error } = await supabase
      .from("combine_shipping_groups")
      .delete()
      .eq("id", group.id);

    if (error) {
      alert("합배송 그룹 삭제 실패\n" + error.message);
      return;
    }

    await loadAll();
    alert("합배송 그룹 삭제 완료");
  };

  const deleteBroadcastOnly = async (broadcast: Broadcast) => {
    const title = getBroadcastTitle(broadcast);

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcast.id);

    const orderCount = count || 0;

    const message =
      `이 방송일을 목록에서 삭제할까요?\n\n` +
      `${title}\n\n` +
      `연결된 주문: ${orderCount}건\n\n` +
      `주문은 삭제하지 않고 방송 목록에서만 숨김 처리됩니다.`;

    if (!confirm(message)) return;

    const { error } = await supabase
      .from("broadcasts")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        delete_memo: `관리자 방송목록 / 방송일 삭제 / 연결 주문 ${orderCount}건`,
      })
      .eq("id", broadcast.id);

    if (error) {
      alert("방송목록 / 방송일 삭제 실패\n" + error.message);
      return;
    }

    await supabase
      .from("combine_shipping_group_broadcasts")
      .delete()
      .eq("broadcast_id", broadcast.id);

    setSelectedBroadcastIds((prev) => prev.filter((id) => id !== broadcast.id));

    await loadAll();
    alert("방송일을 삭제했습니다. 연결된 주문은 유지됩니다.");
  };

  const getBroadcastsForGroup = (groupId: string) => {
    const broadcastIds = groupMap.get(groupId) || [];

    return broadcastIds
      .map((id) => broadcasts.find((broadcast) => broadcast.id === id))
      .filter(Boolean) as Broadcast[];
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5 text-gray-950">
        <section className="w-full max-w-sm bg-white rounded-3xl p-6 border border-gray-300 shadow-sm">
          <h1 className="text-3xl font-extrabold mb-5 text-gray-950">
            방송관리 로그인
          </h1>

          <input
            type="password"
            placeholder="관리자 비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
            className="w-full border border-gray-300 rounded-2xl p-4 font-bold text-gray-950 bg-white"
          />

          <button
            onClick={login}
            className="w-full bg-black text-white rounded-2xl p-4 font-extrabold mt-4"
          >
            로그인
          </button>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl p-8 border font-extrabold">
          불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-5 text-gray-950">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-gray-600">
              RURU BROADCAST
            </div>

            <h1 className="text-4xl font-extrabold text-gray-950">
              방송관리
            </h1>

            <p className="mt-2 text-gray-600 font-bold">
              방송목록 / 방송일 삭제와 합배송 그룹 설정을 관리합니다.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/admin"
              className="inline-flex justify-center rounded-2xl bg-white border border-gray-300 px-5 py-3 font-extrabold text-gray-950 hover:bg-black hover:text-white transition"
            >
              관리자 홈
            </a>

            <button
              onClick={loadAll}
              className="rounded-2xl bg-black text-white px-5 py-3 font-extrabold"
            >
              새로고침
            </button>
          </div>
        </div>

        <section className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
            <h2 className="text-2xl font-extrabold mb-4">
              {editingGroupId ? "합배송 그룹 수정" : "합배송 그룹 만들기"}
            </h2>

            <div className="grid gap-3">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="예) 5/16 신발+의류 합배송"
                className="w-full border border-gray-300 rounded-2xl p-4 font-bold"
              />

              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 예) 같은 이름+전화번호+주소면 배송비 1번"
                className="w-full border border-gray-300 rounded-2xl p-4 font-bold"
              />

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-lg font-extrabold">
                      합배송할 방송 선택
                    </div>
                    <div className="text-sm font-bold text-gray-500 mt-1">
                      최근 14일 방송이 기본 표시됩니다.
                    </div>
                  </div>

                  <button
                    onClick={() => setShowAllBroadcasts((prev) => !prev)}
                    className="rounded-2xl bg-white border border-gray-300 px-4 py-2 font-extrabold"
                  >
                    {showAllBroadcasts ? "최근만" : "전체보기"}
                  </button>
                </div>

                <div className="grid gap-2 max-h-[520px] overflow-y-auto pr-1">
                  {visibleBroadcasts.map((broadcast) => {
                    const checked = selectedBroadcastIds.includes(broadcast.id);

                    return (
                      <label
                        key={broadcast.id}
                        className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer ${
                          checked
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-950 border-gray-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBroadcast(broadcast.id)}
                          className="mt-1 w-5 h-5 shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-base">
                            {getBroadcastTitle(broadcast)}
                          </div>

                          <div className={`mt-1 text-sm font-bold ${checked ? "text-white/70" : "text-gray-500"}`}>
                            {formatDateTime(broadcast.started_at || broadcast.created_at)}
                            {" · "}
                            {getStatusLabel(broadcast.status)}
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {visibleBroadcasts.length === 0 && (
                    <div className="rounded-2xl border bg-white p-5 text-center font-bold text-gray-500">
                      표시할 방송이 없습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={saveGroup}
                  className="bg-black text-white rounded-2xl p-4 font-extrabold"
                >
                  {editingGroupId ? "수정 저장" : "합배송 그룹 저장"}
                </button>

                <button
                  onClick={resetForm}
                  className="bg-gray-200 text-gray-950 rounded-2xl p-4 font-extrabold"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <section className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
              <h2 className="text-2xl font-extrabold mb-4">
                합배송 그룹 관리
              </h2>

              <div className="grid gap-3">
                {groups.map((group) => {
                  const groupBroadcasts = getBroadcastsForGroup(group.id);

                  return (
                    <article
                      key={group.id}
                      className="rounded-2xl border border-gray-300 bg-gray-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xl font-extrabold">
                            {group.group_name}
                          </div>

                          {group.memo && (
                            <div className="mt-1 text-sm font-bold text-gray-600">
                              {group.memo}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => editGroup(group)}
                            className="rounded-xl bg-black text-white px-4 py-2 font-bold"
                          >
                            수정
                          </button>

                          <button
                            onClick={() => deleteGroup(group)}
                            className="rounded-xl bg-red-500 text-white px-4 py-2 font-bold"
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2">
                        {groupBroadcasts.map((broadcast) => (
                          <div
                            key={broadcast.id}
                            className="rounded-xl bg-white border border-gray-200 px-4 py-3 font-bold text-gray-800"
                          >
                            {getBroadcastTitle(broadcast)}
                            <span className="ml-2 text-xs text-gray-500">
                              {formatDateTime(broadcast.started_at || broadcast.created_at)}
                            </span>
                          </div>
                        ))}

                        {groupBroadcasts.length === 0 && (
                          <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 font-bold text-gray-500">
                            연결된 방송이 없습니다.
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}

                {groups.length === 0 && (
                  <div className="rounded-2xl border bg-gray-50 p-5 text-center font-bold text-gray-500">
                    등록된 합배송 그룹이 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
              <h2 className="text-2xl font-extrabold mb-4">
                방송목록 / 방송일 삭제
              </h2>

              <div className="text-sm text-gray-600 font-bold mb-3">
                방송일은 목록에서만 숨김 처리됩니다. 연결된 주문은 삭제되지 않습니다.
              </div>

              <div className="grid gap-2 max-h-[360px] overflow-y-auto pr-1">
                {visibleBroadcasts.map((broadcast) => (
                  <div
                    key={`delete-${broadcast.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold truncate">
                        {getBroadcastTitle(broadcast)}
                      </div>

                      <div className="text-sm text-gray-500 font-bold mt-1">
                        {formatDateTime(broadcast.started_at || broadcast.created_at)}
                        {" · "}
                        {getStatusLabel(broadcast.status)}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteBroadcastOnly(broadcast)}
                      className="shrink-0 rounded-xl bg-red-50 border border-red-200 px-4 py-2 font-extrabold text-red-700 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
