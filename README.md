# NoAIText-YT · YouTube 视频 AI 文案检测插件

![版本](https://img.shields.io/badge/版本-0.1.0-22c55e)
![License](https://img.shields.io/badge/License-MIT-blue)
![平台](https://img.shields.io/badge/平台-Chrome%20%7C%20Edge-orange)
![Manifest](https://img.shields.io/badge/Manifest-V3-purple)
![语言](https://img.shields.io/badge/字幕-中%20%2F%20EN-brightgreen)

提取 YouTube 视频字幕（中/英），扫描其中 AI 常用句式与文本结构特征，加权计算后给出 **0–100 的"文案由 AI 生成"概率得分**，并在命中示例点击后跳转到视频对应时间。无字幕的视频不显示面板。

**双语支持**：按字幕轨 `languageCode` 分别走中文/英文两套规则库。中文沿用同系列 B 站版规则集；英文规则集基于社区 AI-slop 抱怨调研（Reddit r/ChatGPT、HN、GPTZero/Originality.ai 博客、El País 学术用词研究）整理，仅靠借浏览器登录会话读取用户可见内容，全程**本地计算**，无任何数据上传。

仅支持 Chrome / Edge（Manifest V3）。

## 特性

- 视频页右下角徽标就地显示得分，点击展开命中明细
- **中英双语**：按轨 `languageCode` 严格单语跑；切换字幕轨即重算
- 字幕轨下拉标注 ASR / 手动轨；为英文视频提供**自动翻译开关**（默认关、面板可选，机翻结果仅供参考）
- 7 类规则（中英各一套）：成对句式、连接/总结语、翻译腔/学术腔、大词/营销腔、开头结尾套路、结构统计、反向·人类口语
- 反向规则用真实口语特征（中文：语气词/口头禅/自我纠正；英文：uh/um/you know/I mean/I mean 等）扣分，双向判别
- 按每千字 / 每千词密度计分，长视频不会因命中绝对数多而虚高
- 命中示例可点击跳转到视频对应时间
- 规则可逐条开关、调权重、改上限，支持自定义规则与导入/导出 JSON
- 设置页可按语言过滤规则列表、调中英两套短文本下限、调灵敏度

## 它解决什么问题

AI 配音解说视频文案高度同质、套路明显。本插件把"AI 味"拆成**可量化、可调权重**的规则，在 YouTube 视频页就地给出判定，方便甄别内容。

## 安装

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角"开发者模式"
3. 点击"加载已解压的扩展程序"，选择本目录
4. 打开任意**带字幕**的 YouTube 视频页面（`https://www.youtube.com/watch?v=...`）
5. 视频页右下角会出现圆形徽标，显示当前得分；点击展开命中明细

无需登录即可读公开字幕；私密/会员视频需登录 YouTube 会话读取可见内容。

## 使用

- **徽标配色**：绿 = 大概率真人（0–29），黄 = 疑似 AI 辅助（30–59），红 = 大概率 AI 文案（60–100）
- **面板**：总分、判定档、字幕字数/密度（中文显示「字」，英文显示「词」）、字幕轨切换、自动翻译开关、命中规则明细
- **无字幕**：YouTube 字幕缺失时按设计**不显示**面板（无文本可分析）
- **设置**：徽标→展开→"设置规则"，或扩展管理页→详细信息→扩展选项。可逐条开关、调权重、改命中上限、新增自定义规则、按语言过滤、调灵敏度、导入/导出 JSON

## 字幕链路

不依赖受限的 YouTube Data API v3。仅借用户登录会话读取 watch 页 HTML 中内嵌的 `ytInitialPlayerResponse`，取出 `playerCaptionsTracklistRenderer.captionTracks[]`，对 `baseUrl` 追加 `&fmt=json3` 拉取 `events[]`，标准化为 `{content, from, to}`（毫秒转秒）后送入检测引擎。

```
content.js(URL 解析 ?v= / yt-navigate-finish SPA 监听)
   └─sendMessage('analyze')─▶ background.js
        ├─ api/youtube.js
        │   GET watch?v=ID         → HTML → 内嵌 ytInitialPlayerResponse
        │   captionTracks[].baseUrl（含 ASR 标志 / languageCode）
        │   GET baseUrl&fmt=json3   → events[]{tStartMs,dDurationMs,segs[]} → segments[]
        ├─ 缓存(videoInfo / subtitle / 结果 三级)
        ├─ core/detector.js  analyze(segments, rules, { lang, ...settings }) → {score,level,rules[]}
        └─ 返回 → content.js → panel.js 渲染 Shadow DOM 面板
```

- 选轨策略：**按音频原始语言优先**——手动轨（音频语言）> ASR（音频语言）> 任意手动轨 > 第一条
- 语言归一：`zh-*` → `zh`，`en-*` → `en`；其它语言由 detector 按 CJK 占比回退判定
- 自动翻译：`settings.autoTranslate=true` 时，对英文视频可附 `&tlang=zh-Hans` 取 AI 机翻中字幕轨参与检测，结果标灰「仅供参考」
- 全程**本地计算**，无任何数据上传

## 检测原理

规则分 7 类，每条带权重、命中上限、`lang` 字段：

| 类 | 中文例子 | 英文例子 | 权重 |
|---|---|---|---|
| 成对句式 | 不是…而是…、不仅…更… | not only…but、not…but rather、whether…or | 高(5–16) |
| 连接/总结语 | 综上所述、值得注意的是 | moreover、furthermore、in conclusion、it's worth noting | 中(3–11) |
| 翻译腔/学术腔 | 随着…的发展、至关重要、扮演着…角色 | delve、meticulous、navigate the complexities、a testament to | 中(4–12) |
| 大词/营销腔 | 赋能、闭环、底层逻辑 | synergy、paradigm、holistic、leverage、seamless | 低(3–8) |
| 开头结尾套路 | 今天我们来聊…、希望对你有所帮助 | without further ado、let's break it down、stick around | 低(1–4) |
| 结构统计 | 破折号密度、三连排比、句长过于均匀 | dash 密度、英文排比、however/nevertheless 转折偏多 | 中(3–6) |
| 反向·人类口语 | 语气词、口头禅、自我纠正（**扣分**） | uh、um、you know、I mean、I dunno、so yeah（**扣分**）| 负（-3–-4）|

计分：`单规则贡献 = min(命中数, 上限) × 权重`，正负相加得原始分 → 按字幕量度（中文按千字、英文按千词）折算密度 `d` → `得分 = 100 × (1 − e^(−d/k))`，k 默认 8（设置页可调）。长视频不会因命中绝对数多而虚高。

英文规则对正则类自动启用大小写不敏感匹配（ASR 常无大写）；用 `\b` 词边界防子串误匹配（如 unlike 误命中 like）。下方"陷阱词"未收录，避免误伤真实 YouTuber：`actually / basically / just / really / literally / very / obviously / honestly / in order to / in terms of / due to` 等。

## 单元测试

```bash
npm test          # node --test，14 个用例
npm run check     # 语法检查
```

测试覆盖：中英 AI 文案 vs 人类口语样本的分数排序、关键句式命中、反向规则命中、`lang` 严格过滤、英文 regex 大小写不敏感、cap 上限、空文本、示例时间戳、短文本标记、语言回退判定。

## 目录结构

```
NoAIText-YT/
├─ manifest.json               # MV3，host: youtube.com
├─ package.json                # 仅用于 npm test / check，插件本体不依赖
├─ icons/                      # 16/48/128
├─ src/
│  ├─ background.js            # Service Worker：字幕获取+检测+缓存+消息
│  ├─ api/youtube.js           # watch HTML 解析 + captionTracks 取轨 + json3 取内容
│  ├─ core/
│  │  ├─ rules.js              # 聚合层 + DEFAULT_SETTINGS
│  │  ├─ rules-zh.js           # 中文默认规则库（lang: 'zh'）
│  │  ├─ rules-en.js           # 英文默认规则库（lang: 'en'）
│  │  ├─ detector.js           # 纯函数评分引擎（中英通用 + 按 lang 选结构函数）
│  │  └─ storage.js            # 规则/设置持久化（chrome.storage.local，命名空间 noyit:*）
│  └─ content/
│     ├─ bootstrap.js          # 经典脚本入口，动态导入 content.js
│     ├─ content.js            # 主逻辑：URL 解析 / yt-navigate-finish / 通信
│     ├─ panel.js              # Shadow DOM 悬浮面板（含字幕轨下拉与自动翻译开关）
│     └─ panel.css
├─ options/{options.html,js,css}  # 含语言过滤维度与中英两套短文本下限
├─ test/detector.test.mjs
└─ README.md / CHANGELOG.md / AGENTS.md / LICENSE
```

## 与同系列 B 站版的关系

本仓是 [NoAIText](https://github.com/yaki1210/NoAIText) 的 YouTube 独立衍生版。核心评分引擎与面板结构 80% 复用，但字幕管线完全重写（watch 内嵌 JSON + `&fmt=json3`），规则库按中英拆分（每条带 `lang` 字段），detector 按 lang 调度结构特征函数（中文标点切分 vs 英文 `and/or` 切分）。

## 合规与边界

- 仅供个人学习研究，勿用于商业化批量抓取
- 仅用用户本人会话读取其本人可见的内容，不转发、不外传
- 请求频率低（每视频仅 1 次 watch HTML + N 次字幕请求，全部带缓存）；如平台加风控会失效
- 判定是**概率参考**而非事实，分数受字幕质量（尤其英文 ASR 错字、无标点）与文案长度影响；短文本（中文<200 字 / 英文<150 词）面板会提示"仅供参考"
- 自动翻译字幕准确性差，结果仅供参考
- 视频页 AIGC 官方声明字段不在本插件范围内（有声明可手动判断）

## 已知限制

- 仅 `/watch` 页面，Shorts `/shorts/` 与 `/embed/` 暂不支持
- 中途加载广告 / 直播页字幕接管可能误判，等底层视频就绪后自动重算
- YouTube 对 InnerTube `player` 接口近年加大 `pot` 风控；本插件走"读 watch 页内嵌 JSON + 按 baseUrl 拉字幕"路径目前仍可用，若被升级会失效
- 英文 ASR 字幕常无标点、错字多，会显著干扰 `parallel3`、`sentence_uniform` 等结构特征统计的准确性（已通过 `_en` 分支放宽阈值与切分逻辑，检测时面板会标注「ASR」）
- 中英以外的语言未配置规则集，会由 detector 按 CJK 占比回退判为 zh 或 en 再跑（命中会很少，但不会报错）

## 开发

```bash
npm test          # 单元测试（node --test，14 个用例）
npm run check     # 语法检查
```

本项目仅用 `npm` 跑测试与语法检查，插件本体不依赖任何 npm 包。

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

[MIT License](./LICENSE) © 2026 yaki1210

本项目仅供个人学习研究使用。YouTube 相关接口与商标所有权归 Google 所有，本插件不与之存在任何关联。