// page-world 脚本：在 YouTube 页面主世界运行，可访问 window.ytplayer /
// document.getElementById("movie_player")、video.textTracks、window.fetch。
//
// content script（隔离世界）拿不到 page-world 变量，所以通过本脚本 + postMessage
// 桥接。content 发 {__bridge, direction:"req", id, lan}，本脚本读出字幕发回
// {__bridge, direction:"res", id, ok, segments, ...}。
//
// === 字幕获取架构（2026 起 YouTube 风控升级后的稳定路径） ===
// 直接 fetch timedtext baseUrl 在 pot 风控下返回空 body；mp.setOption 也不再生
// 效（YouTube 已迁离 HTML5 textTracks，改用自定义 div overlay 渲染字幕）。
// 唯一稳定可靠的方法是「网络拦截」：
//   1) 猴补 window.fetch 与 XMLHttpRequest，捕获所有 timedtext 请求的响应
//   2) 调用 mp.toggleSubtitles() 触发 YouTube 自己去拉字幕（请求自带有效 pot）
//   3) 拦截到响应后解析 JSON3（events[]{tStartMs, dDurationMs, segs[].utf8}）
//   4) 拦截失败时退到 textTracks 路径（极少数旧版 player 仍用 HTML5 track）
//
// 注意：本脚本在 page-world，不能用 chrome.* API；只能 postMessage 与 content 通信。

