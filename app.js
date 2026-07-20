/**
 * 工程水印相机
 * 水印样式：蓝条标题 + 黄条副标题 + 半透明字段列表
 * 支持：点选时间、地图选点（经纬度+地址）、按时间/位置自动天气（含历史）
 */

const STORAGE_KEY = "shuiying_types_v3";
const STORAGE_KEY_LEGACY = ["shuiying_types_v2", "shuiying_types_v1"];

// —— 默认类型（上线干净模板：无示例工程/坐标/天气） ——
const DEFAULT_TYPES = [
  {
    id: "eng-record",
    name: "工程记录",
    defaultTitle: "工程记录",
    defaultSubtitle: "",
    fields: [
      { key: "content", label: "施工内容", defaultValue: "" },
      { key: "time", label: "拍摄时间", defaultValue: "", auto: "datetime" },
      { key: "weather", label: "天    气", defaultValue: "", auto: "weather" },
      { key: "address", label: "地    址", defaultValue: "", auto: "address" },
      { key: "lng", label: "经    度", defaultValue: "", auto: "lng" },
      { key: "lat", label: "纬    度", defaultValue: "", auto: "lat" },
    ],
  },
  {
    id: "safety",
    name: "安全巡查",
    defaultTitle: "安全巡查",
    defaultSubtitle: "",
    fields: [
      { key: "location", label: "检查地点", defaultValue: "", auto: "address" },
      { key: "person", label: "巡查人员", defaultValue: "" },
      { key: "result", label: "检查结果", defaultValue: "" },
      { key: "time", label: "检查时间", defaultValue: "", auto: "datetime" },
      { key: "weather", label: "天    气", defaultValue: "", auto: "weather" },
      { key: "lng", label: "经    度", defaultValue: "", auto: "lng" },
      { key: "lat", label: "纬    度", defaultValue: "", auto: "lat" },
    ],
  },
  {
    id: "progress",
    name: "进度汇报",
    defaultTitle: "进度汇报",
    defaultSubtitle: "",
    fields: [
      { key: "section", label: "施工段", defaultValue: "" },
      { key: "progress", label: "完成进度", defaultValue: "" },
      { key: "note", label: "备    注", defaultValue: "" },
      { key: "time", label: "记录时间", defaultValue: "", auto: "datetime" },
      { key: "weather", label: "天    气", defaultValue: "", auto: "weather" },
      { key: "address", label: "地    址", defaultValue: "", auto: "address" },
      { key: "lng", label: "经    度", defaultValue: "", auto: "lng" },
      { key: "lat", label: "纬    度", defaultValue: "", auto: "lat" },
    ],
  },
];

// —— 状态 ——
const state = {
  image: null,
  imageName: "",
  types: [],
  typeId: "eng-record",
  title: "工程记录",
  subtitle: "",
  fieldValues: {},
  scale: 1,
  fontScale: 1,
  boxOpacity: 0.92,
  textOpacity: 1,
  radius: 12,
  position: "bl",
  margin: 24,
  headerColor: "#1e6bb8",
  bannerColor: "#f5c518",
  textColor: "#1a1a1a",
  offsetX: 0,
  offsetY: 0,
  editingTypeId: null,
  // 选中位置缓存（用于天气）
  pickedLng: null,
  pickedLat: null,
  weatherLoading: false,
};

// 地图相关
let map = null;
let mapMarker = null;
let pendingLoc = { lng: null, lat: null, address: "" };
/** @type {{ google: L.TileLayer, esri: L.TileLayer, labels: L.TileLayer } | null} */
let mapBaseLayers = null;
let currentBasemap = "google";
const MAP_DEFAULT_ZOOM = 18;
const MAP_MAX_ZOOM = 21;

// —— DOM ——
const $ = (sel) => document.querySelector(sel);
const canvas = $("#mainCanvas");
const ctx = canvas.getContext("2d");
const emptyState = $("#emptyState");
const fileInput = $("#fileInput");
const cameraInput = $("#cameraInput");
const imageInfo = $("#imageInfo");
const typeSelect = $("#typeSelect");
const titleInput = $("#titleInput");
const subtitleInput = $("#subtitleInput");
const fieldsEditor = $("#fieldsEditor");
const typesList = $("#typesList");
const typeModal = $("#typeModal");
const typeFieldsEditor = $("#typeFieldsEditor");
const timeModal = $("#timeModal");
const locModal = $("#locModal");
const autoStatus = $("#autoStatus");

// —— 字段角色识别 ——
function fieldRole(f) {
  if (f.auto) return f.auto;
  const label = (f.label || "").replace(/\s/g, "");
  if (/时间|日期/.test(label)) return "datetime";
  if (/天气/.test(label)) return "weather";
  if (/地址|地点|位置/.test(label)) return "address";
  if (/经度/.test(label)) return "lng";
  if (/纬度/.test(label)) return "lat";
  return null;
}

function findFieldByRole(role) {
  const type = getCurrentType();
  return type?.fields.find((f) => fieldRole(f) === role) || null;
}

function getFieldValueByRole(role) {
  const f = findFieldByRole(role);
  return f ? (state.fieldValues[f.key] ?? "") : "";
}

function setFieldValueByRole(role, value) {
  const f = findFieldByRole(role);
  if (f) state.fieldValues[f.key] = value;
}

function setStatus(msg, kind = "") {
  if (!autoStatus) return;
  autoStatus.textContent = msg || "";
  autoStatus.classList.remove("error", "ok");
  if (kind) autoStatus.classList.add(kind);
}

// —— 时间格式 ——
function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatNow() {
  return formatDateDisplay(new Date());
}

function formatDateDisplay(d) {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 解析水印时间字符串 → Date | null */
function parseDisplayTime(str) {
  if (!str || !String(str).trim()) return null;
  const s = String(str).trim();
  // 2026.07.09 09:31 或 2026-07-09 09:31 或 2026/07/09 09:31
  let m = s.match(
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInputValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeInputValue(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 从分离的 date + time 输入拼成 Date */
function fromDateAndTimeInputs(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = timeStr && timeStr.trim() ? timeStr : "00:00";
  const m = t.match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2], Number(m[1]), Number(m[2]), 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function updateTimePreview() {
  const el = $("#timePreview");
  if (!el) return;
  const d = fromDateAndTimeInputs($("#datePickerInput")?.value, $("#timePickerInput")?.value);
  el.textContent = d ? formatDateDisplay(d) : "请选择日期和时间";
}

// —— 类型存储 / 迁移 ——
function migrateTypes(types) {
  return types.map((t) => {
    const fields = [...(t.fields || [])];
    const has = (role) => fields.some((f) => fieldRole(f) === role);

    // 工程类模板补全地址
    if ((t.id === "eng-record" || t.name === "工程记录") && !has("address")) {
      const weatherIdx = fields.findIndex((f) => fieldRole(f) === "weather");
      const insertAt = weatherIdx >= 0 ? weatherIdx + 1 : fields.length;
      fields.splice(insertAt, 0, {
        key: "address",
        label: "地    址",
        defaultValue: "",
        auto: "address",
      });
    }

    // 为已知字段补 auto 标记
    for (const f of fields) {
      if (!f.auto) {
        const role = fieldRole(f);
        if (role) f.auto = role;
      }
    }
    return { ...t, fields };
  });
}

/** 清除历史示例文案（竹山、假坐标等） */
function scrubSampleContent(types) {
  const sampleSubtitles = /竹山|排水渠|施工前|现场安全检查|施工进度记录/;
  const sampleValues = /请输入内容|小雨\s*\d|111\.724|22\.040/;
  return types.map((t) => {
    const next = { ...t, fields: (t.fields || []).map((f) => ({ ...f })) };
    if (sampleSubtitles.test(next.defaultSubtitle || "")) {
      next.defaultSubtitle = "";
    }
    for (const f of next.fields) {
      if (sampleValues.test(String(f.defaultValue || ""))) {
        f.defaultValue = "";
      }
    }
    return next;
  });
}

function loadTypes() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of STORAGE_KEY_LEGACY) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        state.types = scrubSampleContent(migrateTypes(parsed));
        saveTypes();
        // 清理旧 key，避免示例残留
        for (const key of STORAGE_KEY_LEGACY) {
          try {
            localStorage.removeItem(key);
          } catch (_) {}
        }
        return;
      }
    }
  } catch (_) {}
  state.types = structuredClone(DEFAULT_TYPES);
  saveTypes();
}

function saveTypes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.types));
}

function getCurrentType() {
  return state.types.find((t) => t.id === state.typeId) || state.types[0];
}

