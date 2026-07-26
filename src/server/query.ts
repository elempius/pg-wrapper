import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPool } from './pool';
import { resolveParams } from './params';
import { record as recordMetric } from './metrics';

const DEFAULT_SLOW_QUERY_MS = 100;

function slowQueryThresholdMs(): number {
    const raw = GetConvarInt('pg_slowQueryWarnMs', DEFAULT_SLOW_QUERY_MS);
    return raw > 0 ? raw : DEFAULT_SLOW_QUERY_MS;
}

function callerResource(): string {
    try {
        return GetInvokingResource() || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const caller = callerResource();
    const start = Date.now();
    let status: 'ok' | 'error' = 'ok';

    try {
        return await fn();
    } catch (err) {
        status = 'error';
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`pg-wrapper: query from resource "${caller}" failed: ${message}.`);
    } finally {
        const duration = Date.now() - start;

        recordMetric({
            timestamp: Date.now(),
            resource: caller,
            text: label.length > 200 ? `${label.slice(0, 200)}…` : label,
            durationMs: duration,
            status,
        });

        if (duration >= slowQueryThresholdMs()) {
            console.warn(`[pg-wrapper] slow query (${duration}ms) from resource "${caller}": ${label}.`);
        }
    }
}

export type Params = unknown[] | Record<string, unknown>;

export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: Params = [],
): Promise<QueryResult<T>> {
    return timed(text, async () => {
        const pool = await getPool();
        const { text: resolvedText, values } = resolveParams(text, params);
        return pool.query<T>(resolvedText, values);
    });
}

export async function scalar<T = unknown>(text: string, params: Params = []): Promise<T | null> {
    const result = await query(text, params);
    const row = result.rows[0];

    if (!row) {
        return null;
    }

    const firstKey = Object.keys(row)[0];
    return (firstKey ? (row as Record<string, unknown>)[firstKey] : null) as T | null;
}

export async function execute(text: string, params: Params = []): Promise<number> {
    const result = await query(text, params);
    return result.rowCount ?? 0;
}

/**
 * Runs an INSERT and returns the first column of the first returned row.
 * Appends `RETURNING id` automatically if the query has no RETURNING clause.
 */
export async function insert(text: string, params: Params = []): Promise<unknown> {
    const hasReturning = /\breturning\b/i.test(text);
    const finalText = hasReturning ? text : `${text} RETURNING id`;
    return scalar(finalText, params);
}

export interface BatchStatement {
    text: string;
    params?: Params;
}

/** Runs a list of statements sequentially inside a single transaction. */
export async function batch(statements: BatchStatement[]): Promise<number[]> {
    return transaction(async (client) => {
        const results: number[] = [];

        for (const statement of statements) {
            const { text, values } = resolveParams(statement.text, statement.params ?? []);
            const result = await client.query(text, values);
            results.push(result.rowCount ?? 0);
        }

        return results;
    });
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = await getPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
