import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#0f172a] p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-blue-300">
          <Compass size={24} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-100">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          이동하려는 경로가 없거나 현재 UI 범위에 포함되지 않은 화면입니다. 대시보드로 돌아가서 정상 라우트를 이용해 주세요.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            <ArrowLeft size={16} className="mr-2" />
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
