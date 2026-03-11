# 서비스 상세 페이지 - Technical Specification

> **관련 PRD**: `service-detail-prd.md`
> **영향 범위**: `internal/api`, `internal/storage`, `web/src`

---

## 1. 백엔드 변경

### 1.1 Storage 인터페이스 확장

`internal/storage/sqlite.go`의 `Storage` 인터페이스에 메서드 1개 추가:

```go
type Storage interface {
    // ... 기존 메서드 유지 ...

    // Services
    GetServices(ctx context.Context) ([]ServiceInfo, error)
    GetServiceByName(ctx context.Context, name string) (*ServiceInfo, error) // 신규
}
```

### 1.2 `GetServiceByName` 구현

`internal/storage/sqlite.go`에 추가. 기존 `GetServices()` 쿼리를 기반으로 `WHERE service_name = ?` 조건만 추가한다.

```go
func (s *SQLiteStorage) GetServiceByName(ctx context.Context, name string) (*ServiceInfo, error) {
    // 모든 파티션 DB를 순회하며 해당 서비스의 집계 데이터를 조회
    // 기존 GetServices()의 쿼리 로직 재활용, WHERE service_name = ? 추가
    //
    // 집계 항목: span_count, error_count, avg_latency_ms, p95_latency_ms, p99_latency_ms
    //
    // 서비스가 존재하지 않으면 nil, nil 반환 (에러 아님)
}
```

**SQL 쿼리** (기존 `GetServices` 쿼리에서 파생):

```sql
SELECT
    COUNT(*)                            AS span_count,
    SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) AS error_count,
    AVG(duration_ns / 1e6)              AS avg_latency_ms
FROM spans
WHERE service_name = ?
```

P95/P99 계산은 기존 `GetServices()`와 동일한 방식 사용.

### 1.3 API 엔드포인트

#### `GET /api/services/{serviceName}`

**파일**: `internal/api/handler.go`

```go
func (h *Handler) HandleGetServiceDetail(w http.ResponseWriter, r *http.Request) {
    serviceName := r.PathValue("serviceName")
    if serviceName == "" {
        writeError(w, http.StatusBadRequest, "serviceName required")
        return
    }

    svc, err := h.store.GetServiceByName(r.Context(), serviceName)
    if err != nil {
        writeError(w, http.StatusInternalServerError, err.Error())
        return
    }
    if svc == nil {
        writeError(w, http.StatusNotFound, "service not found")
        return
    }

    writeJSON(w, http.StatusOK, svc)
}
```

**응답 (200 OK)**:

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

**에러 응답**:

| 상태 코드 | 조건 | 응답 |
|----------|------|------|
| 400 | serviceName 비어있음 | `{"error": "serviceName required"}` |
| 404 | 서비스 미존재 | `{"error": "service not found"}` |
| 500 | DB 오류 | `{"error": "<message>"}` |

#### 라우트 등록

**파일**: `internal/api/routes.go`

```go
mux.HandleFunc("GET /api/services/{serviceName}", h.HandleGetServiceDetail)
```

> 기존 `GET /api/services` (목록)와 충돌하지 않음. Go 1.22+ `net/http` 패턴 매칭에서 구체적 패턴이 우선함.

### 1.4 기존 API 활용 (변경 없음)

서비스 상세 페이지에서 트레이스/로그 조회 시 기존 API를 그대로 사용:

| 용도 | 엔드포인트 | 쿼리 |
|------|-----------|------|
| 서비스의 최근 트레이스 | `GET /api/traces` | `?service={name}&limit=10` |
| 서비스의 최근 로그 | `GET /api/logs` | `?service={name}&limit=10` |

---

## 2. 프론트엔드 변경

### 2.1 API 클라이언트 확장

**파일**: `web/src/api/client.ts`

```typescript
export const api = {
  // ... 기존 메서드 유지 ...
  getServiceByName: (name: string) =>
    client.get<ServiceInfo>(`/services/${encodeURIComponent(name)}`).then(res => res.data),
};
```

`encodeURIComponent`로 서비스명에 포함될 수 있는 특수문자(`.`, `/` 등)를 인코딩한다.

### 2.2 라우트 추가

**파일**: `web/src/App.tsx`

```tsx
import ServiceDetail from './pages/ServiceDetail';

// Routes 안에 추가
<Route path="/services/:serviceName" element={<ServiceDetail />} />
```

### 2.3 서비스 상세 페이지

**파일**: `web/src/pages/ServiceDetail.tsx` (신규)

