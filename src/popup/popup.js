// 扩展弹窗逻辑：手动检测触发 + 自动检测开关

const SETTINGS_KEY = "noyit:settings";

document.addEventListener("DOMContentLoaded", async () => {
  // 读取自动检测设置
  const settings = await loadSettings();
  const autoDetect = settings?.autoDetect === true;
  document.getElementById("chk-auto").checked = autoDetect;

  // 检测此视频
  document.getElementById("btn-detect").addEventListener("click", async () => {
    const tab = await findYouTubeTab();
    if (!tab) {
      alert("请在 YouTube 视频页面使用此功能");
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "triggerAnalyze" });
    } catch {
      // content script 可能未就绪，刷新页面重试
      alert("页面未就绪，请刷新后重试");
    }
    window.close();
  });

  // 自动检测开关
  document.getElementById("chk-auto").addEventListener("change", async (e) => {
    await saveSettings({ autoDetect: e.target.checked });
  });

  // 设置规则链接
  document.getElementById("link-settings").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: "openOptions" });
    window.close();
  });
});

async function loadSettings() {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return r[SETTINGS_KEY] || {};
}

async function saveSettings(obj) {
  const cur = await loadSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...cur, ...obj } });
}

async function findYouTubeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: ["*://www.youtube.com/watch*", "*://youtube.com/watch*"]
  });
  return tabs?.[0] || null;
}