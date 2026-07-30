// 纯函数评分引擎。不依赖浏览器 API，可被 background 与 node 测试同时引用。
// 用法：import { analyze } from './detector.js';
//       const result = analyze(segments, rules, settings);  // settings.lang 可选，缺省按 CJK 占比回退

const roamSplitZh = /[。！？!?\n]+/;
const roamSplitEn = /[.!?!\n]+/;

// ── 文本与片段辅助 ──────────────────────────────────────
function chars(s) {
  return Array.from(s).filter(c => !/\s/.test(c)).length;
}
function words(text) {
  return (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

// 把字幕片段拼接为全文，并记录每个字符区间所属片段（含时间）
function buildIndex(segments) {
  const segs = (segments || []).map(s => ({ content: s.content || "", from: typeof s.from === "number" ? s.from : null, to: s.to ?? null }));
  let pos = 0;
  const text = [];
  const offs = [];
  for (const s of segs) {
    const arr = Array.from(s.content);
    offs.push({ start: pos, end: pos + arr.length, from: s.from, to: s.to });
    text.push(s.content);
    pos += arr.length + 1; // +1 为 join 的换行符
  }
  return { text: text.join("\n"), offs };
}

function detectLang(segments) {
  const { text } = buildIndex(segments);
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk >= latin ? "zh" : "en";
}

function findSeg(offs, index) {
  if (!offs.length) return null;
  let lo = 0, hi = offs.length - 1, ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index < offs[mid].start) hi = mid - 1;
    else { ans = mid; lo = mid + 1; }
  }
  return ans != null ? offs[ans] : null;
}

// ── 单规则命中 ──────────────────────────────────────────
function matchRegex(patternStr, text, flags) {
  let re;
  try { re = new RegExp(patternStr, flags); } catch { return { hits: 0, indices: [] }; }
  const indices = [];
  let m, guard = 0;
  while ((m = re.exec(text)) !== null) {
    indices.push({ index: m.index, match: m[0] });
    if (re.lastIndex === m.index) re.lastIndex++;
    if (++guard > 50000) break;
  }
  return { hits: indices.length, indices };
}

function matchSubstring(text, sub) {
  if (!sub) return { hits: 0, indices: [] };
  const hay = text.toLowerCase(), needle = sub.toLowerCase();
  const indices = [];
  let idx = 0, guard = 0;
  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    indices.push({ index: idx, match: text.substr(idx, needle.length) });
    idx += needle.length;
    if (++guard > 50000) break;
  }
  return { hits: indices.length, indices };
}

function matchAll(text, subs) {
  const counts = (subs || []).map(s => matchSubstring(text, s).hits);
  const sets = counts.length && counts.every(Boolean) ? Math.min(...counts) : 0;
  // 取首个子串第一个出现位置作为示例定位
  let firstIndex = -1, firstMatch = "";
  for (const s of subs || []) {
    const r = matchSubstring(text, s);
    if (r.indices.length) { firstIndex = r.indices[0].index; firstMatch = s; break; }
  }
  return { hits: sets, indices: firstIndex >= 0 ? [{ index: firstIndex, match: firstMatch }] : [] };
}

