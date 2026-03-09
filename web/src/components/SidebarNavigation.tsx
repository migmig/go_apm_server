import { Activity, ChevronRight, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn';
import { navigationSections } from '../lib/navigation';

interface SidebarNavigationProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  onMobileToggle: () => void;
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <nav className="mt-8 flex-1 space-y-8">
      {navigationSections.map((section) => (
        <div key={section.label}>
          <p className="px-4 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">{section.label}</p>
          <div className="mt-3 space-y-1">
            {section.items.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to !== '/' && location.pathname.startsWith(item.to));

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                      : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100',
                  )}
                >
                  <item.icon
                    size={18}
                    className={cn(
                      'mr-3 shrink-0',
                      isActive ? 'text-blue-300' : 'text-slate-500',
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {isActive ? <ChevronRight size={14} className="text-blue-300/70" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavigationPanel({
  className,
  onNavigate,
  onRequestClose,
  showCloseButton,
}: {
  className?: string;
  onNavigate?: () => void;
  onRequestClose?: () => void;
  showCloseButton?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-slate-800 bg-[#0f172a] px-4 py-5 shadow-2xl shadow-black/20',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 px-2">
        <Link to="/" onClick={onNavigate} className="flex items-center">
          <div className="mr-3 rounded-xl bg-blue-600 p-2 shadow-lg shadow-blue-500/20">
            <Activity className="text-white" size={20} />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-100">Go APM</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Server Console</p>
          </div>
        </Link>

        {showCloseButton ? (
          <button
            type="button"
            onClick={onRequestClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100"
            aria-label="메뉴 닫기"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      <NavItems onNavigate={onNavigate} />

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center">
          <div className="mr-2 h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm text-slate-200">서버 상태: 정상</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          모바일에서는 메뉴를 닫아 본문 공간을 확보할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default function SidebarNavigation({
  mobileOpen,
  onMobileClose,
  onMobileToggle,
}: SidebarNavigationProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">
        <NavigationPanel />
      </aside>

      <button
        type="button"
        onClick={onMobileToggle}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-100 shadow-lg shadow-black/30 backdrop-blur lg:hidden"
        aria-label="메뉴 열기"
      >
        <Menu size={20} />
      </button>

      {mobileOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={onMobileClose}
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
            aria-label="메뉴 닫기"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-2rem))]">
            <NavigationPanel
              className="border-r border-slate-800"
              onNavigate={onMobileClose}
              onRequestClose={onMobileClose}
              showCloseButton
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