function applyType(type, keepValues = false) {
  if (!type) return;
  state.typeId = type.id;
  state.title = type.defaultTitle || type.name;
  state.subtitle = type.defaultSubtitle || "";
  const prev = keepValues ? { ...state.fieldValues } : {};
  state.fieldValues = {};
  for (const f of type.fields) {
    if (keepValues && prev[f.key] !== undefined) {
      state.fieldValues[f.key] = prev[f.key];
    } else if (fieldRole(f) === "datetime") {
      state.fieldValues[f.key] = formatNow();
    } else {
      state.fieldValues[f.key] = f.defaultValue ?? "";
    }
  }
  // 同步缓存坐标
  const lng = parseFloat(getFieldValueByRole("lng"));
  const lat = parseFloat(getFieldValueByRole("lat"));
  state.pickedLng = Number.isFinite(lng) ? lng : null;
  state.pickedLat = Number.isFinite(lat) ? lat : null;

  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  renderTypeSelect();
  renderFieldsEditor();
  renderTypesList();
  redraw();
}

// —— UI 渲染 ——
function renderTypeSelect() {
  typeSelect.innerHTML = state.types
    .map(
      (t) =>
        `<option value="${escapeAttr(t.id)}" ${t.id === state.typeId ? "selected" : ""}>${escapeHtml(t.name)}</option>`
    )
    .join("");
}

function pickBtnForRole(role) {
  if (role === "datetime") return { act: "pick-time", title: "点选时间", icon: "📅" };
  if (role === "address" || role === "lng" || role === "lat")
    return { act: "pick-loc", title: "点选位置", icon: "📍" };
  if (role === "weather") return { act: "pick-weather", title: "更新天气", icon: "🌤" };
  return null;
}

function renderFieldsEditor() {
  const type = getCurrentType();
  if (!type) {
    fieldsEditor.innerHTML = "";
    return;
  }
  fieldsEditor.innerHTML = type.fields
    .map((f) => {
      const val = state.fieldValues[f.key] ?? "";
      const role = fieldRole(f);
      const pick = pickBtnForRole(role);
      const pickHtml = pick
        ? `<button type="button" class="btn-pick" data-role="pick" data-act="${pick.act}" title="${pick.title}">${pick.icon}</button>`
        : `<span style="width:32px"></span>`;
      return `
        <div class="field-row" data-key="${escapeAttr(f.key)}" data-frole="${escapeAttr(role || "")}">
          <input type="text" class="field-label" value="${escapeAttr(f.label)}" data-role="label" title="字段标签（可改）" />
          <input type="text" class="field-value" value="${escapeAttr(val)}" data-role="value" placeholder="可手动输入" />
          ${pickHtml}
          <button type="button" class="btn-icon" data-role="remove" title="删除字段">×</button>
        </div>`;
    })
    .join("");
}

function renderTypesList() {
  typesList.innerHTML = state.types
    .map((t) => {
      const active = t.id === state.typeId ? "active" : "";
      return `
        <div class="type-card ${active}" data-id="${escapeAttr(t.id)}">
          <div class="type-card-head">
            <span class="type-card-name">${escapeHtml(t.name)}</span>
            <div class="type-card-actions">
              <button type="button" data-act="use">使用</button>
              <button type="button" data-act="edit">编辑</button>
              <button type="button" data-act="del" class="danger">删除</button>
            </div>
          </div>
          <div class="type-card-meta">${t.fields.length} 个字段 · ${escapeHtml(t.defaultTitle || "")}</div>
        </div>`;
    })
    .join("");
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

// —— 天气（Open-Meteo，支持历史） ——
const WMO_WEATHER = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "小阵雨",
  81: "阵雨",
  82: "强阵雨",
  85: "小阵雪",
  86: "强阵雪",
  95: "雷暴",
  96: "雷暴伴冰雹",
  99: "强雷暴伴冰雹",
};

function weatherText(code, tempC) {
  const name = WMO_WEATHER[code] ?? "未知";
  const t = Math.round(Number(tempC));
  return `${name} ${t}℃`;
}

function dayDiffFromToday(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

/**
 * 根据经纬度与时间获取「小时级」天气（Open-Meteo，无需 API Key）
 *
 * 接口返回的是逐小时序列（非分钟级）。按你选的 时:分 取最接近的整点：
 * 例如 09:31 → 更接近 10:00 则用 10:00；09:20 → 用 09:00。
 *
 * - 历史 Archive（ERA5）：约 1940 年起，逐小时
 * - Forecast：近况/预报，逐小时
 *
 * @returns {{ text: string, source: string, hourLabel: string, matchedTime: string }}
 */
async function fetchWeather(lat, lng, date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const dateStr = `${y}-${m}-${day}`;
  const hour = date.getHours();
  const minute = date.getMinutes();
  const diff = dayDiffFromToday(date);

  if (y < 1940) {
    throw new Error("历史天气最早约支持到 1940 年");
  }
  if (diff > 16) {
    throw new Error("预报仅支持约未来 16 天内");
  }

  // timezone=auto：按经纬度当地时区返回小时序列，与拍摄地钟点对齐
  const qs =
    `latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,weather_code&timezone=auto` +
    `&start_date=${dateStr}&end_date=${dateStr}`;

  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?${qs}`;
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?${qs}`;

  /** @type {{ url: string, source: string }[]} */
  const attempts = [];
  if (diff <= -5) {
    attempts.push({ url: archiveUrl, source: "历史再分析·小时" });
    if (diff >= -92) attempts.push({ url: forecastUrl, source: "近况模式·小时" });
  } else if (diff < 0) {
    attempts.push({ url: forecastUrl, source: "近况·小时" });
    attempts.push({ url: archiveUrl, source: "历史再分析·小时" });
  } else if (diff === 0) {
    attempts.push({ url: forecastUrl, source: "当天·小时" });
  } else {
    attempts.push({ url: forecastUrl, source: "预报·小时" });
  }

  let lastErr = null;
  for (const { url, source } of attempts) {
    try {
      const hit = await fetchWeatherFromUrl(url, hour, minute);
      return { ...hit, source };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("该日期暂无小时级天气数据");
}

/** 在逐小时序列里，按目标时:分取最近整点 */
function pickNearestHourIndex(times, targetHour, targetMinute = 0) {
  const target = targetHour * 60 + targetMinute;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < times.length; i++) {
    const m = String(times[i]).match(/T(\d{2}):(\d{2})/);
    if (!m) continue;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    let dist = Math.abs(mins - target);
    dist = Math.min(dist, 24 * 60 - dist);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return { index: bestIdx, distMinutes: bestDist };
}

async function fetchWeatherFromUrl(url, hour, minute = 0) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`天气接口 ${res.status}`);
  const data = await res.json();
  if (data.reason) throw new Error(data.reason);
  const times = data.hourly?.time || [];
  const temps = data.hourly?.temperature_2m || [];
  const codes = data.hourly?.weather_code || [];
  if (!times.length) throw new Error("该日期暂无小时级天气数据");

  const { index: bestIdx, distMinutes } = pickNearestHourIndex(times, hour, minute);
  const temp = temps[bestIdx];
  const code = codes[bestIdx];
  if (temp == null || code == null) throw new Error("该小时天气数据不完整");

  const matched = String(times[bestIdx]);
  const hm = matched.match(/T(\d{2}):(\d{2})/);
  const hourLabel = hm ? `${hm[1]}:${hm[2]}` : `${pad2(hour)}:00`;

  return {
    text: weatherText(code, temp),
    hourLabel,
    matchedTime: matched,
    distMinutes,
  };
}

/** 解析当前表单里的经纬度（优先字段手动值） */
function resolveCoordsFromFields() {
  const lngRaw = getFieldValueByRole("lng");
  const latRaw = getFieldValueByRole("lat");
  const lng = parseFloat(lngRaw);
  const lat = parseFloat(latRaw);
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return { lng, lat };
  }
  if (Number.isFinite(state.pickedLng) && Number.isFinite(state.pickedLat)) {
    return { lng: state.pickedLng, lat: state.pickedLat };
  }
  return null;
}

let weatherDebounceTimer = null;
let weatherRequestId = 0;

/** 防抖：手动改时间/经纬度后自动刷新天气 */
function scheduleWeatherRefresh(delayMs = 800) {
  clearTimeout(weatherDebounceTimer);
  weatherDebounceTimer = setTimeout(() => {
    updateWeatherFromState({ silent: false });
  }, delayMs);
}

