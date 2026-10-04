// Per-install daily cap, counted in D1 when the DB binding exists. One atomic upsert per check.
// The Anthropic workspace's monthly spend limit is the hard backstop behind it.
export async function takeDailyUse(env, installId, now = new Date()) {
  const limit = Number(env.DAILY_LIMIT_PER_INSTALL || 20);
  if (!env.DB) return { ok: true, used: 0, limit };
  const row = await env.DB.prepare(
    "INSERT INTO uses (install_id, day, count) VALUES (?1, ?2, 1) " +
      "ON CONFLICT (install_id, day) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(installId, now.toISOString().slice(0, 10))
    .first();
  const used = Number(row?.count) || 0;
  return { ok: used <= limit, used, limit };
}
