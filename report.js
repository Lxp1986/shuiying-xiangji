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
};

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

// —— 持久化 ——
function saveDoc() {
  try {
    const slim = {
      ...reportState.doc,
      blocks: reportState.doc.blocks.map((b) => {
        if (b.type !== "photo") return b;
        return { ...b, previewUrl: "" };
      }),
    };
    localStorage.setItem(REPORT_KEY, JSON.stringify(slim));
  } catch (e) {
    console.warn("报告保存失败", e);
  }
}

function loadDoc() {
  try {
    const raw = localStorage.getItem(REPORT_KEY) || localStorage.getItem("shuiying_report_v1");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.blocks) return;
    reportState.doc = parsed;
    for (const b of reportState.doc.blocks) {
      if (b.type === "photo" && b.assetId && reportState.doc.assets[b.assetId]) {
        const a = reportState.doc.assets[b.assetId];
        b.previewUrl = a.composedUrl || a.dataUrl || a.rawUrl || "";
        if (!a.rawUrl && a.dataUrl) a.rawUrl = a.dataUrl;
      }
    }
  } catch (_) {}
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
      <div class="report-heading" contenteditable="true" data-role="text">${escapeHtml(b.text || "报告标题")}</div>
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
      emptyPhoto(),
      { id: uid(), type: "label", text: "施工后：" },
      emptyPhoto(),
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

/** 像 Word 一样新开一页，并放一组前后对比骨架 */
function insertNextPage() {
  flushWmToSelected();
  const pageBreak = { id: uid(), type: "pageBreak" };
  const group = [
    pageBreak,
    { id: uid(), type: "heading", text: reportState.doc.title || "续页", align: "center", underline: true },
    { id: uid(), type: "label", text: "施工前：" },
    emptyPhoto(),
    { id: uid(), type: "label", text: "施工后：" },
    emptyPhoto(),
  ];
  // 追加到文末
  reportState.doc.blocks.push(...group);
  reportState.selectedId = group[group.length - 1].id;
  saveDoc();
  renderPaper();
  selectBlock(reportState.selectedId);
  // 滚到新页
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
  if (!confirm("新建报告将清空当前内容，确定？")) return;
  reportState.doc = defaultDoc();
  reportState.selectedId = reportState.doc.blocks[0].id;
  saveDoc();
  renderPaper();
  hideWmSection();
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
                text: b.text || reportState.doc.title || "施工报告",
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
    const title =
      reportState.doc.title ||
      reportState.doc.blocks.find((x) => x.type === "heading")?.text ||
      "施工报告";
    const safe = String(title).replace(/[\\/:*?"<>|]/g, "_") || "施工报告";
    const name = `${safe}_${new Date().toISOString().slice(0, 10)}.docx`;

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

  if (window.syDesktop?.onExportDocx) {
    window.syDesktop.onExportDocx(() => {
      setMode("report");
      exportDocx();
    });
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
};
