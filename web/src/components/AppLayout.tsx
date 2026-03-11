import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import SidebarNavigation from './SidebarNavigation';
import { getPageMeta } from '../lib/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageMeta = getPageMeta(location.pathname);

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

                  <div className="shrink-0 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-400">
                    v0.1.0-alpha
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
