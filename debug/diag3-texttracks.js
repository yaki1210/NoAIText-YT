// YouTube 视频页 F12 → Console 粘贴运行。共三轮：探测→激活CC→再读cues。
(async () => {
  const log = (...a) => console.log("[diag3]", ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const v = document.querySelector("video");
  if (!v) { log("无 video 元素"); return; }

  // 1) 先看 ytplayer API
  log("1) ytplayer.config_ keys:", window.ytplayer?.config_ ? Object.keys(window.ytplayer.config_) : "none");
  const mp = document.getElementById("movie_player") || document.querySelector("#movie_player");
  log("   movie_player present?", !!mp);
  if (mp) {
    try {
      const pr = await mp.getPlayerResponse?.();
      log("   getPlayerResponse captions.tracks:", pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(t=>({lang:t.languageCode,kind:t.kind,name:t.name?.simpleText})) || "无");
    } catch (e) { log("   getPlayerResponse err:", e?.message || e); }
    try {
      const opt = await mp.getOption?.("captions", "tracklist");
      log("   getOption(captions,tracklist):", JSON.stringify(opt)?.slice(0,300));
    } catch (e) { log("   getOption err:", e?.message || e); }
  }

  // 2) 主动尝试把所有 textTracks 激活到 showing 触发 YouTube 加载 cues
  log("2) 尝试激活 textTracks…");
  for (let i = 0; i < (v.textTracks?.length || 0); i++) {
    const t = v.textTracks[i];
    log(`   before track[${i}]: kind=${t.kind} label="${t.label}" mode=${t.mode} cues=${t.cues?.length||0}`);
    try { t.mode = "showing"; } catch (e) { log("   set mode err:", e?.message); }
  }
  await sleep(1500);
  for (let i = 0; i < (v.textTracks?.length || 0); i++) {
    const t = v.textTracks[i];
    log(`   after  track[${i}]: mode=${t.mode} cues=${t.cues?.length||0}`);
    const c0 = t.cues?.[0];
    if (c0) log(`     cue[0]: startTime=${c0.startTime} text="${String(c0.text||'').slice(0,80)}"`);
  }

  // 3) 点 YouTube 播放器自带的 CC 按钮强制加载字幕
  log("3) 若仍无 cues，请手动在播放器点 CC 按钮开启字幕，再回到 console 运行：");
  log("   for(const t of document.querySelector('video').textTracks){console.log(t.kind,t.label,t.mode,t.cues?.length);for(let i=0;i<Math.min(3,t.cues?.length||0);i++)console.log('  ',t.cues[i].startTime,t.cues[i].text)}");

  // 4) 给个最简判定：直接 fetch timedtext 时强制加 fmt=json3 + 的 Origin 头模拟同源
  log("4) 试加 Origin header 与不加 credentials 对比 (Content-Type=text/html 的怪状)");
  const html = await fetch(location.href, {credentials:"include"}).then(r=>r.text());
  const idx = html.indexOf("ytInitialPlayerResponse");
  const s = html.indexOf("{", idx);
  let d=0,e=-1,inS=false,esc=false,q="";
  for(let j=s;j<html.length;j++){const c=html[j];if(inS){if(esc)esc=false;else if(c==="\\")esc=true;else if(c===q)inS=false;}else if(c==='"'||c==="'"){inS=true;q=c;}else if(c==="{")d++;else if(c==="}"){d--;if(d===0){e=j;break;}}}
  const p = JSON.parse(html.slice(s,e+1));
  const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length) {
    const u = new URL(tracks[0].baseUrl);
    u.searchParams.delete("fmt"); u.searchParams.set("fmt","json3");
    // 4-a 普通 fetch
    const r1 = await fetch(u.toString(), {credentials:"include"});
    const t1 = await r1.text();
    log(`   4a 普通: ${r1.status} ct=${r1.headers.get("content-type")} len=${t1.length} prefix=${t1.slice(0,60).replace(/\s+/g," ")}`);
    // 4-b 加 'X-YouTube-Client-Data' 不放，但加 Origin 与 Referer 头（fetch 通常禁止，但试一下）
    try {
      const r2 = await fetch(u.toString(), {credentials:"include", headers:{"X-YouTube-Client-Data":"CIi8"}});
      const t2 = await r2.text();
      log(`   4b 加XYT头: ${r2.status} ct=${r2.headers.get("content-type")} len=${t2.length} prefix=${t2.slice(0,60).replace(/\s+/g," ")}`);
    } catch(e){ log("   4b err:", e?.message); }
  }
})().catch(e=>console.log("diag3 ERR", e));