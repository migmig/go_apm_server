# 설정 화면 개선 - Technical Specification

> **관련 PRD**: `settings-improvement-prd.md`
> **영향 범위**: `internal/api`, `cmd/server`, `web/src`

---

## 1. 백엔드 변경

### 1.1 Handler 구조체 확장

현재 `Handler`는 `store`만 주입받는다. Config 조회와 시스템 정보를 위해 필드를 추가한다.

**파일**: `internal/api/handler.go`

```go
type Handler struct {
    store     storage.Storage
    cfg       *config.Config
    startTime time.Time  // 서버 시작 시각 (uptime 계산용)
}

func NewHandler(store storage.Storage, cfg *config.Config) *Handler {
    return &Handler{
        store:     store,
        cfg:       cfg,
        startTime: time.Now(),
    }
}
```

> `NewHandler` 시그니처 변경 → `routes.go`, `handler_test.go`, `main.go` 호출부 수정 필요.

### 1.2 Config 조회 API

#### `GET /api/config`

**파일**: `internal/api/handler.go`

```go
func (h *Handler) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, h.cfg)
}
```

**응답 (200 OK)**:

```json
{
  "server": { "api_port": 8080 },
  "receiver": { "grpc_port": 4317, "http_port": 4318 },
  "processor": {
    "batch_size": 1000,
    "flush_interval": "2s",
    "queue_size": 10000,
    "drop_on_full": true
  },
  "storage": { "path": "./data/apm.db", "retention_days": 7 }
}
```

Config 구조체에 이미 `yaml` 태그가 있으나 JSON 직렬화 시 필드명이 다를 수 있다. `json` 태그를 추가하여 일관된 snake_case 키를 보장한다.

**파일**: `internal/config/config.go` — json 태그 추가

```go
type Config struct {
    Server    ServerConfig    `yaml:"server"    json:"server"`
    Receiver  ReceiverConfig  `yaml:"receiver"  json:"receiver"`
    Processor ProcessorConfig `yaml:"processor" json:"processor"`
    Storage   StorageConfig   `yaml:"storage"   json:"storage"`
}

type ServerConfig struct {
    APIPort int `yaml:"api_port" json:"api_port"`
}

type ReceiverConfig struct {
    GRPCPort int `yaml:"grpc_port" json:"grpc_port"`
    HTTPPort int `yaml:"http_port" json:"http_port"`
}

type ProcessorConfig struct {
    BatchSize     int    `yaml:"batch_size"      json:"batch_size"`
    FlushInterval string `yaml:"flush_interval"  json:"flush_interval"`
    QueueSize     int    `yaml:"queue_size"      json:"queue_size"`
    DropOnFull    bool   `yaml:"drop_on_full"    json:"drop_on_full"`
}

type StorageConfig struct {
    Path          string `yaml:"path"           json:"path"`
    RetentionDays int    `yaml:"retention_days" json:"retention_days"`
}
```

### 1.3 시스템 정보 API

#### `GET /api/system`

**파일**: `internal/api/handler.go`

```go
func (h *Handler) HandleGetSystem(w http.ResponseWriter, r *http.Request) {
    dataSize := calcDirSize(filepath.Dir(h.cfg.Storage.Path))

    writeJSON(w, http.StatusOK, map[string]any{
        "version":             "v0.1.0-alpha",
        "go_version":          runtime.Version(),
        "os":                  runtime.GOOS,
        "arch":                runtime.GOARCH,
        "uptime_seconds":      int(time.Since(h.startTime).Seconds()),
        "data_dir_size_bytes": dataSize,
    })
}

func calcDirSize(dir string) int64 {
    var size int64
    filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
        if err != nil || d.IsDir() {
            return nil
        }
        info, err := d.Info()
        if err == nil {
            size += info.Size()
        }
        return nil
    })
    return size
}
```

**응답 (200 OK)**:

```json
{
  "version": "v0.1.0-alpha",
  "go_version": "go1.22.4",
  "os": "darwin",
  "arch": "arm64",
  "uptime_seconds": 223920,
  "data_dir_size_bytes": 130547712
}
```

### 1.4 라우트 등록

**파일**: `internal/api/routes.go`

```go
mux.HandleFunc("GET /api/config", h.HandleGetConfig)
mux.HandleFunc("GET /api/system", h.HandleGetSystem)
```

### 1.5 NewHandler 호출부 수정

**파일**: `internal/api/routes.go`

```go
func NewServer(port int, store storage.Storage, cfg *config.Config) *http.Server {
    h := NewHandler(store, cfg)
    // ...
}
```

**파일**: `cmd/server/main.go` — `NewServer` 호출에 `cfg` 전달

**파일**: `internal/api/handler_test.go` — `setupTestServer`에서 `NewHandler(db, nil)` 또는 테스트용 Config 전달

---

## 2. 프론트엔드 변경

### 2.1 API 클라이언트 확장

**파일**: `web/src/api/client.ts`

```typescript
export interface AppConfig {
  server: { api_port: number };
  receiver: { grpc_port: number; http_port: number };
  processor: {
    batch_size: number;
    flush_interval: string;
    queue_size: number;
    drop_on_full: boolean;
  };
  storage: { path: string; retention_days: number };
}

export interface SystemInfo {
  version: string;
  go_version: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  data_dir_size_bytes: number;
}

export const api = {
  // ... 기존 ...
  getConfig: () => client.get<AppConfig>('/config').then(res => res.data),
  getSystem: () => client.get<SystemInfo>('/system').then(res => res.data),
};
```

