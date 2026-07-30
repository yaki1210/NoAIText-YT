// 在 YouTube 视频页(https://www.youtube.com/watch?v=...) 按 F12 打开 console 粘贴运行。
// 把完整输出发我即可定位根因。
(async () => {
  const log = (...a) => console.log("[NoAIText-YT-diag]", ...a);
  try {
    const html = await fetch(location.href, { credentials: "include" }).then(r => r.text());
    const key = "ytInitialPlayerResponse";
    const idx = html.indexOf(key);
    if (idx < 0) { log("未找到 ytInitialPlayerResponse"); return; }
    const s = html.indexOf("{", idx);
    let d = 0, e = -1, inS = false, esc = false, q = "";
    for (let j = s; j < html.length; j++) {
      const c = html[j];
      if (inS) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === q) inS = false; }
      else if (c === '"' || c === "'") { inS = true; q = c; }
      else if (c === "{") d++;
      else if (c === "}") { d--; if (d === 0) { e = j; break; } }
    }
    const p = JSON.parse(html.slice(s, e + 1));
    const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    log("tracks count:", tracks.length);
    log("logged_in:", p?.responseContext?.serviceTrackingParams?.find(x => x.key === "logged_in")?.value || "?");
    if (!tracks.length) { log("无字幕轨"); return; }
    tracks.forEach((t, i) => {
      log(`  [${i}] lang=${t.languageCode} kind=${t.kind || "-"} name=${t.name?.simpleText || t.name?.runs?.[0]?.text || "-"}`);
      log(`      baseUrl: ${t.baseUrl}`);
    });
    const u = new URL(tracks[0].baseUrl);
    log("baseUrl params:", [...u.searchParams.keys()].join(","));
    log("has pot:", u.searchParams.has("pot"), "| has signature:", u.searchParams.has("signature"), "| has exp:", u.searchParams.has("exp"));
    // 试三种 fmt（删除原 fmt 再 set）
    for (const fmt of ["json3", "vtt", "srv3", ""]) {
      const u2 = new URL(tracks[0].baseUrl);
      u2.searchParams.delete("fmt");
      if (fmt) u2.searchParams.set("fmt", fmt);
      const r = await fetch(u2.toString(), { credentials: "include" });
      const txt = await r.text();
      log(`fmt=${fmt || "(原样)"}: HTTP ${r.status}, len=${txt.length}, prefix=${txt.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  } catch (e) { log("ERROR:", e?.message || e); }
})();