#### 컴포넌트 구조

```
ServiceDetail
├── 헤더 섹션
│   ├── 뒤로가기 링크 (→ /)
│   ├── 서비스명
│   └── 상태 배지 (정상/위급)
├── 요약 카드 그리드 (4열)
│   ├── StatCard: Span 수 (span_count)
│   ├── StatCard: 에러 수 (error_count)
│   ├── StatCard: 평균 응답시간 (avg_latency_ms)
│   └── StatCard: P99 응답시간 (p99_latency_ms)
├── 최근 트레이스 섹션
│   ├── 섹션 헤더 + "전체보기" 링크 (→ /traces?service={name})
│   └── TraceList (최대 10건)
└── 최근 로그 섹션
    ├── 섹션 헤더 + "전체보기" 링크 (→ /logs?service={name})
    └── LogItem 목록 (최대 10건)
```

#### 상태 관리

```typescript
const { serviceName } = useParams();

// 3개의 API를 병렬 호출
const [service, setService] = useState<ServiceInfo | null>(null);
const [traces, setTraces] = useState<TraceSummary[]>([]);
const [logs, setLogs] = useState<LogRecord[]>([]);
const [loading, setLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState<string | null>(null);

useEffect(() => {
  async function fetchAll() {
    setLoading(true);
    try {
      const [svc, tracesRes, logsRes] = await Promise.all([
        api.getServiceByName(serviceName!),
        client.get('/traces', { params: { service: serviceName, limit: 10 } }),
        client.get('/logs', { params: { service: serviceName, limit: 10 } }),
      ]);
      setService(svc);
      setTraces(tracesRes.data.traces ?? []);
      setLogs(logsRes.data.logs ?? []);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, '서비스 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }
  fetchAll();
}, [serviceName]);
```

#### 뷰 상태 분기

기존 `PageLoadingState`, `PageErrorState`, `PageEmptyState` 컴포넌트를 활용하여 `getAsyncViewState()`로 분기:

| 상태 | 화면 |
|------|------|
| `loading` | `PageLoadingState` — "서비스 정보를 불러오는 중입니다" |
| `error` | `PageErrorState` — 에러 메시지 + 재시도 버튼 |
| `empty` | `PageEmptyState` — "서비스 데이터가 없습니다" |
| `ready` | 전체 페이지 렌더링 |

#### 건강 상태 판정 (기존 대시보드 로직과 동일)

```typescript
const errorRate = svc.span_count > 0 ? svc.error_count / svc.span_count : 0;
const isUnhealthy = errorRate > 0.05 || svc.avg_latency_ms > 500;
```

### 2.4 대시보드 서비스 테이블 링크화

**파일**: `web/src/pages/Dashboard.tsx` (278~283번 줄)

**Before:**

```tsx
<td className="whitespace-nowrap px-4 py-4 md:px-6 lg:px-8">
  <div className="flex items-center">
    <div className={`w-2 h-2 rounded-full mr-3 ...`}></div>
    <span className="text-sm font-bold text-slate-200">{svc.name}</span>
  </div>
</td>
```

**After:**

```tsx
<td className="whitespace-nowrap px-4 py-4 md:px-6 lg:px-8">
  <div className="flex items-center">
    <div className={`w-2 h-2 rounded-full mr-3 ...`}></div>
    <Link
      to={`/services/${svc.name}`}
      className="text-sm font-bold text-slate-200 hover:text-blue-400 transition-colors"
    >
      {svc.name}
    </Link>
  </div>
</td>
```

### 2.5 브레드크럼 네비게이션

**파일**: `web/src/components/AppLayout.tsx` (기존 패턴 활용)

`/services/:serviceName` 경로에 대한 브레드크럼:

```
홈 > 모니터링 > {serviceName}
```

`web/src/lib/navigation.ts`에 서비스 상세 경로의 breadcrumb 매핑 추가.

---

## 3. 디자인 스펙

### 3.1 레이아웃

```
헤더:           px-4 py-4, rounded-xl, border-slate-800, bg-[#0f172a]
요약 카드:       grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
트레이스 섹션:   rounded-xl, border-slate-800, bg-[#0f172a], overflow-hidden
로그 섹션:       rounded-xl, border-slate-800, bg-[#0f172a], overflow-hidden
```

### 3.2 헤더 디자인

`TraceDetail.tsx`의 헤더 패턴을 따름:

- 좌측: `<ChevronLeft>` 뒤로가기 (→ `/`)
- 중앙: 서비스명 (`text-lg font-bold text-slate-100 font-mono`) + 상태 배지
- 하단: span 수, 에러율, 평균 응답시간 요약 텍스트

