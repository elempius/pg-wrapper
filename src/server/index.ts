import { batch, execute, insert, query, scalar, transaction, type BatchStatement, type Params } from './query';
import { columns, tableExists } from './schema';
import { isReady, shutdown, whenReady } from './pool';
import { getStats } from './metrics';

type Callback<T> = (err: Error | null, result?: T) => void;

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

/** Lets every export accept an optional trailing callback in addition to returning a promise. */
function withCallback<T>(promise: Promise<T>, cb?: Callback<T>): Promise<T> | void {
    if (typeof cb !== 'function') {
        return promise;
    }

    promise.then((result) => cb(null, result)).catch((err) => cb(toError(err)));
    return undefined;
}

/** Normalizes the common `(params?, cb?)` trailing-argument pattern used by every query export. */
function splitParamsAndCallback(maybeParams: unknown, maybeCb: unknown): { params: Params; cb?: Callback<unknown> } {
    if (typeof maybeParams === 'function') {
        return { params: [], cb: maybeParams as Callback<unknown> };
    }

    return { params: (maybeParams as Params) ?? [], cb: maybeCb as Callback<unknown> | undefined };
}

exports('query', (text: string, maybeParams?: unknown, maybeCb?: unknown) => {
    const { params, cb } = splitParamsAndCallback(maybeParams, maybeCb);
    return withCallback(
        query(text, params).then((result) => result.rows),
        cb,
    );
});

exports('scalar', (text: string, maybeParams?: unknown, maybeCb?: unknown) => {
    const { params, cb } = splitParamsAndCallback(maybeParams, maybeCb);
    return withCallback(scalar(text, params), cb);
});

exports('execute', (text: string, maybeParams?: unknown, maybeCb?: unknown) => {
    const { params, cb } = splitParamsAndCallback(maybeParams, maybeCb);
    return withCallback(execute(text, params), cb);
});

exports('insert', (text: string, maybeParams?: unknown, maybeCb?: unknown) => {
    const { params, cb } = splitParamsAndCallback(maybeParams, maybeCb);
    return withCallback(insert(text, params), cb);
});

exports('batch', (statements: BatchStatement[], cb?: Callback<number[]>) => {
    return withCallback(batch(statements), cb);
});

exports('transaction', (fn: (client: unknown) => Promise<unknown>, cb?: Callback<unknown>) => {
    return withCallback(transaction(fn as never), cb);
});

exports('tableExists', (table: string, cb?: Callback<boolean>) => {
    return withCallback(tableExists(table), cb);
});

exports('columns', (table: string, cb?: Callback<unknown>) => {
    return withCallback(columns(table), cb);
});

exports('isReady', () => isReady());

exports('ready', (cb?: Callback<void>) => {
    return withCallback(whenReady(), cb);
});

function debugEnabled(): boolean {
    return GetConvar('pg_debug', 'false') === 'true';
}

function canViewStats(playerSrc: number): boolean {
    return IsPlayerAceAllowed(String(playerSrc), 'command.pgstats');
}

// `restricted: true` enforces the `command.pgstats` ACE before the handler runs.
RegisterCommand(
    'pgstats',
    (playerSrc: number) => {
        if (!debugEnabled()) {
            emitNet(
                'pg-wrapper:disabled',
                playerSrc,
                'pg-wrapper debug mode is disabled. Set pg_debug "true" in server.cfg to enable the query stats overlay.',
            );
            return;
        }

        TriggerClientEvent('pg-wrapper:openStats', playerSrc);
    },
    true,
);

onNet('pg-wrapper:requestStats', () => {
    const playerSrc = source;

    if (!debugEnabled() || !canViewStats(playerSrc)) {
        emitNet('pg-wrapper:disabled', playerSrc, 'pg-wrapper debug mode is disabled or you lack permission.');
        return;
    }

    emitNet('pg-wrapper:stats', playerSrc, getStats());
});

on('onResourceStop', (resourceName: string) => {
    if (GetCurrentResourceName() === resourceName) {
        shutdown().catch((err) => console.error(`[pg-wrapper] error during shutdown: ${toError(err).message}.`));
    }
});

whenReady().catch((err) =>
    console.error(`[pg-wrapper] initial connection failed permanently: ${toError(err).message}.`),
);

console.log('[pg-wrapper] starting, connecting to PostgreSQL...');
