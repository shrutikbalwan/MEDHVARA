/**
 * A tiny in-memory stand-in for the Supabase query builder, covering exactly
 * the calls this codebase makes: select / eq / in / order / limit / returns,
 * insert, and upsert with onConflict (+ ignoreDuplicates). Awaiting a query
 * runs it. Tables named in `fail` return an RLS-style error instead.
 */
type Row = Record<string, unknown>;

export function fakeSupabase(seed: Record<string, Row[]> = {}, fail: string[] = []) {
  const db: Record<string, Row[]> = {};
  const table = (name: string) => (db[name] ??= []);
  for (const [name, rows] of Object.entries(seed)) table(name).push(...rows.map((r) => ({ ...r })));

  const from = (name: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let limit = Infinity;
    let write: { rows: Row[]; key: string[] | null } | null = null;

    const run = () => {
      if (fail.includes(name)) {
        return { data: null, error: { code: "42501", message: `permission denied for table ${name}` } };
      }
      if (write) {
        const rows = table(name);
        const inserted = write.key
          ? write.rows.filter((r) => !rows.some((e) => write!.key!.every((k) => e[k] === r[k])))
          : write.rows;
        rows.push(...inserted.map((r) => ({ ...r })));
        return { data: inserted, error: null };
      }
      return { data: table(name).filter((r) => filters.every((f) => f(r))).slice(0, limit), error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      returns: () => builder,
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      eq: (key: string, value: unknown) => (filters.push((r) => r[key] === value), builder),
      in: (key: string, values: unknown[]) => (filters.push((r) => values.includes(r[key])), builder),
      insert: (rows: Row | Row[]) => ((write = { rows: ([] as Row[]).concat(rows), key: null }), builder),
      upsert: (rows: Row | Row[], options: { onConflict?: string } = {}) => (
        (write = { rows: ([] as Row[]).concat(rows), key: options.onConflict?.split(",") ?? null }), builder
      ),
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
        try {
          resolve(run());
        } catch (error) {
          reject(error);
        }
      },
    };
    return builder;
  };

  // Cast: callers type their parameter as the real server client.
  return { db, client: { from } as never };
}
