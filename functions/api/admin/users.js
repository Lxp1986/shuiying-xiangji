import { bad, ensureAdmin, getSessionUser, json } from "../../_lib/auth.js";

async function requireAdmin(env, request) {
  await ensureAdmin(env);
  const user = await getSessionUser(env, request);
  if (!user) return { error: bad("未登录", 401) };
  if (user.role !== "admin") return { error: bad("需要管理员权限", 403) };
  return { user };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const gate = await requireAdmin(env, request);
    if (gate.error) return gate.error;

    const { results } = await env.DB.prepare(
      `SELECT id, username, role, status, created_at, updated_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    ).all();

    return json({ ok: true, users: results || [] });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}

/** 禁用 / 启用用户 */
export async function onRequestPatch(context) {
  const { request, env } = context;
  try {
    const gate = await requireAdmin(env, request);
    if (gate.error) return gate.error;

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();
    if (!id) return bad("缺少用户 id");
    if (!["active", "disabled", "pending", "rejected"].includes(status)) {
      return bad("无效状态");
    }

    const target = await env.DB.prepare(
      `SELECT id, role, username FROM users WHERE id = ?`
    )
      .bind(id)
      .first();
    if (!target) return bad("用户不存在", 404);
    if (target.role === "admin" && status !== "active") {
      return bad("不能禁用管理员账号");
    }

    const now = Date.now();
    await env.DB.prepare(
      `UPDATE users SET status = ?, updated_at = ? WHERE id = ?`
    )
      .bind(status, now, id)
      .run();

    if (status === "disabled" || status === "rejected") {
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}
