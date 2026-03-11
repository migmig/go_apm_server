/**
 * 서비스 건강 상태 판별 유틸리티
 *
 * Dashboard.tsx와 ServiceDetail.tsx 등에서 중복으로 사용되던
 * 에러율·응답 지연 기반 '위급' 판단 로직을 공통 함수로 추출합니다.
 */

export const HEALTH_THRESHOLDS = {
    /** 에러율이 이 값을 초과하면 위급(Unhealthy) */
    ERROR_RATE: 0.05,
    /** 평균 응답 시간(ms)이 이 값을 초과하면 위급(Unhealthy) */
    AVG_LATENCY_MS: 500,
} as const;

export interface ServiceHealth {
    isUnhealthy: boolean;
    errorRate: number;
}

/**
 * 서비스의 건강 상태를 평가합니다.
 *
 * @param spanCount  - 전체 Span 수
 * @param errorCount - 에러 Span 수
 * @param avgLatencyMs - 평균 응답 시간(ms)
 */
export function getServiceHealth(
    spanCount: number,
    errorCount: number,
    avgLatencyMs: number,
): ServiceHealth {
    const errorRate = spanCount > 0 ? errorCount / spanCount : 0;
    const isUnhealthy =
        errorRate > HEALTH_THRESHOLDS.ERROR_RATE ||
        avgLatencyMs > HEALTH_THRESHOLDS.AVG_LATENCY_MS;

    return { isUnhealthy, errorRate };
}
