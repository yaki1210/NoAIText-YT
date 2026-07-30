// 悬浮面板 UI（Shadow DOM）。导出 Panel 类。
// 相对 B站版新增：
//   - 字幕轨下拉标注 ASR / 自动翻译
//   - 自动翻译开关（默认关，开启时 background 为英文视频附加 tlang=zh-Hans）
//   - 文本量纲按 lang 渲染（中文"字" / 英文"词"）

const CATEGORY_LABEL = {
  pair: "句式", connect: "连接词", academic: "翻译腔",
  buzzword: "大词", outro: "套话", structure: "结构", human: "口语"
};

export class Panel {
  constructor({ onSeek, onSwitchTrack, onToggleTranslate, onSettings, onReanalyze } = {}) {
    this.onSeek = onSeek || (() => {});
    this.onSwitchTrack = onSwitchTrack || (() => {});
    this.onToggleTranslate = onToggleTranslate || (() => {});
    this.onSettings = onSettings || (() => {});
    this.onReanalyze = onReanalyze || (() => {});
    this._built = false;
  }

  async build() {
    if (this._built) return;
    this.root = document.createElement("div");
    this.root.className = "nat-host";
    const shadow = this.root.attachShadow({ mode: "open" });

    const cssUrl = chrome.runtime.getURL("src/content/panel.css");
    const style = document.createElement("style");
    try { style.textContent = await (await fetch(cssUrl)).text(); }
    catch { /* css 缺失也能跑 */ }
    shadow.appendChild(style);

    const tpl = document.createElement("div");
    tpl.innerHTML = `
      <div class="nat-root">
        <button class="nat-badge busy" title="NoAIText-YT · AI文案检测">...</button>
        <div class="nat-panel" hidden>
          <div class="nat-head">
            <span class="nat-title">NoAIText<small>AI文案检测 · YT</small></span>
            <button class="nat-close" title="收起">×</button>
          </div>
          <div class="nat-scorebox">
            <div class="nat-score">–</div>
            <div class="nat-meta">
              <div class="nat-level">检测中…</div>
              <div class="nat-sub"></div>
            </div>
          </div>
          <div class="nat-tracks" hidden><select></select></div>
          <label class="nat-translate" hidden><input type="checkbox"> 自动翻译为中文</label>
          <div class="nat-warn" hidden></div>
          <div class="nat-body"></div>
          <div class="nat-foot">
            <button class="nat-btn nat-reanalyze">重新检测</button>
            <button class="nat-btn nat-settings">设置规则</button>
            <span class="nat-status"></span>
          </div>
        </div>
      </div>`;
    shadow.appendChild(tpl.firstElementChild);
    this.s = shadow;

    this.badge = shadow.querySelector(".nat-badge");
    this.panel = shadow.querySelector(".nat-panel");
    this.scoreEl = shadow.querySelector(".nat-score");
    this.levelEl = shadow.querySelector(".nat-level");
    this.subEl = shadow.querySelector(".nat-sub");
    this.tracksWrap = shadow.querySelector(".nat-tracks");
    this.trackSel = shadow.querySelector("select");
    this.translateWrap = shadow.querySelector(".nat-translate");
    this.translateCb = shadow.querySelector(".nat-translate input");
    this.warnEl = shadow.querySelector(".nat-warn");
    this.bodyEl = shadow.querySelector(".nat-body");
    this.statusEl = shadow.querySelector(".nat-status");

    this.badge.addEventListener("click", () => this.toggle());
    shadow.querySelector(".nat-close").addEventListener("click", () => this.toggle(false));
    shadow.querySelector(".nat-reanalyze").addEventListener("click", () => this.onReanalyze());
    shadow.querySelector(".nat-settings").addEventListener("click", () => this.onSettings());
    this.trackSel.addEventListener("change", e => this.onSwitchTrack(e.target.value));
    this.translateCb.addEventListener("change", e => this.onToggleTranslate(e.target.checked));

    document.documentElement.appendChild(this.root);
    this._built = true;
  }

  toggle(force) {
    const willOpen = force === undefined ? this.panel.hidden : force;
    this.panel.hidden = !willOpen;
  }

  _setBadge(text, level, busy) {
    this.badge.textContent = busy ? "" : String(text);
    this.badge.className = "nat-badge" + (level ? " " + level : "") + (busy ? " busy" : "");
  }

  async setBusy() {
    if (!this._built) await this.build();
    this._setBadge("...", "", true);
    this.statusEl.textContent = "提取字幕中…";
  }

