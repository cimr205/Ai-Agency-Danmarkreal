// Read-only: checks that set_config(..., true) does not leak to the next query on the same connection.

import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DBURL, ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on' });
await c.connect();
const r1 = await c.query(`SELECT 1 WHERE set_config('app.tenant_id', 'tenant_test', true) IS NULL; SELECT current_setting('app.tenant_id', true) AS inside`);
const inside = r1[1].rows[0].inside, prefixRows = r1[0].rows.length;
const after = (await c.query(`SELECT coalesce(current_setting('app.tenant_id', true), '') AS after`)).rows[0].after;
console.log({ prefix_rows: prefixRows, inside_same_query: inside, next_query_on_same_connection: after === '' ? '(empty)' : after });
console.log(prefixRows === 0 && inside === 'tenant_test' && after === '' ? 'PASS no leakage between queries' : 'FAIL');
await c.end();
