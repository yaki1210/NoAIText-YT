// content 主逻辑：页面解析、SPA 监听、与 background 通信、面板编排。
// 字幕获取主路径：background 走 watch HTML + baseUrl&fmt=json3（失败时
// background 自己用 InnerTube /youtubei/v1/player 重取新鲜 baseUrl 再试）。
// 兜底路径：page-bridge 注入 page-world，通过 movie_player 激活目标轨后
// 读 video.textTracks 的 cues，专治 is_servable:false 的 ASR 轨。
import { Panel } from "./panel.js";

let panel = null;
let currentLan = null;     // 用户在面板手动选择的字幕轨 lan（如 "zh-Hant" / "en"）
let autoTranslate = null;  // 保留字段（page-bridge 路径暂不接机翻，留待后续）
let lastCtxKey = null;
let runToken = 0;
let contextInvalid = false;
let pollIntervalId = null;
let bridgeReady = false;
let cachedAutoDetect = false;  // 自动检测开关缓存

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
    // 新流程含拦截器安装 + toggleSubtitles 触发 + 6s capture + 可能的 fmt=json3 重取，
    // 超时放到 20s 留足余量
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("page-bridge 超时未响应（页面可能未就绪，刷新试试）"));
    }, 20000);

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

async function requestAnalyze(forceNow = false, force = false, manual = false) {
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
    // 主路径：background 走 watch HTML + baseUrl&fmt=json3（失败时 background
    // 自己用 InnerTube 重取新鲜 baseUrl 再试）。这条路径不依赖 movie_player /
    // textTracks，绝大多数视频能直接命中。
    let res = await chrome.runtime.sendMessage({
      type: "analyze",
      videoId: ctx.videoId,
      lan: currentLan || "",
      autoTranslate: autoTranslate,
      force
    });
    if (myToken !== runToken) return;
    if (!contextAlive()) return;

    // 主路径失败（无字幕轨 / baseUrl 空 body / InnerTube 也救不回）→
    // 退到 page-bridge 走 textTracks，专治 is_servable:false 的 ASR 轨。
    if (res?.status !== "ok") {
      const fallbackReason = res?.status || "primary-failed";
      res = await tryBridgeFallback(ctx, myToken, fallbackReason);
      if (myToken !== runToken) return;
      if (!contextAlive()) return;
    }

    if (!panel || !contextAlive()) return;
    if (res?.status === "ok") panel.setResult(res);
    else if (manual) {
      // 手动模式：显示错误信息
      if (res?.status === "no-subtitle") { await panel.clear(); panel = null; }
      else panel.setError(res?.message || "检测失败");
    } else {
      // 自动模式：静默，不显示任何内容
      if (panel) { await panel.clear(); panel = null; }
    }
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

// page-bridge 兜底：注入 page-world 脚本，请求 textTracks cues，送 analyzeCaptured。
// 仅在主路径（baseUrl）返回 no-subtitle / error 时调用。
async function tryBridgeFallback(ctx, myToken, reason) {
  try {
    injectBridge();
    if (!bridgeReady) await new Promise(r => setTimeout(r, 200));

    const captured = await requestBridgeCaptions(currentLan);
    if (myToken !== runToken) return { status: "error", message: "superseded" };
    if (!contextAlive()) return { status: "error", message: "context-invalid" };

    return await chrome.runtime.sendMessage({
      type: "analyzeCaptured",
      videoId: ctx.videoId,
      segments: captured.segments,
      chosenLang: captured.chosenLang,
      audioLang: captured.audioLang,
      tracks: captured.tracks,
      force: true
    });
  } catch (e) {
    // 兜底也失败：返回结构化错误，主流程统一展示
    return { status: "error", message: `主路径(${reason})与 textTracks 兜底均失败：${String(e?.message || e)}` };
  }
}

// 防抖：仅在自动检测开启时触发
let debounceTimer = null;
function scheduleAnalyze() {
  if (!contextAlive()) return;
  if (!cachedAutoDetect) return;
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

async function updateAutoDetectSetting() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: "getSettings" });
    cachedAutoDetect = settings?.autoDetect === true;
  } catch {
    cachedAutoDetect = false;
  }
}

async function init() {
  if (!contextAlive()) return;
  // 不再 eager 注入 page-bridge：主路径走 baseUrl，仅在兜底时按需注入
  watchNavigation();
  await updateAutoDetectSetting();
  if (cachedAutoDetect) requestAnalyze(true);
}

try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "refresh") scheduleAnalyze();
    if (msg && msg.type === "triggerAnalyze") requestAnalyze(true, false, true);
    if (msg && msg.type === "settingsChanged") updateAutoDetectSetting();
    return false;
  });
} catch { contextInvalid = true; }

init();