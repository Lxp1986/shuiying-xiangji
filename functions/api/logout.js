import { clearSessionCookie, json, parseCookies } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const cookies = parseCookies(request);
    const token = cookies.sy_session;
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearSessionCookie() }
    );
  } catch (e) {
    return json({ ok: false, error: e.message || "server error" }, 500);
  }
}