// ── 结构特征函数：返回 { hits, detail } ─────────────────
const structureFns = {
  // ─── 中文 ─────────────────────────────────────────
  dash_density(text) {
    const runs = (text.match(/[—\u2014]{1,}|--+/g) || []).length;
    const c = chars(text);
    const perK = c ? (runs / c) * 1000 : 0;
    const hits = perK < 1.5 ? 0 : perK < 3 ? 1 : perK < 5 ? 2 : Math.min(4, Math.round(perK / 1.5));
    return { hits, detail: `≈${perK.toFixed(1)}次/千字` };
  },
  parallel3(text) {
    let count = 0;
    for (const sent of text.split(roamSplitZh)) {
      if (!sent) continue;
      const chunks = sent.split(/[，、；;]+/).map(x => Array.from(x).filter(c => !/\s/.test(c))).filter(a => a.length >= 3);
      for (let i = 0; i + 2 < chunks.length; i++) {
        const tri = [chunks[i].length, chunks[i + 1].length, chunks[i + 2].length];
        const mean = (tri[0] + tri[1] + tri[2]) / 3;
        const cv = mean ? Math.sqrt(((tri[0] - mean) ** 2 + (tri[1] - mean) ** 2 + (tri[2] - mean) ** 2) / 3) / mean : 1;
        if (cv < 0.25) count++;
      }
    }
    return { hits: Math.min(count, 4), detail: count ? `${count}处` : null };
  },
  sentence_uniform(text) {
    const sents = text.split(roamSplitZh).map(s => Array.from(s).filter(c => !/\s/.test(c)).length).filter(n => n > 0);
    if (sents.length < 10) return { hits: 0, detail: null };
    const mean = sents.reduce((a, b) => a + b, 0) / sents.length;
    const stdev = Math.sqrt(sents.reduce((a, b) => a + (b - mean) ** 2, 0) / sents.length);
    const cv = mean ? stdev / mean : 1;
    const hits = cv < 0.25 ? 3 : cv < 0.35 ? 2 : cv < 0.45 ? 1 : 0;
    return { hits, detail: hits ? `句长CV=${cv.toFixed(2)}` : null };
  },
  er_transition(text) {
    const runs = (text.match(/[，。]\s*而/g) || []).length;
    return { hits: Math.min(runs, 4), detail: runs ? `${runs}次` : null };
  },
  yuqici(text) {
    const runs = (text.match(/啊|呢|吧|嘛|哦|哈|呗|喲|呀/g) || []).length;
    const c = chars(text);
    const perK = c ? (runs / c) * 1000 : 0;
    const hits = perK < 2 ? 0 : perK < 5 ? 1 : perK < 8 ? 2 : perK < 12 ? 3 : Math.min(5, Math.round(perK / 3));
    return { hits, detail: hits ? `≈${perK.toFixed(1)}/千字` : null };
  },
  koutouchan(text) {
    const runs = (text.match(/那个那个|这个这个|怎么说呢|我跟你说|你猜怎么着|说白了|就是就是|反正吧|嚯|哎|诶/g) || []).length;
    return { hits: Math.min(runs, 5), detail: runs ? `${runs}次` : null };
  },
  self_correct(text) {
    const runs = (text.match(/不对不对|说错了|我说错了|不是说得|口误|改口|应该是|应该是说|准确地说/g) || []).length;
    return { hits: Math.min(runs, 3), detail: runs ? `${runs}次` : null };
  },

  // ─── 英文 ─────────────────────────────────────────
  // 按 lang=en 调度时 detector 会优先选 ${pattern}_en，未提供则回退到上面的中文实现。
  dash_density_en(text) {
    const runs = (text.match(/[—–]|--+/g) || []).length;
    const w = words(text);
    const perK = w ? (runs / w) * 1000 : 0;
    const hits = perK < 1 ? 0 : perK < 3 ? 1 : perK < 6 ? 2 : 3;
    return { hits, detail: `≈${perK.toFixed(1)}/千词` };
  },
  parallel3_en(text) {
    let count = 0;
    for (const sent of text.split(roamSplitEn)) {
      if (!sent) continue;
      // ASR 英文常无标点：按 , ; 切；再按 and/or 切
      const chunks = sent
        .split(/[,;]+|\s+(?:and|or)\s+/i)
        .map(x => x.trim())
        .filter(x => x && words(x) >= 2);
      for (let i = 0; i + 2 < chunks.length; i++) {
        const tri = [words(chunks[i]), words(chunks[i + 1]), words(chunks[i + 2])];
        const mean = (tri[0] + tri[1] + tri[2]) / 3;
        if (mean < 2) continue;
        const cv = mean ? Math.sqrt(((tri[0] - mean) ** 2 + (tri[1] - mean) ** 2 + (tri[2] - mean) ** 2) / 3) / mean : 1;
        if (cv < 0.30) count++;
      }
    }
    return { hits: Math.min(count, 4), detail: count ? `${count}处` : null };
  },
  sentence_uniform_en(text) {
    const sents = text.split(roamSplitEn).map(s => words(s)).filter(n => n > 0);
    if (sents.length < 10) return { hits: 0, detail: null };
    const mean = sents.reduce((a, b) => a + b, 0) / sents.length;
    const stdev = Math.sqrt(sents.reduce((a, b) => a + (b - mean) ** 2, 0) / sents.length);
    const cv = mean ? stdev / mean : 1;
    // 英文 ASR 句长波动天然更大，阈值放宽
    const hits = cv < 0.30 ? 3 : cv < 0.40 ? 2 : cv < 0.50 ? 1 : 0;
    return { hits, detail: hits ? `句长CV=${cv.toFixed(2)}` : null };
  },
  but_transition_en(text) {
    // 与中文「，而」对齐：英文 AI 偏爱 however/nevertheless/nonetheless/on the other hand
    const runs = (text.toLowerCase().match(/\b(?:however|nevertheless|nonetheless|on the other hand)\b/g) || []).length;
    const w = words(text);
    const perK = w ? (runs / w) * 1000 : 0;
    const hits = perK < 2 ? 0 : perK < 4 ? 1 : perK < 6 ? 2 : Math.min(4, Math.round(perK / 2));
    return { hits, detail: hits ? `≈${perK.toFixed(1)}/千词` : null };
  }
};

