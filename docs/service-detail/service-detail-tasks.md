# 서비스 상세 페이지 - Tasks

> **관련 문서**: `service-detail-prd.md`, `service-detail-spec.md`

## Phase 8: 서비스 상세 페이지 — 백엔드

- [x] **T-056**: `internal/storage/sqlite.go` — `Storage` 인터페이스에 `GetServiceByName(ctx, name) (*ServiceInfo, error)` 메서드 추가
- [x] **T-057**: `internal/storage/sqlite.go` — `GetServiceByName` 구현
  - 기존 `GetServices()` 쿼리 기반, `WHERE service_name = ?` 조건 추가
  - 모든 파티션 DB 순회하여 span_count, error_count, avg_latency_ms, p95_latency_ms, p99_latency_ms 집계
  - 서비스 미존재 시 `nil, nil` 반환
- [x] **T-058**: `internal/api/handler.go` — `HandleGetServiceDetail` 핸들러 추가
  - `r.PathValue("serviceName")` 으로 서비스명 추출
  - 200 OK: ServiceInfo JSON / 400: serviceName 누락 / 404: 서비스 미존재 / 500: DB 오류
- [x] **T-059**: `internal/api/routes.go` — `GET /api/services/{serviceName}` 라우트 등록
  - 기존 `GET /api/services` (목록)와 충돌 없음 확인

## Phase 9: 서비스 상세 페이지 — 프론트엔드 기반

- [x] **T-060**: `web/src/api/client.ts` — API 함수 추가
  - `getServiceByName(name: string)` → `GET /api/services/${encodeURIComponent(name)}`
- [x] **T-061**: `web/src/App.tsx` — 라우트 추가
  - `<Route path="/services/:serviceName" element={<ServiceDetail />} />`
- [x] **T-062**: `web/src/lib/navigation.ts` — 브레드크럼 매핑 추가
  - `/services/:serviceName` → `홈 > 모니터링 > 대시보드 > {serviceName}`

## Phase 10: 서비스 상세 페이지 — UI 구현

- [x] **T-063**: `web/src/pages/ServiceDetail.tsx` — 페이지 스켈레톤 생성
  - `useParams()`로 serviceName 추출
  - 3개 API 병렬 호출 (서비스 정보 + 트레이스 + 로그)
  - `getAsyncViewState()`로 loading/error/empty/ready 상태 분기
- [x] **T-064**: `ServiceDetail.tsx` — 헤더 섹션
  - 뒤로가기 링크 (`<ChevronLeft>` → `/`)
  - 서비스명 (`font-mono text-lg font-bold`)
  - 상태 배지 (정상: emerald / 위급: rose)
  - 요약 텍스트 (span 수, 에러율, 평균 응답시간)
- [x] **T-065**: `ServiceDetail.tsx` — 요약 카드 섹션
  - 인라인 카드 구현 (대시보드 패턴 활용)
  - 4열 그리드: Span 수 / 에러 수 / 평균 응답시간 / P99 응답시간
  - 반응형: 모바일 1열 → md 2열 → lg 4열
- [x] **T-066**: `ServiceDetail.tsx` — 최근 트레이스 섹션
  - 섹션 헤더 + "전체 보기" 링크 (→ `/traces?service={name}`)
  - 기존 `TraceList` 컴포넌트 재활용 (최대 10건)
  - 데이터 없을 시 빈 상태 메시지 표시
- [x] **T-067**: `ServiceDetail.tsx` — 최근 로그 섹션
  - 섹션 헤더 + "전체 보기" 링크 (→ `/logs?service={name}`)
  - 기존 `LogItem` 컴포넌트 재활용 (최대 10건)
  - 데이터 없을 시 빈 상태 메시지 표시

## Phase 11: 대시보드 연결

- [x] **T-068**: `web/src/pages/Dashboard.tsx` — 서비스 테이블 링크화
  - 서비스 이름 `<span>` → `<Link to={/services/${svc.name}}>` 변경
  - hover 스타일: `text-slate-200 hover:text-blue-400 transition-colors`

## Phase 12: 빌드 및 검증

- [x] **T-069**: 프론트엔드 빌드 (`npm run build`)
- [x] **T-070**: Go 서버 빌드 (`go build` — embed 반영)
- [ ] **T-071**: 수동 검증 (브라우저 MCP 연결 불안정으로 대기 중)
  - [x] API 검증: 서비스 상세/트레이스/로그 3개 API 정상 응답
  - [x] SPA 라우팅: `/services/backend` → 200 (index.html 서빙)
  - [ ] 대시보드 서비스 이름 클릭 → 서비스 상세 이동 확인
  - [ ] 서비스 상세: 요약 카드 4개 정상 표시
  - [ ] 서비스 상세: 최근 트레이스/로그 목록 표시
  - [ ] "전체 보기" → 트레이스/로그 페이지 서비스 필터 적용 이동
  - [ ] 뒤로가기 → 대시보드 이동
  - [ ] 존재하지 않는 서비스명 → 에러 상태 표시
  - [ ] 모바일 반응형 레이아웃
  - [ ] 브레드크럼 네비게이션
- [x] **T-072**: `internal/api/handler_test.go` — 테스트 추가 (Phase 8에서 완료)
  - `TestServiceDetailEndpoint` — 정상 조회 (200) ✅
  - `TestServiceDetailNotFound` — 미존재 서비스 (404) ✅
