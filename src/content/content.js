// content 主逻辑：页面解析、SPA 监听、与 background 通信、面板编排。
// 字幕获取走 page-bridge（page-world 注入）路径，绕开 timedtext baseUrl 的
// is_servable:false 限制；page-bridge 通过 movie_player 激活目标轨后读
// video.textTracks 的 cues 返回给本 script。
import { Panel } from "./panel.js";

let panel = null;
let currentLan = null;     // 用户在面板手动选择的字幕轨 lan（如 "zh-Hant" / "en"）
let autoTranslate = null;  // 保留字段（page-bridge 路径暂不接机翻，留待后续）
let lastCtxKey = null;
let runToken = 0;
let contextInvalid = false;
let pollIntervalId = null;
let bridgeReady = false;

const BRIDGE = "noyitext-yt";

// 检测 extension context 是否仍可用。
function contextAlive() {
  if (contextInvalid) return false;
  try {
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

// 注入 page-world 桥接脚本。MV3 content script 在隔离世界无法访问
// window.ytplayer / movie_player，靠 <script src=chrome-extension://..>
// 注入主世界脚本，并约定 postMessage 通信。
function injectBridge() {
  if (document.querySelector(`script[${'data-noyitext-bridge'}]`)) return;
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("src/content/page-bridge.js");
  s.async = true;
  s.setAttribute("data-noyitext-bridge", "1");
  (document.head || document.documentElement).appendChild(s);
  s.onload = () => { try { s.remove(); } catch {} };
}

// 通过 page-bridge 请求字幕（page-world）。返回 {segments, audioLang, tracks, chosenLang}。
function requestBridgeCaptions(lan) {
  return new Promise((resolve, reject) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("page-bridge 超时未响应（页面可能未就绪，刷新试试）"));
    }, 12000);

    function onMsg(ev) {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.__bridge !== BRIDGE) return;
      if (d.direction === "ready") { bridgeReady = true; return; }
      if (d.direction !== "res" || d.id !== id) return;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      if (d.ok) resolve({ segments: d.segments || [], audioLang: d.audioLang || "", tracks: d.tracks || [], chosenLang: d.chosenLang || "" });
      else reject(new Error(d.error || "page-bridge 取字幕失败"));
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ __bridge: BRIDGE, direction: "req", id, lan: lan || "" }, "*");
  });
}

async function ensurePanel() {
  if (!panel) {
    panel = new Panel({
      onSeek: seekTo,
      onSwitchTrack: lan => { currentLan = lan; requestAnalyze(true); },
      onToggleTranslate: () => { /* 自动翻译当前 page-bridge 路径不接，留作后续 */ requestAnalyze(true, true); },
      onSettings: openSettings,
      onReanalyze: () => requestAnalyze(true, true)
    });
  }
  await panel.build();
}

async function requestAnalyze(forceNow = false, force = false) {
  if (!contextAlive()) return;
  const ctx = getCtx();
  if (!ctx) { if (panel) panel.clear().catch(() => {}); panel = null; lastCtxKey = null; return; }
  const key = `${ctx.videoId}:${currentLan || ""}`;
  const sameCtx = key === lastCtxKey && !force;
  lastCtxKey = key;

  try {
    await ensurePanel();
  } catch (e) {
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
    injectBridge();
    // 给 page-bridge 一点 ready 时间；首次注入可能慢
    if (!bridgeReady) await new Promise(r => setTimeout(r, 200));

    const captured = await requestBridgeCaptions(currentLan);
    if (myToken !== runToken) return;
    if (!contextAlive()) return;

    // 把 page-bridge 取到的 segments 直接交给 background 分析（不经过 timedtext）
    const res = await chrome.runtime.sendMessage({
      type: "analyzeCaptured",
      videoId: ctx.videoId,
      segments: captured.segments,
      chosenLang: captured.chosenLang,
      audioLang: captured.audioLang,
      tracks: captured.tracks
    });
    if (myToken !== runToken) return;
    if (!panel || !contextAlive()) return;
    if (res?.status === "ok") panel.setResult(res);
    else if (res?.status === "no-subtitle") { await panel.clear(); panel = null; }
    else panel.setError(res?.message || "检测失败");
  } catch (e) {
    if (myToken !== runToken) return;
    const msg = String(e?.message || e);
    if (msg.includes("context") || msg.includes("Extension context")) {
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

function watchNavigation() {
  window.addEventListener("yt-navigate-finish", scheduleAnalyze);
  let last = location.href;
  pollIntervalId = setInterval(() => {
    if (!contextAlive()) return;
    if (location.href !== last) { last = location.href; bridgeReady = false; scheduleAnalyze(); }
  }, 800);
}

function init() {
  if (!contextAlive()) return;
  injectBridge();
  watchNavigation();
  requestAnalyze(true);
}

try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "refresh") scheduleAnalyze();
    return false;
  });
} catch { contextInvalid = true; }

init();