// ── 取示例（最多 N 个，带时间）────────────────────────
function buildExamples(limit, indices, offs, text) {
  const exs = [];
  const seen = new Set();
  for (const it of indices) {
    if (exs.length >= limit) break;
    const seg = findSeg(offs, it.index);
    if (seg && seen.has(seg.start)) continue;
    if (seg) seen.add(seg.start);
    let snippet = it.match || text.substr(it.index, 12);
    if (Array.from(snippet).length > 40) snippet = Array.from(snippet).slice(0, 40).join("") + "…";
    exs.push({
      text: snippet,
      time: seg ? sec2fmt(seg.from) : "",
      timeSec: seg ? seg.from : null
    });
  }
  return exs;
}

function sec2fmt(sec) {
  if (sec == null || !isFinite(sec)) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s < 10 ? "0" + s : s}`;
}

// ── 主函数 ──────────────────────────────────────────────
export function analyze(segments, rules = [], settings = {}) {
  const { text, offs } = buildIndex(segments);
  const lang = settings.lang || detectLang(segments);
  const k = settings.sensitivity ?? 8;
  const shortLimit = lang === "en"
    ? (settings.shortTextLimitEn ?? 150)
    : (settings.shortTextLimit ?? 200);
  // 按语言的主量纲：zh=字符数，en=词数
  const total = lang === "en" ? words(text) : chars(text);

  if (total === 0) {
    return { status: "empty", score: 0, level: levelInfo(0, settings), charCount: 0, lang, short: true, density: 0, rules: [] };
  }

  const matchedRules = [];
  let S = 0;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    // 语言过滤：rule.lang 缺省或 'both' 不过滤；否则必须匹配
    if (rule.lang && rule.lang !== "both" && rule.lang !== lang) continue;

    let mr;
    if (rule.kind === "regex") {
      const flags = (rule.lang === "en") ? "gi" : "g";
      mr = matchRegex(rule.pattern, text, flags);
    } else if (rule.kind === "keyword") mr = matchSubstring(text, rule.pattern);
    else if (rule.kind === "all") mr = matchAll(text, rule.pattern);
    else if (rule.kind === "structure") {
      // 英文优先 _en 实现，无则回退到默认（中文）实现
      const fnKey = (lang === "en" && structureFns[rule.pattern + "_en"]) ? rule.pattern + "_en" : rule.pattern;
      const fn = structureFns[fnKey];
      if (!fn) continue;
      mr = fn(text);
    } else continue;

    if (!mr.hits) continue;
    const eff = Math.min(mr.hits, rule.cap ?? 1);
    if (eff <= 0) continue;          // cap=0 时该规则不计分也不展示
    const contrib = eff * rule.weight;
    S += contrib;

    matchedRules.push({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      kind: rule.kind,
      lang: rule.lang,
      hits: mr.hits,
      eff,
      contrib,
      weight: rule.weight,
      examples: buildExamples(3, mr.indices || [], offs, text),
      detail: mr.detail || null
    });
  }

  matchedRules.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));

  const density = total ? S / (total / 1000) : 0;
  const score = mapScore(density, k);

  return {
    status: "ok",
    score,
    level: levelInfo(score, settings),
    charCount: total,
    lang,
    short: total < shortLimit,
    density: Math.max(0, Math.round(density * 100) / 100),
    rules: matchedRules,
    positiveContribution: matchedRules.filter(r => r.contrib > 0).reduce((a, b) => a + b.contrib, 0),
    negativeContribution: matchedRules.filter(r => r.contrib < 0).reduce((a, b) => a + b.contrib, 0)
  };
}

function mapScore(density, k) {
  const d = Math.max(0, density);
  return Math.round(100 * (1 - Math.exp(-d / k)));
}

function levelInfo(score, settings) {
  const low = settings.thresholds?.low ?? 30;
  const mid = settings.thresholds?.mid ?? 60;
  if (score < low) return { key: "low", label: "大概率真人", color: "#22c55e" };
  if (score < mid) return { key: "mid", label: "疑似 AI 辅助", color: "#eab308" };
  return { key: "high", label: "大概率 AI 文案", color: "#ef4444" };
}