async function updateWeatherFromState({ silent = false } = {}) {
  if (!findFieldByRole("weather")) {
    if (!silent) setStatus("当前类型没有天气字段", "error");
    return;
  }
  const coords = resolveCoordsFromFields();
  if (!coords) {
    if (!silent) setStatus("请先填写或点选经纬度", "error");
    return;
  }
  const { lng, lat } = coords;
  // 写回缓存，便于后续地图打开
  state.pickedLng = lng;
  state.pickedLat = lat;

  const timeStr = getFieldValueByRole("datetime");
  const parsed = parseDisplayTime(timeStr);
  const date = parsed || new Date();
  if (!parsed && !silent) {
    setStatus("时间格式无法解析，已按当前时间查天气", "");
  }

  const reqId = ++weatherRequestId;
  state.weatherLoading = true;
  setStatus("正在获取小时级天气…");
  try {
    const { text, source, hourLabel, distMinutes } = await fetchWeather(lat, lng, date);
    if (reqId !== weatherRequestId) return;
    setFieldValueByRole("weather", text);
    renderFieldsEditor();
    redraw();
    const pickHint =
      distMinutes === 0
        ? `整点 ${hourLabel}`
        : `最接近整点 ${hourLabel}（与所选相差 ${distMinutes} 分钟）`;
    setStatus(
      `天气已更新（${source} · ${pickHint}） ${formatDateDisplay(date)} · ${lat.toFixed(4)},${lng.toFixed(4)}`,
      "ok"
    );
  } catch (err) {
    if (reqId !== weatherRequestId) return;
    console.error(err);
    setStatus(`天气获取失败：${err.message || err}`, "error");
  } finally {
    if (reqId === weatherRequestId) state.weatherLoading = false;
  }
}

