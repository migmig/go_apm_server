# APM Server Web UI 개선 작업 목록 (Tasks)

본 문서는 `spec_ui_improvements.md`에 정의된 기술 명세를 실행 가능한 작업 단위로 분해한 것입니다.

## Phase 1 — Quick Wins (공통화 · 데이터 정확성 · 접근성)

### Task 1-1. 서비스 상태 판별 유틸리티 추출 (`lib/health.ts`)
- [x] `web/src/lib/health.ts` 파일 신규 생성
- [x] `HEALTH_THRESHOLDS` 상수 정의 (`ERROR_RATE: 0.05`, `AVG_LATENCY_MS: 500`)
- [x] `getServiceHealth(spanCount, errorCount, avgLatencyMs)` 함수 작성
- [x] `Dashboard.tsx` 내 인라인 판별 로직을 `getServiceHealth` 호출로 교체
- [x] `ServiceDetail.tsx` 내 인라인 판별 로직을 `getServiceHealth` 호출로 교체

### Task 1-2. 색상 디자인 토큰 유틸리티 추출 (`lib/theme.ts`)
- [x] `web/src/lib/theme.ts` 파일 신규 생성
- [x] `getLogSeverityStyle(severityNumber)` 함수 구현 — 로우 배경 및 뱃지 스타일 반환
- [x] `getTraceStatusStyle(statusCode)` 함수 구현 — 성공/실패 텍스트·배경 클래스 반환
- [x] `getServiceColor(serviceName)` 함수 이전 — `TraceDetail.tsx`에서 공통으로 이동
- [x] `Logs.tsx`의 `getSeverityRowStyle`, `getSeverityBadgeStyle` 함수를 `theme.ts` 호출로 교체
- [x] `TraceList.tsx`의 `TraceStatusBadge`에서 `theme.ts` 호출로 교체

### Task 1-3. 통계 카드 공통 컴포넌트 생성 (`StatCard.tsx`)
- [x] `web/src/components/ui/StatCard.tsx` 파일 신규 생성
- [x] `StatCardProps` 인터페이스 정의 (`label`, `value`, `icon`, `colorClass`, `bgClass`, `warning?`, `chartData?`, `dataKey?`)
- [x] 스파크라인(AreaChart) 포함 카드 레이아웃 구현
- [x] `Dashboard.tsx`의 인라인 카드 JSX를 `<StatCard>` 호출로 교체
- [x] `ServiceDetail.tsx`의 인라인 카드 JSX를 `<StatCard>` 호출로 교체

### Task 1-4. 대시보드 스파크라인 데이터 매핑 수정
- [x] `Dashboard.tsx` `statCards` 배열의 `dataKey` 속성을 지표별로 분리
  - 전체 요청 수 → `'rps'`
  - 전체 작업 수 → `'spans_per_sec'` (또는 적합한 시계열 키)
  - 에러 발생률 → `'error_rate'`
  - 평균 응답 시간 → `'avg_latency_ms'`
- [x] 백엔드 `/api/stats` 응답의 `time_series` 필드에 해당 키들이 포함되는지 확인·보완

### Task 1-5. 대시보드 동적 RPS 계산 로직 적용
- [x] `Dashboard.tsx` 서비스 테이블의 `(svc.span_count / 3600)` 하드코딩 제거
- [x] 백엔드 응답에 `time_window_seconds` 또는 `rps` 메타 필드가 있는지 확인
- [x] 있으면 해당 값 사용, 없으면 시계열 데이터 첫/마지막 타임스탬프 차이를 기반으로 동적 계산

### Task 1-6. 검색 폼 접근성 개선 (`<form>` 래핑)
- [x] `Traces.tsx` — 서비스 이름 `<input>` + 조회 버튼을 `<form onSubmit>` 으로 감싸기
- [x] `Traces.tsx` — `onKeyDown` 핸들러 제거
- [x] `Logs.tsx` — 서비스 이름 + 본문 검색 `<input>` 영역을 `<form onSubmit>` 으로 감싸기
- [x] `Logs.tsx` — 기존 `onKeyDown` 핸들러가 있으면 제거

