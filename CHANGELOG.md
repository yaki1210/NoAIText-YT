# 更新日志

本文件记录 NoAIText-YT 的所有显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-08-02

### 新增
- **扩展工具栏弹窗**：点击浏览器工具栏 NoAIText-YT 图标弹出菜单，含"检测此视频"按钮和"自动检测"开关
- **自动检测开关**：默认关闭，开启后页面加载时自动检测；关闭时无浮窗、无面板，不干扰浏览

### 改进
- 默认改为手动检测（关闭自动检测），避免无字幕视频反复报错
- 自动检测时无字幕视频**静默处理**：不显示面板、不报错
- 手动检测时无字幕视频仍显示错误提示

### 内部
- 新增 `src/popup/` 弹窗模块（popup.html / popup.js / popup.css）
- `DEFAULT_SETTINGS` 新增 `autoDetect: false`；`getSettings()` 返回 `autoDetect` 字段
- background.js 新增 `getSettings` 消息处理；设置变更时额外发送 `settingsChanged` 通知
- content.js：`init()` 按 `autoDetect` 设置决定是否自动检测；`scheduleAnalyze()` 检查缓存开关；新增 `triggerAnalyze` 消息监听；`requestAnalyze` 增加 `manual` 参数，自动模式失败时静默

## [0.2.0] - 2026-07-31

### 新增
- **繁体中文支持**：`lang=zh` 时对字幕文本做繁体→简体 1:1 归一（仅用于规则匹配，示例展示仍为原文），简繁共用同一套简体规则库，繁体字幕不再「零命中」
- **英文书面风格结构信号**：大写+句读密度（手动字幕/AI 文案 vs ASR）、分号密度、括号密度
- **英文规则库大幅扩充**：
  - 成对句式：on the one hand…on the other、the more…the more、no matter how/what、whether or not、that being said、in other words 等
  - 连接/总结语：it's important to note、it should be noted、ultimately、notably、consequently、in essence、to sum up、picture this 等
  - 脚本式连读短语（口语化 AI 文案高频）：the key thing is、it comes down to、you will find、what this means is、it's safe to say 等
  - 学术腔/大词：embark、harness、pivotal、landscape、realm、comprehensive、cutting-edge、unprecedented、transformative 等
- plays a role 规则收紧：仅匹配带强调形容词的写法（crucial/vital/key/essential 等）

### 改进
- 反向·人类口语规则只保留**真人独有**的失语/缩略特征（uh/um/gonna/wanna/gotta/kinda/ain't/yeah 等）；移除 actually/basically/honestly/literally/just/really 等陷阱词——口语化 AI 文案同样高频，作负信号会误伤
- 句长均匀结构规则降权（中 5→3 / 英 4→3），降低 ASR 断句均匀造成的假阳性
- 英文「today we're going to」套话规则放宽允许列表（look at/cover）

### 测试
- 用例 14 → 28：新增繁体 AI/人类两组样本、繁体与简体评分一致性断言、繁体语言回退判定、英文口语缩略词反向扣分断言、英文书面风格结构信号断言

## [0.1.0] - 2026-07-30

首个开源版本，源自 NoAIText(B站版) 的 YouTube 独立衍生。

### 新增
- 提取 YouTube `/watch` 视频字幕（中/英），扫描 AI 常用句式与文本结构特征，给出 0–100 的"文案由 AI 生成"概率得分
- **双语规则库**：按字幕轨 `languageCode` 严格单语跑，中文沿用 B 站版规则集，英文规则集基于社区 AI-slop 抱怨调研整理
- 7 类规则（中英各一套）：成对句式、连接/总结语、翻译腔/学术腔、大词/营销腔、开头结尾套路、结构统计、反向·人类口语（负权重扣分）
- 选轨：按"音频原始语言优先"原则（手动轨 > ASR > 任意手动轨 > 第一条）
- 字幕轨下拉标注 ASR；自动翻译开关（默认关，开启时为英文视频附 `&tlang=zh-Hans` 取机翻中字幕轨参与检测，标灰「仅供参考」）
- 按每千字（中）/ 每千词（英）密度计分，长视频不会因命中绝对数多而虚高
- 徽标配色：绿（0–29 大概率真人）/ 黄（30–59 疑似 AI 辅助）/ 红（60–100 大概率 AI 文案）
- 悬浮面板（Shadow DOM）：总分、判定档、字幕字数/密度（中「字」/ 英「词」）、字幕轨切换、自动翻译开关、命中规则明细（可点击示例跳转视频时间）
- 规则设置页：逐条开关、调权重、改命中上限、新增自定义规则（按语言选择）、按语言过滤规则列表、调中英两套短文本下限、调灵敏度、导入/导出 JSON
- 字幕轨/字幕内容/检测结果三级缓存，规则变更自动刷新
- 单元测试：检测引擎 14 个用例（中文 + 英文 AI/人类样本、lang 过滤、大小写不敏感、cap、回退判定）

### 字幕管线（重写自 B 站版）
- 不依赖受限的 YouTube Data API v3
- 抓取 watch 页 HTML → 括号平衡 + 字符串跳过方式抠内嵌 `ytInitialPlayerResponse`（避免正则非贪婪误截嵌套大括号）
- 取 `playerCaptionsTracklistRenderer.captionTracks[]` → `baseUrl` 追加 `&fmt=json3` → `events[]` 标准化为 `{content, from, to}`（毫秒转秒）

### 检测引擎改造
- `analyze(segments, rules, settings)` 加 `settings.lang` 入参；缺省时按 CJK 占比回退判定
- 规则按 `rule.lang` 过滤（缺省 / `'both'` 不过滤）
- `structureFns` 按语言分支：英文优先选用 `${pattern}_en` 实现（ASR 无标点切分放宽，`however/nevertheless` 转折密度统计），无则回退到中文实现
- 英文 regex 规则自动用 `gi` flag（ASR 常无大写）
- 密度分母按语言主量纲：中文按字符数，英文按词数

### 反馈已知限制
- 仅 `/watch` 页面，Shorts / embed 暂不支持
- 英文 ASR 无标点、错字多，结构统计噪声较大（已放宽阈值并降权 `en_struct_uniform`）
- 自动翻译准确性差，仅作辅助参考，结果会标灰
- 中英以外语言未配规则集，由 detector 按 CJK 占比回退判为 zh/en 再跑（命中会少但不会报错）