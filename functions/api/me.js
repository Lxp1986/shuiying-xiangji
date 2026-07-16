import { ensureAdmin, getSessionUser, json, publicUser } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    await ensureAdmin(env);
    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: true, user: null });
    return json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}
