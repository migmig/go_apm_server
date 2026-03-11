import type React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

export interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    /** 아이콘 텍스트 색상, ex: 'text-blue-400' */
    colorClass: string;
    /** 아이콘 배경 색상, ex: 'bg-blue-500/10' */
    bgClass: string;
    /** 경고(위급) 상태 여부 — 보더 및 값 텍스트 색상 변경 */
    warning?: boolean;
    /** 스파크라인용 시계열 데이터 */
    chartData?: any[];
    /** 스파크라인 데이터 키 */
    dataKey?: string;
}

/** 색상 클래스 문자열에서 Recharts에 전달할 HEX 색상을 유추합니다. */
function resolveStrokeColor(colorClass: string): string {
    if (colorClass.includes('blue')) return '#3b82f6';
    if (colorClass.includes('amber')) return '#f59e0b';
    if (colorClass.includes('rose')) return '#f43f5e';
    if (colorClass.includes('emerald')) return '#10b981';
    if (colorClass.includes('indigo')) return '#6366f1';
    return '#64748b';
}

export default function StatCard({
    label,
    value,
    icon: Icon,
    colorClass,
    bgClass,
    warning = false,
    chartData,
    dataKey,
}: StatCardProps) {
    const strokeColor = resolveStrokeColor(colorClass);

    return (
        <div
            className={`bg-[#0f172a] p-6 rounded-xl border ${warning ? 'border-rose-500/50' : 'border-slate-800'
                } shadow-sm relative overflow-hidden group`}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 relative z-10">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {label}
                </span>
                <div className={`${bgClass} ${colorClass} p-2 rounded-lg`}>
                    <Icon size={16} />
                </div>
            </div>

            {/* Value */}
            <p
                className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight relative z-10 ${warning ? 'text-rose-400' : 'text-slate-100'
                    }`}
            >
                {value ?? '-'}
            </p>

            {/* Sparkline */}
            {chartData && chartData.length > 0 && dataKey && (
                <div className="absolute bottom-0 left-0 w-full h-12 opacity-20 group-hover:opacity-40 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <Area
                                type="monotone"
                                dataKey={dataKey}
                                stroke={strokeColor}
                                fill={strokeColor}
                                strokeWidth={0}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
