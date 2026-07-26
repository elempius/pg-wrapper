# pg-wrapper

A PostgreSQL connector/wrapper resource for FXServer (FiveM/RedM). Exposes
`query`/`scalar`/`execute`/`insert`/`batch`/`transaction` exports usable from
Lua or JS/TS resources, plus an in-game debug overlay (`/pgstats`) showing
recent query activity and duration.

## Installation

1. Download the latest release zip from the
   [Releases page](https://github.com/elempius/pg-wrapper/releases) and
   extract the `pg-wrapper` folder into your `resources/` directory. It
   already contains the built `dist/server.js` / `dist/client.js` — no
   build step needed.
2. Add to `server.cfg`:

   ```
   set pg_connectionString "postgres://user:password@host:5432/database"
   ensure pg-wrapper
   ```

Cloning `main` directly instead of using a release? `dist/` isn't committed
to the repo (it's build output) — see [Development](#development) to build
it yourself first.

## Convars

| Convar | Default | Purpose |
|---|---|---|
| `pg_connectionString` | *(required)* | Postgres connection string. |
| `pg_poolMax` | `10` | Max concurrent pool connections. |
| `pg_statementTimeoutMs` | `30000` | Server-side statement timeout (ms); also used as the client-side query timeout. Caps how long one query can hold a connection. |
| `pg_connectionTimeoutMs` | `10000` | How long to wait for a free pool connection before giving up. |
| `pg_slowQueryWarnMs` | `100` | Queries at or above this duration are logged as slow and flagged in the stats overlay. |
| `pg_debug` | `false` | Must be `"true"` for `/pgstats` and the stats overlay to return data. |

## Exports

Every export accepts either a promise-style call (await the return value) or
a trailing callback `(err, result)`. Params can be positional (`$1, $2, ...`
via an array) or named (`:name` via an object).

```lua
-- callback style (safe to fire many of these concurrently)
exports['pg-wrapper']:query('SELECT * FROM players WHERE id = $1', { playerId }, function(err, rows)
    if err then return end
    print(#rows)
end)

-- promise style (FXServer auto-awaits the returned promise across the Lua/JS
-- boundary, blocking only the calling coroutine)
local rows = exports['pg-wrapper']:query('SELECT * FROM players WHERE name = :name', { name = 'alice' })
```

```ts
// from another TS/JS resource
const rows = await exports['pg-wrapper'].query('SELECT * FROM players WHERE id = $1', [playerId]);
```

| Export | Returns |
|---|---|
| `query(text, params?)` | array of rows |
| `scalar(text, params?)` | first column of the first row, or `null` |
| `execute(text, params?)` | affected row count |
| `insert(text, params?)` | inserted id (auto-appends `RETURNING id` if the query has no `RETURNING` clause) |
| `batch(statements[])` | array of row counts, all run in a single transaction. `statements` is `{ text, params? }[]` |
| `transaction(fn)` | whatever `fn(client)` returns; runs inside `BEGIN`/`COMMIT`/`ROLLBACK` |
| `tableExists(table)` | boolean |
| `columns(table)` | column metadata from `information_schema.columns` |
| `isReady()` | boolean, synchronous |
| `ready()` | promise/callback that resolves once connected |

Always bind values as params — never concatenate them into the query string.
Aside from the usual SQL-injection risk, raw query *text* (not bound values)
is visible in the `/pgstats` overlay and slow-query console logs to anyone
with the `command.pgstats` ACE, so embedding a literal secret directly in a
query string would leak it there too.

## Query stats overlay

Grant the ACE and turn on debug mode:

```
set pg_debug "true"
add_ace group.admin command.pgstats allow
```

Then admins can run `/pgstats` in-game to open an overlay showing the most
recent queries (duration, resource, status) and an ok/slow/error breakdown.
The command is `restricted: true` server-side, so FXServer enforces the ACE
before the handler runs; the stats-request event also re-checks the ACE and
`pg_debug` server-side independently, since any connected client can trigger
a network event by name regardless of the intended UI flow.

## Trust model

Every export is callable by any other server-side resource with no
additional permission checks — this matches how `oxmysql` and similar
wrappers work. Any resource running on the same server already has full
Node/V8 access, so this isn't an additional privilege boundary; installing
an untrusted resource grants it full database access through this wrapper
regardless.

## Development

```
npm install
npm run typecheck
npm run build
```

- `src/server/` — server-side TS (Node), bundled to `dist/server.js` via esbuild.
- `src/client/` — client-side TS, bundled to `dist/client.js`.
- `web/` — the NUI overlay (plain HTML/CSS/JS, not bundled).

## License

MIT — see [LICENSE](LICENSE).
