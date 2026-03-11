# 서비스 상세 페이지 UI 개선 PRD

## 1. 개요

대시보드의 "서비스별 성능 현황" 테이블에서 서비스 이름을 클릭하면 해당 서비스의 상세 페이지(`/services/:serviceName`)로 이동하는 기능을 추가한다.

## 2. 배경 및 목적

- **현재 상태**: 대시보드에서 서비스 이름은 일반 텍스트로 표시되며, 클릭 시 아무 동작 없음
- **목표**: 서비스별 성능 지표, 트레이스, 로그를 한 페이지에서 모아볼 수 있는 서비스 상세 페이지 제공
- **기대 효과**: 특정 서비스의 상태를 빠르게 파악하고, 관련 트레이스/로그를 바로 조회할 수 있음

## 3. 변경 범위

### 3.1 프론트엔드 변경

#### 3.1.1 대시보드 서비스 테이블 링크화
- **파일**: `web/src/pages/Dashboard.tsx` (278~283번 줄)
- **변경**: 서비스 이름(`svc.name`)을 `<Link to={/services/${svc.name}}>` 으로 감싸기
- **스타일**: hover 시 밑줄 + 파란색 텍스트로 클릭 가능함을 표시

#### 3.1.2 서비스 상세 페이지 신규 생성
- **파일**: `web/src/pages/ServiceDetail.tsx` (신규)
- **라우트**: `/services/:serviceName`

**페이지 구성:**

