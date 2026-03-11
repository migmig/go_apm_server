# Phase 4 UX 개선 작업 현황

`docs/ui_improvements/phase4_proposals.md` 기획안과 오늘 진행된 추가 개선 작업을 바탕으로 한 진행 현황 문서입니다.

## 🚀 진행 완료 (Completed)

- [x] **Task 1: 원클릭 클립보드 복사 (Copy-to-Clipboard)**
  - `CopyButton.tsx` 재사용 컴포넌트 신규 생성 및 `toast` 연동
  - `TraceList`: 목록 및 모바일 뷰 Trace ID 복사 적용
  - `TraceDetail`: 상단 헤더 Trace ID 복사 적용
  - `Logs`: 트레이스 연결 링크 ID 복사 기능 적용
  - `LogAttributes`: 모든 속성(Key-Value) 값 호버 시 복사 아이콘 활성화

- [x] **Task 2: 로그 검색어 실시간 하이라이팅 (Keyword Highlighting)**
  - `HighlightText.tsx` 컴포넌트 신규 생성
  - 정규식을 활용한 대소문자 구분 없는 검색어 필터링 지원
  - `Logs.tsx`의 `body` 필드 내에서 일치하는 검색어 시각적 강조(`<mark>` 태그 및 노란 배경) 처리

- [x] **Task 3: 트레이스 목록 기준별 테이블 정렬 (Table Sorting)**
  - `TraceList.tsx`에 `SortField` 및 `SortOrder` 상태 적용
  - 테이블 헤더 오름차순/내림차순 토글 화살표(`ChevronUp`, `ChevronDown`) 구현
  - 모바일용 `select` 정렬 UI 추가
  - 요청 시간(start_time), 소요 시간(duration_ms), 결과 상태(status_code) 기준 정렬 지원

- [x] **Task 4: 수신 화면 동결 토글 (Global Freeze / Pause)**
  - `useWebSocket.tsx` 내 `WSContext`를 확장하여 `isPaused` 상태 관리 및 버퍼링 로직(`useWSPause`) 주입
  - `AppLayout.tsx` 메인 헤더에 글로벌 '수신 동결 / 재개' 버튼 도입 (버튼 클릭 시 쌓인 버퍼 일괄 렌더링)

- [x] **Task 5 (Extra): 확장 도구 컴파일 성능 개선 (tsgo 도입)**
  - MS 네이티브 TypeScript 포트로 개발된 `tsgo`(`@typescript/native-preview`) 도입
  - `tsconfig.json`의 비호환성 필드(`esModuleInterop`) 제거
  - `vite-env.d.ts` 추가로 에러 방지
  - `npm run build` 스크립트를 변경하여 타임 체킹 성능 최소 3배 향상

---

## ⏳ 미진행 / 중장기 백로그 (Pending)

- [ ] **Task 6: 워터폴 차트 미니맵 및 Zoom 드래그**
  - 대규모 스팬(Span) 환경에서 직관적인 확인을 위해 `TraceDetail.tsx`의 워터폴 상단에 전체 Overview 미니맵 표시
  - 마우스 드래그를 통한 특정 타임라인 구간 확대(Zoom-in) 차트 컨트롤 구현
  - **비고**: 기술적 난이도가 가장 높아 별도의 Phase 5 작업 또는 중장기 백로그로 분류됨.
