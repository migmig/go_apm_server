# [Spec] 요청 추적 화면(Trace List) 개선 상세 사양

## 1. UI/UX 변경 사항

### 1.1 날짜 형식 변경
*   **파일:** `web/src/pages/Traces.tsx`, `web/src/components/traces/TraceList.tsx`
*   **변경 전:** `format(trace.start_time / 1e6, 'MMM dd, HH:mm:ss.SSS')`
*   **변경 후:** `format(trace.start_time / 1e6, 'yyyy-MM-dd HH:mm:ss')`
*   **참고:** `date-fns` 라이브러리의 포맷 규칙을 따름.

### 1.2 요청 ID(Trace ID) 링크 및 스타일
*   **파일:** `web/src/pages/Traces.tsx`, `web/src/components/traces/TraceList.tsx`
*   **구성:**
    ```tsx
    <Link 
      to={`/traces/${trace.trace_id}`}
      className="text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline transition-colors"
    >
      {trace.trace_id.substring(0, 8)}...
    </Link>
    ```
*   **효과:** 클릭 시 상세 페이지 이동, 호버 시 색상 변경 및 밑줄 표시.

### 1.3 수행 작업(Operation/Root Span) 컬럼 최적화
*   **파일:** `web/src/pages/Traces.tsx`, `web/src/components/traces/TraceList.tsx`
*   **속성:**
    *   `className`: `max-w-[200px] truncate` (너비 제한 및 말줄임)
    *   `title`: `{trace.root_span}` (마우스 오버 시 전체 텍스트 노출)
*   **코드 예시:**
    ```tsx
    <td className="px-6 py-4 whitespace-nowrap max-w-[200px] truncate" title={trace.root_span}>
      <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
        {trace.root_span}
      </span>
    </td>
    ```

### 1.4 레이아웃 너비 확장
*   **파일:** `web/src/components/AppLayout.tsx`
*   **변경 사항:**
    *   기존 `max-w-7xl` (80rem / 1280px) 제한을 `max-w-[1600px]` 또는 `max-w-screen-2xl`로 확장.
*   **적용 위치:**
    *   Header 내부의 컨테이너 div
    *   Main 내부의 컨테이너 div

## 2. 코드 구조 최적화 (선택 사항)
*   현재 `Traces.tsx` 내부에 테이블 코드가 직접 구현되어 있고, `TraceList.tsx`에도 유사한 코드가 존재함.
*   중복 제거를 위해 `Traces.tsx`에서 `TraceList.tsx` 컴포넌트를 사용하도록 리팩토링 권장.

## 3. 테스트 케이스
*   [ ] 날짜가 `2026-03-11 14:30:15` 형식으로 표시되는가?
*   [ ] Trace ID 클릭 시 `/traces/{id}` 페이지로 정상 이동하는가?
*   [ ] 수행 작업 내용이 길 때 `...`으로 표시되고 마우스를 올리면 전체 내용이 보이는가?
*   [ ] 2560px 이상의 모니터에서 화면이 이전보다 넓게 활용되는가?
