// 纯函数评分引擎。不依赖浏览器 API，可被 background 与 node 测试同时引用。
// 用法：import { analyze } from './detector.js';
//       const result = analyze(segments, rules, settings);  // settings.lang 可选，缺省按 CJK 占比回退
// lang=zh 时先把文本做繁体→简体 1:1 归一（仅用于规则匹配），
// 简繁共用同一套简体规则库；示例展示仍用原文，1:1 映射保证字符偏移对齐。

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
  // 含 CJK 扩展 A 区与兼容区，繁体生僻字也能计入中文
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk >= latin ? "zh" : "en";
}

// ── 繁体→简体 1:1 归一 ──────────────────────────────────
// 每 2 个字符为 1 组（繁体,简体）。歧义字只取字幕中最常用义：
// 著→着（随着）、後→后（最后）、發/髮→发（发展/头发）、餘→余（剩余）等。
// 收录覆盖默认中文规则库所需字符，另补高频常用字以惠及自定义规则。
const T2S_PAIRS =
  "個个們们說说還还這这裡里裏里後后長长門门為为時时來来見见讓让對对實实從从會会應应該该關关變变單单" +
  "論论總总結结無无問问顯显眾众換换話话與与當当隨随進进斷断義义鍵键遠远響响揮挥賦赋閉闭環环層层" +
  "輯辑維维顛颠雙双劍剑異异謝谢觀观聽听幫帮錯错誤误確确準准給给沒没試试簡简別别顧顾難难現现" +
  "發发認认輕輕举举種种麼么麽么著着唄呗囉啰嗚呜嗎吗喲哟誒诶綜综學学習习術术語语業业題题類类師师愛爱" +
  "爾尔萬万億亿數数歲岁頭头馬马鳥鸟魚鱼車车電电動动東东樂乐產产標标記记訓训議议設设訪访講讲許许" +
  "評评詞词讀读課课誰谁請请調调談谈貝贝資资貴贵買买賣卖賠赔費费貨货質质財财貧贫貢贡責责賬账貫贯" +
  "寫写軍军農农紅红級级紙纸經经紀纪線线組组細细終终紹绍絕绝統统網网緒绪緊紧繞绕編编缓缓縮缩續续" +
  "羅罗罰罚罷罢風风飛飞餘余鬥斗鬧闹聞闻開开間间閣阁閱阅隊队陽阳陰阴陳陈陸陆際际隱隐雲云霧雾頁页" +
  "頂顶項项順顺須须領领額额飯饭飲饮飾饰館馆駕驾騎骑髮发鬆松適适達达熱热覺觉嚴严華华衛卫醫医歷历" +
  "曆历廠厂廳厅壓压厭厌縣县場场壇坛團团圖图圓圆聖圣聲声處处備备態态戰战執执擴扩揚扬護护報报擁拥" +
  "撲扑揀拣擔担擬拟撥拨擇择攔拦擰拧擋挡擠挤損损據据撈捞撿捡摻掺攬揽擱搁摟搂攪搅攜携攝摄搖摇撐撑" +
  "擊击搶抢拋抛臺台係系繫系復复複复幾几僅仅邏逻視视審审兒儿雜杂況况剛刚邊边過过點点強强龍龙鳳凤" +
  "雞鸡鴨鸭鵝鹅豬猪貓猫獅狮蝦虾體体塊块牆墙壞坏壽寿夢梦獎奖將将導导尋寻彎弯張张彈弹彌弥彙汇匯汇" +
  "徹彻徑径徵征憶忆懷怀懶懒懼惧戀恋戶户採采捨舍掃扫掛挂攏拢攣挛擾扰擺摆攤摊敘叙敗败啟启斬斩晝昼";

let t2sMap = null;
function toSimplified(text) {
  if (!t2sMap) {
    t2sMap = {};
    for (let i = 0; i < T2S_PAIRS.length; i += 2) t2sMap[T2S_PAIRS[i]] = T2S_PAIRS[i + 1];
  }
  let out = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const r = t2sMap[c];
    if (r) {
      if (!out) out = text.slice(0, i);
      out += r;
    } else if (out) {
      out += c;
    }
  }
  return out || text;
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
    const runs = (text.match(/啊|呢|吧|嘛|哦|哈|呗|哟|呀/g) || []).length;
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
  },
  // 书面文本风格：大写 + 句读（手动字幕 / AI 文案均有，ASR 两者都≈0）
  written_style_en(text) {
    const w = words(text);
    if (w < 25) return { hits: 0, detail: null };
    const capPerK = ((text.match(/[A-Z]/g) || []).length / w) * 1000;
    const punctPerK = ((text.match(/[.!?]/g) || []).length / w) * 1000;
    if (capPerK < 3 && punctPerK < 4) return { hits: 0, detail: null };
    let hits = 1;
    if (punctPerK >= 6) hits++;
    if (capPerK >= 60) hits++;
    return { hits, detail: `大写${capPerK.toFixed(0)}/千词 句读${punctPerK.toFixed(0)}/千词` };
  },
  // 分号密度：ASR 从不产出，书面 AI 文案高频
  semicolon_en(text) {
    const w = words(text);
    const perK = w ? ((text.match(/;/g) || []).length / w) * 1000 : 0;
    const hits = perK < 1 ? 0 : perK < 3 ? 1 : perK < 6 ? 2 : 3;
    return { hits, detail: `≈${perK.toFixed(1)}/千词` };
  },
  // 括号密度：ASR 从不产出，书面 AI 文案常用补充说明
  paren_en(text) {
    const w = words(text);
    const perK = w ? ((text.match(/\([^)\n]{1,60}\)/g) || []).length / w) * 1000 : 0;
    const hits = perK < 1 ? 0 : perK < 3 ? 1 : perK < 6 ? 2 : 3;
    return { hits, detail: `≈${perK.toFixed(1)}/千词` };
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
    let snippet = it.match ? text.substr(it.index, it.match.length) : text.substr(it.index, 12);
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
  // 繁简归一（1:1）仅作用于规则匹配文本；原文 text 仍用于示例展示与字数统计
  const matchText = lang === "zh" ? toSimplified(text) : text;
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
      mr = matchRegex(rule.pattern, matchText, flags);
    } else if (rule.kind === "keyword") mr = matchSubstring(matchText, rule.pattern);
    else if (rule.kind === "all") mr = matchAll(matchText, rule.pattern);
    else if (rule.kind === "structure") {
      // 英文优先 _en 实现，无则回退到默认（中文）实现
      const fnKey = (lang === "en" && structureFns[rule.pattern + "_en"]) ? rule.pattern + "_en" : rule.pattern;
      const fn = structureFns[fnKey];
      if (!fn) continue;
      mr = fn(matchText);
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