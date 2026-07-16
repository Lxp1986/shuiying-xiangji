import {
  bad,
  ensureAdmin,
  genInviteCode,
  getSessionUser,
  json,
} from "../../_lib/auth.js";

async function requireAdmin(env, request) {
  await ensureAdmin(env);
  const user = await getSessionUser(env, request);
  if (!user) return { error: bad("未登录", 401) };
  if (user.role !== "admin") return { error: bad("需要管理员权限", 403) };
  return { user };
}

/** 列出授权码 */
export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const gate = await requireAdmin(env, request);
    if (gate.error) return gate.error;

    const { results } = await env.DB.prepare(
      `SELECT code, created_by, note, used_by, used_at, expires_at, created_at, revoked
       FROM invite_codes ORDER BY created_at DESC LIMIT 100`
    ).all();

    // 附带使用者用户名
    const users = {};
    for (const row of results || []) {
      if (row.used_by && !users[row.used_by]) {
        const u = await env.DB.prepare(
          `SELECT username FROM users WHERE id = ?`
        )
          .bind(row.used_by)
          .first();
        users[row.used_by] = u?.username || row.used_by;
      }
    }

    const invites = (results || []).map((r) => ({
      ...r,
      used_username: r.used_by ? users[r.used_by] : null,
      status: r.revoked
        ? "revoked"
        : r.used_by
          ? "used"
          : r.expires_at && r.expires_at < Date.now()
            ? "expired"
            : "available",
    }));

    return json({ ok: true, invites });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}

/** 生成授权码 count=1..20，可选 days 有效期、note 备注 */
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const gate = await requireAdmin(env, request);
    if (gate.error) return gate.error;

    const body = await request.json().catch(() => ({}));
    let count = Number(body.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 20) count = 20;
    const days = body.days != null ? Number(body.days) : 30;
    const note = String(body.note || "").slice(0, 100);
    const now = Date.now();
    const expires_at =
      days > 0 ? now + days * 24 * 60 * 60 * 1000 : null;

    const codes = [];
    for (let i = 0; i < count; i++) {
      let code = genInviteCode();
      // 极低概率碰撞，重试
      for (let t = 0; t < 5; t++) {
        try {
          await env.DB.prepare(
            `INSERT INTO invite_codes (code, created_by, note, used_by, used_at, expires_at, created_at, revoked)
             VALUES (?, ?, ?, NULL, NULL, ?, ?, 0)`
          )
            .bind(code, gate.user.id, note || null, expires_at, now)
            .run();
          codes.push(code);
          break;
        } catch {
          code = genInviteCode();
        }
      }
    }

    return json({ ok: true, codes });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}

/** 作废授权码 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const gate = await requireAdmin(env, request);
    if (gate.error) return gate.error;

    const url = new URL(request.url);
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return bad("缺少 code");

    await env.DB.prepare(
      `UPDATE invite_codes SET revoked = 1 WHERE code = ? AND used_by IS NULL`
    )
      .bind(code)
      .run();

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}
