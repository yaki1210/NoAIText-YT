// YouTube 字幕链路：取 watch 页 HTML → 抠内嵌 ytInitialPlayerResponse →
// captionTracks[].baseUrl → &fmt=json3 → events[] 标准化为 {content,from,to}。
//
// 不走 Data API v3（需 OAuth + ToS 严格），仅借浏览器登录会话读用户可见内容，
// 与 B站版原则一致。SPA 切换无需重新抓 HTML：只需 background 缓存按 videoId 分桶。
//
// 稳健性注意：
//   - 抠 JSON 采用"括号平衡 + 字符串跳过"，避免正则非贪婪误截嵌套大括号
//   - baseUrl 必须校验非空再 fetch，避免 background SW 中 fetch("") 误取自身
//   - 翻译轨道 (auto-translation) 通过 baseUrl&fmt=json3&tlang=zh 取，准确性差，
//     由调用方按 settings.autoTranslate 决定是否取

const WATCH_URL = "https://www.youtube.com/watch?v=";

// ── HTML 抓取 ──────────────────────────────────────────
async function fetchWatchHTML(videoId) {
  const res = await fetch(`${WATCH_URL}${encodeURIComponent(videoId)}`, {
    credentials: "include",
    headers: { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" }
  });
  if (!res.ok) throw new Error(`抓取 watch 页失败 HTTP ${res.status}`);
  return res.text();
}

// 从 HTML 抠出 ytInitialPlayerResponse。括号平衡 + 字符串跳过，避免正则误截。
function extractPlayerResponse(html) {
  const key = "ytInitialPlayerResponse";
  const idx = html.indexOf(key);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0, end = -1, inStr = false, esc = false, quote = "";
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") { inStr = true; quote = c; }
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(start, end + 1)); }
  catch { return null; }
}

// ── 元信息与字幕轨 ──────────────────────────────────────
export async function fetchVideoInfo(videoId) {
  const html = await fetchWatchHTML(videoId);
  const player = extractPlayerResponse(html);
  if (!player) throw new Error("未在 watch 页找到 ytInitialPlayerResponse（可能是 consent 重定向或风控）");
  const tracks = extractTracks(player);
  return {
    videoId,
    title: player?.videoDetails?.title || "(未知)",
    audioLang: player?.videoDetails?.defaultAudioTrackLanguage || "",
    durationMs: player?.videoDetails?.lengthSeconds ? Number(player.videoDetails.lengthSeconds) * 1000 : null,
    tracks,
    isLive: player?.videoDetails?.isLive || player?.videoDetails?.isLiveContent || false
  };
}

function extractTracks(player) {
  const list = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(list)) return [];
  return list.map(t => ({
    baseUrl: t.baseUrl || "",
    languageCode: t.languageCode || "",
    name: t?.name?.simpleText || (t?.name?.runs?.[0]?.text) || "",
    kind: t.kind || "",                  // 'asr' 表自动生成（ASR）
    vssId: t.vssId || "",
    isTranslatable: !!t.isTranslatable
  })).filter(t => t.baseUrl);            // 过滤缺 URL 的占位
}

// 选轨：按"音频原始语言优先"原则。
// 优先级:
//   1) lang 指定 → 该语言手动轨（kind !== 'asr'）
//   2) 该语言 ASR 轨
//   3) 该语言任一轨
//   4) 任意手动轨
//   5) 第一条
// 返回 null 表示无字幕轨。
export function pickTrack(tracks, opts = {}) {
  if (!tracks.length) return null;
  const lang = opts.lang || "";
  const audioLang = opts.audioLang || "";

  const find = (wantLang, manualOnly, asrOnly) => {
    const pool = tracks.filter(t => !wantLang || t.languageCode === wantLang);
    if (manualOnly) return pool.find(t => t.kind !== "asr");
    if (asrOnly) return pool.find(t => t.kind === "asr");
    return pool[0];
  };

  if (lang) {
    const m = find(lang, true, false);
    if (m) return m;
    const a = find(lang, false, true);
    if (a) return a;
  }
  const prefer = audioLang || tracks[0].languageCode;
  if (prefer) {
    const m = find(prefer, true, false);
    if (m) return m;
    const a = find(prefer, false, true);
    if (a) return a;
  }
  const anyManual = tracks.find(t => t.kind !== "asr");
  if (anyManual) return anyManual;
  return tracks[0];
}

// ── 字幕内容 ────────────────────────────────────────────
// baseUrl 追加 fmt=json3 → events[]{tStartMs, dDurationMs, segs[]}
export async function fetchSubtitleContent(baseUrl, opts = {}) {
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error("字幕轨缺少可用 baseUrl");
  }
  let u = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
  if (opts.tlang) u += `&tlang=${encodeURIComponent(opts.tlang)}`;
  const res = await fetch(u, { credentials: "include" });
  if (!res.ok) throw new Error(`字幕下载失败 HTTP ${res.status}`);
  const j = await res.json();
  const events = Array.isArray(j.events) ? j.events : [];
  const segs = [];
  for (const ev of events) {
    if (!ev) continue;
    const content = (ev.segs || []).map(s => s?.utf8 || "").join("").trim();
    const from = typeof ev.tStartMs === "number" ? ev.tStartMs / 1000 : null;
    const to = (typeof ev.tStartMs === "number" && typeof ev.dDurationMs === "number")
      ? (ev.tStartMs + ev.dDurationMs) / 1000 : null;
    if (content || from != null) segs.push({ content, from, to });
  }
  return segs;
}

export { extractPlayerResponse as _extractPlayerResponse };