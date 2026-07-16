/**
 * 登录门禁 + 注册（需授权码）+ 管理员授权码/用户管理
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const authGate = $("#authGate");
  const appRoot = $("#appRoot");
  const authUserBar = $("#authUserBar");

  let currentUser = null;

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: `HTTP ${res.status}` };
    }
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  function showGate(mode = "login") {
    if (authGate) authGate.hidden = false;
    if (appRoot) appRoot.hidden = true;
    setAuthMode(mode);
  }

  function showApp() {
    if (authGate) authGate.hidden = true;
    if (appRoot) appRoot.hidden = false;
    renderUserBar();
    // 通知主应用已就绪（触发布局后画布适配）
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("auth:ready", { detail: currentUser }));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("auth:ready", { detail: currentUser }));
      });
    });
  }

  function setAuthMode(mode) {
    $$(".auth-mode-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );
    $("#authLoginForm").hidden = mode !== "login";
    $("#authRegisterForm").hidden = mode !== "register";
    setAuthMsg("");
  }

  function setAuthMsg(msg, kind = "") {
    const el = $("#authMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "auth-msg" + (kind ? ` ${kind}` : "");
  }

  function renderUserBar() {
    if (!authUserBar || !currentUser) return;
    const adminBtn =
      currentUser.role === "admin"
        ? `<button type="button" class="btn btn-ghost btn-sm" id="btnAdminPanel">授权管理</button>`
        : "";
    authUserBar.innerHTML = `
      <span class="auth-user-name" title="${escapeAttr(currentUser.username)}">${escapeHtml(currentUser.username)}${currentUser.role === "admin" ? " · 管理员" : ""}</span>
      ${adminBtn}
      <button type="button" class="btn btn-ghost btn-sm" id="btnLogout">退出</button>
    `;
    $("#btnLogout")?.addEventListener("click", onLogout);
    $("#btnAdminPanel")?.addEventListener("click", openAdminModal);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function refreshMe() {
    try {
      const data = await api("/api/me");
      if (data.ok && data.user) {
        currentUser = data.user;
        window.__currentUser = currentUser;
        showApp();
        return true;
      }
    } catch (_) {
      /* 本地无 API 时放行？生产必须登录 */
    }
    currentUser = null;
    window.__currentUser = null;
    // 本地 file / 无 functions 开发：可检测
    if (location.protocol === "file:") {
      setAuthMsg("请通过部署站点或本地 Pages 预览使用登录功能", "error");
    }
    showGate("login");
    return false;
  }

  async function onLogin(e) {
    e.preventDefault();
    const username = $("#loginUsername").value.trim();
    const password = $("#loginPassword").value;
    setAuthMsg("登录中…");
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!data.ok) {
      setAuthMsg(data.error || "登录失败", "error");
      return;
    }
    currentUser = data.user;
    window.__currentUser = currentUser;
    setAuthMsg("登录成功", "ok");
    showApp();
  }

  async function onRegister(e) {
    e.preventDefault();
    const username = $("#regUsername").value.trim();
    const password = $("#regPassword").value;
    const password2 = $("#regPassword2").value;
    const inviteCode = $("#regInvite").value.trim();
    if (password !== password2) {
      setAuthMsg("两次密码不一致", "error");
      return;
    }
    setAuthMsg("注册中…");
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password, inviteCode }),
    });
    if (!data.ok) {
      setAuthMsg(data.error || "注册失败", "error");
      return;
    }
    currentUser = data.user;
    window.__currentUser = currentUser;
    setAuthMsg("注册成功，已登录", "ok");
    showApp();
  }

  async function onLogout() {
    await api("/api/logout", { method: "POST", body: "{}" });
    currentUser = null;
    window.__currentUser = null;
    showGate("login");
  }

  // —— 管理面板 ——
  function openAdminModal() {
    const modal = $("#adminModal");
    if (!modal) return;
    modal.hidden = false;
    loadAdminData();
  }

  function closeAdminModal() {
    const modal = $("#adminModal");
    if (modal) modal.hidden = true;
  }

  async function loadAdminData() {
    const usersBox = $("#adminUsersList");
    const invitesBox = $("#adminInvitesList");
    if (usersBox) usersBox.innerHTML = "<p class='muted'>加载中…</p>";
    if (invitesBox) invitesBox.innerHTML = "<p class='muted'>加载中…</p>";

    const [usersRes, invitesRes] = await Promise.all([
      api("/api/admin/users"),
      api("/api/admin/invites"),
    ]);

    if (usersBox) {
      if (!usersRes.ok) {
        usersBox.innerHTML = `<p class="auth-msg error">${escapeHtml(usersRes.error || "加载失败")}</p>`;
      } else {
        usersBox.innerHTML = (usersRes.users || [])
          .map((u) => {
            const st = statusLabel(u.status);
            const actions =
              u.role === "admin"
                ? `<span class="muted">管理员</span>`
                : u.status === "active"
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-uid="${escapeAttr(u.id)}" data-act="disable">禁用</button>`
                  : `<button type="button" class="btn btn-ghost btn-sm" data-uid="${escapeAttr(u.id)}" data-act="enable">启用</button>`;
            return `<div class="admin-row">
              <div>
                <strong>${escapeHtml(u.username)}</strong>
                <span class="muted"> · ${escapeHtml(u.role)} · ${st}</span>
              </div>
              <div>${actions}</div>
            </div>`;
          })
          .join("");
      }
    }

    if (invitesBox) {
      if (!invitesRes.ok) {
        invitesBox.innerHTML = `<p class="auth-msg error">${escapeHtml(invitesRes.error || "加载失败")}</p>`;
      } else {
        const list = invitesRes.invites || [];
        if (!list.length) {
          invitesBox.innerHTML = `<p class="muted">暂无授权码，请点击下方生成</p>`;
        } else {
          invitesBox.innerHTML = list
            .map((c) => {
              const st = inviteStatusLabel(c.status);
              const used = c.used_username
                ? ` · 使用者 ${escapeHtml(c.used_username)}`
                : "";
              const revoke =
                c.status === "available"
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-code="${escapeAttr(c.code)}" data-act="revoke">作废</button>`
                  : "";
              return `<div class="admin-row">
                <div>
                  <code class="invite-code">${escapeHtml(c.code)}</code>
                  <span class="muted"> · ${st}${used}</span>
                  ${c.note ? `<div class="muted">${escapeHtml(c.note)}</div>` : ""}
                </div>
                <div class="admin-row-actions">
                  ${c.status === "available" ? `<button type="button" class="btn btn-ghost btn-sm" data-copy="${escapeAttr(c.code)}">复制</button>` : ""}
                  ${revoke}
                </div>
              </div>`;
            })
            .join("");
        }
      }
    }
  }

  function statusLabel(s) {
    return (
      {
        active: "正常",
        pending: "待授权",
        rejected: "已拒绝",
        disabled: "已禁用",
      }[s] || s
    );
  }

  function inviteStatusLabel(s) {
    return (
      {
        available: "可用",
        used: "已使用",
        expired: "已过期",
        revoked: "已作废",
      }[s] || s
    );
  }

  async function genInvites() {
    const count = Number($("#inviteCount")?.value || 1);
    const days = Number($("#inviteDays")?.value || 30);
    const note = $("#inviteNote")?.value || "";
    const msg = $("#adminInviteMsg");
    if (msg) {
      msg.textContent = "生成中…";
      msg.className = "auth-msg";
    }
    const data = await api("/api/admin/invites", {
      method: "POST",
      body: JSON.stringify({ count, days, note }),
    });
    if (!data.ok) {
      if (msg) {
        msg.textContent = data.error || "生成失败";
        msg.className = "auth-msg error";
      }
      return;
    }
    if (msg) {
      msg.textContent = `已生成：${(data.codes || []).join("、")}`;
      msg.className = "auth-msg ok";
    }
    loadAdminData();
  }

  function bindAdminEvents() {
    $("#adminModal")?.querySelectorAll("[data-close-admin]").forEach((el) => {
      el.addEventListener("click", closeAdminModal);
    });
    $("#btnGenInvite")?.addEventListener("click", genInvites);

    $("#adminUsersList")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-uid]");
      if (!btn) return;
      const id = btn.dataset.uid;
      const act = btn.dataset.act;
      const status = act === "disable" ? "disabled" : "active";
      const data = await api("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      if (!data.ok) alert(data.error || "操作失败");
      loadAdminData();
    });

    $("#adminInvitesList")?.addEventListener("click", async (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        try {
          await navigator.clipboard.writeText(copy.dataset.copy);
          copy.textContent = "已复制";
          setTimeout(() => (copy.textContent = "复制"), 1200);
        } catch {
          prompt("复制授权码：", copy.dataset.copy);
        }
        return;
      }
      const rev = e.target.closest("[data-act='revoke']");
      if (rev) {
        if (!confirm(`作废授权码 ${rev.dataset.code}？`)) return;
        const data = await api(
          `/api/admin/invites?code=${encodeURIComponent(rev.dataset.code)}`,
          { method: "DELETE" }
        );
        if (!data.ok) alert(data.error || "作废失败");
        loadAdminData();
      }
    });
  }

  function bindAuthEvents() {
    $$(".auth-mode-btn").forEach((b) => {
      b.addEventListener("click", () => setAuthMode(b.dataset.mode));
    });
    $("#authLoginForm")?.addEventListener("submit", onLogin);
    $("#authRegisterForm")?.addEventListener("submit", onRegister);
    bindAdminEvents();
  }

  window.SyAuth = {
    getUser: () => currentUser,
    refresh: refreshMe,
    logout: onLogout,
    openAdmin: openAdminModal,
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindAuthEvents();
    refreshMe();
  });
})();