### 3.3 상태 배지

```tsx
// 정상
<span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded border border-emerald-500/20 uppercase tracking-widest">
  정상
</span>

// 위급
<span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-xs font-bold rounded border border-rose-500/20 uppercase tracking-widest">
  위급
</span>
```

### 3.4 섹션 헤더 + 전체보기 링크

```tsx
<div className="flex items-center justify-between border-b border-slate-800 px-4 py-6 md:px-6 lg:px-8">
  <h2 className="text-lg font-semibold text-slate-200 flex items-center">
    <Layers className="mr-3 text-blue-500" size={20} />
    최근 트레이스
  </h2>
  <Link
    to={`/traces?service=${serviceName}`}
    className="text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest"
  >
    전체 보기 →
  </Link>
</div>
```

### 3.5 반응형 breakpoint

| Breakpoint | 요약 카드 | 트레이스 테이블 | 로그 목록 |
|-----------|----------|---------------|----------|
| `< md` (모바일) | 1열 | 카드형 (`TraceMobileCard`) | 축약 표시 |
| `md ~ lg` | 2열 | 테이블 | 전체 표시 |
| `>= lg` | 4열 | 테이블 | 전체 표시 |

---

## 4. 컴포넌트 재활용 매핑

| 필요 기능 | 재활용 컴포넌트 | 원본 파일 |
|----------|---------------|----------|
| 요약 카드 | `StatCard` | `web/src/components/dashboard/StatCard.tsx` |
| 트레이스 목록 | `TraceList` (TraceTable + TraceMobileCard) | `web/src/components/traces/TraceList.tsx` |
| 로그 목록 | `LogItem` | `web/src/components/logs/LogItem.tsx` |
| 로딩/에러/빈 상태 | `PageLoadingState`, `PageErrorState`, `PageEmptyState` | `web/src/components/PageState.tsx` |
| 비동기 뷰 상태 | `getAsyncViewState` | `web/src/lib/request-state.ts` |
| 에러 메시지 추출 | `getErrorMessage` | `web/src/lib/request-state.ts` |

---

## 5. 파일 변경 목록

| 작업 | 파일 | 변경 유형 |
|------|------|----------|
| Storage 인터페이스 확장 | `internal/storage/sqlite.go` | 수정 |
| `GetServiceByName` 구현 | `internal/storage/sqlite.go` | 수정 |
| API 핸들러 추가 | `internal/api/handler.go` | 수정 |
| 라우트 등록 | `internal/api/routes.go` | 수정 |
| API 클라이언트 확장 | `web/src/api/client.ts` | 수정 |
| 프론트엔드 라우트 추가 | `web/src/App.tsx` | 수정 |
| 서비스 상세 페이지 | `web/src/pages/ServiceDetail.tsx` | **신규** |
| 대시보드 링크화 | `web/src/pages/Dashboard.tsx` | 수정 |
| 브레드크럼 매핑 | `web/src/lib/navigation.ts` | 수정 |

**신규 파일**: 1개 (`ServiceDetail.tsx`)
**수정 파일**: 8개

---

## 6. 테스트

### 6.1 백엔드

```go
// internal/api/handler_test.go에 추가

func TestGetServiceDetail(t *testing.T) {
    h, db := setupTestServer(t)
    // 테스트 span 삽입
    // GET /api/services/backend → 200, ServiceInfo 응답 검증
}

func TestGetServiceDetail_NotFound(t *testing.T) {
    h, _ := setupTestServer(t)
    // GET /api/services/nonexistent → 404
}
```

### 6.2 수동 검증 체크리스트

- [ ] 대시보드 서비스 테이블에서 서비스 이름 hover 시 스타일 변경
- [ ] 서비스 이름 클릭 → `/services/{name}` 이동
- [ ] 서비스 상세 페이지: 요약 카드 4개 정상 표시
- [ ] 서비스 상세 페이지: 최근 트레이스 10건 표시
- [ ] 서비스 상세 페이지: 최근 로그 10건 표시
- [ ] "전체 보기" 클릭 → 트레이스/로그 페이지로 서비스 필터 적용 이동
- [ ] 뒤로가기 버튼 → 대시보드 이동
- [ ] 존재하지 않는 서비스명 → 404 에러 상태 표시
- [ ] 모바일 반응형 레이아웃 정상 동작
- [ ] 브레드크럼 네비게이션 정상 표시
