/**
 * 디자인 토큰 — 상태 및 심각도에 따른 Tailwind 스타일 매핑
 *
 * 로그 심각도, 트레이스 결과, 서비스 색상 등에 사용되는
 * 스타일 클래스를 한 곳에서 관리합니다.
 */

// ---------------------------------------------------------------------------
// 로그 심각도 (Log Severity)
// ---------------------------------------------------------------------------

export interface SeverityStyle {
    /** 로그 행의 좌측 보더 + 배경색 */
    row: string;
    /** 뱃지 텍스트·배경·보더 */
    badge: string;
}

/**
 * severity_number 기반 로그 행 & 뱃지 스타일을 반환합니다.
 *
 * - 17+ : ERROR (rose)
 * - 13+ : WARN  (amber)
 * -  9+ : INFO  (blue)
 * - 그 외 : DEBUG/TRACE (slate)
 */
export function getLogSeverityStyle(severityNumber: number): SeverityStyle {
    if (severityNumber >= 17) {
        return {
            row: 'border-l-rose-500 bg-rose-500/5',
            badge: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
        };
    }
    if (severityNumber >= 13) {
        return {
            row: 'border-l-amber-500 bg-amber-500/5',
            badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        };
    }
    if (severityNumber >= 9) {
        return {
            row: 'border-l-blue-500 bg-blue-500/5',
            badge: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
        };
    }
    return {
        row: 'border-l-slate-700',
        badge: 'border-slate-700 bg-slate-800 text-slate-400',
    };
}

// ---------------------------------------------------------------------------
// 트레이스 상태 (Trace Status)
// ---------------------------------------------------------------------------

export interface TraceStatusStyle {
    text: string;
    label: string;
}

/**
 * OTLP status_code 기반 스타일을 반환합니다.
 *
 * - 2 : ERROR (rose)
 * - 그 외 : OK (emerald)
 */
export function getTraceStatusStyle(statusCode: number): TraceStatusStyle {
    if (statusCode === 2) {
        return {
            text: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
            label: '실패',
        };
    }
    return {
        text: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        label: '성공',
    };
}

// ---------------------------------------------------------------------------
// 서비스 색상 (Service Color)
// ---------------------------------------------------------------------------

const SERVICE_COLORS = [
    'bg-blue-500',
    'bg-indigo-500',
    'bg-purple-500',
    'bg-emerald-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-violet-500',
] as const;

/**
 * 서비스 이름의 해시 기반으로 일정한 색상 클래스를 반환합니다.
 */
export function getServiceColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}