(() => {
  const BRIDGE = "noyitext-yt";

  function stripHtml(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, "")                  // 去内联标签 <font color="...">，<c.xxx>
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 轮询直到 cond() 返回真或超时。返回是否命中。
  function waitFor(cond, timeoutMs, stepMs = 100) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        let ok = false;
        try { ok = !!cond(); } catch { ok = false; }
        if (ok) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(check, stepMs);
      };
      check();
    });
  }

  function waitForCues(track, timeoutMs) {
    return waitFor(() => track.cues && track.cues.length > 0, timeoutMs);
  }

  function getMoviePlayer() {
    return document.getElementById("movie_player") || document.querySelector("#movie_player");
  }

  // ── JSON3 解析（与 background api/youtube.js tryJson3 同构）──────────────
  // YouTube 自身请求常返回 wireMagic:"pb3" 的 JSON3 格式，结构与 fmt=json3 一致。
  function parseJson3Body(text) {
    if (!text) return null;
    const head = text.slice(0, 200).trim();
    if (!head.startsWith("{") && !head.startsWith("[")) return null;
    let j;
    try { j = JSON.parse(text); } catch { return null; }
    const events = Array.isArray(j.events) ? j.events : [];
    const segs = [];
    for (const ev of events) {
      if (!ev) continue;
      const content = (ev.segs || []).map(s => s?.utf8 || "").join("").trim();
      const from = typeof ev.tStartMs === "number" ? ev.tStartMs / 1000 : null;
      const to = (typeof ev.tStartMs === "number" && typeof ev.dDurationMs === "number")
        ? (ev.tStartMs + ev.dDurationMs) / 1000 : null;
      if (content || from != null) segs.push({ content: stripHtml(content), from, to });
    }
    return segs.length ? segs : null;
  }

  // 从 timedtext URL 抽取 languageCode（&lang=）与 kind（&kind=asr）
  function parseTimedtextUrl(url) {
    try {
      const u = new URL(url);
      return {
        languageCode: u.searchParams.get("lang") || "",
        kind: u.searchParams.get("kind") || "",
        vssId: u.searchParams.get("vssId") || ""
      };
    } catch { return { languageCode: "", kind: "", vssId: "" }; }
  }

  // ── 网络拦截器：捕获 timedtext 请求的响应 ─────────────────────────────
  // 返回 { install, capture, restore }。
  //   install()：开始捕获，记下原始 fetch/XHR
  //   capture(lan, timeoutMs)：等符合 lan 的响应；lan 空时取第一条
  //   restore()：还原 fetch/XHR
  function makeInterceptor() {
    const origFetch = window.fetch;
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;
    const captured = [];     // [{ url, status, body, lang, kind }]
    let installed = false;

    function isTimedtext(url) {
      return typeof url === "string" && url.includes("timedtext");
    }

    function record(url, status, body) {
      const info = parseTimedtextUrl(url);
      captured.push({ url, status, body, languageCode: info.languageCode, kind: info.kind });
    }

    function install() {
      if (installed) return;
      installed = true;
      window.fetch = function (...args) {
        const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");
        if (!isTimedtext(url)) return origFetch.apply(this, args);
        const p = origFetch.apply(this, args);
        p.then(r => r.clone().text().then(t => {
          try { record(url, r.status, t); } catch {}
        })).catch(() => {});
        return p;
      };
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__noyitext_url = url;
        return origXhrOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const url = this.__noyitext_url || "";
        if (isTimedtext(url)) {
          this.addEventListener("load", () => {
            try { record(url, this.status, this.responseText || ""); } catch {}
          });
        }
        return origXhrSend.call(this, body);
      };
    }

    async function capture(lan, timeoutMs) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        // 优先匹配 lan；lan 为空则取第一条
        let hit = null;
        if (lan) {
          hit = captured.find(c => c.languageCode === lan || c.languageCode?.startsWith?.(lan.slice(0, 2)));
        }
        if (!hit && captured.length) hit = captured[0];
        if (hit) return hit;
        await new Promise(r => setTimeout(r, 150));
      }
      return null;
    }

    function restore() {
      if (!installed) return;
      installed = false;
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXhrOpen;
      XMLHttpRequest.prototype.send = origXhrSend;
    }

    return { install, capture, restore };
  }

  // ── 触发 YouTube 自身加载字幕 ─────────────────────────────────────────
  // 策略：先确认字幕处于关闭态，再 toggleSubtitles 一次（开启 → 触发 fetch）。
  // 已开启状态下 toggleSubtitles 会变成关闭（不 fetch），所以先关再开。
  async function triggerCaptionFetch(mp, v) {
    // 尝试让 captions 模块就绪（部分 SPA 冷启动时需要）
    try { mp.loadModule?.("captions"); } catch {}

    // 当前是否已开启？getOption track 带 languageCode 视为已开启
    let curTrack = null;
    try { curTrack = mp.getOption?.("captions", "track"); } catch {}
    const wasOn = !!(curTrack && (curTrack.languageCode || curTrack.vssId));

    if (wasOn) {
      // 先关闭，等 400ms 让 player 稳定
      try { mp.toggleSubtitles?.(); } catch {}
      await new Promise(r => setTimeout(r, 400));
    }
    // 现在确保开启
    try { mp.toggleSubtitles?.(); } catch {}

    // toggleSubtitles 没生效时，退化到点击 CC 按钮
    await new Promise(r => setTimeout(r, 800));
    let nowOn = false;
    try {
      const t = mp.getOption?.("captions", "track");
      nowOn = !!(t && (t.languageCode || t.vssId));
    } catch {}
    if (!nowOn) {
      const ccBtn = document.querySelector(".ytp-subtitles-button");
      if (ccBtn) {
        try {
          ccBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          ccBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          ccBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        } catch {}
      }
    }
  }

  // 还原字幕开关状态：若我们开启过且原本是关，则关闭；避免污染用户画面
  function restoreCaptionState(mp, wasOn) {
    try {
      const t = mp.getOption?.("captions", "track");
      const nowOn = !!(t && (t.languageCode || t.vssId));
      if (nowOn && !wasOn) mp.toggleSubtitles?.();
    } catch {}
  }

  // ── 主路径：网络拦截取字幕 ────────────────────────────────────────────
  async function readCaptionsViaIntercept(mp, v, lan) {
    const intercept = makeInterceptor();
    intercept.install();

    let curTrack = null;
    try { curTrack = mp.getOption?.("captions", "track"); } catch {}
    const wasOn = !!(curTrack && (curTrack.languageCode || curTrack.vssId));

    try {
      await triggerCaptionFetch(mp, v);
      const hit = await intercept.capture(lan, 6000);
      if (!hit) throw new Error("未拦截到 timedtext 请求（player 未触发字幕拉取）");

      // 1) 优先解析已捕获的响应体（多数情况是 JSON3 / wireMagic:"pb3"）
      let segs = parseJson3Body(hit.body);

      // 2) 解析失败（响应是二进制 protobuf）→ 用捕获的 URL 加 fmt=json3 重取
      if (!segs && hit.url) {
        try {
          const u = new URL(hit.url);
          u.searchParams.delete("fmt");
          u.searchParams.set("fmt", "json3");
          const r = await fetch(u.toString(), { credentials: "include" });
          if (r.ok) {
            const t = await r.text();
            segs = parseJson3Body(t);
          }
        } catch {}
      }

      if (!segs) throw new Error(`timedtext 响应解析失败（status=${hit.status}, body 前缀=${(hit.body || "").slice(0, 60)}）`);

      // 元信息：用拦截到的 URL 反推语言；tracklist 也拿一下供面板切换
      const info = parseTimedtextUrl(hit.url);
      let tracklist = [];
      try { tracklist = mp.getOption?.("captions", "tracklist") || []; } catch {}
      let audioLang = "";
      try { audioLang = (await mp.getPlayerResponse?.())?.videoDetails?.defaultAudioTrackLanguage || ""; } catch {}

      const tracks = (Array.isArray(tracklist) ? tracklist : []).map(t => ({
        languageCode: t.languageCode || "",
        name: t.displayName || t.name?.simpleText || "",
        isAsr: t.kind === "asr"
      }));
      const chosenLang = info.languageCode || (tracks[0]?.languageCode || "");
      return { segments: segs, audioLang, tracks, chosenLang };
    } finally {
      intercept.restore();
      restoreCaptionState(mp, wasOn);
    }
  }

  // ── 兜底路径：textTracks 直读（旧版 player 仍可能用 HTML5 track）─────────
  async function ensureCaptionsModule(mp, timeoutMs) {
    try { mp.loadModule?.("captions"); } catch {}
    return waitFor(() => {
      const tl = (() => { try { return mp.getOption?.("captions", "tracklist"); } catch { return null; } })();
      return Array.isArray(tl) && tl.length > 0;
    }, timeoutMs);
  }

  async function getTracklist(mp) {
    let list = [];
    try { list = await mp.getOption?.("captions", "tracklist") || []; } catch {}
    if (list && list.length) return list;
    try {
      const pr = await mp.getPlayerResponse?.();
      list = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(t => ({
        languageCode: t.languageCode,
        kind: t.kind || "",
        displayName: t.name?.simpleText || t.name?.runs?.[0]?.text || "",
        vssId: t.vssId || ""
      })) || [];
    } catch {}
    return list || [];
  }

  function chooseTrack(tracklist, lan, audioLang) {
    if (!tracklist.length) return null;
    if (lan) {
      const m = tracklist.find(t => t.languageCode === lan || t.vssId?.includes(lan) || t.displayName?.includes(lan));
      if (m) return m;
    }
    if (audioLang) {
      const m = tracklist.find(t => t.languageCode === audioLang || t.languageCode?.startsWith?.(audioLang.slice(0, 2)));
      if (m) return m;
    }
    return tracklist[0];
  }

  function matchTextTrack(tt, chosen, lan) {
    if (!tt) return null;
    if (lan && (tt.language === lan || tt.id?.includes?.(lan) || (tt.label || "").includes(lan))) return tt;
    if (chosen) {
      if (tt.language === chosen.languageCode) return tt;
      const dn = chosen.displayName || "";
      if (dn && (tt.label || "").includes(dn)) return tt;
      if (chosen.vssId && tt.id?.includes?.(chosen.vssId)) return tt;
    }
    return null;
  }

  async function readCaptionsViaTextTracks(mp, v, lan) {
    await ensureCaptionsModule(mp, 3000);
    const tracklist = await getTracklist(mp);
    if (!tracklist.length) throw new Error("该视频无字幕轨");
    let audioLang = "";
    try { audioLang = (await mp.getPlayerResponse?.())?.videoDetails?.defaultAudioTrackLanguage || ""; } catch {}
    const chosen = chooseTrack(tracklist, lan, audioLang);

    const trackArg = chosen || tracklist[0];
    try {
      mp.setOption?.("captions", "track", {
        languageCode: trackArg.languageCode || "",
        kind: trackArg.kind || "",
        vssId: trackArg.vssId || "",
        name: trackArg.displayName || ""
      });
    } catch {}

    const ttReady = await waitFor(() => v.textTracks && v.textTracks.length > 0, 3000);
    if (!ttReady) throw new Error("textTracks 未出现（player 已迁离 HTML5 字幕渲染）");

    let tt = null;
    for (let i = 0; i < (v.textTracks?.length || 0); i++) {
      tt = matchTextTrack(v.textTracks[i], chosen, lan) || tt;
      if (tt === v.textTracks[i]) break;
    }
    if (!tt) tt = v.textTracks?.[0] || null;

    const origMode = tt.mode;
    tt.mode = "showing";
    await waitForCues(tt, 3500);
    const cues = Array.from(tt.cues || []);
    if (origMode !== "showing") {
      try { tt.mode = "disabled"; } catch {}
      if (origMode === "hidden") { try { tt.mode = "hidden"; } catch {} }
    }
    if (!cues.length) throw new Error("textTracks 激活后仍无 cues");

    const segments = [];
    for (const c of cues) {
      const content = stripHtml(c.text || "");
      const from = typeof c.startTime === "number" ? c.startTime : null;
      const to = typeof c.endTime === "number" ? c.endTime : null;
      if (content || from != null) segments.push({ content, from, to });
    }
    if (!segments.length) throw new Error("字幕 cues 解析后为空");

    const tracks = tracklist.map(t => ({
      languageCode: t.languageCode || "",
      name: t.displayName || "",
      isAsr: t.kind === "asr"
    }));
    return { segments, audioLang, tracks, chosenLang: chosen?.languageCode || tracklist[0].languageCode || "" };
  }

  // ── 入口：先拦截，失败再 textTracks ──────────────────────────────────
  async function readCaptions({ lan }) {
    const v = document.querySelector("video");
    if (!v) throw new Error("无 video 元素");
    const mp = getMoviePlayer();
    if (!mp) throw new Error("无 movie_player（页面未就绪）");

    // 主路径：网络拦截（2026 风控下唯一稳定路径）
    try {
      return await readCaptionsViaIntercept(mp, v, lan || "");
    } catch (e1) {
      // 兜底：textTracks（极少数旧版 player 仍用 HTML5 track 才有效）
      try {
        const r = await readCaptionsViaTextTracks(mp, v, lan || "");
        return r;
      } catch (e2) {
        throw new Error(`拦截路径：${e1?.message || e1} | textTracks 兜底：${e2?.message || e2}`);
      }
    }
  }

  // 监听来自 content 的请求
  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__bridge !== BRIDGE || d.direction !== "req") return;
    try {
      const r = await readCaptions({ lan: d.lan || "" });
      window.postMessage({ __bridge: BRIDGE, direction: "res", id: d.id, ok: true, ...r }, "*");
    } catch (e) {
      window.postMessage({ __bridge: BRIDGE, direction: "res", id: d.id, ok: false, error: String(e?.message || e) }, "*");
    }
  });

  // 给 content 一份 ready 信号，便于等注入完成
  window.postMessage({ __bridge: BRIDGE, direction: "ready" }, "*");
})();
