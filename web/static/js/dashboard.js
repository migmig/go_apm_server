Router.register('/', async (el) => {
    try {
        const [statsData, servicesData, tracesData] = await Promise.all([
            API.get('/stats?since=0'),
            API.get('/services'),
            API.get('/traces?limit=10'),
        ]);

        const stats = statsData;
        const services = servicesData.services || [];
        const traces = tracesData.traces || [];

        el.innerHTML = `
            <div class="page-header">
                <h2>Dashboard</h2>
                <p>Overview of your services</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Services</div>
                    <div class="stat-value">${stats.service_count}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Traces</div>
                    <div class="stat-value">${stats.total_traces.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Spans</div>
                    <div class="stat-value">${stats.total_spans.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Error Rate</div>
                    <div class="stat-value ${stats.error_rate > 0.05 ? 'error' : 'success'}">${(stats.error_rate * 100).toFixed(2)}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Avg Latency</div>
                    <div class="stat-value">${formatDuration(stats.avg_latency_ms)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">P99 Latency</div>
                    <div class="stat-value">${formatDuration(stats.p99_latency_ms)}</div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <span class="card-title">Services</span>
                </div>
                ${services.length === 0
                    ? '<div class="empty-state"><h3>No services yet</h3><p>Send OTLP data to see services here</p></div>'
                    : `<div class="services-grid">${services.map(svc => `
                        <div class="service-card" onclick="location.hash='#/traces?service=${encodeURIComponent(svc.name)}'">
                            <div class="service-name">${escapeHtml(svc.name)}</div>
                            <div class="service-stats">
                                <div class="service-stat">Spans<span>${svc.span_count.toLocaleString()}</span></div>
                                <div class="service-stat">Errors<span class="${svc.error_count > 0 ? 'error' : ''}">${svc.error_count}</span></div>
                                <div class="service-stat">Avg<span>${formatDuration(svc.avg_latency_ms)}</span></div>
                            </div>
                        </div>
                    `).join('')}</div>`
                }
            </div>

            <div class="card">
                <div class="card-header">
                    <span class="card-title">Recent Traces</span>
                    <a href="#/traces" class="btn btn-secondary">View All</a>
                </div>
                ${traces.length === 0
                    ? '<div class="empty-state"><h3>No traces yet</h3></div>'
                    : `<div class="table-container"><table>
                        <thead><tr>
                            <th>Service</th><th>Operation</th><th>Duration</th><th>Spans</th><th>Status</th><th>Time</th>
                        </tr></thead>
                        <tbody>${traces.map(t => `
                            <tr class="clickable" onclick="location.hash='#/traces/${t.trace_id}'">
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
            </div>
        `;
    } catch (err) {
        el.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
});
