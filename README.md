# pg-wrapper

A PostgreSQL connector for FXServer. Exposes `query` / `scalar` / `execute` /
`insert` / `batch` / `transaction` exports for Lua or JS/TS resources, plus
an in-game query stats overlay (`/pgstats`).

> Developed and tested on the new enhanced version of the game (GTA V
> Enhanced / FiveM early-access client). Not verified against legacy FiveM.

## Installation

1. Grab the latest zip from [Releases](https://github.com/elempius/pg-wrapper/releases) and extract into `resources/`.
2. Add to `server.cfg`:

   ```
   set pg_connectionString "postgres://user:password@host:5432/database"
   ensure pg-wrapper
   ```

(Cloning `main` instead of a release? `dist/` isn't committed — run `npm install && npm run build` first.)

## Convars

| Convar | Default | Purpose |
|---|---|---|
| `pg_connectionString` | *(required)* | Postgres connection string |
| `pg_poolMax` | `10` | Max concurrent pool connections |
| `pg_statementTimeoutMs` | `30000` | Max time a single query can run |
| `pg_connectionTimeoutMs` | `10000` | Max time to wait for a free connection |
| `pg_slowQueryWarnMs` | `100` | Threshold for slow-query warnings |
| `pg_debug` | `false` | Must be `"true"` to enable `/pgstats` |

## Usage

Params can be positional (`$1`, array) or named (`:name`, object). Every
export works as a promise or with a trailing `(err, result)` callback.

```lua
exports['pg-wrapper']:query('SELECT * FROM players WHERE id = $1', { playerId }, function(err, rows)
    if err then return end
    print(#rows)
end)

-- or, without a callback, auto-awaited by FXServer's Lua/JS interop:
local rows = exports['pg-wrapper']:query('SELECT * FROM players WHERE name = :name', { name = 'alice' })
```

```ts
const rows = await exports['pg-wrapper'].query('SELECT * FROM players WHERE id = $1', [playerId]);
```

| Export | Returns |
|---|---|
| `query(text, params?)` | rows |
| `scalar(text, params?)` | first column of first row, or `null` |
| `execute(text, params?)` | affected row count |
| `insert(text, params?)` | inserted id (auto-adds `RETURNING id`) |
| `batch(statements[])` | row counts, all in one transaction |
| `transaction(fn)` | result of `fn(client)`, wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` |
| `tableExists(table)` / `columns(table)` | schema info |
| `isReady()` / `ready()` | connection state |

Always bind values as params, never concatenate — raw query text (not bound
values) is visible in `/pgstats` and slow-query logs.

## Stats overlay

```
set pg_debug "true"
add_ace group.admin command.pgstats allow
```

`/pgstats` in-game opens an overlay of recent queries and an ok/slow/error
breakdown. Access is enforced server-side via the `command.pgstats` ACE.

## Development

```
npm install && npm run typecheck && npm run build
```

`src/server` and `src/client` are TS, bundled with esbuild into `dist/`.
`web/` (the NUI overlay) is plain HTML/CSS/JS, not bundled.

## License

MIT — see [LICENSE](LICENSE).
