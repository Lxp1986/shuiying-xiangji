import {
  bad,
  createSession,
  ensureAdmin,
  hashPassword,
  json,
  randomToken,
  sessionCookie,
  uid,
} from "../_lib/auth.js";

/**
 * 注册必须提供有效的管理员授权码（invite code）。
 * 使用成功后邀请码作废；账号立即 active。
 * 也可配置：无码时创建 pending（默认关闭，仅允许授权注册）。
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    await ensureAdmin(env);
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const inviteCode = String(body.inviteCode || body.invite || "")
      .trim()
      .toUpperCase();

    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/.test(username)) {
      return bad("用户名 2–32 位，仅字母数字下划线或中文");
    }
    if (password.length < 8) return bad("密码至少 8 位");
    if (password.length > 128) return bad("密码过长");
    if (!inviteCode) return bad("请填写管理员授权码（注册必须授权）");

    const existing = await env.DB.prepare(
      `SELECT id FROM users WHERE username = ? COLLATE NOCASE`
    )
      .bind(username)
      .first();
    if (existing) return bad("用户名已存在");

    const invite = await env.DB.prepare(
      `SELECT code, expires_at, revoked, used_by FROM invite_codes WHERE code = ?`
    )
      .bind(inviteCode)
      .first();

    if (!invite) return bad("授权码无效");
    if (invite.revoked) return bad("授权码已作废");
    if (invite.used_by) return bad("授权码已被使用");
    if (invite.expires_at && invite.expires_at < Date.now()) {
      return bad("授权码已过期");
    }

    const now = Date.now();
    const id = uid();
    const salt = randomToken(16);
    const password_hash = await hashPassword(password, salt);

    // 事务：创建用户 + 核销邀请码
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, username, password_hash, salt, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`
      ).bind(id, username, password_hash, salt, now, now),
      env.DB.prepare(
        `UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL AND revoked = 0`
      ).bind(id, now, inviteCode),
    ]);

    // 确认核销成功（防并发双用）
    const used = await env.DB.prepare(
      `SELECT used_by FROM invite_codes WHERE code = ?`
    )
      .bind(inviteCode)
      .first();
    if (!used || used.used_by !== id) {
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      return bad("授权码核销失败，请换一个码重试");
    }

    const session = await createSession(env.DB, id);
    return json(
      {
        ok: true,
        user: { id, username, role: "user", status: "active" },
      },
      200,
      { "Set-Cookie": sessionCookie(session.token, session.maxAge) }
    );
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("UNIQUE")) return bad("用户名已存在");
    return json({ ok: false, error: msg || "server error" }, 500);
  }
}
