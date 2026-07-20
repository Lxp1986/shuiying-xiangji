/**
 * 施工报告：连续块编辑 + 前后对比排版 + 导出 Word
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  HeadingLevel,
} from "https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm";

const REPORT_KEY = "shuiying_report_v1";
const $ = (s, r = document) => r.querySelector(s);

function uid() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultDoc() {
  return {
    version: 1,
    title: "",
    blocks: [
      {
        id: uid(),
        type: "heading",
        text: "",
        align: "center",
        underline: true,
      },
      { id: uid(), type: "label", text: "施工前：" },
      {
        id: uid(),
        type: "photo",
        assetId: null,
        previewUrl: "",
        useWatermark: true,
        wmSnapshot: null,
      },
      { id: uid(), type: "label", text: "施工后：" },
      {
        id: uid(),
        type: "photo",
        assetId: null,
        previewUrl: "",
        useWatermark: true,
        wmSnapshot: null,
      },
    ],
    assets: {}, // id -> { name, dataUrl }
  };
}

const reportState = {
  doc: defaultDoc(),
  selectedId: null,
  mode: "watermark",
};

// —— 模式切换 ——
function setMode(mode) {
  reportState.mode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  const isWm = mode === "watermark";
  $("#modeWatermark").hidden = !isWm;
  $("#modeReport").hidden = isWm;
  $("#watermarkActions").hidden = !isWm;
  $("#reportActions").hidden = isWm;
  if (!isWm) {
    renderPaper();
    scheduleFitIfNeeded();
  } else {
    window.dispatchEvent(new Event("resize"));
  }
}

function scheduleFitIfNeeded() {
  requestAnimationFrame(() => {
    if (typeof window.scheduleFitCanvas === "function") window.scheduleFitCanvas();
  });
}

// —— 持久化 ——
function saveDoc() {
  try {
    const slim = {
      ...reportState.doc,
      blocks: reportState.doc.blocks.map((b) => {
        if (b.type !== "photo") return b;
        // 预览 URL 用 dataUrl 重建，不存 blob:
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
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.blocks) return;
    reportState.doc = parsed;
    // 恢复 photo preview
    for (const b of reportState.doc.blocks) {
      if (b.type === "photo" && b.assetId && reportState.doc.assets[b.assetId]) {
        b.previewUrl = reportState.doc.assets[b.assetId].dataUrl;
      }
    }
  } catch (_) {}
}

// —— 渲染纸面 ——
function renderPaper() {
  const paper = $("#reportPaper");
  if (!paper) return;
  const { blocks } = reportState.doc;
  paper.innerHTML = blocks
    .map((b) => {
      const sel = b.id === reportState.selectedId ? "selected" : "";
      if (b.type === "heading") {
        return `<div class="report-block ${sel}" data-id="${b.id}" data-type="heading" draggable="true">
          <span class="block-handle" title="拖动排序">⋮⋮</span>
          <div class="report-heading" contenteditable="true" data-role="text">${escapeHtml(b.text || "报告标题")}</div>
        </div>`;
      }
      if (b.type === "label") {
        return `<div class="report-block ${sel}" data-id="${b.id}" data-type="label" draggable="true">
          <span class="block-handle" title="拖动排序">⋮⋮</span>
          <div class="report-label" contenteditable="true" data-role="text">${escapeHtml(b.text || "文字")}</div>
        </div>`;
      }
      if (b.type === "photo") {
        const img = b.previewUrl
          ? `<img class="report-photo" src="${b.previewUrl}" alt="施工图" />`
          : `<div class="report-photo-empty">点击导入图片（在文档中直接显示）</div>`;
        return `<div class="report-block ${sel}" data-id="${b.id}" data-type="photo" draggable="true">
          <span class="block-handle" title="拖动排序">⋮⋮</span>
          <div class="report-photo-wrap">${img}</div>
        </div>`;
      }
      return "";
    })
    .join("");

  $("#reportDocTitle").value = reportState.doc.title || "";
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
  reportState.selectedId = id;
  document.querySelectorAll(".report-block").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  syncSideEditor();
}

function syncSideEditor() {
  const ed = $("#reportBlockEditor");
  const hint = $("#reportBlockHint");
  const b = getBlock(reportState.selectedId);
  if (!b) {
    ed.hidden = true;
    hint.hidden = false;
    return;
  }
  ed.hidden = false;
  hint.hidden = true;
  const textField = $("#blockTextInput");
  const photoField = $("#blockPhotoField");
  if (b.type === "photo") {
    textField.closest(".field").hidden = true;
    photoField.hidden = false;
    $("#blockWmCheck").checked = b.useWatermark !== false;
  } else {
    textField.closest(".field").hidden = false;
    photoField.hidden = true;
    textField.value = b.text || "";
  }
}

// —— 块操作 ——
function insertBlocks(list, afterId) {
  const arr = reportState.doc.blocks;
  let idx = afterId ? arr.findIndex((b) => b.id === afterId) : arr.length - 1;
  if (idx < 0) idx = arr.length - 1;
  arr.splice(idx + 1, 0, ...list);
  reportState.selectedId = list[list.length - 1].id;
  saveDoc();
  renderPaper();
}

function insertCompareGroup() {
  insertBlocks(
    [
      { id: uid(), type: "label", text: "施工前：" },
      {
        id: uid(),
        type: "photo",
        assetId: null,
        previewUrl: "",
        useWatermark: true,
        wmSnapshot: null,
      },
      { id: uid(), type: "label", text: "施工后：" },
      {
        id: uid(),
        type: "photo",
        assetId: null,
        previewUrl: "",
        useWatermark: true,
        wmSnapshot: null,
      },
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
  insertBlocks(
    [
      {
        id: uid(),
        type: "photo",
        assetId: null,
        previewUrl: "",
        useWatermark: true,
        wmSnapshot: null,
      },
    ],
    reportState.selectedId
  );
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
}

function dupBlock(id) {
  const b = getBlock(id);
  if (!b) return;
  const copy = JSON.parse(JSON.stringify(b));
  copy.id = uid();
  if (copy.type === "photo" && copy.assetId) {
    // 共用 asset
  }
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
}

function newReport() {
  if (!confirm("新建报告将清空当前内容，确定？")) return;
  reportState.doc = defaultDoc();
  reportState.selectedId = reportState.doc.blocks[0].id;
  saveDoc();
  renderPaper();
}

// —— 图片 + 水印 ——
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
  const assetId = uid();
  reportState.doc.assets[assetId] = { name: file.name || "photo.jpg", dataUrl };
  b.assetId = assetId;
  b.useWatermark = $("#blockWmCheck")?.checked !== false;

  if (b.useWatermark && window.SyWatermark?.composeDataUrl) {
    try {
      b.wmSnapshot = window.SyWatermark.getSnapshot();
      b.previewUrl = await window.SyWatermark.composeDataUrl(dataUrl, b.wmSnapshot);
    } catch (e) {
      console.warn(e);
      b.previewUrl = dataUrl;
    }
  } else {
    b.previewUrl = dataUrl;
    b.wmSnapshot = null;
  }
  // 存合成后的图到 asset 方便导出（保留原图+合成）
  reportState.doc.assets[assetId].composedUrl = b.previewUrl;
  reportState.doc.assets[assetId].rawUrl = dataUrl;
  saveDoc();
  renderPaper();
}

async function reapplyWatermarkToBlock(blockId) {
  const b = getBlock(blockId);
  if (!b || b.type !== "photo" || !b.assetId) {
    alert("请先为该块选择图片");
    return;
  }
  const asset = reportState.doc.assets[b.assetId];
  if (!asset?.rawUrl && !asset?.dataUrl) return;
  const raw = asset.rawUrl || asset.dataUrl;
  b.useWatermark = true;
  $("#blockWmCheck").checked = true;
  if (!window.SyWatermark?.composeDataUrl) {
    alert("水印引擎未就绪");
    return;
  }
  b.wmSnapshot = window.SyWatermark.getSnapshot();
  b.previewUrl = await window.SyWatermark.composeDataUrl(raw, b.wmSnapshot);
  asset.composedUrl = b.previewUrl;
  asset.rawUrl = raw;
  saveDoc();
  renderPaper();
}

// —— 导出 Word ——
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
  const btn = $("#btnExportDocx");
  const old = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "导出中…";
  }
  try {
    const children = [];
    // A4 内容区约 210mm - 2*5mm ≈ 200mm → 约 567 像素（96dpi 估算用较宽）
    // 极窄页边距 ~5mm = 284 twips；图片尽量铺满版心并居中
    const pageContentWidth = 620;

    for (const b of reportState.doc.blocks) {
      if (b.type === "heading") {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120, before: 40 },
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
        const maxW = pageContentWidth;
        const scale = Math.min(1, maxW / w);
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

    // 页边距约 5mm（1mm ≈ 56.7 twips → 5mm ≈ 284）
    const tight = 284;
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: tight,
                bottom: tight,
                left: tight,
                right: tight,
              },
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

  $("#reportDocTitle")?.addEventListener("input", (e) => {
    reportState.doc.title = e.target.value;
    saveDoc();
  });

  const paper = $("#reportPaper");
  paper?.addEventListener("click", (e) => {
    const block = e.target.closest(".report-block");
    if (!block) return;
    selectBlock(block.dataset.id);
  });

  paper?.addEventListener("input", (e) => {
    const el = e.target.closest("[data-role='text']");
    if (!el) return;
    const block = el.closest(".report-block");
    const b = getBlock(block?.dataset.id);
    if (!b) return;
    b.text = el.innerText.replace(/\n/g, "").trim();
    if (b.type === "heading" && !reportState.doc.title) {
      reportState.doc.title = b.text;
      $("#reportDocTitle").value = b.text;
    }
    saveDoc();
  });

  // 拖拽排序
  let dragId = null;
  paper?.addEventListener("dragstart", (e) => {
    const block = e.target.closest(".report-block");
    if (!block) return;
    dragId = block.dataset.id;
    block.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  paper?.addEventListener("dragend", (e) => {
    e.target.closest(".report-block")?.classList.remove("dragging");
    document.querySelectorAll(".report-block.drag-over").forEach((el) => el.classList.remove("drag-over"));
    dragId = null;
  });
  paper?.addEventListener("dragover", (e) => {
    e.preventDefault();
    const block = e.target.closest(".report-block");
    if (!block || block.dataset.id === dragId) return;
    document.querySelectorAll(".report-block.drag-over").forEach((el) => el.classList.remove("drag-over"));
    block.classList.add("drag-over");
  });
  paper?.addEventListener("drop", (e) => {
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

  $("#blockWmCheck")?.addEventListener("change", async (e) => {
    const b = getBlock(reportState.selectedId);
    if (!b || b.type !== "photo") return;
    b.useWatermark = e.target.checked;
    const asset = b.assetId ? reportState.doc.assets[b.assetId] : null;
    if (!asset) {
      saveDoc();
      return;
    }
    const raw = asset.rawUrl || asset.dataUrl;
    if (b.useWatermark && window.SyWatermark?.composeDataUrl) {
      b.wmSnapshot = window.SyWatermark.getSnapshot();
      b.previewUrl = await window.SyWatermark.composeDataUrl(raw, b.wmSnapshot);
      asset.composedUrl = b.previewUrl;
    } else {
      b.previewUrl = raw;
      asset.composedUrl = raw;
    }
    saveDoc();
    renderPaper();
  });

  $("#btnApplyWmToBlock")?.addEventListener("click", () => {
    if (reportState.selectedId) reapplyWatermarkToBlock(reportState.selectedId);
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
}

function initReport() {
  loadDoc();
  if (!reportState.doc.blocks?.length) reportState.doc = defaultDoc();
  reportState.selectedId = reportState.doc.blocks[0]?.id || null;
  bindReportEvents();
  // 默认水印模式
  setMode("watermark");

  // Electron 菜单：导出 Word
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
};
