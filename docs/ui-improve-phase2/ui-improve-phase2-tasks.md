# Phase 2 UI Improvements Tasks

## Phase 5: High-Impact "Quick Wins" (P0-P1)

### 5.1. Dashboard & Reliability (P0)
- [x] Add a summary section at the top of the Dashboard for "Critical" services only.
- [x] Align time-window calculations for RPS and sparklines; add tooltips defining aggregation methods.
- [x] Implement unified color palette for Severity (Error/Warning/Info) and Health logic.

### 5.2. Trace Detail & Waterfall (P1)
- [x] Add a direct "View Logs for this Span" link in the Metadata sidebar.
- [x] Visually emphasize spans occupying >30% of total duration (Heavy Spans).
- [x] Split the waterfall into fixed labels and a scrollable timeline to maintain span identification.

### 5.3. Logs & Performance (P1)
- [x] Implement windowed rendering for high-volume logs to maintain 60fps scrolling.
- [x] Default to "Summary View" (Top N tags) with an expand/collapse control for log details.
- [x] Add a mini-chart showing Error/Warning frequency over time above log results.

## Future Enhancements (P2)
- [ ] Implement Advanced Trace Tools: Mini-map, zoom/pan controls, and time-range range selection for Waterfall.
- [ ] Replace layout-shifting error banners with Toast notifications.

## Execution Checklist
- [ ] Align metric definitions (RPS/Denominator) with UI tooltips.
- [ ] Verify health color consistency across Dashboard, Service Detail, and Traces.
- [ ] Test Waterfall scroll performance with 500+ spans.
- [ ] Ensure keyboard navigation (Tab/Enter) works for all filter inputs.
- [ ] Validate that log attributes do not "jump" layout when expanded.