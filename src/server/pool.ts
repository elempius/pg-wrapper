import { Pool } from 'pg';

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;

let pool: Pool | undefined;
let readyPromise: Promise<void> | undefined;
let ready = false;

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

function createPool(): Pool {
    const instance = new Pool({
        connectionString: connectionString(),
        max: poolMax(),
        statement_timeout: statementTimeoutMs(),
        query_timeout: statementTimeoutMs(),
        connectionTimeoutMillis: connectionTimeoutMs(),
    });

    instance.on('error', (err) => {
        console.error(`[pg-wrapper] unexpected error on idle client: ${err.message}.`);
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
            console.log('[pg-wrapper] connected to PostgreSQL.');
            return;
        } catch (err) {
            attempt += 1;
            const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
            const message = err instanceof Error ? err.message : String(err);

            console.error(`[pg-wrapper] connection attempt ${attempt} failed (${message}), retrying in ${delay}ms.`);

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
    ready = false;
    readyPromise = undefined;

    if (pool) {
        await pool.end();
        pool = undefined;
    }
}
