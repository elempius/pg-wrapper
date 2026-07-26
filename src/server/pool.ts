import { Pool } from 'pg';

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;

let pool: Pool | undefined;
let readyPromise: Promise<void> | undefined;
let ready = false;
let stopping = false;

function connectionString(): string {
    const value = GetConvar('pg_connectionString', '');

    if (!value) {
        throw new Error('pg-wrapper: convar "pg_connectionString" is not set in server.cfg.');
    }

    return value;
}

function poolMax(): number {
    const raw = GetConvarInt('pg_poolMax', 10);
    return raw > 0 ? raw : 10;
}

/** Caps how long a query may run before Postgres cancels it, so one bad query can't starve the pool. */
function statementTimeoutMs(): number {
    const raw = GetConvarInt('pg_statementTimeoutMs', 30000);
    return raw > 0 ? raw : 30000;
}

/** Caps how long `pool.connect()` will wait for a free connection before giving up. */
function connectionTimeoutMs(): number {
    const raw = GetConvarInt('pg_connectionTimeoutMs', 10000);
    return raw > 0 ? raw : 10000;
}

const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'EPIPE',
]);

/**
 * A dead pool surfaces two different ways: an already-idle client's socket
 * dying (`pool.on('error')`) or a query failing because the pool couldn't
 * open a *new* connection at all (a rejected `pool.query()`/`connect()` -
 * this never touches `pool.on('error')`). Both need to be recognized as
 * "we're not really connected anymore", so both paths funnel into this check.
 */
function looksLikeConnectionLoss(err: unknown): boolean {
    const code = (err as { code?: unknown } | undefined)?.code;

    if (typeof code === 'string') {
        if (CONNECTION_ERROR_CODES.has(code)) {
            return true;
        }
        // Postgres' own "connection_exception" error class.
        if (code.startsWith('08')) {
            return true;
        }
    }

    const message = err instanceof Error ? err.message : '';
    return /connection terminated|terminating connection|client has encountered a connection error/i.test(message);
}

/** Drops the ready state and restarts the retry-with-backoff loop, so callers block on `whenReady()` instead of hammering a dead pool. */
function beginReconnect(): void {
    if (stopping || !ready) {
        return;
    }

    ready = false;
    const dead = pool;
    pool = undefined;

    console.warn('lost connection to PostgreSQL, reconnecting...');
    dead?.end().catch(() => {});

    readyPromise = connectWithRetry();
}

/** Called from `query.ts` whenever a query throws, in case the pool is dead rather than the query being bad. */
export function reportQueryError(err: unknown): void {
    if (looksLikeConnectionLoss(err)) {
        beginReconnect();
    }
}

function createPool(): Pool {
    const instance = new Pool({
        connectionString: connectionString(),
        max: poolMax(),
        statement_timeout: statementTimeoutMs(),
        query_timeout: statementTimeoutMs(),
        connectionTimeoutMillis: connectionTimeoutMs(),
    });

    instance.on('error', (err) => {
        console.error(`unexpected error on idle client: ${err.message}.`);
        beginReconnect();
    });

    return instance;
}

async function connectWithRetry(): Promise<void> {
    let attempt = 0;

    for (;;) {
        try {
            pool = createPool();
            await pool.query('SELECT 1');
            ready = true;
            console.log('connected to PostgreSQL.');
            return;
        } catch (err) {
            attempt += 1;
            const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
            const message = err instanceof Error ? err.message : String(err);

            console.error(`connection attempt ${attempt} failed (${message}), retrying in ${delay}ms.`);

            try {
                await pool?.end();
            } catch {}

            pool = undefined;

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

export function isReady(): boolean {
    return ready;
}

export function whenReady(): Promise<void> {
    if (ready) {
        return Promise.resolve();
    }

    if (!readyPromise) {
        readyPromise = connectWithRetry();
    }

    return readyPromise;
}

export async function getPool(): Promise<Pool> {
    await whenReady();

    if (!pool) {
        throw new Error('pg-wrapper: pool unavailable after ready state.');
    }

    return pool;
}

export async function shutdown(): Promise<void> {
    stopping = true;
    ready = false;
    readyPromise = undefined;

    if (pool) {
        await pool.end();
        pool = undefined;
    }
}