  async setResult(res) {
    if (!this._built) await this.build();
    const lv = res.level || {};
    this._setBadge(res.score, lv.key, false);
    this.scoreEl.textContent = res.score;
    this.scoreEl.style.color = lv.color || "#e6e6e6";
    this.levelEl.textContent = lv.label || "—";
    this.levelEl.style.color = lv.color || "#e6e6e6";

    // 按语言选量纲
    const unit = res.lang === "en" ? "词" : "字";
    const countStr = res.charCount != null ? `${res.charCount} ${unit}` : "";
    const densStr = res.density != null ? `密度 ${res.density}` : "";
    const langTag = res.lang ? `· ${res.lang.toUpperCase()}` : "";
    this.subEl.textContent = [countStr, densStr, langTag].filter(Boolean).join(" · ");

    this.warnEl.hidden = !res.short;
    if (res.short) this.warnEl.textContent = `字幕文本过短（<${res.lang === "en" ? 150 : 200}${unit}），结果仅供参考。`;

    // 字幕轨
    const tracks = res.tracks || [];
    if (tracks.length > 1) {
      this.tracksWrap.hidden = false;
      const cur = res.lan;
      this.trackSel.innerHTML = tracks.map(t =>
        `<option value="${escapeAttr(t.languageCode)}"${t.languageCode === cur ? " selected" : ""}>${escapeHtml(t.name || t.languageCode)}${t.isAsr ? "（ASR）" : ""}</option>`
      ).join("");
    } else {
      this.tracksWrap.hidden = true;
    }

    // 自动翻译开关：仅当当前轨不是 zh 时显示
    const curIsZh = res.lan && /^zh/i.test(res.lan);
    this.translateWrap.hidden = false;
    this.translateCb.checked = !!res.useMode;
    this.translateWrap.title = curIsZh ? "当前已是中文字幕，无需翻译" : "为英文字幕叠加 AI 机翻中文字轨（准确性差，仅供参考）";
    this.translateCb.disabled = curIsZh;

    // 规则明细
    const rules = (res.rules || []).filter(r => r.contrib !== 0);
    if (!rules.length) {
      this.bodyEl.innerHTML = `<div class="nat-empty">未命中明显 AI 句式特征。</div>`;
    } else {
      this.bodyEl.innerHTML = rules.map(r => this._ruleHtml(r)).join("");
      this.bodyEl.querySelectorAll(".nat-ex").forEach(el => {
        el.addEventListener("click", () => {
          const t = parseFloat(el.dataset.time);
          if (!isNaN(t)) this.onSeek(t);
        });
      });
    }

    this.statusEl.textContent = res.cached ? "已缓存" : "";
    this.toggle(true);
  }

  _ruleHtml(r) {
    const cat = CATEGORY_LABEL[r.category] || r.category || "";
    const contribClass = r.contrib > 0 ? "pos" : r.contrib < 0 ? "neg" : "mute";
    const sign = r.contrib > 0 ? "+" : "";
    const ex = (r.examples || []).slice(0, 3).map(e =>
      `<div class="nat-ex" data-time="${e.timeSec ?? ""}"><span class="nat-time">${e.time || ""}</span><span>${escapeHtml(e.text)}</span></div>`
    ).join("");
    const detail = r.detail ? `<div class="nat-detail">${escapeHtml(r.detail)}</div>` : "";
    return `
      <div class="nat-rule ${contribClass === "neg" ? "nat-mute" : ""}">
        <span class="nat-cat">${cat}</span>
        <span class="nat-rule-name">${escapeHtml(r.name)} <small style="color:#6b7280">×${r.hits}</small></span>
        <span class="nat-contri ${contribClass}">${sign}${r.contrib}</span>
        <div class="nat-examples">${ex}${detail}</div>
      </div>`;
  }

  async setError(msg) {
    if (!this._built) await this.build();
    this._setBadge("!", "mid", false);
    this.panel.hidden = false;
    this.scoreEl.textContent = "!";
    this.scoreEl.style.color = "#eab308";
    this.levelEl.textContent = "出错";
    this.levelEl.style.color = "#eab308";
    this.subEl.textContent = "";
    this.warnEl.hidden = true;
    this.bodyEl.innerHTML = `<div class="nat-empty">${escapeHtml(msg || "检测失败")}</div>`;
    this.statusEl.textContent = "";
  }

  async clear() {
    if (this._built) this.root.remove();
    this._built = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/["'&<>]/g, c => ({
    '"': "&quot;", "'": "&#39;", "&": "&amp;", "<": "&lt;", ">": "&gt;"
  }[c]));
}