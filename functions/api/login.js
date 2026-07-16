import {
  bad,
  createSession,
  ensureAdmin,
  json,
  sessionCookie,
  verifyPassword,
} from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    await ensureAdmin(env);
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) return bad("请输入用户名和密码");

    const user = await env.DB.prepare(
      `SELECT id, username, password_hash, salt, role, status FROM users WHERE username = ? COLLATE NOCASE`
    )
      .bind(username)
      .first();

    if (!user) return bad("用户名或密码错误", 401);

    const ok = await verifyPassword(password, user.salt, user.password_hash);
    if (!ok) return bad("用户名或密码错误", 401);

    if (user.status === "pending") {
      return bad("账号待管理员授权，请稍后再试", 403);
    }
    if (user.status === "rejected") {
      return bad("注册未通过授权，请联系管理员", 403);
    }
    if (user.status === "disabled") {
      return bad("账号已被禁用", 403);
    }
    if (user.status !== "active") {
      return bad("账号不可用", 403);
    }

    const session = await createSession(env.DB, user.id);
    return json(
      {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
        },
      },
      200,
      {
        "Set-Cookie": sessionCookie(session.token, session.maxAge),
      }
    );
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}
