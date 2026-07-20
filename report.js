/**
 * 施工报告：文档内编辑水印 + 多页连续排版 + 导出 Word
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  PageBreak,
} from "https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm";

const REPORT_KEY = "shuiying_report_v2";
const $ = (s, r = document) => r.querySelector(s);

function uid() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyPhoto() {
  return {
    id: uid(),
    type: "photo",
    assetId: null,
    previewUrl: "",
    useWatermark: true,
    wmSnapshot: null,
  };
}

function defaultDoc() {
  return {
    version: 2,
    title: "",
    blocks: [
      { id: uid(), type: "heading", text: "", align: "center", underline: true },
      { id: uid(), type: "label", text: "施工前：" },
      emptyPhoto(),
      { id: uid(), type: "label", text: "施工后：" },
      emptyPhoto(),
    ],
    assets: {},
  };
}

const reportState = {
  doc: defaultDoc(),
  selectedId: null,
  mode: "report",
  _liveBusy: false,
  _suppressWmLoad: false,
  projectPath: null, // 当前工程文件路径
  dirty: false,
  settings: {
    defaultSaveDir: "",
    autoSaveMinutes: 3,
    lastProjectPath: "",
  },
  _autoTimer: null,
};

function setDirty(v = true) {
  reportState.dirty = v;
  updateProjectStatus();
}

function updateProjectStatus() {
  const el = $("#projectStatus");
  if (!el) return;
  const name = reportState.projectPath
    ? reportState.projectPath.split(/[/\\]/).pop()
    : "未保存工程";
  el.textContent = (reportState.dirty ? "● " : "") + name;
  el.title = reportState.projectPath || "尚未保存到文件";
}

// —— 水印面板停靠（同一套 UI 在报告侧栏复用） ——
function dockWmPanel(where) {
  const panel = $("#wmSharedControls");
  const home = $("#wmControlsHome");
  const dock = $("#reportWmDock");
  if (!panel) return;
  if (where === "report" && dock) {
    dock.appendChild(panel);
  } else if (home) {
    home.appendChild(panel);
  }
}

function setMode(mode) {
  reportState.mode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  const isWm = mode === "watermark";
  if ($("#modeWatermark")) $("#modeWatermark").hidden = !isWm;
  if ($("#modeReport")) $("#modeReport").hidden = isWm;
  if ($("#watermarkActions")) $("#watermarkActions").hidden = !isWm;
  if ($("#reportActions")) $("#reportActions").hidden = isWm;

  if (isWm) {
    dockWmPanel("watermark");
    window.dispatchEvent(new Event("resize"));
  } else {
    renderPaper();
    // 若当前选中图片，把水印工具挂到报告侧栏
    const b = getBlock(reportState.selectedId);
    if (b?.type === "photo") {
      showWmForPhoto(b);
    } else {
      hideWmSection();
      dockWmPanel("watermark");
    }
  }
}

// —— 持久化（localStorage 草稿 + 工程文件） ——
function serializeDoc() {
  return {
    ...reportState.doc,
    blocks: reportState.doc.blocks.map((b) => {
      if (b.type !== "photo") return b;
      return { ...b, previewUrl: "" };
    }),
  };
}

function hydrateDoc(parsed) {
  reportState.doc = parsed;
  for (const b of reportState.doc.blocks) {
    if (b.type === "photo" && b.assetId && reportState.doc.assets[b.assetId]) {
      const a = reportState.doc.assets[b.assetId];
      b.previewUrl = a.composedUrl || a.dataUrl || a.rawUrl || "";
      if (!a.rawUrl && a.dataUrl) a.rawUrl = a.dataUrl;
    }
  }
}

function saveDoc() {
  try {
    localStorage.setItem(REPORT_KEY, JSON.stringify(serializeDoc()));
  } catch (e) {
    console.warn("草稿保存失败", e);
  }
  setDirty(true);
}

function loadDoc() {
  try {
    const raw = localStorage.getItem(REPORT_KEY) || localStorage.getItem("shuiying_report_v1");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.blocks) return;
    hydrateDoc(parsed);
    reportState.dirty = false;
  } catch (_) {}
}

function projectJsonString() {
  return JSON.stringify(
    {
      app: "现场图片工具",
      format: "xctp",
      version: 2,
      savedAt: new Date().toISOString(),
      doc: serializeDoc(),
    },
    null,
    2
  );
}

function suggestedProjectName() {
  const t =
    reportState.doc.title ||
    reportState.doc.blocks.find((x) => x.type === "heading")?.text ||
    "未命名";
  return String(t).replace(/[\\/:*?"<>|]/g, "_").trim() || "未命名";
}

async function openProjectFile() {
  if (!window.syDesktop?.openProject) {
    alert("打开工程仅支持桌面 App");
    return;
  }
  if (reportState.dirty && !confirm("当前有未保存修改，打开其它工程将丢失，继续？")) return;
  const res = await window.syDesktop.openProject();
  if (!res?.ok) {
    if (!res?.canceled && res?.error) alert(res.error);
    return;
  }
  const data = res.data?.doc ? res.data.doc : res.data;
  if (!data?.blocks) {
    alert("工程文件格式不正确");
    return;
  }
  hydrateDoc(data);
  reportState.projectPath = res.path;
  reportState.selectedId = reportState.doc.blocks.find((b) => b.type !== "pageBreak")?.id || null;
  reportState.dirty = false;
  saveDoc(); // 同步草稿
  renderPaper();
  updateProjectStatus();
  setMode("report");
  setStatusBar("已打开：" + res.path);
}

async function saveProjectFile({ saveAs = false } = {}) {
  if (!window.syDesktop?.saveProject) {
    // Web：仅 localStorage
    saveDoc();
    setDirty(false);
    setStatusBar("已保存到浏览器本地草稿");
    return;
  }
  const res = await window.syDesktop.saveProject({
    path: saveAs ? null : reportState.projectPath,
    askPath: saveAs || !reportState.projectPath,
    json: projectJsonString(),
    suggestedName: suggestedProjectName() + ".xctp",
  });
  if (!res?.ok) {
    if (!res?.canceled && res?.error) alert("保存失败：" + res.error);
    return;
  }
  reportState.projectPath = res.path;
  reportState.dirty = false;
  saveDoc();
  // saveDoc 会 setDirty(true)，再清掉
  reportState.dirty = false;
  updateProjectStatus();
  setStatusBar("已保存：" + res.path);
}

async function autosaveProjectFile() {
  if (!window.syDesktop?.autosaveProject) return;
  if (!reportState.dirty && reportState.projectPath) return;
  const res = await window.syDesktop.autosaveProject({
    path: reportState.projectPath,
    json: projectJsonString(),
    suggestedName: suggestedProjectName(),
  });
  if (res?.ok) {
    reportState.projectPath = res.path;
    reportState.dirty = false;
    updateProjectStatus();
    setStatusBar("自动保存：" + new Date().toLocaleTimeString() + " · " + res.path.split(/[/\\]/).pop());
  }
}

function setupAutoSave() {
  if (reportState._autoTimer) {
    clearInterval(reportState._autoTimer);
    reportState._autoTimer = null;
  }
  const mins = Number(reportState.settings.autoSaveMinutes) || 0;
  if (mins <= 0 || !window.syDesktop?.autosaveProject) return;
  reportState._autoTimer = setInterval(() => {
    autosaveProjectFile();
  }, mins * 60 * 1000);
}

function setStatusBar(msg) {
  const el = $("#fileStatusMsg");
  if (el) {
    el.textContent = msg || "";
  }
}

async function loadSettingsUI() {
  if (!window.syDesktop?.getSettings) return;
  reportState.settings = await window.syDesktop.getSettings();
  const dir = $("#settingDefaultDir");
  const mins = $("#settingAutoSave");
  if (dir) dir.value = reportState.settings.defaultSaveDir || "";
  if (mins) mins.value = String(reportState.settings.autoSaveMinutes ?? 3);
  setupAutoSave();
}

async function saveSettingsFromUI() {
  if (!window.syDesktop?.setSettings) return;
  const dir = $("#settingDefaultDir")?.value?.trim() || "";
  const mins = Math.max(0, Math.min(120, Number($("#settingAutoSave")?.value) || 0));
  reportState.settings = await window.syDesktop.setSettings({
    defaultSaveDir: dir,
    autoSaveMinutes: mins,
  });
  setupAutoSave();
  setStatusBar("设置已保存");
  closeSettingsModal();
}

function openSettingsModal() {
  const m = $("#settingsModal");
  if (!m) return;
  loadSettingsUI();
  m.hidden = false;
}

function closeSettingsModal() {
  const m = $("#settingsModal");
  if (m) m.hidden = true;
}

// —— 分页渲染 ——
function splitPages(blocks) {
  const pages = [[]];
  for (const b of blocks) {
    if (b.type === "pageBreak") {
      pages.push([]);
    } else {
      pages[pages.length - 1].push(b);
    }
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

function renderBlockHtml(b) {
  const sel = b.id === reportState.selectedId ? "selected" : "";
  if (b.type === "heading") {
    return `<div class="report-block ${sel}" data-id="${b.id}" data-type="heading" draggable="true">
      <span class="block-handle" title="拖动">⋮⋮</span>
      <div class="report-heading" contenteditable="true" data-role="text">${escapeHtml(b.text || "标题")}</div>
    </div>`;
  }
  if (b.type === "label") {
    return `<div class="report-block ${sel}" data-id="${b.id}" data-type="label" draggable="true">
      <span class="block-handle" title="拖动">⋮⋮</span>
      <div class="report-label" contenteditable="true" data-role="text">${escapeHtml(b.text || "文字")}</div>
    </div>`;
  }
  if (b.type === "photo") {
    const img = b.previewUrl
      ? `<img class="report-photo" src="${b.previewUrl}" alt="施工图" />`
      : `<div class="report-photo-empty">点击右侧选择图片，并在下方编辑水印</div>`;
    return `<div class="report-block ${sel}" data-id="${b.id}" data-type="photo" draggable="true">
      <span class="block-handle" title="拖动">⋮⋮</span>
      <div class="report-photo-wrap">${img}</div>
    </div>`;
  }
  return "";
}

function renderPaper() {
  const host = $("#reportPages");
  if (!host) return;
  const pages = splitPages(reportState.doc.blocks);
  host.innerHTML = pages
    .map((pageBlocks, pageIndex) => {
      const body = pageBlocks.map(renderBlockHtml).join("");
      const empty =
        pageBlocks.length === 0
          ? `<div class="report-page-empty">第 ${pageIndex + 1} 页（空）· 用工具栏插入内容</div>`
          : "";
      return `<article class="report-paper" data-page="${pageIndex}">
        <div class="report-page-badge">第 ${pageIndex + 1} 页 / 共 ${pages.length} 页</div>
        ${body}${empty}
      </article>`;
    })
    .join("");

  if ($("#reportDocTitle")) $("#reportDocTitle").value = reportState.doc.title || "";
  syncSideEditor();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getBlock(id) {
  return reportState.doc.blocks.find((b) => b.id === id);
}

function selectBlock(id) {
  // 离开上一张图时，把当前水印快照写回
  flushWmToSelected();
  reportState.selectedId = id;
  document.querySelectorAll(".report-block").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  syncSideEditor();
  const b = getBlock(id);
  if (b?.type === "photo") showWmForPhoto(b);
  else hideWmSection();
}

function hideWmSection() {
  const sec = $("#reportWmSection");
  if (sec) sec.hidden = true;
  if (reportState.mode === "report") {
    // 停靠回水印模式容器，避免丢 DOM
    dockWmPanel("watermark");
  }
}

function showWmForPhoto(b) {
  const sec = $("#reportWmSection");
  if (sec) sec.hidden = false;
  dockWmPanel("report");
  // 加载该图自己的水印快照到表单
  if (b.wmSnapshot && window.SyWatermark?.loadSnapshotToUI) {
    reportState._suppressWmLoad = true;
    window.SyWatermark.loadSnapshotToUI(b.wmSnapshot);
    reportState._suppressWmLoad = false;
  }
}

function flushWmToSelected() {
  const b = getBlock(reportState.selectedId);
  if (!b || b.type !== "photo") return;
  if (window.SyWatermark?.getSnapshot) {
    b.wmSnapshot = window.SyWatermark.getSnapshot();
  }
}

function syncSideEditor() {
  const ed = $("#reportBlockEditor");
  const hint = $("#reportBlockHint");
  const b = getBlock(reportState.selectedId);
  if (!b) {
    if (ed) ed.hidden = true;
    if (hint) hint.hidden = false;
    return;
  }
  if (ed) ed.hidden = false;
  if (hint) hint.hidden = true;
  const textField = $("#blockTextField");
  const photoField = $("#blockPhotoField");
  if (b.type === "photo") {
    if (textField) textField.hidden = true;
    if (photoField) photoField.hidden = false;
  } else if (b.type === "pageBreak") {
    if (textField) textField.hidden = true;
    if (photoField) photoField.hidden = true;
  } else {
    if (textField) textField.hidden = false;
    if (photoField) photoField.hidden = true;
    if ($("#blockTextInput")) $("#blockTextInput").value = b.text || "";
  }
}

// —— 块操作 ——
function insertBlocks(list, afterId) {
  const arr = reportState.doc.blocks;
  let idx = afterId != null ? arr.findIndex((b) => b.id === afterId) : arr.length - 1;
  if (idx < 0) idx = arr.length - 1;
  arr.splice(idx + 1, 0, ...list);
  reportState.selectedId = list[list.length - 1].id;
  saveDoc();
  renderPaper();
  selectBlock(reportState.selectedId);
}

function insertCompareGroup() {
  insertBlocks(
    [
      { id: uid(), type: "label", text: "施工前：" },
      emptyPhotoWithInherit(),
      { id: uid(), type: "label", text: "施工后：" },
      emptyPhotoWithInherit(),
    ],
    reportState.selectedId
  );
}

function insertHeading() {
  insertBlocks(
    [{ id: uid(), type: "heading", text: "标题", align: "center", underline: true }],
    reportState.selectedId
  );
}

function insertLabel() {
  insertBlocks([{ id: uid(), type: "label", text: "文字：" }], reportState.selectedId);
}

function insertPhoto() {
  insertBlocks([emptyPhoto()], reportState.selectedId);
}

/** 取上一张带水印快照的图片配置，并清空时间/天气/地址/经纬度（其它文字保留） */
function inheritWmSnapshotFromPrev() {
  const blocks = reportState.doc.blocks;
  let src = null;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "photo" && b.wmSnapshot) {
      src = b.wmSnapshot;
      break;
    }
  }
  if (!src && window.SyWatermark?.getSnapshot) {
    src = window.SyWatermark.getSnapshot();
  }
  if (!src) return null;
  const snap = JSON.parse(JSON.stringify(src));
  const fields = snap.fields || [];
  const shouldClear = (f) => {
    const label = String(f.label || "").replace(/\s/g, "");
    const key = String(f.key || "");
    const auto = f.auto || "";
    if (["datetime", "weather", "address", "lng", "lat"].includes(auto)) return true;
    if (/时间|日期/.test(label) || key === "time") return true;
    if (/天气/.test(label) || key === "weather") return true;
    if (/地址|地点/.test(label) || key === "address") return true;
    if (/经度/.test(label) || key === "lng") return true;
    if (/纬度/.test(label) || key === "lat") return true;
    return false;
  };
  if (!snap.fieldValues) snap.fieldValues = {};
  for (const f of fields) {
    if (shouldClear(f)) snap.fieldValues[f.key] = "";
  }
  return snap;
}

