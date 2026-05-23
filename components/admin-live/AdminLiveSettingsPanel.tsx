type SettingSection = {
  title: string;
  desc: string;
  items: string[];
  tone: "blue" | "emerald" | "amber" | "violet" | "slate" | "red";
};

function toneClass(tone: SettingSection["tone"]) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
  };

  return tones[tone];
}

const settingSections: SettingSection[] = [
  {
    title: "방송 운영 설정",
    desc: "방송중/대기, 방송 제목, 유튜브 영상·채팅 연결 같은 운영값을 관리할 영역입니다.",
    tone: "blue",
    items: ["방송 시작/종료", "방송 제목", "유튜브 영상 URL", "유튜브 채팅 URL"],
  },
  {
    title: "주문서 설정",
    desc: "주문서 작성 가능 시간, 방송중 안내문, 주문서 차단 안내를 관리할 영역입니다.",
    tone: "emerald",
    items: ["주문서 ON/OFF", "주문 가능 시간", "방송중 아닐 때 안내문", "주문 제한 안내"],
  },
  {
    title: "입금 안내 설정",
    desc: "무통장 입금 안내 문구, 닉네임 입금 안내, 자동입금확인 조건 안내를 관리할 영역입니다.",
    tone: "amber",
    items: ["입금계좌 안내", "닉네임 입금 안내", "정확한 금액 안내", "자동입금확인 안내문"],
  },
  {
    title: "알림 설정",
    desc: "새 주문, 자동입금확인, 접속중 알림 등 방송 중 알림 방식을 관리할 영역입니다.",
    tone: "violet",
    items: ["새 주문 알림", "자동입금확인 알림", "접속중 알림", "소리 ON/OFF"],
  },
  {
    title: "배송·운영 설정",
    desc: "기본 배송비, 제주·산간 배송비, 송장 내보내기 기준을 관리할 영역입니다.",
    tone: "slate",
    items: ["기본 배송비", "제주·산간 배송비", "송장 내보내기 기준", "닉네임 주소 표기"],
  },
  {
    title: "관리자 보안",
    desc: "관리자 로그인, 세션, 접근 제한 같은 보안 관련 설정을 분리해서 관리할 영역입니다.",
    tone: "red",
    items: ["관리자 로그인", "세션 유지", "접근 제한", "보안 점검"],
  },
];

export default function AdminLiveSettingsPanel() {
  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">OPERATION SETTINGS</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">설정</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              현재 연결은 읽기전용입니다. 설정 저장·배송비 변경·입금계좌 변경·알림 설정 저장은 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            읽기전용 연결
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          설정은 방송 운영과 돈 흐름에 직접 영향을 줄 수 있으므로, 저장 기능은 다음 단계에서 항목별로 분리 검증 후 연결합니다.
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {settingSections.map((section) => (
          <div key={section.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">{section.title}</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{section.desc}</p>
              </div>

              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${toneClass(section.tone)}`}>
                준비중
              </span>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {section.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700"
                >
                  ✓ {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">다음 연결 순서</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">
            1. 설정 항목 확정
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
            2. 저장 전 검증 로직 분리
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
            3. 항목별 저장 기능 연결
          </div>
        </div>

        <p className="mt-4 text-xs font-black leading-5 text-slate-500">
          지금 화면은 UI 구조 확인용입니다. settings DB, 주문 DB, 입금 DB, 정산 데이터는 변경하지 않습니다.
        </p>
      </div>
    </section>
  );
}
