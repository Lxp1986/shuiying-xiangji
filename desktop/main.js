const { app, BrowserWindow, shell, Menu, dialog, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

const GEO_UA = "XianChangTuPianGongJu/1.3 (desktop; field photo tool)";
const PROJECT_FILTERS = [
  { name: "现场图片工程", extensions: ["xctp", "json"] },
  { name: "所有文件", extensions: ["*"] },
];

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(p, "utf8")) };
    }
  } catch (_) {}
  return defaultSettings();
}

function defaultSettings() {
  return {
    defaultSaveDir: "",
    autoSaveMinutes: 3, // 0=关闭
    lastProjectPath: "",
  };
}

function saveSettings(partial) {
  const cur = loadSettings();
  const next = { ...cur, ...partial };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "现场图片工具",
    backgroundColor: "#0f1419",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const indexPath = path.join(__dirname, "..", "office.html");
  win.loadFile(indexPath);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "打开工程…",
          accelerator: "CmdOrCtrl+O",
          click: (_i, win) => win?.webContents.send("menu:open-project"),
        },
        {
          label: "保存工程",
          accelerator: "CmdOrCtrl+S",
          click: (_i, win) => win?.webContents.send("menu:save-project"),
        },
        {
          label: "工程另存为…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: (_i, win) => win?.webContents.send("menu:save-project-as"),
        },
        { type: "separator" },
        {
          label: "导出 Word…",
          accelerator: "CmdOrCtrl+E",
          click: (_i, win) => win?.webContents.send("menu:export-docx"),
        },
        { type: "separator" },
        {
          label: "设置…",
          accelerator: "CmdOrCtrl+,",
          click: (_i, win) => win?.webContents.send("menu:settings"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("dialog:save-blob", async (event, { name, base64 }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const settings = loadSettings();
  const defaultPath = settings.defaultSaveDir
    ? path.join(settings.defaultSaveDir, name || "现场图片报告.docx")
    : name || "现场图片报告.docx";
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath,
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return { ok: true, path: filePath };
});

ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:set", (_e, partial) => saveSettings(partial || {}));

ipcMain.handle("dialog:pick-directory", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const settings = loadSettings();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: settings.defaultSaveDir || app.getPath("documents"),
  });
  if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
  return { ok: true, path: filePaths[0] };
});

ipcMain.handle("project:open", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const settings = loadSettings();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    defaultPath: settings.lastProjectPath || settings.defaultSaveDir || app.getPath("documents"),
    filters: PROJECT_FILTERS,
  });
  if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = filePaths[0];
  const text = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是有效的工程 JSON" };
  }
  saveSettings({ lastProjectPath: filePath });
  return { ok: true, path: filePath, data };
});

ipcMain.handle("project:save", async (event, { path: filePath, json, askPath, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const settings = loadSettings();
  let target = filePath;

  if (!target || askPath) {
    const base =
      suggestedName ||
      (settings.lastProjectPath && path.basename(settings.lastProjectPath)) ||
      "未命名.xctp";
    const defaultPath = settings.defaultSaveDir
      ? path.join(settings.defaultSaveDir, base.endsWith(".xctp") ? base : `${base}.xctp`)
      : base.endsWith(".xctp")
        ? base
        : `${base}.xctp`;
    const res = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: PROJECT_FILTERS,
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    target = res.filePath;
    if (!/\.(xctp|json)$/i.test(target)) target += ".xctp";
  }

  try {
    const dir = path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, typeof json === "string" ? json : JSON.stringify(json), "utf8");
    saveSettings({ lastProjectPath: target });
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

/** 自动保存到已有路径或默认目录（不弹窗） */
ipcMain.handle("project:autosave", async (_e, { path: filePath, json, suggestedName }) => {
  const settings = loadSettings();
  let target = filePath || settings.lastProjectPath;
  if (!target) {
    if (!settings.defaultSaveDir) {
      return { ok: false, error: "未设置默认保存路径，且尚未手动保存过工程" };
    }
    const base = (suggestedName || "自动保存").replace(/[\\/:*?"<>|]/g, "_");
    target = path.join(settings.defaultSaveDir, `${base}.xctp`);
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof json === "string" ? json : JSON.stringify(json), "utf8");
    saveSettings({ lastProjectPath: target });
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("geo:reverse", async (_e, { lat, lng }) => {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
    `&accept-language=zh-CN&addressdetails=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": GEO_UA },
  });
  if (!res.ok) throw new Error(`逆地理 ${res.status}`);
  return res.json();
});

ipcMain.handle("geo:search", async (_e, { q }) => {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}` +
    `&limit=6&accept-language=zh-CN&addressdetails=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": GEO_UA },
  });
  if (!res.ok) throw new Error(`搜索 ${res.status}`);
  return res.json();
});

/** IP 模糊定位（城市级，无 GPS 时使用） */
ipcMain.handle("geo:ip", async () => {
  const errors = [];
  // 1) ipapi.co
  try {
    const res = await fetch("https://ipapi.co/json/", {
      headers: { "User-Agent": GEO_UA },
    });
    if (res.ok) {
      const d = await res.json();
      if (d.latitude != null && d.longitude != null) {
        return {
          lat: Number(d.latitude),
          lng: Number(d.longitude),
          city: d.city || "",
          region: d.region || d.region_code || "",
          country: d.country_name || d.country || "",
          source: "ipapi.co",
        };
      }
    }
  } catch (e) {
    errors.push(String(e.message || e));
  }
  // 2) ip-api.com
  try {
    const res = await fetch("http://ip-api.com/json/?lang=zh-CN&fields=status,message,lat,lon,city,regionName,country");
    if (res.ok) {
      const d = await res.json();
      if (d.status === "success" && d.lat != null && d.lon != null) {
        return {
          lat: Number(d.lat),
          lng: Number(d.lon),
          city: d.city || "",
          region: d.regionName || "",
          country: d.country || "",
          source: "ip-api.com",
        };
      }
    }
  } catch (e) {
    errors.push(String(e.message || e));
  }
  // 3) ipwho.is
  try {
    const res = await fetch("https://ipwho.is/");
    if (res.ok) {
      const d = await res.json();
      if (d.success !== false && d.latitude != null && d.longitude != null) {
        return {
          lat: Number(d.latitude),
          lng: Number(d.longitude),
          city: d.city || "",
          region: d.region || "",
          country: d.country || "",
          source: "ipwho.is",
        };
      }
    }
  } catch (e) {
    errors.push(String(e.message || e));
  }
  throw new Error("模糊定位失败：" + (errors[0] || "无可用服务"));
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "geolocation" || permission === "media") {
      callback(true);
      return;
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (permission === "geolocation" || permission === "media") return true;
    return false;
  });

  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
