// content 主逻辑：页面解析、SPA 监听、与 background 通信、面板编排。
import { Panel } from "./panel.js";

let panel = null;
let currentLan = null;     // 用户在面板手动选择的字幕轨 lan（如 "zh-Hans" / "en"）
let autoTranslate = null;  // 用户在面板切换的自动翻译开关（覆盖 settings.autoTranslate）
let lastCtxKey = null;
let runToken = 0;
let contextInvalid = false;   // 扩展被重载/更新后，本 content 的 chrome.runtime 失效
let pollIntervalId = null;

// 检测 extension context 是否仍可用。失效后清理自身、停止调度并退出。
// 触发点：用户在 chrome://extensions 点了重载按钮 / 扩展被热更新。
// 旧 content script 会永久失效，只能优雅自毁，等用户刷新页面重新注入。
function contextAlive() {
  if (contextInvalid) return false;
  try {
    // chrome.runtime.id 在 context 失效后访问会抛 "Extension context invalidated"
    if (!chrome.runtime?.id) throw new Error("no runtime id");
    return true;
  } catch {
    contextInvalid = true;
    if (panel) panel.clear().catch(() => {});
    panel = null;
    if (pollIntervalId) clearInterval(pollIntervalId);
    return false;
  }
}

function getCtx() {
  // YouTube watch 页：?v=VIDEO_ID
  const u = new URL(location.href);
  if (!/\/watch(\?|$)/.test(u.pathname)) return null;
  const v = u.searchParams.get("v");
  if (!v) return null;
  return { videoId: v };
}

function seekTo(sec) {
  const v = document.querySelector("video");
  if (v && typeof sec === "number" && isFinite(sec)) {
    try { v.currentTime = sec; } catch { /* ignore */ }
  }
}

function openSettings() {
  if (!contextAlive()) return;
  try { chrome.runtime.sendMessage({ type: "openOptions" }); }
  catch { contextInvalid = true; }
}

async function ensurePanel() {
  if (!panel) {
    panel = new Panel({
      onSeek: seekTo,
      onSwitchTrack: lan => { currentLan = lan; requestAnalyze(true); },
      onToggleTranslate: en => { autoTranslate = en; requestAnalyze(true, true); },
      onSettings: openSettings,
      onReanalyze: () => requestAnalyze(true, true)
    });
  }
  // panel.build() 内调 chrome.runtime.getURL，context 失效时抛 friendly error
  await panel.build();
}

async function requestAnalyze(forceNow = false, force = false) {
  if (!contextAlive()) return;                  // context 失效后停止响应
  const ctx = getCtx();
  if (!ctx) { if (panel) panel.clear().catch(() => {}); panel = null; lastCtxKey = null; return; }
  const key = ctx.videoId;
  const sameCtx = key === lastCtxKey && !force;
  lastCtxKey = key;

  try {
    await ensurePanel();
  } catch (e) {
    // panel.build() 失败大概率是 context 失效：清理并退出，让用户刷新页面
    contextInvalid = true;
    if (panel) panel.clear().catch(() => {});
    panel = null;
    return;
  }
  if (!contextAlive()) return;
  if (!forceNow && sameCtx) return;
  await panel.setBusy();

  const myToken = ++runToken;
  try {
    const res = await chrome.runtime.sendMessage({
      type: "analyze",
      videoId: ctx.videoId,
      lan: currentLan,
      autoTranslate: autoTranslate
    });
    if (myToken !== runToken) return;   // 已被新请求取代
    if (!panel || !contextAlive()) return;
    if (res?.status === "ok") panel.setResult(res);
    else if (res?.status === "no-subtitle") { await panel.clear(); panel = null; }
    else panel.setError(res?.message || "检测失败");
  } catch (e) {
    if (myToken !== runToken) return;
    const msg = String(e?.message || e);
    if (msg.includes("context") || msg.includes("Extension context")) {
      // 扩展被重载，本 content 已失效：自毁并退出
      contextInvalid = true;
      if (panel) panel.clear().catch(() => {});
      panel = null;
      return;
    }
    if (panel) panel.setError(msg);
  }
}

// 防抖
let debounceTimer = null;
function scheduleAnalyze() {
  if (!contextAlive()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => requestAnalyze(true), 450);
}

// YouTube SPA 路由监听
function watchNavigation() {
  // YouTube 切视频时自发派发 yt-navigate-finish（页内 history 更新同步发生）
  window.addEventListener("yt-navigate-finish", scheduleAnalyze);
  // 兜底：少数情况 yt 事件未触发
  let last = location.href;
  pollIntervalId = setInterval(() => {
    if (!contextAlive()) return;
    if (location.href !== last) { last = location.href; scheduleAnalyze(); }
  }, 800);
}

function init() {
  if (!contextAlive()) return;
  watchNavigation();
  requestAnalyze(true);
}

// 监听 background 在规则变更后发起的刷新
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "refresh") scheduleAnalyze();
    return false;
  });
} catch { contextInvalid = true; }

init();