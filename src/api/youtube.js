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
// 防御点：YouTube 在某些场景返回空 body / consent 重定向 HTML / 默认 srv3 XML，
// 直接 res.json() 会抛 "Unexpected end of JSON input"。故先 text() 判别，
// 失败时回退 fmt=vtt（WebVTT，普遍可解析）。
export async function fetchSubtitleContent(baseUrl, opts = {}) {
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error("字幕轨缺少可用 baseUrl");
  }
  const sep = baseUrl.includes("?") ? "&" : "?";
  const tlangPart = opts.tlang ? `&tlang=${encodeURIComponent(opts.tlang)}` : "";

  // 1) 优先 json3
  let segs = await tryJson3(`${baseUrl}${sep}fmt=json3${tlangPart}`);
  if (segs) return segs;

  // 2) 回退 vtt（WebVTT，多数视频可用）
  segs = await tryVtt(`${baseUrl}${sep}fmt=vtt${tlangPart}`);
  if (segs) return segs;

  // 3) 都失败，给出真实 HTTP 与首字符诊断，便于定位
  const diag = await diagnosticFetch(`${baseUrl}${sep}fmt=json3${tlangPart}`);
  throw new Error(`字幕下载失败：HTTP ${diag.status}，内容前缀=${diag.prefix}`);
}

async function tryJson3(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;                                   // 空 body
  // consent 重定向或 HTML 错误页 → 不是 JSON
  const head = text.slice(0, 200).trim();
  if (!head.startsWith("{") && !head.startsWith("[")) return null;
  let j;
  try { j = JSON.parse(text); }
  catch { return null; }
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

// WebVTT 解析：跳过 WEBVTT 头/NOTE，识别 cuetime --> cuetime 行后聚合文本块。
async function tryVtt(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const text = await res.text();
  return parseVttText(text);
}

// 纯函数：解析 WebVTT 文本为 segments[]。空/非 VTT 返回 null（便于单测）。
export function parseVttText(text) {
  if (!text) return null;
  const head = text.slice(0, 200).trim();
  if (!/^WEBVTT/i.test(head) && !head.includes("-->")) return null;

  const segs = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  // 跳过头部（直到第一个空行）
  while (i < lines.length && lines[i].trim() !== "") i++;
  i++;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/);
    if (m) {
      const from = parseVttTime(m[1]);
      const to = parseVttTime(m[2]);
      i++;
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "") {
        // 去掉 VTT 内联标签如 <c.colorE5E5E5>
        buf.push(lines[i].replace(/<[^>]+>/g, ""));
        i++;
      }
      const content = buf.join(" ").trim();
      if (content || from != null) segs.push({ content, from, to });
    } else {
      i++;
    }
  }
  return segs.length ? segs : null;
}

function parseVttTime(s) {
  // 形如 00:01:02.345 / 01:02.345 / 1:02.345 → 秒
  const parts = s.split(/[;.,]/);
  const main = parts[0].split(":");
  let sec = 0;
  if (main.length === 3) sec = (+main[0]) * 3600 + (+main[1]) * 60 + (+main[2]);
  else if (main.length === 2) sec = (+main[0]) * 60 + (+main[1]);
  if (parts[1]) sec += Number("0." + parts[1].padEnd(3, "0").slice(0, 3));
  return isFinite(sec) ? sec : null;
}

async function diagnosticFetch(url) {
  try {
    const res = await fetch(url, { credentials: "include" });
    const text = await res.text();
    const prefix = (text.slice(0, 60) || "<empty>").replace(/\s+/g, " ");
    return { status: res.status, prefix };
  } catch (e) {
    return { status: 0, prefix: String(e?.message || e).slice(0, 60) };
  }
}

export { extractPlayerResponse as _extractPlayerResponse, parseVttTime as _parseVttTime };