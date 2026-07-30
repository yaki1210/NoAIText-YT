import { loadOverrides, saveOverrides, loadSettingsObj, saveSettingsObj } from "../src/core/storage.js";
import { DEFAULT_RULES, DEFAULT_SETTINGS } from "../src/core/rules.js";

const CATEGORY_LABEL = {
  pair: "句式", connect: "连接词", academic: "翻译腔",
  buzzword: "大词", outro: "套话", structure: "结构", human: "口语"
};
const LANG_LABEL = { zh: "中文", en: "EN" };

let overrides = [];
let settings = {};

const $ = sel => document.querySelector(sel);
const listEl = $("#rules-list");
const savedTag = $("#saved-tag");

function flashSaved() {
  savedTag.textContent = "✓ 已保存";
  savedTag.classList.add("show");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => savedTag.classList.remove("show"), 1200);
}

// ── 数据加载 ────────────────────────────────────────
async function loadAll() {
  overrides = await loadOverrides();
  settings = await loadSettingsObj();
  settings.sensitivity = settings.sensitivity ?? DEFAULT_SETTINGS.sensitivity;
  settings.shortTextLimit = settings.shortTextLimit ?? DEFAULT_SETTINGS.shortTextLimit;
  settings.shortTextLimitEn = settings.shortTextLimitEn ?? DEFAULT_SETTINGS.shortTextLimitEn;
  settings.autoTranslate = settings.autoTranslate ?? false;
  settings.thresholds = settings.thresholds || {};
  settings.thresholds.low = settings.thresholds.low ?? 30;
  settings.thresholds.mid = settings.thresholds.mid ?? 60;
  renderSettings();
  renderRules();
}

// ── 覆盖项读写 ──────────────────────────────────────
function setOverride(id, patch) {
  let ov = overrides.find(o => o.id === id);
  if (!ov) { ov = { id }; overrides.push(ov); }
  Object.assign(ov, patch);
}
function clearOverride(id) {
  overrides = overrides.filter(o => o.id !== id);
}

async function persistRules() {
  await saveOverrides(overrides);
  flashSaved();
}

// ── 构造展示行 ──────────────────────────────────────
function buildRows() {
  const defaultIds = new Set(DEFAULT_RULES.map(r => r.id));
  const ovMap = new Map(overrides.map(o => [o.id, o]));
  const rows = DEFAULT_RULES.map(d => {
    const ov = ovMap.get(d.id);
    return {
      id: d.id, name: ov?.name ?? d.name, kind: d.kind, lang: d.lang,
      category: d.category, weight: ov?.weight ?? d.weight,
      cap: ov?.cap ?? d.cap, enabled: ov?.enabled ?? d.enabled ?? true,
      pattern: (d.kind !== "structure" && ov?.pattern != null) ? ov.pattern : d.pattern,
      custom: false
    };
  });
  for (const ov of overrides) {
    if (!defaultIds.has(ov.id) && ov.id && ov.kind) {
      rows.push({ id: ov.id, name: ov.name, kind: ov.kind, lang: ov.lang || "zh",
        category: ov.category, weight: ov.weight, cap: ov.cap, enabled: ov.enabled ?? true,
        pattern: ov.pattern, custom: true });
    }
  }
  return rows;
}

function patternToString(kind, pattern) {
  if (kind === "all") return Array.isArray(pattern) ? pattern.join(" | ") : String(pattern ?? "");
  return String(pattern ?? "");
}
function patternFromString(kind, text) {
  if (kind === "all") return text.split(/[|｜]/).map(s => s.trim()).filter(Boolean);
  return text;
}

function renderRules() {
  const filter = $("#filter").value.trim().toLowerCase();
  const onlyEnabled = $("#only-enabled").checked;
  const langFilter = $("#filter-lang").value;
  const rows = buildRows().filter(r => {
    if (onlyEnabled && !r.enabled) return false;
    if (langFilter && r.lang !== langFilter) return false;
    if (!filter) return true;
    return (r.name || "").toLowerCase().includes(filter) ||
           (CATEGORY_LABEL[r.category] || "").toLowerCase().includes(filter);
  });
  listEl.innerHTML = rows.map(rowHtml).join("");
}

