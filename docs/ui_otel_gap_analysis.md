# UI 심층 분석 및 OTel 스펙 미구현 항목 갭 리포트

## 목적

사용자 관점에서 현재 웹 UI의 사용성을 점검하고, 현재 수집/저장/조회 파이프라인이 OpenTelemetry(OTel) 스펙 대비 어느 부분이 미구현인지 식별한다.

---

## 1) 사용자 관점 UI 심층 분석

### 1-1. 현재 강점

1. **기본 관측 3종(Trace/Metric/Log) 접근성은 확보됨**
   - Traces 페이지는 검색/무한스크롤/로딩·에러·빈 상태가 분리되어 있어 초기 탐색 UX가 안정적이다.
2. **Trace 상세의 탐색 흐름이 직관적임**
   - 워터폴 + 선택한 span 메타데이터 패널 구성으로 병목 위치 파악이 빠르다.
   - 선택 span에서 로그 페이지로 이동 링크가 있어 기본 상관관계 분석 동선이 존재한다.
3. **운영 상태 피드백이 있음**
   - 마지막 조회 시각, 재조회 액션, 실패 시 재시도 버튼 등 운영자에게 즉각적인 피드백을 준다.

### 1-2. 사용자 불편 포인트 (우선순위 순)

#### P0. Trace 검색 필터가 제한적
- 현재 Traces 화면은 사실상 `service` 중심 검색이며, 백엔드는 `status`, `min_duration`, `start/end`를 지원하지만 UI 노출은 제한적이다.
- 장애 분석 시 사용자는 “오류만”, “느린 요청만(예: 500ms+)” 같은 필터를 즉시 쓰고 싶어한다.

**개선안**
- 상단 필터바에 다음을 기본 제공:
  - Status (All / OK / Error)
  - Min duration(ms)
  - 상대 시간 프리셋 (5m, 15m, 1h, 24h)
- 필터 상태를 URL 쿼리에 완전 반영하여 공유 가능한 조사 링크 제공.

#### P0. Trace 상세 정보 밀도가 높지만 “문제 우선 시각화”가 약함
- 현재는 모든 span을 동일한 리스트로 보여주고, 오류 span/장시간 span은 배지 수준 강조만 있다.
- 실제 운영자는 먼저 “에러 원인 span”, “전체 지연 기여도가 큰 span Top N”을 보고 싶어한다.

**개선안**
- Trace 상세 상단에 인시던트 요약 카드 추가:
  - Error span count
  - Critical path duration
  - Slowest span Top 3
- 워터폴 좌측 리스트에 “오류 우선 정렬 토글”, “긴 span만 보기 토글” 추가.

#### P1. 로그 탐색의 컨텍스트 복원 비용이 큼
- Trace 상세에서 로그로 이동은 가능하지만, 로그 화면에서 Trace 상세로 돌아가거나 관련 span에 재점프하는 흐름이 약하면 탐색이 끊긴다.

**개선안**
- 로그 아이템에 `Trace`, `Span` 딥링크를 상시 노출.
- 필터칩(서비스/trace_id/severity/search)을 상단 고정하고 one-click 제거 지원.

#### P1. 접근성(A11y)·키보드 사용성 검증 부재
- 현재 컴포넌트 전반에 키보드 내비게이션, 포커스 순서, ARIA 역할이 체계적으로 문서화/테스트되지 않았다.

**개선안**
- 핵심 플로우(Traces 목록, Trace 상세 span 선택, Logs 검색)에 대해:
  - Tab 순서/Enter 동작 명세
  - `aria-label`, `aria-live` 적용
  - axe 기반 자동 점검

#### P2. 실시간 업데이트 신뢰성 표시 부족
- 웹소켓으로 신규 trace를 prepend하지만, 사용자는 “실시간 수신 중인지 / 지연 중인지”를 명확히 알기 어렵다.

**개선안**
- 연결 상태 배지(Connected / Reconnecting / Offline)와 마지막 메시지 시각을 고정 노출.
- 일시 오프라인 시 사용자에게 stale 상태 배너 제공.

---

## 2) OTel 스펙 대비 미구현/부분구현 갭

아래는 **현재 코드 기준**의 구현 범위와 누락 항목이다.

### 2-1. Trace 데이터

- **미구현: Span Links 저장/조회**
  - 현재 span 모델에 links 필드가 없다.
  - 비동기 메시징, fan-in/fan-out 추적에서 링크 분석이 불가능하다.

- **부분구현: Instrumentation Scope 정보 미보존**
  - `ResourceSpans -> ScopeSpans`를 순회하지만 scope name/version/attributes를 별도 저장하지 않는다.
  - 동일 서비스 내 다중 라이브러리 출처 구분이 어렵다.

### 2-2. Metrics 데이터

- **미구현: ExponentialHistogram, Summary, (가능한) Empty metric 타입 대응 미흡**
  - 파서 switch가 Gauge/Sum/Histogram만 처리한다.

- **부분구현: Histogram bucket/경계값 저장 미흡**
  - 스키마에는 `histogram_buckets` 컬럼이 있으나 파서에서 bucket counts + explicit bounds를 매핑하지 않는다.

- **부분구현: Temporality/Monotonic 플래그 미보존**
  - Sum의 aggregation temporality, monotonic 특성을 저장하지 않아 rate 계산 정확도에 제약이 있다.

### 2-3. Logs 데이터

- **부분구현: Body 타입 손실**
  - 로그 본문을 `lr.Body().AsString()`으로 저장하여 map/array/bytes 등 구조화 body가 문자열로 축소된다.

- **미구현: ObservedTimestamp 보존 없음**
  - 로그 ingestion 지연 분석(발행 시각 vs 수집 시각)에 필요한 observed timestamp가 없다.

### 2-4. 공통 시맨틱/상관관계

- **부분구현: Resource vs Scope vs Record 수준 속성 계층의 완전 보존 부재**
  - Resource/Record attribute는 저장되지만 scope 레벨 메타데이터가 빠져 출처/버전 단위 분석이 약함.

- **부분구현: 상태코드/에러 의미론 표준화 부족**
  - Trace status code는 저장되나, UI에서 OTel semantic conventions 기반 에러 원인 집계를 직접적으로 제공하지 않는다.

---

## 3) 우선순위 로드맵 (실행 제안)

### Phase A (즉시, 1~2주)
1. Traces UI 필터 확장: status/min_duration/time preset
2. Trace 상세 인시던트 요약 카드 추가
3. Logs ↔ Trace/Span 상호 딥링크 보강

### Phase B (중기, 2~4주)
1. Parser/Storage에 instrumentation scope 필드 추가
2. Histogram bucket(explicit bounds/counts) 저장 및 API 노출
3. Log body raw JSON 저장 (타입 보존)

### Phase C (중장기, 4주+)
1. Span links 저장/조회/시각화
2. ExponentialHistogram/Summary 지원
3. A11y 자동점검(axe + e2e) 파이프라인 도입

---

## 4) 기대 효과

- 장애 대응 시 **탐색 시간 단축**(필터 정확도 + 문제 우선 뷰)
- OTel 데이터의 **의미 손실 감소**(scope/body/histogram/links 보존)
- 대규모 분산환경에서 **상관관계 분석 품질 향상**

