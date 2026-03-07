Router.register('/logs', async (el) => {
    const limit = 100;
    let offset = 0;

    async function load() {
        const qp = new URLSearchParams();
        qp.set('limit', limit);
        qp.set('offset', offset);

        const serviceFilter = document.getElementById('log-service-filter');
        const severityFilter = document.getElementById('log-severity-filter');
        const searchInput = document.getElementById('log-search');

        if (serviceFilter && serviceFilter.value) qp.set('service', serviceFilter.value);
        if (severityFilter && severityFilter.value) qp.set('severity_min', severityFilter.value);
        if (searchInput && searchInput.value) qp.set('search', searchInput.value);

        try {
            const [data, servicesData] = await Promise.all([
                API.get(`/logs?${qp}`),
                API.get('/services'),
            ]);
            render(data, servicesData.services || []);
        } catch (err) {
            el.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function render(data, services) {
        const logs = data.logs || [];
        const total = data.total || 0;

        el.innerHTML = `
            <div class="page-header">
                <h2>Logs</h2>
                <p>${total.toLocaleString()} log records</p>
            </div>

            <div class="filters">
                <select id="log-service-filter" class="filter-select">
                    <option value="">All Services</option>
                    ${services.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <select id="log-severity-filter" class="filter-select">
                    <option value="">All Severities</option>
                    <option value="1">TRACE+</option>
                    <option value="5">DEBUG+</option>
                    <option value="9">INFO+</option>
                    <option value="13">WARN+</option>
                    <option value="17">ERROR+</option>
                    <option value="21">FATAL+</option>
                </select>
                <input type="text" id="log-search" class="filter-input" placeholder="Search log body...">
                <button class="btn btn-primary" id="log-search-btn">Search</button>
            </div>

            <div class="card">
                ${logs.length === 0
                    ? '<div class="empty-state"><h3>No logs found</h3></div>'
                    : `<div>${logs.map(l => `
                        <div class="log-row">
                            <span class="log-time">${formatISOTimestamp(l.timestamp)}</span>
                            <span class="log-service">${escapeHtml(l.service_name)}</span>
                            <span class="log-severity ${severityClass(l.severity_number)}">${severityLabel(l.severity_number, l.severity_text)}</span>
                            <span class="log-body">${escapeHtml(l.body)}${l.trace_id ? ` <a href="#/traces/${l.trace_id}" style="color:var(--accent);font-size:11px">[trace]</a>` : ''}</span>
                        </div>
                    `).join('')}</div>`
                }

                <div class="pagination">
                    <span>Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total}</span>
                    <div>
                        <button class="btn btn-secondary" id="log-prev" ${offset === 0 ? 'disabled' : ''}>Prev</button>
                        <button class="btn btn-secondary" id="log-next" ${offset + limit >= total ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('log-search-btn').addEventListener('click', () => { offset = 0; load(); });
        document.getElementById('log-prev')?.addEventListener('click', () => { offset = Math.max(0, offset - limit); load(); });
        document.getElementById('log-next')?.addEventListener('click', () => { offset += limit; load(); });
    }

    await load();
});
