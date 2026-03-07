// --- API Client ---
const API = {
    async get(path) {
        const resp = await fetch(`/api${path}`);
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        return resp.json();
    }
};

// --- Router ---
const Router = {
    routes: {},
    register(pattern, handler) {
        this.routes[pattern] = handler;
    },
    start() {
        window.addEventListener('hashchange', () => this.resolve());
        this.resolve();
    },
    resolve() {
        const hash = location.hash || '#/';
        const content = document.getElementById('content');

        // Update nav active state
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === hash ||
                (hash.startsWith(link.getAttribute('href')) && link.getAttribute('href') !== '#/'));
        });

        // Match route
        for (const [pattern, handler] of Object.entries(this.routes)) {
            const match = this.match(pattern, hash);
            if (match !== null) {
                content.innerHTML = '<div class="loading">Loading...</div>';
                handler(content, match);
                return;
            }
        }

        content.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
    },
    match(pattern, hash) {
        const patternParts = pattern.split('/');
        const hashParts = hash.replace('#', '').split('/');
        if (patternParts.length !== hashParts.length) return null;

        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params[patternParts[i].slice(1)] = hashParts[i];
            } else if (patternParts[i] !== hashParts[i]) {
                return null;
            }
        }
        return params;
    }
};

// --- Utilities ---
function formatDuration(ms) {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(nanos) {
    return new Date(nanos / 1e6).toLocaleString();
}

function formatISOTimestamp(iso) {
    return new Date(iso).toLocaleString();
}

function statusBadge(code) {
    if (code === 1) return '<span class="badge badge-ok">OK</span>';
    if (code === 2) return '<span class="badge badge-error">ERROR</span>';
    return '<span class="badge badge-unset">UNSET</span>';
}

function severityClass(num) {
    if (num <= 4) return 'severity-trace';
    if (num <= 8) return 'severity-debug';
    if (num <= 12) return 'severity-info';
    if (num <= 16) return 'severity-warn';
    if (num <= 20) return 'severity-error';
    return 'severity-fatal';
}

function severityLabel(num, text) {
    if (text) return text;
    if (num <= 4) return 'TRACE';
    if (num <= 8) return 'DEBUG';
    if (num <= 12) return 'INFO';
    if (num <= 16) return 'WARN';
    if (num <= 20) return 'ERROR';
    return 'FATAL';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Service color palette
const SERVICE_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

const serviceColorMap = {};
function getServiceColor(name) {
    if (!serviceColorMap[name]) {
        const idx = Object.keys(serviceColorMap).length % SERVICE_COLORS.length;
        serviceColorMap[name] = SERVICE_COLORS[idx];
    }
    return serviceColorMap[name];
}

// Init router after all page scripts are loaded
window.addEventListener('DOMContentLoaded', () => {
    Router.start();
});