function rowHtml(r) {
  const cat = CATEGORY_LABEL[r.category] || r.category || "";
  const lang = LANG_LABEL[r.lang] || r.lang || "";
  const readOnly = r.kind === "structure";
  const nameEditable = r.custom;
  const pat = readOnly
    ? `<span class="rule-pattern muted">（结构特征，内置算法）</span>`
    : `<span class="rule-pattern"><input data-k="${r.kind}" value="${escapeAttr(patternToString(r.kind, r.pattern))}" /></span>`;
  return `<div class="rule-row${r.custom ? " custom" : ""}">
    <input type="checkbox" ${r.enabled ? "checked" : ""} data-act="enable" data-id="${r.id}" />
    <div class="rule-name">
      <span data-act="name" data-id="${r.id}" ${nameEditable ? 'contenteditable="true"' : ""}>${escapeHtml(r.name)}</span>
      <span class="cat-tag">${cat}</span><span class="lang-tag">${lang}</span>
      ${r.custom ? '<span class="read">自定义</span>' : ""}
    </div>
    ${pat}
    <input type="number" data-act="weight" data-id="${r.id}" value="${r.weight}" />
    <input type="number" data-act="cap" data-id="${r.id}" value="${r.cap}" />
    ${r.custom ? `<button class="danger" data-act="del" data-id="${r.id}">删</button>` : '<span class="muted">—</span>'}
  </div>`;
}

// ── 事件（事件委托）──────────────────────────────────
listEl.addEventListener("change", onRowChange);
listEl.addEventListener("input", debounce(onRowChange, 350));
listEl.addEventListener("focusout", e => {
  if (e.target.dataset?.act === "name") {
    setOverride(e.target.dataset.id, { name: e.target.textContent.trim() });
    persistRules();
  }
});
listEl.addEventListener("click", e => {
  const b = e.target.closest('[data-act="del"]');
  if (!b) return;
  clearOverride(b.dataset.id);
  persistRules().then(renderRules);
});

function onRowChange(e) {
  const t = e.target;
  const act = t.dataset?.act;
  const id = t.dataset?.id;
  if (!act || !id) return;
  if (act === "enable") setOverride(id, { enabled: t.checked });
  else if (act === "weight") setOverride(id, { weight: toNum(t.value, 0) });
  else if (act === "cap") setOverride(id, { cap: toNum(t.value, 1) });
  persistRules();
}

// pattern 输入（data-k）单独监听
listEl.addEventListener("change", e => {
  const t = e.target;
  if (!t.dataset.k) return;
  const row = t.closest(".rule-row");
  const cb = row?.querySelector('[data-act="enable"]');
  if (!cb) return;
  setOverride(cb.dataset.id, { pattern: patternFromString(t.dataset.k, t.value) });
  persistRules();
});

function debounce(fn, ms) {
  let h; return function (...a) {
    clearTimeout(h); h = setTimeout(() => fn.apply(this, a), ms);
  };
}
function toNum(v, d) { const n = Number(v); return isFinite(n) ? n : d; }

// ── 参数区 ──────────────────────────────────────────
function renderSettings() {
  $("#sensitivity").value = settings.sensitivity;
  $("#sensitivity-val").textContent = settings.sensitivity;
  $("#thr-low").value = settings.thresholds.low;
  $("#thr-mid").value = settings.thresholds.mid;
  $("#short-limit").value = settings.shortTextLimit;
  $("#short-limit-en").value = settings.shortTextLimitEn;
  $("#auto-translate").checked = settings.autoTranslate;
}
$("#filter").addEventListener("input", renderRules);
$("#filter-lang").addEventListener("change", renderRules);
$("#only-enabled").addEventListener("change", renderRules);

