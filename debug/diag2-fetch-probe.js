// 在 YouTube 视频页 F12 console 粘贴运行第二轮诊断
(async () => {
  const log = (...a) => console.log("[diag2]", ...a);
  const html = await fetch(location.href, {credentials:"include"}).then(r=>r.text());
  const idx = html.indexOf("ytInitialPlayerResponse");
  const s = html.indexOf("{", idx);
  let d=0,e=-1,inS=false,esc=false,q="";
  for(let j=s;j<html.length;j++){const c=html[j];if(inS){if(esc)esc=false;else if(c==="\\")esc=true;else if(c===q)inS=false;}else if(c==='"'||c==="'"){inS=true;q=c;}else if(c==="{")d++;else if(c==="}"){d--;if(d===0){e=j;break;}}}
  const p = JSON.parse(html.slice(s,e+1));
  const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if(!tracks.length){log("无轨");return;}
  const base = tracks[0].baseUrl;
  log("base=", base);

  // A) 完全不通改 URL，仅 fetch 原样 baseUrl（不触碰签名）
  const rA = await fetch(base, {credentials:"include"});
  const tA = await rA.text();
  log("A 原样 fetch:", rA.status, "len=", tA.length, "prefix=", tA.slice(0,120).replace(/\s+/g," "));

  // B) 同上但 credentials: 'omit'
  const rB = await fetch(base, {credentials:"omit"});
  const tB = await rB.text();
  log("B credentials=omit:", rB.status, "len=", tB.length, "prefix=", tB.slice(0,120).replace(/\s+/g," "));

  // C) 网页 fetch + .then 看 response headers 里有没有 location 或 content-type
  const rC = await fetch(base, {credentials:"include", redirect:"manual"});
  log("C manual redirect:", rC.status, "type=", rC.type, "ct=", rC.headers.get("content-type"), "loc=", rC.headers.get("location"));

  // D) 看页面里有没有更便宜的入口：ytplayer 配置 / player 现成的 cue
  log("D window.ytplayer.config_ presenter? ", !!window.ytplayer);
  log("D ytInitialData presenter? ", !!window.ytInitialData);
  // E) 直接读 video.textTracks（HTML5 内置，已激活字幕时）
  const v = document.querySelector("video");
  log("E video present? ", !!v, "textTracks count=", v?.textTracks?.length || 0);
  for (let i = 0; i < (v?.textTracks?.length || 0); i++) {
    const t = v.textTracks[i];
    log(`   track[${i}]: kind=${t.kind} label="${t.label}" mode=${t.mode} cues=${t.cues?.length||0}`);
  }
})().catch(e=>console.log("diag2 ERR", e));
