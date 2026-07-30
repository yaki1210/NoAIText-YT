import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/core/detector.js";
import { DEFAULT_RULES, DEFAULT_SETTINGS } from "../src/core/rules.js";

// ─── 中文样本 ────────────────────────────────────────
const aiZh = [
  { content: "今天我们来聊聊一个话题。", from: 0, to: 2 },
  { content: "随着科技的发展，这个领域正经历着前所未有的变革。", from: 2, to: 6 },
  { content: "这不仅是一个工具，更是一种全新的思维方式。", from: 6, to: 10 },
  { content: "它不是简单的效率提升，而是底层逻辑的彻底重塑。", from: 10, to: 15 },
  { content: "在当今这个时代，赋能成为了关键词。", from: 15, to: 18 },
  { content: "综上所述，我们需要从多维度的视角去审视。", from: 18, to: 22 },
  { content: "首先，它提升了效率；其次，它降低了成本；最后，它塑造了全新的闭环。", from: 22, to: 28 },
  { content: "值得注意的是，这一技术具有深远的影响。", from: 28, to: 31 },
  { content: "换句话说，这正是未来发展的方向。", from: 31, to: 34 },
  { content: "总而言之，希望对你有所帮助，我们下期再见。", from: 34, to: 38 }
];
const humanZh = [
  { content: "嗯，那个，我跟你说啊，", from: 0, to: 2 },
  { content: "就是这个事儿吧，其实我一开始也没太搞明白。", from: 2, to: 6 },
  { content: "后来我就去试了一下，诶，还别说，真有点意思。", from: 6, to: 10 },
  { content: "说白了就是没那么复杂，对吧。", from: 10, to: 13 },
  { content: "怎么说呢，反正就是你怎么舒服怎么来。", from: 13, to: 17 },
  { content: "那个那个，对，然后我当时就想，不对不对，我说错了，应该是另外一个意思。", from: 17, to: 23 },
  { content: "嗨，就这么个情况嘛。", from: 23, to: 25 },
  { content: "我就随便聊聊，大家听听就行了哈。", from: 25, to: 28 },
  { content: "我口误一下子，刚才那个数字好像是三十七不是三十八。", from: 28, to: 32 },
  { content: "嗯就这些吧，回头再说呗。", from: 32, to: 34 }
];

// ─── 英文样本（YouTuber 风格 ASR，无大写、无句末标点）─────
const aiEn = [
  { content: "today we're going to dive into the fascinating world of artificial intelligence", from: 0, to: 8 },
  { content: "it is worth noting that ai is not just a passing trend but rather a transformative technology", from: 8, to: 16 },
  { content: "moreover machine learning algorithms serve as the backbone of modern automation", from: 16, to: 22 },
  { content: "let's break it down first we have neural networks which are designed to mimic the human brain", from: 22, to: 30 },
  { content: "additionally deep learning plays a crucial role in image recognition tasks", from: 30, to: 36 },
  { content: "needless to say the potential applications are vast and the field is ever evolving", from: 36, to: 42 },
  { content: "in conclusion ai is not merely a tool but rather a paradigm shift in how we approach problem solving", from: 42, to: 50 },
  { content: "when it comes to ethical considerations we must navigate the complexities of bias and transparency", from: 50, to: 58 },
  { content: "this multifaceted topic requires a holistic approach and synergy across disciplines", from: 58, to: 66 },
  { content: "without further ado let's delve into the data and unlock seamless experiences", from: 66, to: 73 }
];
const humanEn = [
  { content: "hey guys whats up so today i wanted to talk about something that actually happened to me last week", from: 0, to: 10 },
  { content: "so i was just kind of sitting there you know and i thought wait a minute this doesnt make any sense", from: 10, to: 20 },
  { content: "i mean like honestly who even does that right anyway so i did some research", from: 20, to: 28 },
  { content: "and basically what i found was pretty surprising i guess i dunno maybe you guys already knew that", from: 28, to: 36 },
  { content: "so yeah im gonna show you how i fixed it step by step stick around if you want to see that", from: 36, to: 44 },
  { content: "ok so first thing you wanna do is open up the settings and just uh look for the display tab", from: 44, to: 52 },
  { content: "its kind of hidden actually so you have to like scroll all the way down which is annoying", from: 52, to: 59 },
  { content: "then once you find it you just click on it and bam problem solved it was that simple", from: 59, to: 67 },
  { content: "um but yeah let me know in the comments if this worked for you or if you ran into any issues", from: 67, to: 75 },
  { content: "thanks for watching guys ill catch you in the next one so yeah peace", from: 75, to: 81 }
];