---

## Phase 2 — Performance (렌더링 성능 · 레이아웃 최적화)

### Task 2-1. 로그 뷰어 가상화 스크롤 적용
- [x] `react-virtuoso` 패키지 설치 (`npm install react-virtuoso`)
- [x] `Logs.tsx`의 `logs.map(...)` 렌더링을 `<Virtuoso>` 컴포넌트로 교체
- [x] `followOutput="smooth"` 옵션으로 실시간 스트리밍 시 자동 스크롤 구현
- [x] 기존 `max-h-[70vh] overflow-y-auto` 컨테이너를 `<Virtuoso>`의 `style` prop으로 대체
- [x] 빈 상태·로딩·에러 상태의 뷰는 `<Virtuoso>` 외부에서 기존 동작 유지

### Task 2-2. 워터폴 차트 레이아웃 개편 (TraceDetail)
- [x] `TraceDetail.tsx`의 라벨·타임라인 `w-1/3` / `w-2/3` 비율 분할 제거
- [x] 라벨 영역 → `w-64 shrink-0` (고정 너비 256px)
- [x] 타임라인 영역 → `flex-1 overflow-x-auto`
- [x] `min-w-[600px]` 제약 재검토 — 고정 라벨 영역이 확보되므로 줄이거나 제거

### Task 2-3. 워터폴 차트 활성 스팬 강조 개선
- [x] 선택 상태(`isSelected`)에 배경색을 더 뚜렷하게 변경 (`bg-blue-600/20`)
- [x] 선택된 스팬 행이 뷰포트 내에 자동으로 보이도록 `scrollIntoView` 호출 추가
- [x] (선택) 워터폴 차트의 큰 로직을 별도 컴포넌트(`WaterfallChart.tsx`)로 분리 검토

---

## Phase 3 — UX Enhancement (에러 알림 · 태그 UI)

### Task 3-1. Toast Notification 시스템 구축
- [x] 경량 Toast 라이브러리 선택 및 설치 (`react-hot-toast` 또는 직접 구현)
- [x] `AppLayout.tsx`에 `<Toaster />` 같은 글로벌 Toast 컨테이너 배치
- [x] `useToast()` 커스텀 훅 또는 직접 호출 패턴 정의
- [x] `Dashboard.tsx` — 폴링 실패 시 `StatusBanner` 대신 `toast.error()` 호출로 교체
- [x] `Logs.tsx` — 자동 갱신 실패 시 `StatusBanner` 대신 `toast.error()` 호출로 교체
- [x] `Traces.tsx` — 추가 로드 실패 시 `StatusBanner` 대신 `toast.error()` 호출로 교체
- [x] **주의**: 최초 로드 에러(`viewState === 'error'`)는 기존 `PageErrorState` 유지 — Toast로 대체하지 않음

### Task 3-2. 로그 속성(Attributes) 접기/펼치기 컴포넌트
- [x] `web/src/components/ui/LogAttributes.tsx` 파일 신규 생성
- [x] 기본 3개까지 속성 태그 표시, 초과 시 `+N 더보기` 버튼 노출
- [x] 버튼 클릭 시 `isExpanded` 상태 토글로 전체 표시 / 접기
- [x] `Logs.tsx`의 로그 아이템 내 속성 렌더링 로직을 `<LogAttributes>` 호출로 교체
- [x] `TraceDetail.tsx`의 메타데이터 사이드바 속성 영역에도 동일 적용 검토

---

## 완료 기준 (Definition of Done)

각 Task는 다음 기준을 모두 충족할 때 완료로 간주합니다.

- [x] 해당 변경으로 인한 기존 기능 회귀(regression) 없음 확인
- [x] 개발 서버(`npm run dev`)에서 정상 동작 확인
- [x] 모바일(375px) ~ 데스크톱(1440px) 뷰포트에서 레이아웃 깨짐 없음 확인
