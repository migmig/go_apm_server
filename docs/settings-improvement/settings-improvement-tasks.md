# 설정 화면 개선 - Tasks

> **관련 문서**: `settings-improvement-prd.md`, `settings-improvement-spec.md`

## Phase 13: 설정 화면 — 백엔드

- [x] **T-073**: `internal/config/config.go` — 모든 Config 구조체에 `json` 태그 추가
- [x] **T-074**: `internal/api/handler.go` — Handler 구조체 확장 (`cfg`, `startTime`, `NewHandler` 시그니처 변경)
- [x] **T-075**: `internal/api/handler.go` — `HandleGetConfig` 핸들러 추가
- [x] **T-076**: `internal/api/handler.go` — `HandleGetSystem` 핸들러 추가 (version, go_version, uptime, data_dir_size)
- [x] **T-077**: `internal/api/routes.go` — `GET /api/config`, `GET /api/system` 라우트 등록 + `NewServer` 시그니처 변경
- [x] **T-078**: `cmd/server/main.go` — `NewServer` 호출부에 `cfg` 전달
- [x] **T-079**: `internal/api/handler_test.go` — `setupTestServer` 수정 + `TestConfigEndpoint`, `TestSystemEndpoint` 추가

## Phase 14: 설정 화면 — 프론트엔드

- [x] **T-080**: `web/src/api/client.ts` — `AppConfig`, `SystemInfo` 타입 + `getConfig()`, `getSystem()` 추가
- [x] **T-081**: `web/src/pages/Settings.tsx` — 전면 개편 (2개 API 병렬 호출, 상태 분기)
- [x] **T-082**: `Settings.tsx` — 수집기 연결 설정 섹션 (포트 3개 + 상태 점)
- [x] **T-083**: `Settings.tsx` — 배치 프로세서 설정 섹션 (4개 설정값)
- [x] **T-084**: `Settings.tsx` — 스토리지 설정 섹션 (경로 + 보존 기간, 3일 이하 amber 경고)
- [x] **T-085**: `Settings.tsx` — 시스템 정보 섹션 (버전, Go 버전, OS, 가동 시간, 데이터 크기)

## Phase 15: 빌드 및 검증

- [x] **T-086**: 프론트엔드 빌드 (`npm run build`) ✅
- [x] **T-087**: Go 서버 빌드 (`go build` — embed 반영) ✅
- [x] **T-088**: API 검증
  - [x] `GET /api/config` → 200, 설정값 정상 반환
  - [x] `GET /api/system` → 200, 런타임 정보 정상 반환
  - [x] 테스트 8개 전부 통과 (TestConfig, TestSystem 포함)
- [ ] 수동 브라우저 검증 (사용자 확인 대기)
