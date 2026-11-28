// ORIGIN logical backup: schema + data of the public schema, read-only, from one consistent snapshot.
// No passwords or secrets are exported (roles are recorded by name and attributes only).
// Usage: SOURCE_URL=postgres://... node logical-backup.mjs > backup.json     (needs: npm i pg)
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.SOURCE_URL, ssl: process.env.SOURCE_SSL === 'off' ? false : { rejectUnauthorized: false } });
await c.connect();
await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TimeZone = 'UTC'");
const rows = async (sql, p) => (await c.query(sql, p)).rows;

const tables = await rows(`
  SELECT c.oid, c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY c.relname`);
for (const t of tables) {
  t.columns = await rows(`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS "default", a.attidentity AS identity
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid]);
  t.grants = await rows(`
    SELECT coalesce(r.rolname, 'PUBLIC') AS grantee, x.privilege_type AS privilege
    FROM pg_class c, aclexplode(c.relacl) x LEFT JOIN pg_roles r ON r.oid = x.grantee
    WHERE c.oid = $1 AND coalesce(r.rolname, 'PUBLIC') <> pg_get_userbyid(c.relowner)`, [t.oid]);
  t.column_grants = await rows(`
    SELECT a.attname AS column, coalesce(r.rolname, 'PUBLIC') AS grantee, x.privilege_type AS privilege
    FROM pg_attribute a, aclexplode(a.attacl) x LEFT JOIN pg_roles r ON r.oid = x.grantee
    WHERE a.attrelid = $1 AND a.attacl IS NOT NULL`, [t.oid]);
  t.data = (await rows(`SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text AS j FROM ${c.escapeIdentifier(t.name)} x`))[0].j;
  t.checksum = (await rows(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text COLLATE "C"), '')) AS md5 FROM ${c.escapeIdentifier(t.name)} x`))[0];
  delete t.oid;
}

const backup = {
  format: 'origin-logical-backup/1',
  taken_at: (await rows('SELECT now() AS t'))[0].t,
  server_version: (await rows('SHOW server_version'))[0].server_version,
  roles: await rows(`
    SELECT rolname AS name, rolsuper AS super, rolbypassrls AS bypassrls, rolcanlogin AS login
    FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> current_user ORDER BY 1`),
  enums: await rows(`
    SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY 1 ORDER BY 1`),
  sequences: await rows(`
    SELECT s.sequencename AS name, s.data_type::text AS type, s.last_value, s.increment_by, s.start_value,
           (SELECT d.refobjid::regclass::text || '.' || a.attname FROM pg_depend d JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
             WHERE d.objid = (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass AND d.deptype IN ('a', 'i') LIMIT 1) AS owned_by,
           EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass AND d.deptype = 'i') AS identity
    FROM pg_sequences s WHERE s.schemaname = 'public' ORDER BY 1`),
  sequence_grants: await rows(`
    SELECT c.relname AS sequence, coalesce(r.rolname, 'PUBLIC') AS grantee, x.privilege_type AS privilege
    FROM pg_class c, aclexplode(c.relacl) x LEFT JOIN pg_roles r ON r.oid = x.grantee
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND coalesce(r.rolname, 'PUBLIC') <> pg_get_userbyid(c.relowner)`),
  tables,
  constraints: await rows(`
    SELECT conrelid::regclass::text AS "table", conname AS name, contype AS type, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype IN ('p', 'u', 'c', 'f', 'x')
    ORDER BY CASE contype WHEN 'f' THEN 1 ELSE 0 END, 1, 2`),
  indexes: await rows(`
    SELECT indexrelid::regclass::text AS name, pg_get_indexdef(indexrelid) AS def FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid WHERE c.relnamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid) ORDER BY 1`),
  functions: await rows(`
    SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS def, pg_get_userbyid(p.proowner) AS owner,
           p.proacl IS NOT NULL AS has_acl,
           coalesce((SELECT array_agg(coalesce(r.rolname::text, 'PUBLIC')) FROM aclexplode(p.proacl) x LEFT JOIN pg_roles r ON r.oid = x.grantee
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner), '{}') AS execute_grantees
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 1`),
  triggers: await rows(`
    SELECT tgname AS name, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal ORDER BY 1`),
  policies: await rows(`
    SELECT tablename AS "table", policyname AS name, permissive, roles::text[] AS roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`),
};
await c.query('COMMIT');
await c.end();
process.stdout.write(JSON.stringify(backup));
