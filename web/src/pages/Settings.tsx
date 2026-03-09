import { BellRing, Settings, ShieldCheck, SlidersHorizontal } from 'lucide-react';

const plannedSections = [
  {
    title: '수집기 연결 설정',
    description: 'OTLP gRPC/HTTP 포트, 수집 상태, 샘플 데이터 연결 여부를 한 화면에서 확인할 수 있도록 정리할 예정입니다.',
    icon: SlidersHorizontal,
  },
  {
    title: '보존 정책 및 스토리지',
    description: 'SQLite 보존 기간, 데이터 디렉터리, 정리 주기를 읽기 전용 상태와 설정 변경 흐름으로 분리할 계획입니다.',
    icon: ShieldCheck,
  },
  {
    title: '알림 및 운영 가이드',
    description: '에러율 상승, 수집 실패, 디스크 여유 공간 부족 시 어떤 대응이 필요한지 운영 가이드를 연결할 예정입니다.',
    icon: BellRing,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-300">
            <Settings size={22} />
          </div>
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              Settings Preview
            </div>
            <h1 className="text-2xl font-bold text-slate-100">설정 화면 준비 중</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-400">
              설정 메뉴는 더 이상 빈 라우트가 아니며, 다음 UI 개선 단계에서 실제 운영 설정 화면으로 확장됩니다.
              현재는 우선순위와 적용 범위를 확인할 수 있는 placeholder 화면을 제공합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plannedSections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
            <div className="mb-4 inline-flex rounded-xl bg-slate-900 p-3 text-slate-200">
              <section.icon size={18} />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{section.description}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