### 2.2 Settings.tsx 전면 개편

**파일**: `web/src/pages/Settings.tsx`

#### 컴포넌트 구조

```
SettingsPage
├── 로딩/에러 상태 분기
└── ready 상태
    ├── 수집기 연결 설정 카드
    │   ├── gRPC 포트 (값 + 상태 점)
    │   ├── HTTP 포트 (값 + 상태 점)
    │   └── API 포트 (값 + 상태 점)
    ├── 배치 프로세서 설정 카드
    │   ├── 배치 크기
    │   ├── 플러시 간격
    │   ├── 큐 크기
    │   └── 큐 초과 시 드롭
    ├── 스토리지 설정 카드
    │   ├── 데이터 경로
    │   └── 보존 기간
    └── 시스템 정보 카드
        ├── 서버 버전
        ├── Go 버전
        ├── OS / Arch
        ├── 서버 가동 시간
        └── 데이터 디렉토리 크기
```

#### 상태 관리

```typescript
const [config, setConfig] = useState<AppConfig | null>(null);
const [system, setSystem] = useState<SystemInfo | null>(null);
const [loading, setLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState<string | null>(null);

useEffect(() => {
  async function fetchAll() {
    setLoading(true);
    try {
      const [cfg, sys] = await Promise.all([
        api.getConfig(),
        api.getSystem(),
      ]);
      setConfig(cfg);
      setSystem(sys);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, '설정 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }
  fetchAll();
}, []);
```

#### 설정 항목 렌더링 헬퍼

```tsx
function ConfigRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-b-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
```

#### 유틸리티 함수

```typescript
// 가동 시간 포맷
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d > 0 && `${d}일`, h > 0 && `${h}시간`, `${m}분`].filter(Boolean).join(' ');
}

// 파일 크기 포맷
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
```

---

## 3. 디자인 스펙

### 3.1 섹션 카드

```
rounded-xl border border-slate-800 bg-[#0f172a] p-5 md:p-6
```

- 카드 헤더: 아이콘 + 제목 (`text-lg font-semibold text-slate-100`)
- 설정 항목: `ConfigRow` — 좌측 label, 우측 value, 하단 구분선

### 3.2 레이아웃

```
grid grid-cols-1 lg:grid-cols-2 gap-6
```

- 모바일: 1열
- 데스크톱: 2열 (수집기+프로세서 / 스토리지+시스템)

### 3.3 상태 표시

포트 옆 상태 점:
```tsx
<div className="flex items-center gap-2">
  <span className="font-mono text-slate-100">{port}</span>
  <div className="h-2 w-2 rounded-full bg-emerald-500" />
  <span className="text-xs text-emerald-400">수신 대기 중</span>
</div>
```

### 3.4 보존 기간 경고

```typescript
const retentionWarning = config.storage.retention_days <= 3;
// retentionWarning 시 값 색상: text-amber-400
```

---

## 4. 파일 변경 목록

| 작업 | 파일 | 변경 유형 |
|------|------|----------|
| Config에 json 태그 추가 | `internal/config/config.go` | 수정 |
| Handler 구조체 확장 | `internal/api/handler.go` | 수정 |
| HandleGetConfig 추가 | `internal/api/handler.go` | 수정 |
| HandleGetSystem 추가 | `internal/api/handler.go` | 수정 |
| 라우트 등록 | `internal/api/routes.go` | 수정 |
| NewServer 시그니처 변경 | `internal/api/routes.go` | 수정 |
| main.go 호출부 수정 | `cmd/server/main.go` | 수정 |
| 테스트 setupTestServer 수정 | `internal/api/handler_test.go` | 수정 |
| API 클라이언트 타입/함수 추가 | `web/src/api/client.ts` | 수정 |
| 설정 페이지 전면 개편 | `web/src/pages/Settings.tsx` | 수정 |

**신규 파일**: 0개
**수정 파일**: 8개

---

## 5. 테스트

### 5.1 백엔드

```go
func TestConfigEndpoint(t *testing.T) {
    // GET /api/config → 200
    // 응답에 server.api_port, receiver.grpc_port 등 존재 확인
}

func TestSystemEndpoint(t *testing.T) {
    // GET /api/system → 200
    // 응답에 version, go_version, uptime_seconds 등 존재 확인
}
```

### 5.2 수동 검증 체크리스트

- [ ] 설정 페이지 접속 시 4개 섹션 카드 정상 표시
- [ ] 수집기 설정: 포트 3개 + 상태 점 표시
- [ ] 배치 프로세서: 4개 설정값 표시
- [ ] 스토리지: 경로 + 보존 기간 표시
- [ ] 시스템 정보: 버전, Go 버전, OS, 가동 시간, 데이터 크기 표시
- [ ] 가동 시간 포맷 정상 (`1일 2시간 30분`)
- [ ] 데이터 크기 포맷 정상 (`124.5 MB`)
- [ ] 로딩 상태 표시
- [ ] API 실패 시 에러 상태 표시