$("#sensitivity").addEventListener("input", e => {
  settings.sensitivity = Number(e.target.value);
  $("#sensitivity-val").textContent = settings.sensitivity;
  saveSettingsObj({ sensitivity: settings.sensitivity }); flashSaved();
});
$("#thr-low").addEventListener("change", e => {
  settings.thresholds.low = clamp(Number(e.target.value), 0, 100);
  saveSettingsObj({ thresholds: { low: settings.thresholds.low, mid: settings.thresholds.mid } });
  renderSettings(); flashSaved();
});
$("#thr-mid").addEventListener("change", e => {
  settings.thresholds.mid = clamp(Number(e.target.value), 0, 100);
  saveSettingsObj({ thresholds: { low: settings.thresholds.low, mid: settings.thresholds.mid } });
  renderSettings(); flashSaved();
});
$("#short-limit").addEventListener("change", e => {
  settings.shortTextLimit = toNum(e.target.value, 200);
  saveSettingsObj({ shortTextLimit: settings.shortTextLimit }); flashSaved();
});
$("#short-limit-en").addEventListener("change", e => {
  settings.shortTextLimitEn = toNum(e.target.value, 150);
  saveSettingsObj({ shortTextLimitEn: settings.shortTextLimitEn }); flashSaved();
});
$("#auto-translate").addEventListener("change", e => {
  settings.autoTranslate = e.target.checked;
  saveSettingsObj({ autoTranslate: settings.autoTranslate }); flashSaved();
});

// ── 新增自定义 ──────────────────────────────────────
$("#btn-add").addEventListener("click", () => {
  const name = $("#add-name").value.trim();
  const kind = $("#add-kind").value;
  const pat = $("#add-pattern").value.trim();
  if (!name || !pat) { $("#add-pattern").focus(); return; }
  const id = "custom_" + Date.now().toString(36);
  overrides.push({
    id, name, kind, lang: $("#add-lang").value, category: $("#add-cat").value,
    pattern: patternFromString(kind, pat),
    weight: toNum($("#add-weight").value, 3),
    cap: toNum($("#add-cap").value, 3),
    enabled: true
  });
  $("#add-name").value = ""; $("#add-pattern").value = "";
  persistRules().then(renderRules);
});

// ── 导入/导出/恢复 ──────────────────────────────────
$("#btn-export").addEventListener("click", () => {
  const data = JSON.stringify({ overrides, settings }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "noyit-rules.json";
  a.click();
});
$("#btn-import").addEventListener("click", () => $("#file-import").click());
$("#file-import").addEventListener("change", async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (Array.isArray(j.overrides)) overrides = j.overrides;
    if (j.settings) {
      settings = { sensitivity: j.settings.sensitivity ?? settings.sensitivity,
        shortTextLimit: j.settings.shortTextLimit ?? settings.shortTextLimit,
        shortTextLimitEn: j.settings.shortTextLimitEn ?? settings.shortTextLimitEn,
        autoTranslate: j.settings.autoTranslate ?? settings.autoTranslate,
        thresholds: j.settings.thresholds || settings.thresholds };
      await saveSettingsObj(settings);
    }
    await persistRules();
    await loadAll();
  } catch (ex) { alert("导入失败：" + ex.message); }
});
$("#btn-reset").addEventListener("click", async () => {
  if (!confirm("确认清空所有自定义修改并恢复默认规则库？")) return;
  overrides = [];
  settings = { sensitivity: DEFAULT_SETTINGS.sensitivity,
    shortTextLimit: DEFAULT_SETTINGS.shortTextLimit,
    shortTextLimitEn: DEFAULT_SETTINGS.shortTextLimitEn,
    autoTranslate: false, thresholds: { low: 30, mid: 60 } };
  await saveOverrides([]);
  await saveSettingsObj(settings);
  await loadAll();
});

// ── 工具 ────────────────────────────────────────────
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "<" }[c])); }
function escapeAttr(s) { return String(s).replace(/["&<>]/g, c => ({ '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

loadAll();