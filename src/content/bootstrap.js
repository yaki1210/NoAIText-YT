// 经典脚本入口（Manifest V3 contentScripts 不支持 ES 模块）。
// 动态加载真正的模块入口 content.js（声明为 web_accessible_resources）。
(() => {
  const url = chrome.runtime.getURL("src/content/content.js");
  import(url).catch(err => console.error("[NoAIText-YT] 加载 content.js 失败", err));
})();