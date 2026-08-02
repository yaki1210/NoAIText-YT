// 规则聚合层：合并中英双库；DEFAULT_SETTINGS 与默认参数。
// detector 按 settings.lang 过滤规则（缺省时按 CJK 占比回退判定），
// 并对 lang=en 的 structure 规则调度对应的 *_en 实现。

import { ZH_RULES } from "./rules-zh.js";
import { EN_RULES } from "./rules-en.js";

export const DEFAULT_SETTINGS = {
  sensitivity: 8,        // 映射系数 k，越小越敏感
  shortTextLimit: 200,   // 字数 / 词数低于此值标记"仅供参考"（detmask 按语言量纲处理）
  shortTextLimitEn: 150, // 英文按词数计的短文本下限
  autoDetect: false      // 默认关闭自动检测
};

export const DEFAULT_RULES = [...ZH_RULES, ...EN_RULES];

export function defaultRuleById(id) {
  return DEFAULT_RULES.find(r => r.id === id);
}