// —— 逆地理 / 搜索（Nominatim） ——
async function reverseGeocode(lat, lng) {
  // 桌面 App：走主进程，避免 file:// CORS / 缺 UA 导致定位地址失败
  if (window.syDesktop?.reverseGeocode) {
    const data = await window.syDesktop.reverseGeocode(lat, lng);
    return formatAddress(data);
  }
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
    `&accept-language=zh-CN&addressdetails=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("地址解析失败");
  const data = await res.json();
  return formatAddress(data);
}

function formatAddress(data) {
  if (!data) return "";
  const a = data.address || {};
  const parts = [
    a.country,
    a.state || a.province,
    a.city || a.town || a.county || a.municipality,
    a.suburb || a.district || a.city_district || a.village,
    a.road || a.pedestrian || a.neighbourhood,
    a.house_number,
  ].filter(Boolean);
  // 去重并拼接；若为空用 display_name
  const uniq = [...new Set(parts)];
  if (uniq.length) return uniq.join("");
  // display_name 多为英文逗号分隔，尽量精简
  const dn = data.display_name || "";
  return dn.split(",").slice(0, 4).join("").replace(/\s+/g, "") || dn;
}

async function searchPlaces(q) {
  if (window.syDesktop?.searchPlaces) {
    return window.syDesktop.searchPlaces(q);
  }
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}` +
    `&limit=6&accept-language=zh-CN&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("搜索失败");
  return res.json();
}

// —— 时间弹窗（日期 + 时间分开） ——
function openTimeModal() {
  const cur = parseDisplayTime(getFieldValueByRole("datetime")) || new Date();
  $("#datePickerInput").value = toDateInputValue(cur);
  $("#timePickerInput").value = toTimeInputValue(cur);
  updateTimePreview();
  timeModal.hidden = false;
}

function closeTimeModal() {
  timeModal.hidden = true;
}

function confirmTime() {
  const d = fromDateAndTimeInputs($("#datePickerInput").value, $("#timePickerInput").value);
  if (!d) {
    alert("请选择有效的日期和时间");
    return;
  }
  setFieldValueByRole("datetime", formatDateDisplay(d));
  // 若没有 datetime 角色字段，尝试写入标签含时间的
  if (!findFieldByRole("datetime")) {
    const type = getCurrentType();
    const f = type?.fields.find((x) => /时间|日期/.test(x.label));
    if (f) state.fieldValues[f.key] = formatDateDisplay(d);
  }
  renderFieldsEditor();
  redraw();
  closeTimeModal();
  updateWeatherFromState();
}

// —— 地图弹窗 ——
/** 手机浏览器底栏会吃掉 100vh：用 visualViewport 同步真实可见高度 */
function syncVisualViewportHeight() {
  const h =
    (window.visualViewport && window.visualViewport.height) ||
    window.innerHeight ||
    document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
  if (map) {
    try {
      map.invalidateSize({ animate: false });
    } catch (_) {}
  }
}

let _vvBound = false;
function bindVisualViewportForMap() {
  syncVisualViewportHeight();
  if (_vvBound) return;
  _vvBound = true;
  const onChange = () => syncVisualViewportHeight();
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", () => setTimeout(onChange, 150));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onChange);
    window.visualViewport.addEventListener("scroll", onChange);
  }
}

function openLocModal() {
  locModal.hidden = false;
  document.body.classList.add("loc-modal-open");
  bindVisualViewportForMap();
  syncVisualViewportHeight();

  const lng =
    state.pickedLng ??
    parseFloat(getFieldValueByRole("lng"));
  const lat =
    state.pickedLat ??
    parseFloat(getFieldValueByRole("lat"));
  const has = Number.isFinite(lng) && Number.isFinite(lat);
  // 无坐标时默认中国大致中心（非示例工程点），仅作地图初始视野
  const initLng = has ? lng : 104.1954;
  const initLat = has ? lat : 35.8617;
  const initZoom = has ? MAP_DEFAULT_ZOOM : 4;
  const addr = getFieldValueByRole("address") || "";

  pendingLoc = {
    lng: has ? initLng : null,
    lat: has ? initLat : null,
    address: addr,
  };
  updateLocPreview();

  // 延迟初始化，等弹窗显示后再 invalidateSize
  requestAnimationFrame(() => {
    syncVisualViewportHeight();
    initMap(initLat, initLng, initZoom);
    if (has && !addr) {
      reverseGeocode(initLat, initLng)
        .then((a) => {
          pendingLoc.address = a;
          updateLocPreview();
        })
        .catch(() => {});
    }
    setTimeout(() => {
      syncVisualViewportHeight();
      map?.invalidateSize({ animate: false });
    }, 250);
  });
}

function closeLocModal() {
  locModal.hidden = true;
  document.body.classList.remove("loc-modal-open");
  $("#locSearchResults").hidden = true;
  $("#locSearchResults").innerHTML = "";
}

function updateLocPreview() {
  $("#locLngPreview").textContent =
    pendingLoc.lng != null ? Number(pendingLoc.lng).toFixed(8) : "—";
  $("#locLatPreview").textContent =
    pendingLoc.lat != null ? Number(pendingLoc.lat).toFixed(8) : "—";
  $("#locAddrPreview").textContent =
    pendingLoc.address ||
    (pendingLoc.lng != null ? "解析中…" : "点击地图或搜索选择位置");
}

/**
 * MacBook 触控板手势：
 * - 双指滑动 → 平移地图
 * - 捏合（浏览器以 ctrl+wheel 上报）→ 以指针为中心缩放
 * 同时保留鼠标滚轮：按住 Ctrl/⌘ + 滚轮也可缩放
 */
function enableTrackpadGestures(leafletMap) {
  // 关闭 Leaflet 默认滚轮缩放，避免双指滑动被当成缩放
  leafletMap.scrollWheelZoom.disable();

  const el = leafletMap.getContainer();
  if (el._trackpadGesturesBound) return;
  el._trackpadGesturesBound = true;

  el.addEventListener(
    "wheel",
    (e) => {
      // 地图弹窗内始终拦截，避免页面跟着滚
      e.preventDefault();

      // 捏合缩放（Safari/Chrome 触控板 pinch 会带 ctrlKey）
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const containerPoint = L.point(e.clientX - rect.left, e.clientY - rect.top);
        const layerPoint = leafletMap.containerPointToLayerPoint(containerPoint);
        const latlng = leafletMap.layerPointToLatLng(layerPoint);
        // deltaY > 0 缩小；系数让捏合更跟手
        const factor = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.01;
        const nextZoom = leafletMap.getZoom() - e.deltaY * factor;
        const z = Math.max(
          leafletMap.getMinZoom(),
          Math.min(leafletMap.getMaxZoom(), nextZoom)
        );
        leafletMap.setZoomAround(latlng, z, { animate: false });
        return;
      }

      // 双指滑动平移（含横向）
      // deltaMode: 0=像素 1=行 2=页
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      leafletMap.panBy([e.deltaX * scale, e.deltaY * scale], { animate: false });
    },
    { passive: false }
  );

  // Safari 旧版手势事件（部分系统仍会触发）
  el.addEventListener(
    "gesturestart",
    (e) => {
      e.preventDefault();
      el._gestureZoom = leafletMap.getZoom();
    },
    { passive: false }
  );
  el.addEventListener(
    "gesturechange",
    (e) => {
      e.preventDefault();
      if (el._gestureZoom == null) return;
      const z = el._gestureZoom + Math.log2(e.scale || 1);
      const clamped = Math.max(
        leafletMap.getMinZoom(),
        Math.min(leafletMap.getMaxZoom(), z)
      );
      leafletMap.setZoom(clamped, { animate: false });
    },
    { passive: false }
  );
  el.addEventListener(
    "gestureend",
    (e) => {
      e.preventDefault();
      el._gestureZoom = null;
    },
    { passive: false }
  );
}

/** 创建高清 WGS-84 卫星底图（默认 Google，Esri 备用） */
function createBaseLayers() {
  // Google 卫星：多数地区比公开 Esri 瓦片更清晰，坐标仍为 Web Mercator / WGS-84
  const google = L.tileLayer(
    "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    {
      subdomains: ["0", "1", "2", "3"],
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: 20,
      // Retina 屏请求更高一级瓦片，MacBook 上更锐利
      detectRetina: true,
      updateWhenZooming: true,
      keepBuffer: 3,
      crossOrigin: true,
      attribution: "Imagery &copy; Google",
    }
  );

  const esri = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: 19,
      detectRetina: true,
      updateWhenZooming: true,
      keepBuffer: 3,
      crossOrigin: true,
      attribution: "Tiles &copy; Esri",
    }
  );

  // 轻量标注（WGS-84 参考层，不参与偏移）
  const labels = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: MAP_MAX_ZOOM,
      maxNativeZoom: 19,
      opacity: 0.85,
      pane: "overlayPane",
      attribution: "Labels &copy; Esri",
    }
  );

  return { google, esri, labels };
}

function setBasemap(name) {
  if (!map || !mapBaseLayers) return;
  const next = name === "esri" ? "esri" : "google";
  const prev = currentBasemap === "esri" ? mapBaseLayers.esri : mapBaseLayers.google;
  const layer = next === "esri" ? mapBaseLayers.esri : mapBaseLayers.google;
  if (prev !== layer) {
    if (map.hasLayer(prev)) map.removeLayer(prev);
    layer.addTo(map);
    // 标注始终压在影像上
    if (mapBaseLayers.labels) {
      if (map.hasLayer(mapBaseLayers.labels)) map.removeLayer(mapBaseLayers.labels);
      mapBaseLayers.labels.addTo(map);
    }
  }
  currentBasemap = next;
  document.querySelectorAll("#basemapSwitch [data-basemap]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.basemap === next);
  });
}

function initMap(lat, lng, zoom = MAP_DEFAULT_ZOOM) {
  if (typeof L === "undefined") {
    setStatus("地图库加载失败，请检查网络", "error");
    return;
  }
  if (!map) {
    map = L.map("map", {
      zoomControl: true,
      // 允许小数缩放，触控板捏合更顺滑
      zoomSnap: 0,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 80,
      touchZoom: true,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: true,
      scrollWheelZoom: false,
      inertia: true,
      inertiaDeceleration: 3000,
      worldCopyJump: true,
      maxZoom: MAP_MAX_ZOOM,
      minZoom: 3,
      // 预加载周边瓦片，缩放后更快变清晰
      preferCanvas: false,
    }).setView([lat, lng], zoom);

    mapBaseLayers = createBaseLayers();
    // 默认高清 Google 卫星；加载失败时可切 Esri
    mapBaseLayers.google.addTo(map);
    mapBaseLayers.labels.addTo(map);
    currentBasemap = "google";

    // Google 瓦片若超时/失败，自动降级 Esri（仅首次）
    let googleFailed = false;
    mapBaseLayers.google.on("tileerror", () => {
      if (googleFailed || currentBasemap !== "google") return;
      googleFailed = true;
      setBasemap("esri");
      setStatus("高清卫星暂不可用，已切换 Esri 备用底图", "error");
    });

    mapMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    mapMarker.on("dragend", async () => {
      const p = mapMarker.getLatLng();
      await setPendingFromLatLng(p.lat, p.lng);
    });
    map.on("click", async (e) => {
      await setPendingFromLatLng(e.latlng.lat, e.latlng.lng);
    });

    enableTrackpadGestures(map);

    const switcher = $("#basemapSwitch");
    if (switcher && !switcher._bound) {
      switcher._bound = true;
      switcher.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-basemap]");
        if (!btn) return;
        setBasemap(btn.dataset.basemap);
      });
    }
  } else {
    map.setView([lat, lng], zoom);
    mapMarker.setLatLng([lat, lng]);
  }
  setTimeout(() => {
    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 200);
  }, 80);
}
async function setPendingFromLatLng(lat, lng, address) {
  pendingLoc.lat = lat;
  pendingLoc.lng = lng;
  mapMarker?.setLatLng([lat, lng]);
  map?.panTo([lat, lng]);
  if (address) {
    pendingLoc.address = address;
    updateLocPreview();
    return;
  }
  pendingLoc.address = "解析中…";
  updateLocPreview();
  try {
    pendingLoc.address = await reverseGeocode(lat, lng);
  } catch {
    pendingLoc.address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  updateLocPreview();
}

async function confirmLoc() {
  if (pendingLoc.lat == null || pendingLoc.lng == null) {
    alert("请先在地图上选择位置");
    return;
  }
  const lngStr = Number(pendingLoc.lng).toFixed(8);
  const latStr = Number(pendingLoc.lat).toFixed(8);
  state.pickedLng = Number(pendingLoc.lng);
  state.pickedLat = Number(pendingLoc.lat);

  setFieldValueByRole("lng", lngStr);
  setFieldValueByRole("lat", latStr);
  setFieldValueByRole("address", pendingLoc.address || "");

  // 安全巡查等「检查地点」也写入
  const type = getCurrentType();
  type?.fields.forEach((f) => {
    if (fieldRole(f) === "address") {
      state.fieldValues[f.key] = pendingLoc.address || state.fieldValues[f.key] || "";
    }
  });

  renderFieldsEditor();
  redraw();
  closeLocModal();
  setStatus("位置已写入，正在更新天气…");
  await updateWeatherFromState();
}

function geolocationErrorMessage(err) {
  if (!err) return "请检查系统定位权限";
  // GeolocationPositionError codes
  if (err.code === 1) return "定位权限被拒绝，请在系统设置中允许本应用使用位置";
  if (err.code === 2) return "暂时无法获取位置，请检查网络或稍后重试";
  if (err.code === 3) return "定位超时，请到室外或打开「精确位置」后重试";
  return err.message || "请检查定位权限与网络";
}

/** GPS 精确定位（失败抛错） */
function tryBrowserGeolocation(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error("无 geolocation API"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** IP / 网络模糊定位（城市级） */
async function tryFuzzyIpLocate() {
  // 桌面：主进程多源 IP 定位
  if (window.syDesktop?.ipLocate) {
    return window.syDesktop.ipLocate();
  }
  // Web 备用
  const res = await fetch("https://ipapi.co/json/");
  if (!res.ok) throw new Error("IP 定位失败");
  const d = await res.json();
  if (d.latitude == null || d.longitude == null) throw new Error("IP 定位无坐标");
  return {
    lat: Number(d.latitude),
    lng: Number(d.longitude),
    city: d.city || "",
    region: d.region || "",
    country: d.country_name || "",
    source: "ipapi.co",
  };
}

/**
 * 定位：先 GPS（高精度→低精度），失败则 IP 模糊定位
 * @returns {{ lat:number, lng:number, address:string, fuzzy:boolean }}
 */
async function locateWithFallback() {
  // 1) GPS 高精度
  try {
    const pos = await tryBrowserGeolocation({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let address = "";
    try {
      address = await reverseGeocode(lat, lng);
    } catch (_) {}
    return { lat, lng, address, fuzzy: false };
  } catch (e1) {
    console.warn("高精度 GPS 失败", e1);
  }
  // 2) GPS 低精度（网络辅助）
  try {
    const pos = await tryBrowserGeolocation({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let address = "";
    try {
      address = await reverseGeocode(lat, lng);
    } catch (_) {}
    return { lat, lng, address, fuzzy: false };
  } catch (e2) {
    console.warn("低精度 GPS 失败", e2);
  }
  // 3) IP 模糊定位
  const ip = await tryFuzzyIpLocate();
  let address = [ip.country, ip.region, ip.city].filter(Boolean).join("");
  try {
    const rev = await reverseGeocode(ip.lat, ip.lng);
    if (rev) address = rev + "（网络模糊定位）";
    else if (address) address = address + "（网络模糊定位）";
    else address = `${ip.lat.toFixed(4)}, ${ip.lng.toFixed(4)}（网络模糊定位）`;
  } catch (_) {
    if (address) address = address + "（网络模糊定位）";
    else address = `${ip.lat.toFixed(4)}, ${ip.lng.toFixed(4)}（网络模糊定位）`;
  }
  return { lat: ip.lat, lng: ip.lng, address, fuzzy: true };
}

async function applyCurrentGps() {
  setStatus("正在定位（GPS，失败将使用网络模糊定位）…");
  if ($("#btnFillGps")) $("#btnFillGps").disabled = true;
  try {
    const { lat, lng, address, fuzzy } = await locateWithFallback();
    state.pickedLng = lng;
    state.pickedLat = lat;
    setFieldValueByRole("lng", lng.toFixed(fuzzy ? 4 : 8));
    setFieldValueByRole("lat", lat.toFixed(fuzzy ? 4 : 8));
    if (address) setFieldValueByRole("address", address);
    renderFieldsEditor();
    redraw();
    setStatus(
      fuzzy
        ? `已使用网络模糊定位（城市级）：${address || `${lat.toFixed(4)},${lng.toFixed(4)}`}`
        : `定位成功：${address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`,
      "ok"
    );
    await updateWeatherFromState({ silent: true });
  } catch (err) {
    console.error(err);
    setStatus("定位失败：" + (err.message || geolocationErrorMessage(err)), "error");
    alert(
      "定位失败：\n" +
        (err.message || geolocationErrorMessage(err)) +
        "\n\n可改用「点选位置」在地图上搜索/点击选点。"
    );
  } finally {
    if ($("#btnFillGps")) $("#btnFillGps").disabled = false;
  }
}

// —— 水印绘制 ——
function measureWatermark(baseUnit) {
  const u = baseUnit * state.scale;
  const fs = state.fontScale;

  const padX = 14 * u;
  const headerH = 36 * u * Math.max(0.85, fs * 0.55 + 0.5);
  const bannerH = 32 * u * Math.max(0.85, fs * 0.55 + 0.5);
  const bodyPadY = 12 * u;
  const lineGap = 6 * u;
  const titleFont = Math.round(16 * u * fs);
  const bannerFont = Math.round(14 * u * fs);
  const bodyFont = Math.round(13 * u * fs);

  ctx.save();
  ctx.font = `600 ${titleFont}px "Noto Sans SC", sans-serif`;
  const titleW = ctx.measureText(state.title || " ").width;

  ctx.font = `600 ${bannerFont}px "Noto Sans SC", sans-serif`;
  const bannerW = ctx.measureText(state.subtitle || " ").width;

  const type = getCurrentType();
  const lines = (type?.fields || []).map((f) => {
    const label = f.label;
    const value = state.fieldValues[f.key] ?? "";
    return { label, value, text: `${label}：${value}` };
  });

  ctx.font = `500 ${bodyFont}px "Noto Sans SC", sans-serif`;
  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line.text).width);
  }
  ctx.restore();

  const contentW = Math.max(titleW, bannerW, maxLineW) + padX * 2;
  const minW = 200 * u;
  const width = Math.max(minW, Math.min(contentW, canvas.width * 0.92 || contentW));
  const bodyH =
    bodyPadY * 2 +
    (lines.length ? lines.length * bodyFont + (lines.length - 1) * lineGap : bodyFont);
  const height = headerH + bannerH + bodyH;

  return {
    width,
    height,
    headerH,
    bannerH,
    bodyH,
    padX,
    bodyPadY,
    lineGap,
    titleFont,
    bannerFont,
    bodyFont,
    lines,
    radius: state.radius * state.scale,
  };
}

function roundedRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function lighten(hex, amount) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.min(255, r + amount);
  g = Math.min(255, g + amount);
  b = Math.min(255, b + amount);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function resolvePosition(imgW, imgH, boxW, boxH) {
  const m = state.margin * (Math.min(imgW, imgH) / 800) * state.scale + state.margin * 0.3;
  const pos = state.position;
  const cx = (imgW - boxW) / 2;
  const cy = (imgH - boxH) / 2;
  const rx = imgW - boxW - m;
  const by = imgH - boxH - m;

  switch (pos) {
    case "tl":
      return { x: m + state.offsetX, y: m + state.offsetY };
    case "tc":
      return { x: cx + state.offsetX, y: m + state.offsetY };
    case "tr":
      return { x: rx + state.offsetX, y: m + state.offsetY };
    case "ml":
      return { x: m + state.offsetX, y: cy + state.offsetY };
    case "mc":
      return { x: cx + state.offsetX, y: cy + state.offsetY };
    case "mr":
      return { x: rx + state.offsetX, y: cy + state.offsetY };
    case "bl":
      return { x: m + state.offsetX, y: by + state.offsetY };
    case "bc":
      return { x: cx + state.offsetX, y: by + state.offsetY };
    case "br":
      return { x: rx + state.offsetX, y: by + state.offsetY };
    default:
      return { x: m + state.offsetX, y: by + state.offsetY };
  }
}

function truncateText(c, text, maxW) {
  if (c.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 0 && c.measureText(s + "…").width > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function drawWatermarkAt(c, ox, oy, layout) {
  const {
    width: w,
    height: h,
    headerH,
    bannerH,
    padX,
    bodyPadY,
    lineGap,
    titleFont,
    bannerFont,
    bodyFont,
    lines,
    radius: r,
  } = layout;
  // 框体与文字透明度独立
  const ba = state.boxOpacity;
  const ta = state.textOpacity;

  c.save();
  c.shadowColor = `rgba(0,0,0,${0.35 * ba})`;
  c.shadowBlur = 18 * state.scale;
  c.shadowOffsetY = 4 * state.scale;

  roundedRectPath(c, ox, oy, w, h, r);
  c.fillStyle = `rgba(255,255,255,${0.88 * ba})`;
  c.fill();

  c.shadowColor = "transparent";
  c.shadowBlur = 0;

  c.save();
  roundedRectPath(c, ox, oy, w, h, r);
  c.clip();

  const headerGrad = c.createLinearGradient(ox, oy, ox, oy + headerH);
  const hc = state.headerColor;
  headerGrad.addColorStop(0, hexToRgba(lighten(hc, 12), ba));
  headerGrad.addColorStop(1, hexToRgba(hc, ba));
  c.fillStyle = headerGrad;
  c.fillRect(ox, oy, w, headerH);

  c.fillStyle = hexToRgba(state.bannerColor, ba);
  c.fillRect(ox, oy + headerH, w, bannerH);

  c.fillStyle = `rgba(248,250,252,${0.55 * ba})`;
  c.fillRect(ox, oy + headerH + bannerH, w, h - headerH - bannerH);
  c.restore();

  roundedRectPath(c, ox + 0.5, oy + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
  c.strokeStyle = `rgba(0,0,0,${0.12 * ba})`;
  c.lineWidth = 1;
  c.stroke();

  // 文字层：独立透明度
  c.fillStyle = `rgba(255,255,255,${ta})`;
  c.font = `600 ${titleFont}px "Noto Sans SC", sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(state.title || "", ox + w / 2, oy + headerH / 2);

  c.fillStyle = hexToRgba("#1a1a1a", ta);
  c.font = `600 ${bannerFont}px "Noto Sans SC", sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText(truncateText(c, state.subtitle || "", w - padX * 2), ox + padX, oy + headerH + bannerH / 2);

  c.fillStyle = hexToRgba(state.textColor, ta);
  c.font = `500 ${bodyFont}px "Noto Sans SC", sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "top";

  let ly = oy + headerH + bannerH + bodyPadY;
  for (const line of lines) {
    c.fillText(truncateText(c, line.text, w - padX * 2), ox + padX, ly);
    ly += bodyFont + lineGap;
  }
  c.restore();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// 水印变更监听（报告模式实时刷新选中块）
const _wmListeners = [];
function notifyWatermarkChange() {
  for (const cb of _wmListeners) {
    try {
      cb(getWatermarkSnapshotSafe());
    } catch (e) {
      console.warn(e);
    }
  }
}
function onWatermarkChange(cb) {
  if (typeof cb === "function") _wmListeners.push(cb);
  return () => {
    const i = _wmListeners.indexOf(cb);
    if (i >= 0) _wmListeners.splice(i, 1);
  };
}
function getWatermarkSnapshotSafe() {
  try {
    return getWatermarkSnapshot();
  } catch {
    return null;
  }
}

/**
 * 让画布在预览区内完整显示（contain），不出现页面滚动。
 * 仅改 CSS 宽高；canvas.width/height 始终等于原图像素，导出分辨率不变。
 */
function fitCanvasDisplay() {
  if (!state.image) {
    canvas.style.width = "";
    canvas.style.height = "";
    return;
  }
  const wrap = $("#canvasWrap");
  if (!wrap) return;

  const rect = wrap.getBoundingClientRect();
  // 四周留 16px 边距，避免贴边
  const inset = 16;
  const availW = Math.max(32, rect.width - inset * 2);
  const availH = Math.max(32, rect.height - inset * 2);

  // 容器尚未布局完成时延后
  if (rect.width < 8 || rect.height < 8) {
    scheduleFitCanvas();
    return;
  }

  const iw = state.image.naturalWidth || canvas.width;
  const ih = state.image.naturalHeight || canvas.height;
  if (!iw || !ih) return;

  // 等比完整放入（可缩小；预览可略放大以填满，不影响导出像素）
  const scale = Math.min(availW / iw, availH / ih);
  const dw = Math.max(1, Math.floor(iw * scale));
  const dh = Math.max(1, Math.floor(ih * scale));
  canvas.style.width = `${dw}px`;
  canvas.style.height = `${dh}px`;
  state._displayScale = scale;
}

let _fitRaf = 0;
function scheduleFitCanvas() {
  if (_fitRaf) cancelAnimationFrame(_fitRaf);
  _fitRaf = requestAnimationFrame(() => {
    _fitRaf = 0;
    fitCanvasDisplay();
    // 二次适配：登录后/字体加载后布局可能再变
    requestAnimationFrame(() => fitCanvasDisplay());
  });
}

function redraw() {
  if (!state.image) {
    canvas.classList.remove("visible");
    emptyState.classList.remove("hidden");
    if ($("#btnExport")) $("#btnExport").disabled = true;
    canvas.style.width = "";
    canvas.style.height = "";
    notifyWatermarkChange();
    return;
  }

  emptyState.classList.add("hidden");
  canvas.classList.add("visible");
  if ($("#btnExport")) $("#btnExport").disabled = false;

  const img = state.image;
  // 位图分辨率 = 原图（保证导出清晰，绝不因预览缩放改掉）
  if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const shortSide = Math.min(canvas.width, canvas.height);
  const baseUnit = shortSide / 900;
  const layout = measureWatermark(baseUnit);
  const { x, y } = resolvePosition(canvas.width, canvas.height, layout.width, layout.height);
  const ox = clamp(x, 0, Math.max(0, canvas.width - layout.width));
  const oy = clamp(y, 0, Math.max(0, canvas.height - layout.height));
  drawWatermarkAt(ctx, ox, oy, layout);
  state._layout = { ...layout, x: ox, y: oy };

  scheduleFitCanvas();
  notifyWatermarkChange();
}

// —— 图片 / 导出 ——
function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    state.image = img;
    state.imageName = file.name || "photo.jpg";
    state.offsetX = 0;
    state.offsetY = 0;
    imageInfo.textContent = `${state.imageName} · ${img.naturalWidth}×${img.naturalHeight}`;
    redraw();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("图片加载失败");
  };
  img.src = url;
}