```
┌─────────────────────────────────────────────────────────┐
│ ← 뒤로가기    서비스명 (backend)       [상태 배지]        │
│               span 수 / 에러율 / 평균 응답시간             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Span 수  │ │ 에러 수  │ │ 평균 응답 │ │ P99 응답 │   │
│  │  1,234   │ │    12    │ │ 45.2ms   │ │ 320ms    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  최근 트레이스 (이 서비스 관련)                  [전체보기] │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 시간 | Trace ID | 작업명 | 소요시간 | 상태      │    │
│  │ ...  | ...      | ...    | ...      | ...       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  최근 로그 (이 서비스 관련)                      [전체보기] │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 시간 | 레벨 | 내용                               │    │
│  │ ...  | ...  | ...                                │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**섹션 상세:**

| 섹션 | 데이터 소스 | 설명 |
|------|-----------|------|
| 헤더 | `GET /api/services` 결과에서 해당 서비스 필터 | 서비스명, 상태 배지(정상/위급), 뒤로가기 링크 |
| 요약 카드 (4개) | `ServiceInfo` 모델 | span_count, error_count, avg_latency_ms, p99_latency_ms |
| 최근 트레이스 | `GET /api/traces?service={name}&limit=10` | 해당 서비스의 최근 트레이스 10건, "전체보기" 클릭 시 `/traces?service={name}` 이동 |
| 최근 로그 | `GET /api/logs?service={name}&limit=10` | 해당 서비스의 최근 로그 10건, "전체보기" 클릭 시 `/logs?service={name}` 이동 |

#### 3.1.3 라우트 등록
- **파일**: `web/src/App.tsx`
- **추가**: `<Route path="/services/:serviceName" element={<ServiceDetail />} />`

#### 3.1.4 네비게이션 브레드크럼
- 기존 `AppLayout.tsx`의 브레드크럼 패턴 활용
- 경로: `홈 > 모니터링 > 서비스명`

### 3.2 백엔드 변경

#### 3.2.1 서비스 단건 조회 API (신규)
- **엔드포인트**: `GET /api/services/:serviceName`
- **파일**: `internal/api/handler.go`, `internal/api/routes.go`
- **응답 형식**:
```json
{
  "name": "backend",
  "span_count": 1234,
  "error_count": 12,
  "avg_latency_ms": 45.23,
  "p95_latency_ms": 180.50,
  "p99_latency_ms": 320.10
}
```
- **구현**: 기존 `GetServices()`에서 반환하는 `[]ServiceInfo` 중 name이 일치하는 항목 필터링. 또는 `Storage` 인터페이스에 `GetServiceByName(ctx, name)` 추가

#### 3.2.2 기존 API 활용 (변경 불필요)
- `GET /api/traces?service={name}` — 이미 `TraceFilter.ServiceName` 필터 지원됨
- `GET /api/logs?service={name}` — 이미 `LogFilter.ServiceName` 필터 지원됨

## 4. 구현 태스크

### Phase 1: 백엔드 (난이도: 낮음)
- [ ] `handler.go`에 `HandleGetServiceDetail` 핸들러 추가
- [ ] `routes.go`에 `GET /api/services/{serviceName}` 라우트 등록
- [ ] (선택) `Storage` 인터페이스에 `GetServiceByName` 추가 또는 기존 `GetServices` 결과 필터링

### Phase 2: 프론트엔드 — 페이지 생성 (난이도: 중간)
- [ ] `web/src/pages/ServiceDetail.tsx` 생성
  - [ ] 헤더 섹션 (서비스명, 상태 배지, 뒤로가기)
  - [ ] 요약 카드 4개 (span 수, 에러 수, 평균 응답, P99 응답)
  - [ ] 최근 트레이스 테이블 (10건, 기존 `TraceList` 컴포넌트 재활용)
  - [ ] 최근 로그 테이블 (10건, 기존 로그 컴포넌트 재활용)
  - [ ] 로딩/에러/빈 데이터 상태 처리 (기존 `PageState` 컴포넌트 활용)
- [ ] `web/src/api/client.ts`에 API 함수 추가
  - `getServiceByName(name: string)` → `GET /api/services/{name}`
- [ ] `web/src/App.tsx`에 라우트 추가

### Phase 3: 대시보드 링크 연결 (난이도: 낮음)
- [ ] `web/src/pages/Dashboard.tsx`의 서비스 이름을 `<Link>` 로 변경
- [ ] hover 스타일 적용 (cursor-pointer, text-blue-400 등)

### Phase 4: 빌드 및 검증
- [ ] `npm run build` 프론트엔드 빌드
- [ ] `go build` 서버 빌드 (embed 반영)
- [ ] 브라우저에서 동작 확인

## 5. 디자인 가이드라인

- 기존 프로젝트의 디자인 시스템 준수:
  - 배경색: `bg-[#0f172a]`, 보더: `border-slate-800`
  - 카드: `rounded-xl border border-slate-800 bg-[#0f172a] shadow-sm`
  - 텍스트: 제목 `text-slate-100`, 본문 `text-slate-400`, 레이블 `text-slate-500`
  - 폰트: 수치 데이터에 `font-mono`, 레이블에 `uppercase tracking-widest`
  - 상태 배지: 정상 `emerald`, 위급 `rose`
- `TraceDetail.tsx` 페이지의 레이아웃 패턴을 참고하여 일관된 UX 유지
- 반응형: 모바일에서는 카드 1열, 데스크톱에서는 4열 그리드

## 6. 기존 코드 재활용

| 재활용 대상 | 원본 위치 | 용도 |
|------------|----------|------|
| `PageLoadingState`, `PageErrorState`, `PageEmptyState` | `components/PageState` | 로딩/에러/빈 상태 |
| `StatCard` | `components/dashboard/StatCard.tsx` | 요약 지표 카드 |
| `TraceList` (테이블 부분) | `components/traces/TraceList.tsx` | 최근 트레이스 목록 |
| `LogItem` | `components/logs/LogItem.tsx` | 최근 로그 목록 |
| `getAsyncViewState` | `lib/request-state.ts` | 비동기 뷰 상태 관리 |

## 7. 제외 범위 (추후 고려)

- 서비스별 시계열 차트 (RPS/에러율 트렌드) — 별도 API 필요
- 서비스 의존성 맵 (서비스 간 호출 관계 시각화)
- 서비스별 알림 설정
