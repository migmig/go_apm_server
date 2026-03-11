import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Pause, Play } from 'lucide-react';
import SidebarNavigation from './SidebarNavigation';
import { getPageMeta } from '../lib/navigation';
import { Toaster } from 'react-hot-toast';
import { useWSPause } from '../hooks/useWebSocket';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageMeta = getPageMeta(location.pathname);
  const { isPaused, setPaused } = useWSPause();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            fontSize: '13px',
          },
          error: {
            iconTheme: { primary: '#f43f5e', secondary: '#0f172a' },
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#0f172a' },
          },
        }}
      />
      <SidebarNavigation
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onMobileToggle={() => setMobileOpen((current) => !current)}
      />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#020617]/90 backdrop-blur">
          <div className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <nav className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs text-slate-500">
                  <Link to="/" className="transition-colors hover:text-slate-300">
                    홈
                  </Link>
                  {pageMeta.breadcrumbs.map((item, index) => (
                    <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                      <ChevronRight size={12} className="shrink-0 text-slate-500" />
                      {item.to ? (
                        <Link to={item.to} className="transition-colors hover:text-slate-300">
                          {item.label}
                        </Link>
                      ) : (
                        <span className={index === pageMeta.breadcrumbs.length - 1 ? 'text-slate-300' : ''}>
                          {item.label}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>

                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
                      {pageMeta.section}
                    </p>
                    <h1 className="mt-1 truncate text-xl font-semibold text-slate-50 md:text-2xl">
                      {pageMeta.title}
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm text-slate-400">{pageMeta.description}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPaused(!isPaused)}
                      className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all shadow-sm ${
                        isPaused 
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20 shadow-amber-500/10' 
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 shadow-emerald-500/10'
                      }`}
                    >
                      {isPaused ? <Play size={14} className="fill-current" /> : <Pause size={14} className="fill-current" />}
                      {isPaused ? '수신 재개' : '수신 동결'}
                    </button>
                    <div className="hidden sm:block shrink-0 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-400">
                      v0.1.0-alpha
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main>
          <div className="mx-auto max-w-screen-2xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
