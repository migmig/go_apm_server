Router.register('/traces', async (el, params) => {
    const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
    const service = urlParams.get('service') || '';
    const limit = 50;
    let offset = parseInt(urlParams.get('offset') || '0');

    async function load() {
        const qp = new URLSearchParams();
        if (service) qp.set('service', service);
        qp.set('limit', limit);
        qp.set('offset', offset);

        const serviceFilter = document.getElementById('trace-service-filter');
        const minDur = document.getElementById('trace-min-duration');
        const statusFilter = document.getElementById('trace-status-filter');

        if (serviceFilter && serviceFilter.value) qp.set('service', serviceFilter.value);
        if (minDur && minDur.value) qp.set('min_duration', minDur.value);
        if (statusFilter && statusFilter.value) qp.set('status', statusFilter.value);

        try {
            const [data, servicesData] = await Promise.all([
                API.get(`/traces?${qp}`),
                API.get('/services'),
            ]);
            render(data, servicesData.services || []);
        } catch (err) {
            el.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function render(data, services) {
        const traces = data.traces || [];
        const total = data.total || 0;

        el.innerHTML = `
            <div class="page-header">
                <h2>Traces</h2>
                <p>${total.toLocaleString()} traces found</p>
            </div>

            <div class="filters">
                <select id="trace-service-filter" class="filter-select">
                    <option value="">All Services</option>
                    ${services.map(s => `<option value="${escapeHtml(s.name)}" ${s.name === service ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <input type="number" id="trace-min-duration" class="filter-input" placeholder="Min duration (ms)">
                <select id="trace-status-filter" class="filter-select">
                    <option value="">All Status</option>
                    <option value="0">Unset</option>
                    <option value="1">OK</option>
                    <option value="2">Error</option>
                </select>
                <button class="btn btn-primary" id="trace-search-btn">Search</button>
            </div>

            <div class="card">
                ${traces.length === 0
                    ? '<div class="empty-state"><h3>No traces found</h3></div>'
                    : `<div class="table-container"><table>
                        <thead><tr>
                            <th>Trace ID</th><th>Service</th><th>Operation</th><th>Duration</th><th>Spans</th><th>Status</th><th>Time</th>
                        </tr></thead>
                        <tbody>${traces.map(t => `
                            <tr class="clickable" onclick="location.hash='#/traces/${t.trace_id}'">
                                <td style="font-family:monospace;font-size:12px">${t.trace_id.substring(0, 16)}...</td>
                                <td>${escapeHtml(t.root_service)}</td>
                                <td>${escapeHtml(t.root_span)}</td>
                                <td>${formatDuration(t.duration_ms)}</td>
                                <td>${t.span_count}</td>
                                <td>${statusBadge(t.status_code)}</td>
                                <td>${formatTimestamp(t.start_time)}</td>
                            </tr>
                        `).join('')}</tbody>
                    </table></div>`
                }

                <div class="pagination">
                    <span>Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total}</span>
                    <div>
                        <button class="btn btn-secondary" id="trace-prev" ${offset === 0 ? 'disabled' : ''}>Prev</button>
                        <button class="btn btn-secondary" id="trace-next" ${offset + limit >= total ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('trace-search-btn').addEventListener('click', () => { offset = 0; load(); });
        document.getElementById('trace-prev')?.addEventListener('click', () => { offset = Math.max(0, offset - limit); load(); });
        document.getElementById('trace-next')?.addEventListener('click', () => { offset += limit; load(); });
    }

    await load();
});
