// content 主逻辑：页面解析、SPA 监听、与 background 通信、面板编排。
import { Panel } from "./panel.js";

let panel = null;
let currentLan = null;     // 用户在面板手动选择的字幕轨 lan（如 "zh-Hans" / "en"）
let autoTranslate = null;  // 用户在面板切换的自动翻译开关（覆盖 settings.autoTranslate）
let lastCtxKey = null;
let runToken = 0;

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
  chrome.runtime.sendMessage({ type: "openOptions" });
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
  await panel.build();
}

async function requestAnalyze(forceNow = false, force = false) {
  const ctx = getCtx();
  if (!ctx) { if (panel) panel.clear().catch(() => {}); panel = null; lastCtxKey = null; return; }
  const key = ctx.videoId;
  const sameCtx = key === lastCtxKey && !force;
  lastCtxKey = key;

  await ensurePanel();
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
    if (res?.status === "ok") panel.setResult(res);
    else if (res?.status === "no-subtitle") { await panel.clear(); panel = null; }
    else panel.setError(res?.message || "检测失败");
  } catch (e) {
    if (myToken !== runToken) return;
    panel.setError(String(e?.message || e));
  }
}

// 防抖
let debounceTimer = null;
function scheduleAnalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => requestAnalyze(true), 450);
}

// YouTube SPA 路由监听
function watchNavigation() {
  // YouTube 切视频时自发派发 yt-navigate-finish（页内 history 更新同步发生）
  window.addEventListener("yt-navigate-finish", scheduleAnalyze);
  // 兜底：少数情况 yt 事件未触发
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) { last = location.href; scheduleAnalyze(); }
  }, 800);
}

function init() {
  watchNavigation();
  requestAnalyze(true);
}

// 监听 background 在规则变更后发起的刷新
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "refresh") scheduleAnalyze();
  return false;
});

init();