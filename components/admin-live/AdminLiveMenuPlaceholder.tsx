import { getAdminLiveMenu, type AdminLiveMenuKey } from "./adminLiveMenu";

type Props = {
  menuKey: AdminLiveMenuKey;
};

export default function AdminLiveMenuPlaceholder({ menuKey }: Props) {
  const menu = getAdminLiveMenu(menuKey);

  return (
    <section className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-soft text-xl">
              {menu.icon}
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-[-0.04em] text-ink">
                {menu.label}
              </h1>
              <p className="mt-1 text-sm font-bold text-ink-soft">{menu.desc}</p>
            </div>
          </div>
        </div>

        <span className="rounded-full bg-warn-bg px-3 py-1 text-xs font-black text-warn-tx">
          화면 연결 준비중
        </span>
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-5">
        <h2 className="text-lg font-black text-ink">{menu.readyTitle}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-ink-soft">
          {menu.readyDescription}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {menu.checkpoints.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-black text-ink"
            >
              ✓ {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-rose-soft px-4 py-3 text-xs font-black leading-5 text-rose-deep">
        지금 단계는 메뉴 클릭 구조만 안전하게 연결한 상태입니다. 실제 주문·입금·정산 데이터 처리 화면은
        기존 로직을 확인한 뒤 메뉴별로 1개씩 분리 연결합니다.
      </div>
    </section>
  );
}
