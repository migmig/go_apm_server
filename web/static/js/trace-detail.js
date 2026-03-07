Router.register('/traces/:traceId', async (el, params) => {
    try {
        const data = await API.get(`/traces/${params.traceId}`);
        const spans = data.spans || [];

        if (spans.length === 0) {
            el.innerHTML = '<div class="empty-state"><h3>Trace not found</h3></div>';
            return;
        }

        // Build span tree and calculate layout
        const traceStart = Math.min(...spans.map(s => s.start_time));
        const traceEnd = Math.max(...spans.map(s => s.end_time));
        const traceDuration = traceEnd - traceStart;
        const rootSpan = spans.find(s => !s.parent_span_id) || spans[0];

        // Order spans: parent first, then children recursively
        const orderedSpans = [];
        const spanMap = new Map();
        spans.forEach(s => spanMap.set(s.span_id, s));

        function walkTree(spanId, depth) {
            const span = spanMap.get(spanId);
            if (!span) return;
            orderedSpans.push({ ...span, depth });
            spans.filter(s => s.parent_span_id === spanId).forEach(child => walkTree(child.span_id, depth + 1));
        }

        walkTree(rootSpan.span_id, 0);
        // Add any orphans
        spans.forEach(s => {
            if (!orderedSpans.find(o => o.span_id === s.span_id)) {
                orderedSpans.push({ ...s, depth: 0 });
            }
        });

        let selectedSpanId = null;

        function render() {
            el.innerHTML = `
                <a href="#/traces" class="back-link">Back to Traces</a>
                <div class="page-header">
                    <h2>${escapeHtml(rootSpan.span_name)}</h2>
                    <p>Trace ${params.traceId.substring(0, 16)}... | ${spans.length} spans | ${formatDuration(rootSpan.duration_ms)}</p>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Waterfall</span>
                        <span style="font-size:12px;color:var(--text-muted)">Total: ${formatDuration(traceDuration / 1e6)}</span>
                    </div>
                    <div class="waterfall">
                        <div class="waterfall-header">
                            <div class="waterfall-label">Operation</div>
                            <div class="waterfall-bar-container">Timeline</div>
                            <div class="waterfall-duration">Duration</div>
                        </div>
                        ${orderedSpans.map(s => {
                            const left = traceDuration > 0 ? ((s.start_time - traceStart) / traceDuration) * 100 : 0;
                            const width = traceDuration > 0 ? Math.max(((s.end_time - s.start_time) / traceDuration) * 100, 0.5) : 100;
                            const color = s.status_code === 2 ? 'var(--error)' : getServiceColor(s.service_name);
                            const indent = s.depth * 16;
                            const selected = s.span_id === selectedSpanId;

                            return `
                                <div class="waterfall-row ${selected ? 'selected' : ''}" data-span-id="${s.span_id}">
                                    <div class="waterfall-label" style="padding-left:${indent + 8}px">
                                        <div class="service">${escapeHtml(s.service_name)}</div>
                                        ${escapeHtml(s.span_name)}
                                    </div>
                                    <div class="waterfall-bar-container">
                                        <div class="waterfall-bar ${s.status_code === 2 ? 'error' : ''}"
                                             style="left:${left}%;width:${width}%;background:${color}"></div>
                                    </div>
                                    <div class="waterfall-duration">${formatDuration(s.duration_ms)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div id="span-detail-panel"></div>
            `;

            // Attach click handlers
            el.querySelectorAll('.waterfall-row').forEach(row => {
                row.addEventListener('click', () => {
                    selectedSpanId = row.dataset.spanId;
                    renderSpanDetail();
                    // Update selected state
                    el.querySelectorAll('.waterfall-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                });
            });

            if (selectedSpanId) renderSpanDetail();
        }

        function renderSpanDetail() {
            const panel = document.getElementById('span-detail-panel');
            const span = orderedSpans.find(s => s.span_id === selectedSpanId);
            if (!span || !panel) return;

            const attrs = span.attributes || {};
            const resAttrs = span.resource_attributes || {};
            const events = span.events || [];

            panel.innerHTML = `
                <div class="span-detail">
                    <h3>${escapeHtml(span.span_name)} ${statusBadge(span.status_code)}</h3>

                    <table class="attr-table">
                        <tr><td class="attr-key">service.name</td><td class="attr-value">${escapeHtml(span.service_name)}</td></tr>
                        <tr><td class="attr-key">span.id</td><td class="attr-value">${span.span_id}</td></tr>
                        <tr><td class="attr-key">parent.span.id</td><td class="attr-value">${span.parent_span_id || '(root)'}</td></tr>
                        <tr><td class="attr-key">span.kind</td><td class="attr-value">${['UNSPECIFIED','INTERNAL','SERVER','CLIENT','PRODUCER','CONSUMER'][span.span_kind] || span.span_kind}</td></tr>
                        <tr><td class="attr-key">duration</td><td class="attr-value">${formatDuration(span.duration_ms)}</td></tr>
                        <tr><td class="attr-key">status</td><td class="attr-value">${span.status_code === 1 ? 'OK' : span.status_code === 2 ? 'ERROR' : 'UNSET'}${span.status_message ? ': ' + escapeHtml(span.status_message) : ''}</td></tr>
                    </table>

                    ${Object.keys(attrs).length > 0 ? `
                        <h3 style="margin-top:16px">Attributes</h3>
                        <table class="attr-table">
                            ${Object.entries(attrs).map(([k, v]) =>
                                `<tr><td class="attr-key">${escapeHtml(k)}</td><td class="attr-value">${escapeHtml(JSON.stringify(v))}</td></tr>`
                            ).join('')}
                        </table>
                    ` : ''}

                    ${Object.keys(resAttrs).length > 0 ? `
                        <h3 style="margin-top:16px">Resource Attributes</h3>
                        <table class="attr-table">
                            ${Object.entries(resAttrs).map(([k, v]) =>
                                `<tr><td class="attr-key">${escapeHtml(k)}</td><td class="attr-value">${escapeHtml(JSON.stringify(v))}</td></tr>`
                            ).join('')}
                        </table>
                    ` : ''}

                    ${events.length > 0 ? `
                        <h3 style="margin-top:16px">Events</h3>
                        <table class="attr-table">
                            ${events.map(e => `
                                <tr><td class="attr-key">${escapeHtml(e.name)}</td><td class="attr-value">${formatTimestamp(e.timestamp)}</td></tr>
                            `).join('')}
                        </table>
                    ` : ''}
                </div>
            `;
        }

        render();
    } catch (err) {
        el.innerHTML = `<div class="empty-state"><h3>Error loading trace</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
});