function exportImage() {
  if (!state.image) return;
  const a = document.createElement("a");
  const name = state.imageName.replace(/\.[^.]+$/, "") || "watermarked";
  a.download = `${name}_水印.jpg`;
  a.href = canvas.toDataURL("image/jpeg", 0.95);
  a.click();
}

/** 供施工报告模块调用：快照 / 离屏合成水印（不改变当前画布图） */
function getWatermarkSnapshot() {
  const type = getCurrentType();
  return {
    title: state.title,
    subtitle: state.subtitle,
    fieldValues: { ...state.fieldValues },
    fields: (type?.fields || []).map((f) => ({
      key: f.key,
      label: f.label,
    })),
    typeId: state.typeId,
    scale: state.scale,
    fontScale: state.fontScale,
    boxOpacity: state.boxOpacity,
    textOpacity: state.textOpacity,
    radius: state.radius,
    position: state.position,
    margin: state.margin,
    headerColor: state.headerColor,
    bannerColor: state.bannerColor,
    textColor: state.textColor,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
  };
}

function applySnapshotToState(snap) {
  if (!snap) return () => {};
  const backup = getWatermarkSnapshot();
  state.title = snap.title ?? state.title;
  state.subtitle = snap.subtitle ?? state.subtitle;
  state.fieldValues = { ...(snap.fieldValues || {}) };
  state.scale = snap.scale ?? state.scale;
  state.fontScale = snap.fontScale ?? state.fontScale;
  state.boxOpacity = snap.boxOpacity ?? state.boxOpacity;
  state.textOpacity = snap.textOpacity ?? state.textOpacity;
  state.radius = snap.radius ?? state.radius;
  state.position = snap.position ?? state.position;
  state.margin = snap.margin ?? state.margin;
  state.headerColor = snap.headerColor ?? state.headerColor;
  state.bannerColor = snap.bannerColor ?? state.bannerColor;
  state.textColor = snap.textColor ?? state.textColor;
  state.offsetX = snap.offsetX ?? 0;
  state.offsetY = snap.offsetY ?? 0;
  // 临时覆盖类型字段标签（measure 读 getCurrentType）
  const type = getCurrentType();
  const labelBackup = type ? type.fields.map((f) => ({ key: f.key, label: f.label })) : [];
  if (type && Array.isArray(snap.fields)) {
    for (const sf of snap.fields) {
      const f = type.fields.find((x) => x.key === sf.key);
      if (f && sf.label != null) f.label = sf.label;
    }
  }
  return () => {
    state.title = backup.title;
    state.subtitle = backup.subtitle;
    state.fieldValues = backup.fieldValues;
    state.scale = backup.scale;
    state.fontScale = backup.fontScale;
    state.boxOpacity = backup.boxOpacity;
    state.textOpacity = backup.textOpacity;
    state.radius = backup.radius;
    state.position = backup.position;
    state.margin = backup.margin;
    state.headerColor = backup.headerColor;
    state.bannerColor = backup.bannerColor;
    state.textColor = backup.textColor;
    state.offsetX = backup.offsetX;
    state.offsetY = backup.offsetY;
    if (type) {
      for (const lb of labelBackup) {
        const f = type.fields.find((x) => x.key === lb.key);
        if (f) f.label = lb.label;
      }
    }
  };
}

