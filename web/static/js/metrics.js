Router.register('/metrics', async (el) => {
    try {
        const servicesData = await API.get('/services');
        const services = servicesData.services || [];

        el.innerHTML = `
            <div class="page-header">
                <h2>Metrics</h2>
                <p>View metric time series</p>
            </div>

            <div class="filters">
                <select id="metric-service-filter" class="filter-select">
                    <option value="">All Services</option>
                    ${services.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <input type="text" id="metric-name-input" class="filter-input" placeholder="Metric name">
                <button class="btn btn-primary" id="metric-search-btn">Load</button>
            </div>

            <div class="card" id="metric-chart-card" style="display:none">
                <div class="card-header">
                    <span class="card-title" id="metric-chart-title">-</span>
                </div>
                <div class="chart-container" id="metric-chart"></div>
            </div>

            <div class="card" id="metric-data-card" style="display:none">
                <div class="card-header">
                    <span class="card-title">Data Points</span>
                </div>
                <div class="table-container">
                    <table id="metric-table">
                        <thead><tr><th>Timestamp</th><th>Value</th><th>Attributes</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <div id="metric-empty" class="empty-state">
                <h3>Enter a metric name to view data</h3>
                <p>Common metrics: http.server.duration, http.server.request.size, runtime.go.goroutines</p>
            </div>
        `;

        document.getElementById('metric-search-btn').addEventListener('click', loadMetrics);

        async function loadMetrics() {
            const service = document.getElementById('metric-service-filter').value;
            const name = document.getElementById('metric-name-input').value;

            if (!name) return;

            const qp = new URLSearchParams();
            if (service) qp.set('service', service);
            qp.set('name', name);
            qp.set('limit', '1000');

            try {
                const data = await API.get(`/metrics?${qp}`);
                const points = data.data_points || [];

                document.getElementById('metric-empty').style.display = points.length === 0 ? '' : 'none';
                document.getElementById('metric-chart-card').style.display = points.length > 0 ? '' : 'none';
                document.getElementById('metric-data-card').style.display = points.length > 0 ? '' : 'none';
                document.getElementById('metric-chart-title').textContent = name;

                if (points.length === 0) {
                    document.getElementById('metric-empty').innerHTML = '<h3>No data points found</h3>';
                    return;
                }

                // Render simple SVG chart
                renderChart(points);

                // Render table
                const tbody = document.querySelector('#metric-table tbody');
                tbody.innerHTML = points.map(p => `
                    <tr>
                        <td>${new Date(p.timestamp / 1e6).toLocaleString()}</td>
                        <td>${p.value}</td>
                        <td style="font-size:12px;font-family:monospace">${escapeHtml(JSON.stringify(p.attributes))}</td>
                    </tr>
                `).join('');
            } catch (err) {
                document.getElementById('metric-empty').innerHTML = `<h3>Error</h3><p>${escapeHtml(err.message)}</p>`;
                document.getElementById('metric-empty').style.display = '';
            }
        }

        function renderChart(points) {
            const container = document.getElementById('metric-chart');
            const width = container.clientWidth || 800;
            const height = 280;
            const pad = { top: 20, right: 20, bottom: 40, left: 60 };

            const values = points.map(p => p.value);
            const times = points.map(p => p.timestamp / 1e6); // ms
            const minV = Math.min(...values);
            const maxV = Math.max(...values);
            const minT = Math.min(...times);
            const maxT = Math.max(...times);
            const rangeV = maxV - minV || 1;
            const rangeT = maxT - minT || 1;

            const chartW = width - pad.left - pad.right;
            const chartH = height - pad.top - pad.bottom;

            const pts = points.map((p, i) => {
                const x = pad.left + ((times[i] - minT) / rangeT) * chartW;
                const y = pad.top + chartH - ((values[i] - minV) / rangeV) * chartH;
                return `${x},${y}`;
            });

            // Y-axis labels
            const yLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => {
                const val = minV + pct * rangeV;
                const y = pad.top + chartH - pct * chartH;
                return `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${val.toFixed(1)}</text>
                        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="2"/>`;
            });

            container.innerHTML = `
                <svg width="${width}" height="${height}" style="display:block">
                    ${yLabels.join('')}
                    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
                    ${points.map((p, i) => {
                        const x = pad.left + ((times[i] - minT) / rangeT) * chartW;
                        const y = pad.top + chartH - ((values[i] - minV) / rangeV) * chartH;
                        return `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)"/>`;
                    }).join('')}
                </svg>
            `;
        }
    } catch (err) {
        el.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
});
