// 规则与设置的持久化：默认规则（中英合并）+ 用户覆盖项（按 id 合并），自定义规则整体存储。
// 使用 chrome.storage.local。命名空间独立为 noyit:*，避免与 B站版 NoAIText 互扰。

import { DEFAULT_RULES, DEFAULT_SETTINGS } from "./rules.js";

const KEY_RULES = "noyit:overrides";
const KEY_SETTINGS = "noyit:settings";

export async function loadOverrides() {
  const r = await chrome.storage.local.get(KEY_RULES);
  return Array.isArray(r[KEY_RULES]) ? r[KEY_RULES] : [];
}

export async function saveOverrides(overrides) {
  await chrome.storage.local.set({ [KEY_RULES]: overrides });
}

export async function loadSettingsObj() {
  const r = await chrome.storage.local.get(KEY_SETTINGS);
  return r[KEY_SETTINGS] && typeof r[KEY_SETTINGS] === "object" ? r[KEY_SETTINGS] : {};
}

export async function saveSettingsObj(obj) {
  const cur = await loadSettingsObj();
  await chrome.storage.local.set({ [KEY_SETTINGS]: { ...cur, ...obj } });
}

export async function getMergedRules() {
  const overrides = await loadOverrides();
  const byId = new Map(overrides.map(o => [o.id, o]));
  const result = [];
  for (const def of DEFAULT_RULES) {
    const ov = byId.get(def.id);
    result.push(ov ? applyOverride(def, ov) : { ...def });
  }
  // 用户自定义规则（默认库里没有的 id）
  for (const ov of overrides) {
    if (!DEFAULT_RULES.some(d => d.id === ov.id) && isValidCustom(ov)) {
      result.push({ ...ov });
    }
  }
  return result;
}

export async function getSettings() {
  const user = await loadSettingsObj();
  return {
    sensitivity: user.sensitivity ?? DEFAULT_SETTINGS.sensitivity,
    shortTextLimit: user.shortTextLimit ?? DEFAULT_SETTINGS.shortTextLimit,
    shortTextLimitEn: user.shortTextLimitEn ?? DEFAULT_SETTINGS.shortTextLimitEn,
    autoTranslate: user.autoTranslate ?? false,
    thresholds: user.thresholds ?? {},
    autoDetect: user.autoDetect ?? DEFAULT_SETTINGS.autoDetect
  };
}

function applyOverride(def, ov) {
  const r = { ...def };
  if (typeof ov.enabled === "boolean") r.enabled = ov.enabled;
  if (typeof ov.weight === "number") r.weight = ov.weight;
  if (typeof ov.cap === "number") r.cap = ov.cap;
  if (typeof ov.name === "string" && ov.name) r.name = ov.name;
  if (ov.pattern != null && def.kind !== "structure") r.pattern = ov.pattern;
  return r;
}

function isValidCustom(ov) {
  const patternOk = ov.kind === "structure"
    || typeof ov.pattern === "string"
    || Array.isArray(ov.pattern);
  return !!ov.id && !!ov.name && !!ov.kind && patternOk
    && typeof ov.weight === "number" && typeof ov.cap === "number";
}