/**
 * 将图片 dataURL + 水印快照合成为 JPEG dataURL
 * @param {string} imageDataUrl
 * @param {object} [snapshot]
 * @param {number} [quality=0.92]
 */
async function composeWatermarkedDataUrl(imageDataUrl, snapshot, quality = 0.92) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = imageDataUrl;
  });

  // 限制最长边，避免 Word 过大（预览/导出仍清晰）
  const maxSide = 3200;
  let tw = img.naturalWidth;
  let th = img.naturalHeight;
  const m = Math.max(tw, th);
  if (m > maxSide) {
    const s = maxSide / m;
    tw = Math.round(tw * s);
    th = Math.round(th * s);
  }

  const off = document.createElement("canvas");
  off.width = tw;
  off.height = th;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0, tw, th);

  const restore = applySnapshotToState(snapshot || getWatermarkSnapshot());
  // measureWatermark 使用主 canvas 的 ctx.font 测量——临时借用 octx
  const prevCtx = ctx;
  // 劫持：临时把全局测量用 octx（measure 内部用 ctx）
  // 更稳妥：直接用主 ctx 测量（与字体无关画布）
  try {
    const shortSide = Math.min(off.width, off.height);
    const baseUnit = shortSide / 900;
    // measure 依赖全局 ctx —— 使用主 canvas 的 ctx 测量即可
    const layout = measureWatermark(baseUnit);
    const { x, y } = resolvePosition(off.width, off.height, layout.width, layout.height);
    const ox = clamp(x, 0, Math.max(0, off.width - layout.width));
    const oy = clamp(y, 0, Math.max(0, off.height - layout.height));
    drawWatermarkAt(octx, ox, oy, layout);
  } finally {
    restore();
  }

  return off.toDataURL("image/jpeg", quality);
}

/** 把快照加载进 state 并同步右侧表单 UI（永久生效，不自动还原） */
function loadSnapshotToUI(snap) {
  if (!snap) return;
  if (snap.typeId) {
    const t = state.types.find((x) => x.id === snap.typeId);
    if (t) state.typeId = t.id;
  }
  applySnapshotToState(snap); // 返回还原函数，此处不调用 = 保持快照
  // 上面会改 state 但仍保存了 backup 闭包——我们需要永久应用：
  // 重新直接写入
  state.title = snap.title ?? state.title;
  state.subtitle = snap.subtitle ?? state.subtitle;
  state.fieldValues = { ...(snap.fieldValues || state.fieldValues) };
  state.scale = snap.scale ?? state.scale;
  state.fontScale = snap.fontScale ?? state.fontScale;
  state.boxOpacity = snap.boxOpacity ?? state.boxOpacity;
  state.textOpacity = snap.textOpacity ?? state.textOpacity;
  state.radius = snap.radius ?? state.radius;
  state.position = snap.position ?? state.position;
  state.margin = snap.margin ?? state.margin;
  state.headerColor = snap.headerColor ?? state.headerColor;
  state.bannerColor = snap.bannerColor ?? state.bannerColor;
  state.textColor = snap.textColor ?? state.textColor;
  state.offsetX = snap.offsetX ?? 0;
  state.offsetY = snap.offsetY ?? 0;

  if (titleInput) titleInput.value = state.title || "";
  if (subtitleInput) subtitleInput.value = state.subtitle || "";
  renderTypeSelect();
  renderFieldsEditor();
  // 滑块
  const setRange = (id, valId, v, fmt) => {
    const el = $(id);
    const lab = $(valId);
    if (el) el.value = v;
    if (lab) lab.textContent = fmt;
  };
  setRange("#scaleRange", "#scaleVal", Math.round(state.scale * 100), `${Math.round(state.scale * 100)}%`);
  setRange("#fontRange", "#fontVal", Math.round(state.fontScale * 100), `${Math.round(state.fontScale * 100)}%`);
  setRange("#boxOpacityRange", "#boxOpacityVal", Math.round(state.boxOpacity * 100), `${Math.round(state.boxOpacity * 100)}%`);
  setRange("#textOpacityRange", "#textOpacityVal", Math.round(state.textOpacity * 100), `${Math.round(state.textOpacity * 100)}%`);
  setRange("#radiusRange", "#radiusVal", state.radius, String(state.radius));
  setRange("#marginRange", "#marginVal", state.margin, `${state.margin}px`);
  if ($("#headerColor")) $("#headerColor").value = state.headerColor;
  if ($("#bannerColor")) $("#bannerColor").value = state.bannerColor;
  if ($("#textColor")) $("#textColor").value = state.textColor;
  document.querySelectorAll("#posGrid button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pos === state.position);
  });
  notifyWatermarkChange();
}

