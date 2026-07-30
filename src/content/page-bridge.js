// page-world 脚本：在 YouTube 页面主世界运行，可访问 window.ytplayer /
// document.getElementById("movie_player") 与 video.textTracks。
//
// content script（隔离世界）拿不到 page-world 变量，所以通过本脚本 + postMessage
// 桥接。content 发 {type:"noyitext-getcaptions", id, lan}，本脚本读出字幕发回
// {type:"noyitext-captions-result", id, ok, segments, ...}。
//
// 选用 textTracks 直读路径的原因：YouTube 部分字幕轨 is_servable=false，
// timedtext baseUrl 返回 HTTP 200 空 body；这类字幕只通过 player 内部激活
// 才能加载到 video.textTracks 的 cues。点播放器 CC 能显示字幕即此原理。
//
// 注意：本脚本在 page-world，不能用 chrome.* API；只能 postMessage 与 content 通信。

(() => {
  const BRIDGE = "noyitext-yt";
  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  function waitForCues(track, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const check = () => {
        if (track.cues && track.cues.length > 0) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
  }

  function getMoviePlayer() {
    return document.getElementById("movie_player") || document.querySelector("#movie_player");
  }

  async function getTracklist(mp) {
    // 优先 getOption，备 getPlayerResponse，再备 ytInitialPlayerResponse
    let list = [];
    try { list = await mp.getOption?.("captions", "tracklist") || []; } catch {}
    if (list && list.length) return list;
    try {
      const pr = await mp.getPlayerResponse?.();
      list = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(t => ({
        languageCode: t.languageCode,
        kind: t.kind || "",
        displayName: t.name?.simpleText || t.name?.runs?.[0]?.text || "",
        vssId: t.vssId || "",
        is_servable: true
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

  async function readCaptions({ lan }) {
    const v = document.querySelector("video");
    if (!v) throw new Error("无 video 元素");
    const mp = getMoviePlayer();
    if (!mp) throw new Error("无 movie_player（页面未就绪）");

    // 1) 确保 captions 模块已加载
    try { mp.loadModule?.("captions"); } catch {}
    await sleep(300);

    // 2) 拿字幕轨列表
    const tracklist = await getTracklist(mp);
    if (!tracklist.length) throw new Error("该视频无字幕轨");
    let audioLang = "";
    try { audioLang = (await mp.getPlayerResponse?.())?.videoDetails?.defaultAudioTrackLanguage || ""; } catch {}

    // 3) 选轨
    const chosen = chooseTrack(tracklist, lan, audioLang);

    // 4) 用 player API 主动激活该轨（让 YouTube 内部加载 cues 到 video.textTracks）
    try {
      mp.setOption?.("captions", "track", chosen || tracklist[0]);
    } catch (e) {
      // ignore：老版 player 可能不支持 setOption，下面会通过 textTracks.mode 兜底
    }
    await sleep(800);

    // 5) 在 video.textTracks 找对应轨
    let tt = null;
    for (let i = 0; i < (v.textTracks?.length || 0); i++) {
      tt = matchTextTrack(v.textTracks[i], chosen, lan) || tt;
      if (tt && tt !== v.textTracks[i]) {} // 已匹配
      if (tt === v.textTracks[i]) break;
    }
    // 6) 找不到精确匹配则取第一条 textTrack；仍无则报错
    if (!tt) tt = v.textTracks?.[0] || null;
    if (!tt) throw new Error("激活字幕后 video 仍无 textTracks（player 可能未加载字幕模块）");

    // 7) 触发 cues 加载：mode 临时设为 showing；保存原 mode 以还原
    const origMode = tt.mode;
    tt.mode = "showing";
    const ok = await waitForCues(tt, 2500);
    const cues = Array.from(tt.cues || []);
    // 还原：原 mode 是 disabled / hidden 时切回，避免污染用户画面
    if (origMode !== "showing") {
      try { tt.mode = "disabled"; } catch {}
      if (origMode === "hidden") { try { tt.mode = "hidden"; } catch {} }
    }

    if (!cues.length) throw new Error("字轨激活后仍无 cues（可能 ASR 未生成或视频无字幕内容）");

    // 8) 标准化为 segments
    const segments = [];
    for (const c of cues) {
      const content = stripHtml(c.text || "");
      const from = typeof c.startTime === "number" ? c.startTime : null;
      const to = typeof c.endTime === "number" ? c.endTime : null;
      if (content || from != null) segments.push({ content, from, to });
    }
    if (!segments.length) throw new Error("字幕 cues 解析后为空");

    // 9) 元信息：让 background 按 languageCode 归一语言
    const tracks = tracklist.map(t => ({
      languageCode: t.languageCode || "",
      name: t.displayName || "",
      isAsr: t.kind === "asr"
    }));
    return { segments, audioLang, tracks, chosenLang: chosen?.languageCode || tracklist[0].languageCode || "" };
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