import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AppConfig, type SystemInfo, type PartitionInfo } from '../api/client';
import { Calendar, Database, HardDrive, Monitor, Radio, SlidersHorizontal, ExternalLink } from 'lucide-react';
import { PageErrorState, PageLoadingState } from '../components/PageState';
import { getAsyncViewState, getErrorMessage } from '../lib/request-state';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d > 0 && `${d}일`, h > 0 && `${h}시간`, `${m}분`].filter(Boolean).join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function ConfigRow({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-b-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-mono ${warn ? 'text-amber-400 font-bold' : 'text-slate-100'}`}>{value}</span>
    </div>
  );
}

function PortRow({ label, port }: { label: string; port: number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-b-0">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-slate-100">{port}</span>
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-emerald-400">수신 대기 중</span>
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-5 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-lg bg-slate-900 p-2.5 text-slate-200">
          <Icon size={18} />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [partitions, setPartitions] = useState<PartitionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, sys, parts] = await Promise.all([
        api.getConfig(),
        api.getSystem(),
        api.getPartitions(),
      ]);
      setConfig(cfg);
      setSystem(sys);
      setPartitions(parts);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, '설정 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasData = config !== null && system !== null;
  const viewState = getAsyncViewState({
    hasData,
    isLoading: loading,
    isEmpty: false,
    errorMessage,
  });

  if (viewState === 'loading') {
    return (
      <PageLoadingState
        title="설정 정보를 불러오는 중입니다"
        description="서버 구성 및 시스템 정보를 조회하고 있습니다."
      />
    );
  }

  if (viewState === 'error' || !config || !system) {
    return (
      <PageErrorState
        title="설정 정보를 불러오지 못했습니다"
        description={errorMessage ?? 'API 서버 연결을 확인한 뒤 다시 시도해 주세요.'}
        onAction={() => void fetchData()}
      />
    );
  }

  const totalSize = partitions.reduce((sum, p) => sum + p.size_bytes, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 수집기 연결 설정 */}
        <SectionCard icon={Radio} title="수집기 연결 설정">
          <PortRow label="gRPC 포트" port={config.receiver.grpc_port} />
          <PortRow label="HTTP 포트" port={config.receiver.http_port} />
          <PortRow label="API 포트" port={config.server.api_port} />
        </SectionCard>

        {/* 배치 프로세서 설정 */}
        <SectionCard icon={SlidersHorizontal} title="배치 프로세서 설정">
          <ConfigRow label="배치 크기" value={new Intl.NumberFormat('ko-KR').format(config.processor.batch_size)} />
          <ConfigRow label="플러시 간격" value={config.processor.flush_interval} />
          <ConfigRow label="큐 크기" value={new Intl.NumberFormat('ko-KR').format(config.processor.queue_size)} />
          <ConfigRow label="큐 초과 시 드롭" value={config.processor.drop_on_full ? '예' : '아니오'} />
        </SectionCard>

        {/* 스토리지 설정 */}
        <SectionCard icon={Database} title="스토리지 설정">
          <ConfigRow label="데이터 디렉토리" value={config.storage.path.replace(/\/[^/]+\.db$/, '/')} />
          <ConfigRow
            label="보존 기간"
            value={`${config.storage.retention_days}일`}
            warn={config.storage.retention_days <= 3}
          />
          <ConfigRow label="전체 데이터 크기" value={formatBytes(totalSize)} />
        </SectionCard>

        {/* 시스템 정보 */}
        <SectionCard icon={Monitor} title="시스템 정보">
          <ConfigRow label="서버 버전" value={system.version} />
          <ConfigRow label="Go 버전" value={system.go_version} />
          <ConfigRow label="OS / Arch" value={`${system.os} / ${system.arch}`} />
          <ConfigRow label="서버 가동 시간" value={formatUptime(system.uptime_seconds)} />
        </SectionCard>
      </div>

      {/* 데이터 파티션 목록 */}
      <SectionCard icon={HardDrive} title="데이터 파티션 (일별 DB 파일)">
        {partitions.length === 0 ? (
          <p className="py-4 text-sm text-slate-400 text-center">파티션 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-3 pr-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">날짜</th>
                  <th className="py-3 pr-4 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">파일명</th>
                  <th className="py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">크기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {partitions.map((p) => {
                  const isToday = p.date === new Date().toISOString().slice(0, 10);
                  const dayStart = new Date(p.date + 'T00:00:00').getTime();
                  const dayEnd = dayStart + 86400000 - 1;
                  const traceLink = `/traces?start=${dayStart}&end=${dayEnd}&date=${p.date}`;
                  return (
                    <tr key={p.date} className="hover:bg-slate-800/20 transition-colors group">
                      <td className="py-3 pr-4">
                        <Link to={traceLink} className="flex items-center gap-2 group/link">
                          <Calendar size={14} className={isToday ? 'text-blue-400' : 'text-slate-500 group-hover/link:text-blue-400 transition-colors'} />
                          <span className={`text-sm font-mono ${isToday ? 'text-blue-400 font-bold' : 'text-slate-100 group-hover/link:text-blue-400'} transition-colors`}>
                            {p.date}
                          </span>
                          {isToday && (
                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20 uppercase">
                              오늘
                            </span>
                          )}
                          <ExternalLink size={12} className="text-slate-600 group-hover/link:text-blue-400 transition-colors" />
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs font-mono text-slate-400">{p.file_path.split('/').pop()}</span>
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-sm font-mono text-slate-100">{formatBytes(p.size_bytes)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <td colSpan={2} className="py-3 pr-4 text-sm font-bold text-slate-300">합계 ({partitions.length}개 파티션)</td>
                  <td className="py-3 text-right text-sm font-mono font-bold text-slate-100">{formatBytes(totalSize)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