// 暴露给 report 模块 / 调试
window.SyWatermark = {
  getSnapshot: getWatermarkSnapshot,
  composeDataUrl: composeWatermarkedDataUrl,
  loadSnapshotToUI,
  onChange: onWatermarkChange,
  notifyChange: notifyWatermarkChange,
  getState: () => state,
};
window.scheduleFitCanvas = scheduleFitCanvas;

// —— 类型弹窗 ——
function openTypeModal(type = null) {
  state.editingTypeId = type?.id || null;
  $("#typeModalTitle").textContent = type ? "编辑类型" : "新建类型";
  $("#typeNameInput").value = type?.name || "";
  $("#typeDefaultTitle").value = type?.defaultTitle || "工程记录";
  $("#typeDefaultSubtitle").value = type?.defaultSubtitle || "";
  renderTypeFieldsEditor(type?.fields || [{ key: "f1", label: "字段1", defaultValue: "" }]);
  typeModal.hidden = false;
}

function closeTypeModal() {
  typeModal.hidden = true;
  state.editingTypeId = null;
}

function renderTypeFieldsEditor(fields) {
  typeFieldsEditor.innerHTML = fields
    .map(
      (f, i) => `
      <div class="field-row single-label" data-idx="${i}">
        <input type="text" value="${escapeAttr(f.label)}" data-role="type-label" placeholder="字段标签" />
        <button type="button" class="btn-icon" data-role="type-remove">×</button>
      </div>`
    )
    .join("");
  typeFieldsEditor._fields = fields.map((f) => ({ ...f }));
}

