(function () {
    'use strict';

    const resourceName = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'pg-wrapper';

    const body = document.body;
    const statusBar = document.getElementById('status-bar');
    const statusLegend = document.getElementById('status-legend');
    const queryRows = document.getElementById('query-rows');
    const emptyState = document.getElementById('empty-state');

    function formatMs(ms) {
        return `${Math.round(ms)}ms`;
    }

    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour12: false });
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch {
            // clipboard unavailable; nothing more we can do
        }
        document.body.removeChild(textarea);
    }

    function renderStatusBar(summary) {
        statusBar.innerHTML = '';
        statusLegend.innerHTML = '';

        if (summary.total <= 0) {
            statusBar.style.display = 'none';
            statusLegend.style.display = 'none';
            return;
        }

        statusBar.style.display = 'flex';
        statusLegend.style.display = 'flex';

        const segments = [
            { key: 'ok', label: 'OK', count: summary.okCount },
            { key: 'slow', label: 'Slow', count: summary.slowCount },
            { key: 'error', label: 'Error', count: summary.errorCount },
        ];

        for (const seg of segments) {
            if (seg.count <= 0) {
                continue;
            }

            const share = summary.total > 0 ? (seg.count / summary.total) * 100 : 0;

            const bar = document.createElement('div');
            bar.className = `status-bar__segment status-bar__segment--${seg.key}`;
            bar.style.width = `${share}%`;
            statusBar.appendChild(bar);

            const legendItem = document.createElement('div');
            legendItem.className = 'status-legend__item';

            const dot = document.createElement('span');
            dot.className = `status-dot status-dot--${seg.key}`;
            legendItem.appendChild(dot);
            legendItem.appendChild(document.createTextNode(seg.label));

            const count = document.createElement('span');
            count.className = 'status-legend__count';
            count.textContent = String(seg.count);
            legendItem.appendChild(count);

            statusLegend.appendChild(legendItem);
        }
    }

    function renderTable(recent) {
        queryRows.innerHTML = '';
        emptyState.style.display = recent.length === 0 ? 'block' : 'none';

        for (const entry of recent) {
            const tr = document.createElement('tr');

            const tdTime = document.createElement('td');
            tdTime.textContent = formatTime(entry.timestamp);
            tr.appendChild(tdTime);

            const tdResource = document.createElement('td');
            tdResource.textContent = entry.resource;
            tr.appendChild(tdResource);

            const tdDuration = document.createElement('td');
            const dot = document.createElement('span');
            const kind = entry.status === 'error' ? 'error' : entry.durationMs >= 100 ? 'slow' : 'ok';
            dot.className = `status-dot status-dot--${kind}`;
            tdDuration.appendChild(dot);
            tdDuration.appendChild(document.createTextNode(formatMs(entry.durationMs)));
            tr.appendChild(tdDuration);

            const tdSql = document.createElement('td');
            tdSql.className = 'sql';

            const sqlWrap = document.createElement('div');
            sqlWrap.className = 'sql-wrap';

            const sqlText = document.createElement('span');
            sqlText.className = 'sql-text';
            sqlText.textContent = entry.text;
            sqlWrap.appendChild(sqlText);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.title = 'Copy query';
            copyBtn.innerHTML =
                '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="0" stroke="currentColor" stroke-width="1.3"/><path d="M3 10.5V3.5C3 2.94772 3.44772 2.5 4 2.5H10.5" stroke="currentColor" stroke-width="1.3"/></svg>';

            copyBtn.addEventListener('click', () => {
                copyToClipboard(entry.text);
                copyBtn.classList.add('copy-btn--done');
                setTimeout(() => copyBtn.classList.remove('copy-btn--done'), 900);
            });

            sqlWrap.appendChild(copyBtn);
            tdSql.appendChild(sqlWrap);
            tr.appendChild(tdSql);

            queryRows.appendChild(tr);
        }
    }

    function render(payload) {
        renderStatusBar(payload.summary);
        renderTable(payload.recent);
    }

    function nuiCallback(name) {
        fetch(`https://${resourceName}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({}),
        }).catch(() => {});
    }

    document.getElementById('close-btn').addEventListener('click', () => nuiCallback('close'));
    document.getElementById('refresh-btn').addEventListener('click', () => nuiCallback('refresh'));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            nuiCallback('close');
        }
    });

    window.addEventListener('message', (event) => {
        const data = event.data;

        if (!data || typeof data !== 'object') {
            return;
        }

        if (data.type === 'visibility') {
            body.classList.toggle('visible', Boolean(data.visible));
        } else if (data.type === 'stats') {
            render(data.payload);
        } else if (data.type === 'disabled') {
            statusBar.innerHTML = '';
            statusLegend.innerHTML = '';
            statusBar.style.display = 'none';
            statusLegend.style.display = 'none';
            queryRows.innerHTML = '';
            emptyState.textContent = data.reason || 'pg-wrapper debug mode is disabled.';
            emptyState.style.display = 'block';
        }
    });
})();
