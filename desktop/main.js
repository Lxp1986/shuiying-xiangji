const { app, BrowserWindow, shell, Menu, dialog, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");

const GEO_UA = "XianChangTuPianGongJu/1.2 (desktop; field photo tool)";

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

  // 桌面独立版入口（无 Cloudflare；含水印 + 现场图片报告）
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
          label: "导出 Word…",
          accelerator: "CmdOrCtrl+E",
          click: (_i, win) => win?.webContents.send("menu:export-docx"),
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
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: name || "现场图片报告.docx",
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const buf = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, buf);
  return { ok: true, path: filePath };
});

/** 主进程请求地理编码（绕过 file:// CORS，并带合法 User-Agent） */
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

app.whenReady().then(() => {
  // 允许页面申请定位权限（macOS / Windows）
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
