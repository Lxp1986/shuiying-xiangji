/** 认证工具：密码哈希、会话、JSON 响应 */

const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 100000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function bad(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

export function uid() {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return [...new Uint8Array(bits)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(password, salt, expectedHash) {
  const h = await hashPassword(password, salt);
  if (h.length !== expectedHash.length) return false;
  let ok = 0;
  for (let i = 0; i < h.length; i++) ok |= h.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return ok === 0;
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  const secure = "Secure; ";
  return `sy_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return `sy_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function ensureSchema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_by TEXT,
        note TEXT,
        used_by TEXT,
        used_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      )
    `),
  ]);
}

/**
 * 首次初始化：若无用户，创建管理员
 * 账号/密码来自环境变量，缺省为用户指定的管理员
 */
export async function ensureAdmin(env) {
  const db = env.DB;
  await ensureSchema(db);
  const row = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (row) return;

  // 首次部署：用环境变量创建管理员（wrangler pages secret put ADMIN_PASSWORD）
  const username = (env.ADMIN_USERNAME || "yclxp").trim();
  const password = env.ADMIN_PASSWORD;
  if (!password) {
    console.error(
      "[auth] 无管理员且未设置 ADMIN_PASSWORD，请执行: wrangler pages secret put ADMIN_PASSWORD"
    );
    return;
  }
  const now = Date.now();
  const salt = randomToken(16);
  const password_hash = await hashPassword(password, salt);
  const id = uid();

  await db
    .prepare(
      `INSERT INTO users (id, username, password_hash, salt, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)`
    )
    .bind(id, username, password_hash, salt, now, now)
    .run();
}

export async function createSession(db, userId) {
  const token = randomToken(32);
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
    )
    .bind(token, userId, expires, now)
    .run();
  return { token, expires, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export async function getSessionUser(env, request) {
  await ensureAdmin(env);
  const cookies = parseCookies(request);
  const token = cookies.sy_session;
  if (!token) return null;

  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.status, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  )
    .bind(token)
    .first();

  if (!row) return null;
  if (row.expires_at < now) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  if (row.status !== "active") return null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
  };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
  };
}

export function genInviteCode() {
  // 易读授权码：XXXX-XXXX
  const part = () =>
    randomToken(3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "A")
      .slice(0, 4);
  // 用更清晰的字符集
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n) => {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return [...arr].map((b) => alphabet[b % alphabet.length]).join("");
  };
  return `${pick(4)}-${pick(4)}`;
}
