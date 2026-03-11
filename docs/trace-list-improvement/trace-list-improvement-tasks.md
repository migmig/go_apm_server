# [Tasks] 요청 추적 화면(Trace List) 개선 작업 목록

## 1. 레이아웃 최적화
- [x] `web/src/components/AppLayout.tsx` 수정
    - [x] Header 및 Main 영역의 `max-w-7xl` 클래스를 `max-w-screen-2xl`로 변경하여 대화면 지원 확장

## 2. 코드 구조 개선 및 중복 제거
- [x] `web/src/pages/Traces.tsx` 리팩토링
    - [x] 파일 내부에 직접 구현된 `<table>` 및 `Mobile Card Layout` 코드를 제거하고 `TraceList` 컴포넌트로 대체
    - [x] `TraceSummary` 인터페이스 및 관련 데이터가 `TraceList` 컴포넌트로 올바르게 전달되도록 수정
- [x] `web/src/components/traces/TraceList.tsx` 보완
    - [x] `Traces.tsx`에서 사용하던 스타일 중 더 나은 스타일이 있다면 통합 및 최적화

## 3. 기능 개선 (UI/UX)
- [x] `web/src/components/traces/TraceList.tsx` 수정
    - [x] **날짜 형식 변경:** `format(..., 'yyyy-MM-dd HH:mm:ss')` 적용
    - [x] **Trace ID 링크 적용:** 텍스트를 `Link` 컴포넌트로 감싸고 스타일(blue-400, hover:underline) 추가
    - [x] **수행 작업 최적화:** 
        - [x] 컬럼 너비 제한 (`max-w-[200px]`) 및 `truncate` 클래스 적용
        - [x] 마우스 오버 시 전체 내용 표시를 위해 `title` 속성 추가
    - [x] **모바일 뷰 대응:** `TraceMobileCard` 컴포넌트에도 변경된 날짜 형식 적용

## 4. 최종 검증
- [x] 브라우저 개발자 도구로 대화면(2560px 이상)에서 레이아웃 확장 확인
- [x] 날짜 형식이 요구사항(`YYYY-MM-DD HH:mm:ss`)과 일치하는지 확인
- [x] Trace ID 클릭 시 상세 페이지로의 이동 여부 확인
- [x] 수행 작업 내용이 긴 데이터에 대해 말줄임표 및 툴팁이 정상 작동하는지 확인
