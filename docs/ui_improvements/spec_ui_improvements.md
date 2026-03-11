# APM Server Web UI 개선사항 기술 명세서 (Technical Specification)

본 문서는 `prd_ui_improvements.md`에서 정의된 UI/UX 및 성능 개선 요구사항을 실제 코드로 구현하기 위한 기술적 세부 설계 및 작업 명세를 다룹니다.

## 1. 아키텍처 및 디렉토리 구조 변경
새롭게 추가되거나 리팩토링될 주요 파일들의 목록입니다. 

```text
web/src/
├── components/
│   ├── ui/
│   │   ├── StatCard.tsx        # (신규) 통계 카드 공통 컴포넌트
│   │   ├── Toast.tsx           # (신규) 비간섭형 에러 알림 컴포넌트
│   │   └── LogAttributes.tsx   # (신규) 접기/펼치기 기능이 포함된 로그 속성 컴포넌트
│   └── traces/
│       └── WaterfallChart.tsx  # (리팩토링) 복잡해진 워터폴 차트를 분리
│
├── lib/
│   ├── health.ts               # (신규) 서비스 위급 상태 판별 로직
│   └── theme.ts                # (신규) 상태 및 심각도 색상 디자인 토큰
│
└── pages/
    ├── Dashboard.tsx           # (수정) StatCard 및 동적 RPS 매핑 변경
    ├── ServiceDetail.tsx       # (수정) StatCard 및 health.ts 적용
    ├── TraceDetail.tsx         # (수정) 레이아웃 고정 너비 및 활성 스팬 강조 적용
    └── Logs.tsx                # (수정) react-virtuoso 적용 및 form 이벤트 전환
```

## 2. 세부 구현 사항

### 2.1. 컴포넌트 및 로직 공통화
**A. `StatCard.tsx` 구현**
- `Dashboard`와 `ServiceDetail`에 중복된 카드 UI를 통일합니다.
- **Props Interface**:
  ```typescript
  interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    colorClass: string;   // ex: 'text-blue-400'
    bgClass: string;      // ex: 'bg-blue-500/10'
    warning?: boolean;    // 경고(위험) 상태 여부
    chartData?: any[];    // 스파크라인을 위한 시계열 데이터
    dataKey?: string;     // 스파크라인에서 사용할 데이터 키
  }
  ```

**B. `lib/health.ts` (서비스 상태 판별)**
- 기준치를 상수로 추출하고, `Dashboard` 및 `ServiceDetail`에서 공통 호출합니다.
  ```typescript
  const HEALTH_THRESHOLDS = {
    ERROR_RATE: 0.05,
    AVG_LATENCY_MS: 500,
  };

  export function getServiceHealth(spanCount: number, errorCount: number, avgLatencyMs: number): { isUnhealthy: boolean; errorRate: number } {
    const errorRate = spanCount > 0 ? errorCount / spanCount : 0;
    const isUnhealthy = errorRate > HEALTH_THRESHOLDS.ERROR_RATE || avgLatencyMs > HEALTH_THRESHOLDS.AVG_LATENCY_MS;
    return { isUnhealthy, errorRate };
  }
  ```

**C. `lib/theme.ts` (색상 토큰화)**
- 로그의 `severity_number`나 HTTP 상태 코드에 맞춰 공통 스타일 객체나 함수를 반환합니다.
- 예: `getLogSeverityColor(number)`, `getTraceStatusColor(statusCode)`

### 2.2. 대시보드 데이터 표현 개선
**A. 동적 RPS 계산 로직 변경**
- **문제점**: `(svc.span_count / 3600).toFixed(2)`의 고정 계산식 제거. 
- **해결책**: 백엔드 API 단에서 조회된 시계열 데이터의 범위를 내려주거나, 응답에 포함된 메타데이터(윈도우 사이즈)를 활용. 프론트엔드에서는 윈도우 사이즈가 없을 경우 임시로 최신 데이터의 타임스탬프 차이를 이용해 계산합니다.

**B. 스파크라인 데이터 매핑**
- `TimeSeries` API 응답 포맷에 `total_traces`, `total_spans`, `avg_latency` 필드가 제공됨을 확인/보장해야 합니다.
- `Dashboard.tsx`의 `statCards` 배열 구성 시 `dataKey`를 각각 명확하게 할당합니다.
  - 전체 요청 수 ➔ `dataKey: 'rps'` (또는 `traces_per_sec`)
  - 전체 작업 수 ➔ `dataKey: 'spans_per_sec'`
  - 에러 발생률 ➔ `dataKey: 'error_rate'`
  - 평균 응답 시간 ➔ `dataKey: 'avg_latency_ms'`

