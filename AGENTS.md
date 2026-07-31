# AGENTS.md — 给后续 AI Agent / 协作者的工程约定

## 验证命令（每次改动后必跑）

```bash
npm test      # 单元测试，node --test，28 个用例
npm run check # 语法检查所有 JS 源文件
```

两个都通过才能视为任务完成。

## 代码约定

- 浏览器扩展（Manifest V3），不依赖任何 npm 包；`package.json` 仅用于 `npm test` / `npm check`
- 评分引擎 `src/core/detector.js` 必须保持纯函数：不引用 `chrome.*` / `document` / `fetch`
- 浏览器 API（`chrome.storage` / `chrome.runtime`）只在 `storage.js`、`background.js`、`content/*.js`、`options/*.js` 调用
- 规则默认库按语言拆 `rules-zh.js` / `rules-en.js`；每条规则必须带 `lang` 字段
- 中文规则以**简体**编写：detector 对 `lang=zh` 文本先做繁体→简体 1:1 归一再匹配（`T2S_PAIRS`，仅匹配用，示例展示原文）。新增规则用到繁体写法不同的字时，需确认该字已收录在 `T2S_PAIRS`
- 新增结构统计规则需在 `detector.js` 的 `structureFns` 实现同名函数；英文版需另写 `${name}_en`
- 缓存键加 `noyit:` 前缀（区别 B 站版 `noaitext:`），与同 environ 的 B 站版互不干扰
- 字幕 URL 必须校验非空再 fetch，避免 Service Worker 把 `""` 解析为自身脚本

## 测试样本原则

- 测试样本沿用 `test/detector.test.mjs` 既有四组（aiZh / humanZh / aiEn / humanEn）；繁体样本（aiZht / humanZht）须与简体组逐句对应，繁体评分应与简体一致
- 英文样本模拟 YouTuber ASR：无大写、无句末标点，确保规则对真实 ASR 友好
- 不收录"陷阱词"（actually / basically / just / really / literally 等）作为 AI 信号，见 README；陷阱词也不作为人类反向信号（口语化 AI 文案同样高频）

## 字幕管线断裂时的退路

YouTube 若加 `pot` 风控使 `ytInitialPlayerResponse` 内嵌路径失效，退路：注入 page script 把 `window.ytInitialPlayerResponse` 转存给 content（需 `world: 'MAIN'` 注入式 content script）。本期未实现此退路，仅留口子。