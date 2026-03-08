import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Traces from './pages/Traces';
import TraceDetail from './pages/TraceDetail';
import Logs from './pages/Logs';
import { 
  Activity, 
  LayoutDashboard, 
  ListTree, 
  FileTerminal, 
  Settings,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

function SidebarItem({ to, children, icon: Icon }: { to: string, children: React.ReactNode, icon: any }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 group rounded-lg mb-1",
        isActive
          ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      )}
    >
      <Icon size={20} className={cn("mr-3", isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />
      <span className="flex-1">{children}</span>
      {isActive && <ChevronRight size={14} className="text-blue-500/50" />}
    </Link>
  );
}

function App() {
  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-[#0f172a] flex flex-col">
        <div className="p-6">
          <Link to="/" className="flex items-center group">
            <div className="bg-blue-600 p-2 rounded-lg mr-3 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <Activity className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              Go APM
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-4 mt-2">
          <div className="mb-8">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 mb-4">모니터링</p>
            <SidebarItem to="/" icon={LayoutDashboard}>대시보드</SidebarItem>
            <SidebarItem to="/traces" icon={ListTree}>요청 추적</SidebarItem>
            <SidebarItem to="/logs" icon={FileTerminal}>로그 기록</SidebarItem>
          </div>
          
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 mb-4">시스템</p>
            <SidebarItem to="/settings" icon={Settings}>설정</SidebarItem>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></div>
            <span className="text-xs text-slate-400">서버 상태: 정상</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-end px-8">
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-500">v0.1.0-alpha</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#020617] p-8">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/traces" element={<Traces />} />
              <Route path="/traces/:traceId" element={<TraceDetail />} />
              <Route path="/logs" element={<Logs />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