// ─── 中文断言（保持与 B站版一致）───────────────────
test("中文：AI 文案得分显著高于人类口语", () => {
  const ai = analyze(aiZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  const hu = analyze(humanZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  assert.ok(ai.score > hu.score, `AI=${ai.score} 应 > 人类=${hu.score}`);
  assert.ok(ai.score >= 60, `AI 样本应判为高概率(>=60)，实际 ${ai.score}`);
  assert.ok(hu.score < 40, `人类样本应判为低概率(<40)，实际 ${hu.score}`);
});

test("中文：成对句式与总结语应被命中", () => {
  const ai = analyze(aiZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  const names = ai.rules.map(r => r.name);
  assert.ok(names.some(n => n.includes("不是…而是…")), "命中 不是…而是…");
  assert.ok(names.some(n => n.includes("首先…其次")), "命中 首先…其次");
  assert.ok(names.includes("综上所述"), "命中 综上所述");
});

test("中文：反向规则应命中人类口语样本", () => {
  const hu = analyze(humanZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  const humanRules = hu.rules.filter(r => r.category === "human");
  assert.ok(humanRules.length >= 2, "人类口语特征至少应命中两条反向规则");
  assert.ok(humanRules.every(r => r.contrib < 0), "反向规则贡献应为负");
});

// ─── 英文断言 ────────────────────────────────────
test("英文：AI 字幕得分显著高于人类 ASR", () => {
  const ai = analyze(aiEn, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  const hu = analyze(humanEn, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  assert.ok(ai.score > hu.score, `EN AI=${ai.score} 应 > EN 人类=${hu.score}`);
  assert.ok(ai.score >= 60, `EN AI 样本应判为高概率(>=60)，实际 ${ai.score}`);
  assert.ok(hu.score < 40, `EN 人类样本应判为低概率(<40)，实际 ${hu.score}`);
});

test("英文：覆盖关键 AI 句式", () => {
  const ai = analyze(aiEn, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  const names = ai.rules.map(r => r.name);
  assert.ok(names.some(n => /not.*but/i.test(n)), "命中 not…but 类");
  assert.ok(names.includes("in conclusion"), "命中 in conclusion");
  assert.ok(names.some(n => /delve/i.test(n)), "命中 delve");
  assert.ok(names.some(n => /navigate the complex/i.test(n)), "命中 navigate the complexities");
  assert.ok(names.some(n => /moreover/i.test(n)), "命中 moreover");
});

test("英文：反向规则应命中人类 ASR 样本", () => {
  const hu = analyze(humanEn, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  const humanRules = hu.rules.filter(r => r.category === "human");
  assert.ok(humanRules.length >= 3, `EN 人类 ASR 至少应命中三条反向规则，实际 ${humanRules.length}`);
  assert.ok(humanRules.every(r => r.contrib < 0), "反向规则贡献应为负");
});

test("英文：regex 大小写不敏感（ASR 缺大写不应漏检）", () => {
  // 同样内容大小写两个版本，命中数应一致
  const lower = analyze(
    [{ content: "moreover it is worth noting that we delve into the details", from: 0, to: 5 }],
    DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" }
  );
  const upper = analyze(
    [{ content: "Moreover It Is Worth Noting That We Delve Into The Details", from: 0, to: 5 }],
    DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" }
  );
  assert.equal(lower.positiveContribution, upper.positiveContribution,
    `大小写命中贡献应一致 lower=${lower.positiveContribution} upper=${upper.positiveContribution}`);
});

// ─── 语言过滤与共享断言 ────────────────────────────
test("lang=en 时中文规则不应参与", () => {
  const r = analyze(aiZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  // 给中文样本按 en 跑：应几乎不再命中 zh 规则
  const zhHits = r.rules.filter(x => x.lang === "zh");
  assert.equal(zhHits.length, 0, "en 模式下中文规则不应命中");
});

test("lang=zh 时英文规则不应参与", () => {
  const r = analyze(aiEn, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  const enHits = r.rules.filter(x => x.lang === "en");
  assert.equal(enHits.length, 0, "zh 模式下英文规则不应命中");
});

test("cap 上限生效", () => {
  const repeated = Array.from({ length: 200 }, (_, i) => ({ content: "however", from: i, to: i + 1 }));
  const r = analyze(repeated, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" });
  // however 走 en_struct_but / 但Transition 走 but_transition_en structure
  // 同时 connect 类无 however 关键词规则——检查但transition结构上限
  const rule = r.rules.find(x => x.id === "en_struct_but");
  assert.ok(rule, "命中 however 转折结构");
  assert.ok(rule.eff <= 4, `cap 应约束计分次数 ≤4，实际 eff=${rule.eff}`);
});

test("空文本返回 empty 且分数为 0", () => {
  const r = analyze([], DEFAULT_RULES, DEFAULT_SETTINGS);
  assert.equal(r.status, "empty");
  assert.equal(r.score, 0);
});

test("示例带时间戳且按字幕片段定位", () => {
  const ai = analyze(aiZh, DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "zh" });
  const rule = ai.rules.find(r => r.id === "bushi_ershi");
  assert.ok(rule, "命中 不是…而是…");
  assert.ok(rule.examples.length > 0, "应给出示例");
  const ex = rule.examples[0];
  assert.equal(typeof ex.timeSec, "number");
  assert.ok(ex.time.length > 0, "时间格式化非空");
});

test("英文短文本应标记 short", () => {
  const r = analyze(
    [{ content: "however this is short", from: 0, to: 2 }],
    DEFAULT_RULES, { ...DEFAULT_SETTINGS, lang: "en" }
  );
  assert.ok(r.short, "英文 < 150 词应标记 short");
  assert.equal(r.lang, "en");
});

test("语言缺失时按 CJK 占比回退判定", () => {
  // 不传 lang，给中文样本应回退判为 zh
  const r = analyze(aiZh, DEFAULT_RULES, DEFAULT_SETTINGS);
  assert.equal(r.lang, "zh");
  // 给英文样本应回退判为 en
  const r2 = analyze(aiEn, DEFAULT_RULES, DEFAULT_SETTINGS);
  assert.equal(r2.lang, "en");
});