function lastHeadingText() {
  const blocks = reportState.doc.blocks;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "heading" && blocks[i].text) return blocks[i].text;
  }
  return "";
}

function emptyPhotoWithInherit() {
  const p = emptyPhoto();
  p.wmSnapshot = inheritWmSnapshotFromPrev();
  return p;
}

/** 像 Word 一样新开一页；标题与其它文字继承上页，时间/定位/天气留空 */
function insertNextPage() {
  flushWmToSelected();
  const heading = lastHeadingText() || "";
  const group = [
    { id: uid(), type: "pageBreak" },
    { id: uid(), type: "heading", text: heading, align: "center", underline: true },
    { id: uid(), type: "label", text: "施工前：" },
    emptyPhotoWithInherit(),
    { id: uid(), type: "label", text: "施工后：" },
    emptyPhotoWithInherit(),
  ];
  reportState.doc.blocks.push(...group);
  reportState.selectedId = group[group.length - 1].id;
  saveDoc();
  renderPaper();
  selectBlock(reportState.selectedId);
  requestAnimationFrame(() => {
    const pages = document.querySelectorAll(".report-paper");
    pages[pages.length - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function moveBlock(id, dir) {
  const arr = reportState.doc.blocks;
  const i = arr.findIndex((b) => b.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  saveDoc();
  renderPaper();
  selectBlock(id);
}

function dupBlock(id) {
  const b = getBlock(id);
  if (!b || b.type === "pageBreak") return;
  const copy = JSON.parse(JSON.stringify(b));
  copy.id = uid();
  insertBlocks([copy], id);
}

function delBlock(id) {
  const arr = reportState.doc.blocks;
  if (arr.length <= 1) {
    alert("至少保留一个块");
    return;
  }
  const i = arr.findIndex((b) => b.id === id);
  if (i < 0) return;
  arr.splice(i, 1);
  reportState.selectedId = arr[Math.max(0, i - 1)]?.id || null;
  saveDoc();
  renderPaper();
  if (reportState.selectedId) selectBlock(reportState.selectedId);
  else hideWmSection();
}

function newReport() {
  if (reportState.dirty && !confirm("当前有未保存修改，新建将清空，确定？")) return;
  if (!reportState.dirty && !confirm("新建报告将清空当前内容，确定？")) return;
  reportState.doc = defaultDoc();
  reportState.selectedId = reportState.doc.blocks[0].id;
  reportState.projectPath = null;
  saveDoc();
  reportState.dirty = false;
  renderPaper();
  hideWmSection();
  updateProjectStatus();
}

// —— 图片 + 水印实时合成 ——
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function assignPhotoToBlock(blockId, file) {
  const b = getBlock(blockId);
  if (!b || b.type !== "photo") return;
  const dataUrl = await fileToDataUrl(file);
  const assetId = b.assetId || uid();
  reportState.doc.assets[assetId] = {
    name: file.name || "photo.jpg",
    dataUrl,
    rawUrl: dataUrl,
  };
  b.assetId = assetId;
  b.useWatermark = true;
  b.wmSnapshot = window.SyWatermark?.getSnapshot?.() || null;

  if (b.wmSnapshot && window.SyWatermark?.composeDataUrl) {
    try {
      b.previewUrl = await window.SyWatermark.composeDataUrl(dataUrl, b.wmSnapshot);
    } catch {
      b.previewUrl = dataUrl;
    }
  } else {
    b.previewUrl = dataUrl;
  }
  reportState.doc.assets[assetId].composedUrl = b.previewUrl;
  saveDoc();
  renderPaper();
  selectBlock(blockId);
}

/** 水印表单变更 → 刷新当前选中图片 */
async function liveUpdateSelectedPhoto() {
  if (reportState._suppressWmLoad) return;
  if (reportState.mode !== "report") return;
  if (reportState._liveBusy) return;
  const b = getBlock(reportState.selectedId);
  if (!b || b.type !== "photo" || !b.assetId) return;
  const asset = reportState.doc.assets[b.assetId];
  const raw = asset?.rawUrl || asset?.dataUrl;
  if (!raw || !window.SyWatermark?.composeDataUrl) return;

  reportState._liveBusy = true;
  try {
    const snap = window.SyWatermark.getSnapshot();
    b.wmSnapshot = snap;
    b.useWatermark = true;
    const url = await window.SyWatermark.composeDataUrl(raw, snap, 0.9);
    b.previewUrl = url;
    asset.composedUrl = url;
    // 仅更新 img，避免整页重绘丢焦点
    const img = document.querySelector(`.report-block[data-id="${b.id}"] img.report-photo`);
    if (img) img.src = url;
    else renderPaper();
    saveDoc();
  } catch (e) {
    console.warn("实时水印失败", e);
  } finally {
    reportState._liveBusy = false;
  }
}

let _liveTimer = null;
function scheduleLiveWm() {
  clearTimeout(_liveTimer);
  _liveTimer = setTimeout(() => liveUpdateSelectedPhoto(), 350);
}

// —— 导出 Word（分页） ——
function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function probeImageSize(dataUrl) {
  return loadImage(dataUrl).then((img) => ({
    w: img.naturalWidth,
    h: img.naturalHeight,
  }));
}

async function exportDocx() {
  flushWmToSelected();
  const btn = $("#btnExportDocx");
  const old = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "导出中…";
  }
  try {
    const children = [];
    const pageContentWidth = 620;
    let firstPage = true;

    for (const b of reportState.doc.blocks) {
      if (b.type === "pageBreak") {
        children.push(
          new Paragraph({
            children: [new PageBreak()],
          })
        );
        firstPage = false;
        continue;
      }
      if (b.type === "heading") {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120, before: firstPage ? 40 : 80 },
            children: [
              new TextRun({
                text: b.text || "标题",
                bold: true,
                size: 32,
                font: "Microsoft YaHei",
                underline: b.underline !== false ? {} : undefined,
              }),
            ],
          })
        );
      } else if (b.type === "label") {
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 60 },
            children: [
              new TextRun({
                text: b.text || "",
                bold: true,
                size: 22,
                font: "Microsoft YaHei",
              }),
            ],
          })
        );
      } else if (b.type === "photo") {
        const asset = b.assetId ? reportState.doc.assets[b.assetId] : null;
        let url = b.previewUrl || asset?.composedUrl || asset?.dataUrl;
        if (!url) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "（未插入图片）",
                  italics: true,
                  color: "888888",
                  size: 20,
                  font: "Microsoft YaHei",
                }),
              ],
            })
          );
          continue;
        }
        if (b.useWatermark && asset?.rawUrl && window.SyWatermark?.composeDataUrl) {
          try {
            const snap = b.wmSnapshot || window.SyWatermark.getSnapshot();
            url = await window.SyWatermark.composeDataUrl(asset.rawUrl, snap, 0.92);
          } catch (_) {}
        }
        const { w, h } = await probeImageSize(url);
        const scale = Math.min(1, pageContentWidth / w);
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);
        const bytes = dataUrlToUint8Array(url);
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new ImageRun({
                data: bytes,
                transformation: { width: dw, height: dh },
                type: "jpg",
              }),
            ],
          })
        );
      }
    }

    if (!children.length) {
      children.push(new Paragraph({ children: [new TextRun("空报告")] }));
    }

    const tight = 284;
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: tight, bottom: tight, left: tight, right: tight },
            },
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    // 文件名 = 文档「文件名」字段；无则用首个标题
    const fileBase =
      reportState.doc.title ||
      reportState.doc.blocks.find((x) => x.type === "heading")?.text ||
      "现场图片报告";
    const safe = String(fileBase).replace(/[\\/:*?"<>|]/g, "_").trim() || "现场图片报告";
    const name = `${safe}.docx`;

    if (window.syDesktop?.saveBlob) {
      await window.syDesktop.saveBlob(blob, name);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  } catch (e) {
    console.error(e);
    alert("导出 Word 失败：" + (e.message || e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old || "导出 Word";
    }
  }
}

// —— 事件 ——
function bindReportEvents() {
  $("#modeSwitch")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (btn) setMode(btn.dataset.mode);
  });

  $("#btnReportNew")?.addEventListener("click", newReport);
  $("#btnExportDocx")?.addEventListener("click", exportDocx);
  $("#btnInsertCompare")?.addEventListener("click", insertCompareGroup);
  $("#btnInsertHeading")?.addEventListener("click", insertHeading);
  $("#btnInsertLabel")?.addEventListener("click", insertLabel);
  $("#btnInsertPhoto")?.addEventListener("click", insertPhoto);
  $("#btnInsertPage")?.addEventListener("click", insertNextPage);
  $("#btnOpenProject")?.addEventListener("click", openProjectFile);
  $("#btnSaveProject")?.addEventListener("click", () => saveProjectFile({ saveAs: false }));
  $("#btnSaveProjectAs")?.addEventListener("click", () => saveProjectFile({ saveAs: true }));
  $("#btnSettings")?.addEventListener("click", openSettingsModal);
  $("#btnPickDefaultDir")?.addEventListener("click", async () => {
    if (!window.syDesktop?.pickDirectory) return;
    const res = await window.syDesktop.pickDirectory();
    if (res?.ok && $("#settingDefaultDir")) $("#settingDefaultDir").value = res.path;
  });
  $("#btnSaveSettings")?.addEventListener("click", saveSettingsFromUI);
  document.querySelectorAll("[data-close-settings]").forEach((el) => {
    el.addEventListener("click", closeSettingsModal);
  });

  $("#reportDocTitle")?.addEventListener("input", (e) => {
    reportState.doc.title = e.target.value;
    saveDoc();
  });

  const pagesHost = $("#reportPages") || $("#reportScroll");
  pagesHost?.addEventListener("click", (e) => {
    const block = e.target.closest(".report-block");
    if (!block) return;
    selectBlock(block.dataset.id);
  });

  pagesHost?.addEventListener("input", (e) => {
    const el = e.target.closest("[data-role='text']");
    if (!el) return;
    const block = el.closest(".report-block");
    const b = getBlock(block?.dataset.id);
    if (!b) return;
    b.text = el.innerText.replace(/\n/g, "").trim();
    if (b.type === "heading" && !reportState.doc.title) {
      reportState.doc.title = b.text;
      if ($("#reportDocTitle")) $("#reportDocTitle").value = b.text;
    }
    saveDoc();
  });

  // 拖拽排序
  let dragId = null;
  pagesHost?.addEventListener("dragstart", (e) => {
    const block = e.target.closest(".report-block");
    if (!block) return;
    dragId = block.dataset.id;
    block.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  pagesHost?.addEventListener("dragend", () => {
    document.querySelectorAll(".report-block.dragging").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".report-block.drag-over").forEach((el) => el.classList.remove("drag-over"));
    dragId = null;
  });
  pagesHost?.addEventListener("dragover", (e) => {
    e.preventDefault();
    const block = e.target.closest(".report-block");
    if (!block || block.dataset.id === dragId) return;
    document.querySelectorAll(".report-block.drag-over").forEach((el) => el.classList.remove("drag-over"));
    block.classList.add("drag-over");
  });
  pagesHost?.addEventListener("drop", (e) => {
    e.preventDefault();
    const block = e.target.closest(".report-block");
    if (!block || !dragId || block.dataset.id === dragId) return;
    const arr = reportState.doc.blocks;
    const from = arr.findIndex((b) => b.id === dragId);
    const to = arr.findIndex((b) => b.id === block.dataset.id);
    if (from < 0 || to < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    saveDoc();
    renderPaper();
  });

  $("#blockTextInput")?.addEventListener("input", (e) => {
    const b = getBlock(reportState.selectedId);
    if (!b || b.type === "photo") return;
    b.text = e.target.value;
    saveDoc();
    renderPaper();
    selectBlock(b.id);
  });

  $("#blockPhotoInput")?.addEventListener("change", async () => {
    const f = $("#blockPhotoInput").files?.[0];
    $("#blockPhotoInput").value = "";
    if (!f || !reportState.selectedId) return;
    await assignPhotoToBlock(reportState.selectedId, f);
  });

  $("#btnBlockUp")?.addEventListener("click", () => {
    if (reportState.selectedId) moveBlock(reportState.selectedId, -1);
  });
  $("#btnBlockDown")?.addEventListener("click", () => {
    if (reportState.selectedId) moveBlock(reportState.selectedId, 1);
  });
  $("#btnBlockDup")?.addEventListener("click", () => {
    if (reportState.selectedId) dupBlock(reportState.selectedId);
  });
  $("#btnBlockDel")?.addEventListener("click", () => {
    if (reportState.selectedId && confirm("删除该块？")) delBlock(reportState.selectedId);
  });

  // 监听水印表单变更 → 实时更新选中图
  if (window.SyWatermark?.onChange) {
    window.SyWatermark.onChange(() => scheduleLiveWm());
  } else {
    // app.js 可能尚未挂上，稍后重试
    setTimeout(() => {
      window.SyWatermark?.onChange?.(() => scheduleLiveWm());
    }, 500);
  }
}

function initReport() {
  loadDoc();
  if (!reportState.doc.blocks?.length) reportState.doc = defaultDoc();
  reportState.selectedId = reportState.doc.blocks.find((b) => b.type !== "pageBreak")?.id || null;
  bindReportEvents();

  const isDesktopOffice =
    document.body.classList.contains("desktop-app") ||
    !!window.syDesktop?.saveBlob ||
    /office\.html/i.test(location.pathname || location.href || "");

  setMode(isDesktopOffice ? "report" : "watermark");
  updateProjectStatus();
  loadSettingsUI().then(() => setupAutoSave());

  if (window.syDesktop?.onExportDocx) {
    window.syDesktop.onExportDocx(() => {
      setMode("report");
      exportDocx();
    });
  }
  if (window.syDesktop?.onMenu) {
    window.syDesktop.onMenu("menu:open-project", openProjectFile);
    window.syDesktop.onMenu("menu:save-project", () => saveProjectFile({ saveAs: false }));
    window.syDesktop.onMenu("menu:save-project-as", () => saveProjectFile({ saveAs: true }));
    window.syDesktop.onMenu("menu:settings", openSettingsModal);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initReport);
} else {
  initReport();
}

window.SyReport = {
  setMode,
  exportDocx,
  getDoc: () => reportState.doc,
  insertNextPage,
  openProject: openProjectFile,
  saveProject: saveProjectFile,
};
