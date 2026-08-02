// Service Worker：消息路由 + 字幕获取 + 检测 + 缓存
// 改造自 NoAIText(B站版)：
//   - 移除 wbi/player_v2，只用 watch 页内嵌 JSON + baseUrl&fmt=json3
//   - 缓存键改为 videoId
//   - 解析媒体轨语言归一到 zh/en 传给 detector；其余语言由 detector detectLang 兜底
import { fetchVideoInfo, fetchSubtitleContent, pickTrack, refreshTracksInnerTube } from "./api/youtube.js";
import { analyze } from "./core/detector.js";
import { getMergedRules, getSettings, loadSettingsObj } from "./core/storage.js";

const infoCache = new Map();     // videoId -> info
const subCache = new Map();      // baseUrl(+tlang) -> segments[]
const resultCache = new Map();   // key -> result

function hashRules(rules, settings) {
  let h = 5381;
  for (const r of rules) {
    if (r.enabled === false) continue;
    h = (h * 33) ^ (r.id.length + r.weight + r.cap + r.kind.length);
    const patStr = Array.isArray(r.pattern) ? r.pattern.join("\u0001") : (r.pattern ?? "");
    for (let i = 0; i < patStr.length; i++) h = (h * 33) ^ patStr.charCodeAt(i);
  }
  h = (h * 33) ^ Math.round((settings.sensitivity ?? 0) * 100);
  h = (h * 33) ^ (settings.autoTranslate ? 1 : 0);
  h = (h * 33) ^ (settings.shortTextLimit ?? 0);
  h = (h * 33) ^ (settings.shortTextLimitEn ?? 0);
  h = (h * 33) ^ (settings.lang ? settings.lang.charCodeAt(0) : 0);
  h = (h * 33) ^ (settings.lang ? settings.lang.charCodeAt(1) || 0 : 0);
  return (h >>> 0).toString(36);
}

function codec2lang(code) {
  if (!code) return null;
  const c = String(code).toLowerCase();
  if (c.startsWith("zh")) return "zh";
  if (c.startsWith("en")) return "en";
  return null;
}

async function handleAnalyze({ videoId, lan, autoTranslate, force }) {
  if (!videoId) return { status: "error", message: "缺少 videoId" };

  let info = !force ? infoCache.get(videoId) : null;
  if (!info) {
    info = await fetchVideoInfo(videoId);
    infoCache.set(videoId, info);
  }
  if (!info.tracks || !info.tracks.length)
    return { status: "no-subtitle", title: info.title, reason: "该视频暂无字幕轨" };

  const track = pickTrack(info.tracks, { lang: lan, audioLang: info.audioLang });
  if (!track || !track.baseUrl)
    return { status: "no-subtitle", title: info.title, reason: "字幕轨无可用 baseUrl" };

  // 缓存字幕内容。自动翻译往英文 ASR/手动轨可叠加 tlang。
  const useMode = !!autoTranslate && codec2lang(lan) === "zh" && codec2lang(track.languageCode) !== "zh";
  const subKey = track.baseUrl + (useMode ? "|zh" : "");
  let segments = !force ? subCache.get(subKey) : null;
  if (!segments) {
    try {
      segments = await fetchSubtitleContent(track.baseUrl, useMode ? { tlang: "zh-Hans" } : {});
    } catch (e) {
      // baseUrl 可能过期或被 pot 风控返回空 body → InnerTube 重取新鲜签名再试一次
      const fresh = await refreshTracksInnerTube(videoId).catch(() => null);
      const freshTrack = fresh && pickTrack(fresh, { lang: lan, audioLang: info.audioLang });
      if (!freshTrack || !freshTrack.baseUrl) throw e;
      segments = await fetchSubtitleContent(freshTrack.baseUrl, useMode ? { tlang: "zh-Hans" } : {});
      // 重试成功：用 fresh baseUrl 替换 info.tracks 中对应轨的 baseUrl，避免下次再踩
      const old = info.tracks.find(t => t.languageCode === freshTrack.languageCode && t.kind === freshTrack.kind);
      if (old) old.baseUrl = freshTrack.baseUrl;
    }
    subCache.set(subKey, segments);
  }
  if (!segments.length)
    return { status: "no-subtitle", title: info.title, reason: "字幕轨内容为空" };

  const rules = await getMergedRules();
  const settings = await getSettings();
  const merged = { ...settings, autoTranslate: autoTranslate ?? settings.autoTranslate };
  const resolvedLang = codec2lang(track.languageCode) || undefined;
  merged.lang = resolvedLang;
  const rkey = `${videoId}:${track.languageCode}:${useMode ? "t" : "n"}:${hashRules(rules, merged)}`;
  const cached = !force ? resultCache.get(rkey) : null;
  if (cached) return { ...cached, cached: true };

  const result = analyze(segments, rules, merged);
  const payload = {
    status: "ok",
    title: info.title,
    videoId,
    lan: track.languageCode,
    audioLang: info.audioLang,
    isAsr: track.kind === "asr",
    useMode,
    tracks: info.tracks.slice().slice(0, 12).map(t => ({
      languageCode: t.languageCode,
      name: t.name,
      isAsr: t.kind === "asr"
    })),
    ...result
  };
  resultCache.set(rkey, payload);
  return payload;
}