function collectTypeFields() {
  const inputs = typeFieldsEditor.querySelectorAll("[data-role='type-label']");
  const fields = [];
  inputs.forEach((input, i) => {
    const label = input.value.trim() || `字段${i + 1}`;
    const key = `f_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    const prev = typeFieldsEditor._fields?.[i];
    const draft = { key: prev?.key || key, label, defaultValue: prev?.defaultValue || "", auto: prev?.auto };
    // 根据标签自动识别角色
    const role = fieldRole(draft);
    if (role) draft.auto = role;
    fields.push(draft);
  });
  return fields;
}

function saveTypeFromModal() {
  const name = $("#typeNameInput").value.trim();
  if (!name) {
    alert("请填写类型名称");
    return;
  }
  const fields = collectTypeFields();
  if (!fields.length) {
    alert("至少保留一个字段");
    return;
  }
  const payload = {
    id: state.editingTypeId || `type_${Date.now()}`,
    name,
    defaultTitle: $("#typeDefaultTitle").value.trim() || name,
    defaultSubtitle: $("#typeDefaultSubtitle").value.trim(),
    fields,
  };

  if (state.editingTypeId) {
    const idx = state.types.findIndex((t) => t.id === state.editingTypeId);
    if (idx >= 0) state.types[idx] = payload;
  } else {
    state.types.push(payload);
  }
  saveTypes();
  closeTypeModal();
  applyType(payload, state.editingTypeId === state.typeId);
}

// —— 拖拽水印 ——
let drag = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function hitWatermark(p) {
  const L = state._layout;
  if (!L) return false;
  return p.x >= L.x && p.x <= L.x + L.width && p.y >= L.y && p.y <= L.y + L.height;
}

function onPointerDown(e) {
  if (!state.image) return;
  const p = canvasPoint(e);
  if (!hitWatermark(p)) return;
  e.preventDefault();
  drag = { startX: p.x, startY: p.y, ox: state.offsetX, oy: state.offsetY };
  canvas.classList.add("dragging");
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();
  const p = canvasPoint(e);
  state.offsetX = drag.ox + (p.x - drag.startX);
  state.offsetY = drag.oy + (p.y - drag.startY);
  redraw();
}

function onPointerUp() {
  drag = null;
  canvas.classList.remove("dragging");
}

// —— 事件 ——
function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $(`#tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) loadImageFile(f);
    fileInput.value = "";
  });
  cameraInput.addEventListener("change", () => {
    const f = cameraInput.files?.[0];
    if (f) loadImageFile(f);
    cameraInput.value = "";
  });

  $("#btnExport").addEventListener("click", exportImage);
  $("#btnNew").addEventListener("click", () => {
    state.image = null;
    state.imageName = "";
    state.offsetX = 0;
    state.offsetY = 0;
    imageInfo.textContent = "尚未选择图片";
    redraw();
  });

  typeSelect.addEventListener("change", () => {
    const t = state.types.find((x) => x.id === typeSelect.value);
    applyType(t);
  });

  titleInput.addEventListener("input", () => {
    state.title = titleInput.value;
    redraw();
  });
  subtitleInput.addEventListener("input", () => {
    state.subtitle = subtitleInput.value;
    redraw();
  });

  fieldsEditor.addEventListener("input", (e) => {
    const row = e.target.closest(".field-row");
    if (!row) return;
    const key = row.dataset.key;
    const role = e.target.dataset.role;
    if (role === "value") {
      state.fieldValues[key] = e.target.value;
      // 手动改经纬度时同步缓存
      const f = getCurrentType()?.fields.find((x) => x.key === key);
      const fr = f ? fieldRole(f) : null;
      if (fr === "lng") {
        const n = parseFloat(e.target.value);
        state.pickedLng = Number.isFinite(n) ? n : null;
      }
      if (fr === "lat") {
        const n = parseFloat(e.target.value);
        state.pickedLat = Number.isFinite(n) ? n : null;
      }
      redraw();
      // 手动改时间 / 经纬度后，防抖自动更新天气
      if (fr === "datetime" || fr === "lng" || fr === "lat") {
        scheduleWeatherRefresh();
      }
    } else if (role === "label") {
      const type = getCurrentType();
      const f = type?.fields.find((x) => x.key === key);
      if (f) {
        f.label = e.target.value;
        const r = fieldRole(f);
        if (r) f.auto = r;
        saveTypes();
        redraw();
      }
    }
  });

  // 失焦时若时间/经纬度已有效，立即尝试更新天气（不等待防抖）
  fieldsEditor.addEventListener("change", (e) => {
    const row = e.target.closest(".field-row");
    if (!row || e.target.dataset.role !== "value") return;
    const f = getCurrentType()?.fields.find((x) => x.key === row.dataset.key);
    const fr = f ? fieldRole(f) : null;
    if (fr === "datetime" || fr === "lng" || fr === "lat") {
      scheduleWeatherRefresh(0);
    }
  });

  fieldsEditor.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-role='pick']");
    if (pick) {
      const act = pick.dataset.act;
      if (act === "pick-time") openTimeModal();
      else if (act === "pick-loc") openLocModal();
      else if (act === "pick-weather") updateWeatherFromState();
      return;
    }
    const btn = e.target.closest("[data-role='remove']");
    if (!btn) return;
    const row = btn.closest(".field-row");
    const key = row?.dataset.key;
    const type = getCurrentType();
    if (!type || type.fields.length <= 1) {
      alert("至少保留一个字段");
      return;
    }
    type.fields = type.fields.filter((f) => f.key !== key);
    delete state.fieldValues[key];
    saveTypes();
    renderFieldsEditor();
    renderTypesList();
    redraw();
  });

  $("#btnAddField").addEventListener("click", () => {
    const type = getCurrentType();
    if (!type) return;
    const key = `custom_${Date.now()}`;
    type.fields.push({ key, label: "新字段", defaultValue: "" });
    state.fieldValues[key] = "";
    saveTypes();
    renderFieldsEditor();
    renderTypesList();
    redraw();
  });

  $("#btnPickTime").addEventListener("click", openTimeModal);
  $("#btnPickLocation").addEventListener("click", openLocModal);
  $("#btnFillGps").addEventListener("click", applyCurrentGps);
  $("#btnRefreshWeather").addEventListener("click", () => updateWeatherFromState());

  // 时间弹窗
  timeModal.querySelectorAll("[data-close-time]").forEach((el) => {
    el.addEventListener("click", closeTimeModal);
  });
  $("#btnTimeNow").addEventListener("click", () => {
    const now = new Date();
    $("#datePickerInput").value = toDateInputValue(now);
    $("#timePickerInput").value = toTimeInputValue(now);
    updateTimePreview();
  });
  $("#datePickerInput").addEventListener("input", updateTimePreview);
  $("#datePickerInput").addEventListener("change", updateTimePreview);
  $("#timePickerInput").addEventListener("input", updateTimePreview);
  $("#timePickerInput").addEventListener("change", updateTimePreview);
  $("#timePresets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-time]");
    if (!btn) return;
    $("#timePickerInput").value = btn.dataset.time;
    // 若尚未选日期，默认今天
    if (!$("#datePickerInput").value) {
      $("#datePickerInput").value = toDateInputValue(new Date());
    }
    updateTimePreview();
  });
  $("#btnConfirmTime").addEventListener("click", confirmTime);

  // 位置弹窗
  locModal.querySelectorAll("[data-close-loc]").forEach((el) => {
    el.addEventListener("click", closeLocModal);
  });
  $("#btnConfirmLoc").addEventListener("click", confirmLoc);
  $("#btnLocGps").addEventListener("click", async () => {
    $("#btnLocGps").textContent = "…";
    try {
      const { lat, lng, address, fuzzy } = await locateWithFallback();
      await setPendingFromLatLng(lat, lng, address || undefined);
      map?.setView([lat, lng], fuzzy ? 11 : MAP_DEFAULT_ZOOM);
      if (fuzzy) setStatus("已使用网络模糊定位（城市级），可在地图上微调", "ok");
    } catch (err) {
      console.error(err);
      alert(
        "定位失败：\n" +
          (err.message || geolocationErrorMessage(err)) +
          "\n\n可在地图上搜索或点击选点。"
      );
    } finally {
      $("#btnLocGps").textContent = "定位";
    }
  });

  const runSearch = async () => {
    const q = $("#locSearchInput").value.trim();
    if (!q) return;
    const box = $("#locSearchResults");
    box.hidden = false;
    box.innerHTML = `<button type="button" disabled>搜索中…</button>`;
    try {
      const list = await searchPlaces(q);
      if (!list.length) {
        box.innerHTML = `<button type="button" disabled>无结果</button>`;
        return;
      }
      box.innerHTML = list
        .map((item, i) => {
          const name = escapeHtml(item.display_name || "");
          return `<button type="button" data-idx="${i}">${name}</button>`;
        })
        .join("");
      box._results = list;
    } catch (err) {
      box.innerHTML = `<button type="button" disabled>搜索失败</button>`;
    }
  };

  $("#btnLocSearch").addEventListener("click", runSearch);
  $("#locSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });
  $("#locSearchResults").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-idx]");
    if (!btn) return;
    const item = $("#locSearchResults")._results?.[Number(btn.dataset.idx)];
    if (!item) return;
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const addr = formatAddress(item) || item.display_name || "";
    await setPendingFromLatLng(lat, lng, addr);
    map?.setView([lat, lng], MAP_DEFAULT_ZOOM);
    $("#locSearchResults").hidden = true;
  });

  // 样式
  const bindRange = (id, valId, key, fmt, transform = (v) => Number(v)) => {
    const el = $(id);
    el.addEventListener("input", () => {
      const v = transform(el.value);
      state[key] = v;
      $(valId).textContent = fmt(v, el.value);
      redraw();
    });
  };
  bindRange("#scaleRange", "#scaleVal", "scale", (_, raw) => `${raw}%`, (v) => Number(v) / 100);
  bindRange("#fontRange", "#fontVal", "fontScale", (_, raw) => `${raw}%`, (v) => Number(v) / 100);
  bindRange("#boxOpacityRange", "#boxOpacityVal", "boxOpacity", (_, raw) => `${raw}%`, (v) => Number(v) / 100);
  bindRange("#textOpacityRange", "#textOpacityVal", "textOpacity", (_, raw) => `${raw}%`, (v) => Number(v) / 100);
  bindRange("#radiusRange", "#radiusVal", "radius", (v) => String(Math.round(v)));
  bindRange("#marginRange", "#marginVal", "margin", (v) => `${Math.round(v)}px`);

  $("#headerColor").addEventListener("input", (e) => {
    state.headerColor = e.target.value;
    redraw();
  });
  $("#bannerColor").addEventListener("input", (e) => {
    state.bannerColor = e.target.value;
    redraw();
  });
  $("#textColor").addEventListener("input", (e) => {
    state.textColor = e.target.value;
    redraw();
  });

  $("#posGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-pos]");
    if (!btn) return;
    $("#posGrid").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.position = btn.dataset.pos;
    state.offsetX = 0;
    state.offsetY = 0;
    redraw();
  });

  typesList.addEventListener("click", (e) => {
    const card = e.target.closest(".type-card");
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest("button")?.dataset.act;
    const type = state.types.find((t) => t.id === id);
    if (!type) return;
    if (act === "use" || !act) applyType(type);
    else if (act === "edit") openTypeModal(type);
    else if (act === "del") {
      if (state.types.length <= 1) {
        alert("至少保留一种类型");
        return;
      }
      if (!confirm(`删除类型「${type.name}」？`)) return;
      state.types = state.types.filter((t) => t.id !== id);
      saveTypes();
      if (state.typeId === id) applyType(state.types[0]);
      else {
        renderTypesList();
        renderTypeSelect();
      }
    }
  });

  $("#btnNewType").addEventListener("click", () => openTypeModal(null));
  $("#btnSaveType").addEventListener("click", saveTypeFromModal);
  typeModal.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closeTypeModal);
  });
  $("#btnAddTypeField").addEventListener("click", () => {
    const fields = collectTypeFields();
    fields.push({ key: `f_${Date.now()}`, label: "新字段", defaultValue: "" });
    renderTypeFieldsEditor(fields);
  });
  typeFieldsEditor.addEventListener("click", (e) => {
    if (!e.target.closest("[data-role='type-remove']")) return;
    const row = e.target.closest(".field-row");
    const fields = collectTypeFields();
    const idx = Number(row.dataset.idx);
    if (fields.length <= 1) {
      alert("至少保留一个字段");
      return;
    }
    fields.splice(idx, 1);
    renderTypeFieldsEditor(fields);
  });

  canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp);

  const wrap = $("#canvasWrap");
  wrap.addEventListener("dragover", (e) => e.preventDefault());
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) loadImageFile(f);
  });
}

function init() {
  loadTypes();
  applyType(getCurrentType() || state.types[0]);
  $("#scaleRange").value = Math.round(state.scale * 100);
  $("#fontRange").value = Math.round(state.fontScale * 100);
  $("#boxOpacityRange").value = Math.round(state.boxOpacity * 100);
  $("#textOpacityRange").value = Math.round(state.textOpacity * 100);
  $("#radiusRange").value = state.radius;
  $("#marginRange").value = state.margin;
  $("#scaleVal").textContent = `${Math.round(state.scale * 100)}%`;
  $("#fontVal").textContent = `${Math.round(state.fontScale * 100)}%`;
  $("#boxOpacityVal").textContent = `${Math.round(state.boxOpacity * 100)}%`;
  $("#textOpacityVal").textContent = `${Math.round(state.textOpacity * 100)}%`;
  $("#radiusVal").textContent = String(state.radius);
  $("#marginVal").textContent = `${state.margin}px`;
  $("#headerColor").value = state.headerColor;
  $("#bannerColor").value = state.bannerColor;
  $("#textColor").value = state.textColor;
  bindEvents();

  // 窗口 / 侧栏 / 登录后显示主界面时重新适配
  const wrap = $("#canvasWrap");
  if (wrap && typeof ResizeObserver !== "undefined") {
    let roTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(() => scheduleFitCanvas(), 30);
    });
    ro.observe(wrap);
    // 同时观察预览面板，侧栏改宽时也能触发
    const panel = document.querySelector(".preview-panel");
    if (panel) ro.observe(panel);
  }
  window.addEventListener("resize", () => scheduleFitCanvas());
  window.addEventListener("auth:ready", () => scheduleFitCanvas());
  // 方向变化（手机）
  window.addEventListener("orientationchange", () => {
    setTimeout(() => scheduleFitCanvas(), 200);
  });

  if (document.fonts?.ready) document.fonts.ready.then(() => redraw());
}

init();