### 2.3. 트레이스 뷰(Waterfall Chart) 레이아웃 및 성능 개선
**A. 고정 라벨 영역 & 반응형 스크롤**
- `<div className="w-1/3">` 방식을 제거하고, `<div className="w-64 shrink-0">`(고정 폭)와 `<div className="flex-1 overflow-x-auto">`(동적 폭 및 스크롤) 구조로 개편합니다.
- 브라우저 크기를 줄여도 좌측 메뉴 이름이 잘리지 않으며, 우측 타임라인만 스크롤 되도록 `flex-nowrap` 구조를 사용합니다.

**B. 활성화(Active) 스팬 하이라이팅 개선**
- 선택된 스팬(`isSelected === true`)일 경우 명도 대비가 뚜렷한 배경색(`bg-blue-600/20 ring-1 ring-blue-500`)을 적용합니다. 

### 2.4. 로그 뷰어 최적화
**A. 리스트 가상화 (`react-virtuoso` 도입)**
- 의존성 설치: `npm install react-virtuoso`
- 수백/수천 건의 로그 배열을 DOM에 모두 그리지 않고 보이지 않는 영역은 메모리에만 두도록 렌더링을 최적화.
  ```tsx
  import { Virtuoso } from 'react-virtuoso';

  export default function Logs() {
    // ...
    return (
      <Virtuoso
        data={logs}
        itemContent={(index, log) => <LogRow log={log} />}
        followOutput={"smooth"} // 자동 스크롤
      />
    );
  }
  ```

**B. 속성(Attributes) 오버플로우 제어**
- `LogAttributes.tsx` 컴포넌트 생성.
- `Object.entries(log.attributes).length > 3` 인 경우 `isExpanded` 상태 연동.
- 최초 3개 표시 후 `+N 더보기` 버튼 활성화.

### 2.5. UX 및 접근성 최적화
**A. 폼(Form) 접근성 강화**
- `Traces.tsx`와 `Logs.tsx`의 `<input>` 필드 묶음을 `<form>` 단위로 묶어 `Enter` 검색이 기본 동작하도록 설정.
- `<input onKeyDown={(e) => e.key === 'Enter' && handleSearch()}>` 제거.
  ```tsx
  <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex ...">
    <input type="text" ... />
    <button type="submit">조회하기</button>
  </form>
  ```

**B. Toast Notification 구축**
- UI 라이브러리(`react-hot-toast` 또는 경량 직접 구현) 사용.
- 웹소켓 단절이나 API 오류 시 상단을 밀어버리는 `StatusBanner` 대신, 우측 하단이나 상단에 플로팅되는 토스트 형태의 알림으로 대체.
- 사용 함수: `useToast()`와 같은 훅을 만들어 `catch(err)` 구문 내에서 `toast.error(message)` 방식으로 처리.

## 3. 작업 우선순위 (마일스톤 대응)

| 작업 내역 | 대상 파일 | 난이도 | 우선순위 |
|-----------|-----------|-------|:------:|
| `lib/health.ts` 및 `lib/theme.ts` 추출 | `web/src/lib/*` | 하 | P1 |
| `<StatCard>` 공통 컴포넌트화 | `StatCard.tsx`, `Dashboard.tsx`, `ServiceDetail.tsx` | 하 | P1 |
| 대시보드 스파크라인/RPS 동적 맵핑 수정 | `Dashboard.tsx` | 중 | P1 |
| 검색 입력 폼(`<form>`) 전환 | `Logs.tsx`, `Traces.tsx` | 하 | P1 |
| 워터폴 차트 레이아웃 분리 및 수정 | `TraceDetail.tsx`, `WaterfallChart.tsx` | 중 | P2 |
| `react-virtuoso` 적용 (Logs) | `Logs.tsx`, `package.json` | 상 | P2 |
| 로그 속성 접기 컴포넌트 개발 | `LogAttributes.tsx`, `Logs.tsx` | 하 | P2 |
| 토스트 알림 라이브러리 교체 | 전역/API 훅, `AppLayout.tsx` | 상 | P3 |