// content 通过 page-bridge 取到字幕后直接送给 detector；不经过 timedtext，
// 专绕 is_servable:false 轨。lan/audioLang 用于归一语言并选轨（仅做 UI 展示）。
async function handleAnalyzeCaptured({ videoId, segments, chosenLang, audioLang, tracks, force }) {
  if (!segments || !segments.length) return { status: "no-subtitle", title: "(未知)", reason: "字幕为空" };
  const rules = await getMergedRules();
  const settings = await getSettings();
  const merged = { ...settings };
  const resolvedLang = codec2lang(chosenLang) || codec2lang(audioLang) || undefined;
  merged.lang = resolvedLang;
  const hash = hashRules(rules, merged);
  const rkey = `cap:${videoId}:${chosenLang || "-"}:${hash}`;
  const cached = !force ? resultCache.get(rkey) : null;
  if (cached) return { ...cached, cached: true };

  const result = analyze(segments, rules, merged);
  const payload = {
    status: "ok",
    title: "(未知)",
    videoId,
    lan: chosenLang,
    audioLang,
    isAsr: (tracks || []).find(t => t.languageCode === chosenLang)?.isAsr || false,
    useMode: false,
    tracks: (tracks || []).slice(0, 12).map(t => ({
      languageCode: t.languageCode,
      name: t.name,
      isAsr: t.isAsr
    })),
    ...result
  };
  resultCache.set(rkey, payload);
  return payload;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "analyze") {
    handleAnalyze(msg)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ status: "error", message: String(e && e.message ? e.message : e) }));
    return true;
  }
  if (msg && msg.type === "analyzeCaptured") {
    handleAnalyzeCaptured(msg)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ status: "error", message: String(e && e.message ? e.message : e) }));
    return true;
  }
  if (msg && msg.type === "ping") {
    sendResponse({ ok: true, t: Date.now() });
    return false;
  }
  if (msg && msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (msg && msg.type === "getSettings") {
    getSettings().then(s => sendResponse(s));
    return true;
  }
  return false;
});

// 规则/设置变更时清缓存并通知打开的 YouTube 视频页重新检测
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes["noyit:overrides"] || changes["noyit:settings"]) {
    resultCache.clear();
    chrome.tabs.query({ url: ["*://www.youtube.com/watch*", "*://youtube.com/watch*"] }, (tabs) => {
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { type: "refresh" }, () => void chrome.runtime.lastError);
        chrome.tabs.sendMessage(t.id, { type: "settingsChanged" }, () => void chrome.runtime.lastError);
      }
    });
  }
});