const HISTORY_LIMIT = 500;

export interface QueryMetric {
    timestamp: number;
    resource: string;
    text: string;
    durationMs: number;
    status: 'ok' | 'error';
}

const history: QueryMetric[] = [];

function slowThresholdMs(): number {
    const raw = GetConvarInt('pg_slowQueryWarnMs', 100);
    return raw > 0 ? raw : 100;
}

export function record(entry: QueryMetric): void {
    history.push(entry);

    if (history.length > HISTORY_LIMIT) {
        history.shift();
    }
}

/** Mutually exclusive so the three counts always add up to `total`. */
function categoryOf(entry: QueryMetric, slowMs: number): 'ok' | 'slow' | 'error' {
    if (entry.status === 'error') return 'error';
    if (entry.durationMs >= slowMs) return 'slow';
    return 'ok';
}

export interface StatsSummary {
    total: number;
    okCount: number;
    slowCount: number;
    errorCount: number;
}

export interface Stats {
    summary: StatsSummary;
    recent: QueryMetric[];
}

export function getStats(): Stats {
    const slowMs = slowThresholdMs();
    const total = history.length;

    let okCount = 0;
    let slowCount = 0;
    let errorCount = 0;

    for (const entry of history) {
        const category = categoryOf(entry, slowMs);
        if (category === 'ok') okCount += 1;
        else if (category === 'slow') slowCount += 1;
        else errorCount += 1;
    }

    // Most recent first. `history` is append-only (oldest evicted from the
    // front), so the last N entries are simply the N most recent calls -
    // sorting by duration instead would let a stale burst of slow queries
    // (e.g. a big benchmark run) bury genuinely recent activity out of view.
    const recent = history.slice(-100).reverse();

    return {
        summary: { total, okCount, slowCount, errorCount },
        recent,
    };
}
