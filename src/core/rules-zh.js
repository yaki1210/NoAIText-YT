// 中文默认规则库。每条带 lang:'zh'，detector 按 settings.lang 过滤。
// category: pair(成对句式) / connect(连接词) / academic(翻译腔) /
//           buzzword(大词) / outro(套话) / structure(结构) / human(口语反向)
// 注：成对句式/翻译腔正则排除句末标点（。！？；）但不排除换行，
// 可跨字幕片段匹配（片段边界是时间切分而非语言边界）。

export const ZH_RULES = [
  // ── A 成对句式 ──────────────────────────────────────────
  { id: "bushi_ershi", name: "不是…而是…", category: "pair", kind: "regex", lang: "zh",
    pattern: "不是[^。！？；]{0,30}?而是", weight: 10, cap: 5, enabled: true },
  { id: "bushi_yebushi_ershi", name: "不是…也不是…而是…", category: "pair", kind: "regex", lang: "zh",
    pattern: "不是[^。！？；]{0,20}?也不是[^。！？；]{0,20}?而是", weight: 16, cap: 3, enabled: true },
  { id: "yuqi_buru", name: "与其说…不如说…", category: "pair", kind: "regex", lang: "zh",
    pattern: "与其(?:说)?[^。！？；]{0,30}?(?:不如说?|倒不如)", weight: 10, cap: 3, enabled: true },
  { id: "bujin_geng", name: "不仅…更…", category: "pair", kind: "regex", lang: "zh",
    pattern: "不仅(?:仅|止)?[^。！？；]{0,25}?(?:更|还|也|而且)", weight: 5, cap: 6, enabled: true },
  { id: "wulun_dou", name: "无论…都…", category: "pair", kind: "regex", lang: "zh",
    pattern: "无论[^。！？；]{0,25}?都", weight: 4, cap: 5, enabled: true },
  { id: "bu_danshi_geng", name: "不单是…更是…", category: "pair", kind: "regex", lang: "zh",
    pattern: "不(?:单|只|唯)(?:是)?[^。！？；]{0,25}?(?:更|还)", weight: 6, cap: 5, enabled: true },
  { id: "ji_ran_name", name: "既…又…又…", category: "pair", kind: "regex", lang: "zh",
    pattern: "既[^。！？；]{0,15}?又[^。！？；]{0,15}?又", weight: 7, cap: 3, enabled: true },

  // ── B AI 高频连接/总结语 ────────────────────────────────
  { id: "zhongshang", name: "综上所述", category: "connect", kind: "keyword", lang: "zh", pattern: "综上所述", weight: 6, cap: 3, enabled: true },
  { id: "zongeryan", name: "总而言之", category: "connect", kind: "keyword", lang: "zh", pattern: "总而言之", weight: 5, cap: 3, enabled: true },
  { id: "zongdeleaning", name: "总的来说", category: "connect", kind: "keyword", lang: "zh", pattern: "总的来说", weight: 4, cap: 3, enabled: true },
  { id: "youcikejian", name: "由此可见", category: "connect", kind: "keyword", lang: "zh", pattern: "由此可见", weight: 4, cap: 4, enabled: true },
  { id: "nanfaxian", name: "不难发现", category: "connect", kind: "keyword", lang: "zh", pattern: "不难发现", weight: 5, cap: 4, enabled: true },
  { id: "zhidezhuyi", name: "值得注意的是", category: "connect", kind: "keyword", lang: "zh", pattern: "值得注意的是", weight: 5, cap: 4, enabled: true },
  { id: "zhidetishi", name: "值得一提的是", category: "connect", kind: "keyword", lang: "zh", pattern: "值得一提的是", weight: 4, cap: 4, enabled: true },
  { id: "xuyaozhichu", name: "需要指出的是", category: "connect", kind: "keyword", lang: "zh", pattern: "需要指出的是", weight: 5, cap: 3, enabled: true },
  { id: "budouke", name: "不可否认", category: "connect", kind: "keyword", lang: "zh", pattern: "不可否认", weight: 5, cap: 3, enabled: true },
  { id: "haowuyiwen", name: "毫无疑问/毋庸置疑", category: "connect", kind: "regex", lang: "zh", pattern: "毫无(?:疑问|置疑)|毋庸置疑", weight: 5, cap: 3, enabled: true },
  { id: "xianeryijian", name: "显而易见", category: "connect", kind: "keyword", lang: "zh", pattern: "显而易见", weight: 5, cap: 3, enabled: true },
  { id: "zhongsuozhouzhi", name: "众所周知", category: "connect", kind: "keyword", lang: "zh", pattern: "众所周知", weight: 5, cap: 3, enabled: true },
  { id: "huanjuhuashuo", name: "换句话说", category: "connect", kind: "keyword", lang: "zh", pattern: "换句话说", weight: 4, cap: 4, enabled: true },
  { id: "huanzhi", name: "换言之", category: "connect", kind: "keyword", lang: "zh", pattern: "换言之", weight: 4, cap: 4, enabled: true },
  { id: "shishishang", name: "事实上", category: "connect", kind: "keyword", lang: "zh", pattern: "事实上", weight: 3, cap: 5, enabled: true },
  { id: "yushitongshi", name: "与此同时", category: "connect", kind: "keyword", lang: "zh", pattern: "与此同时", weight: 3, cap: 5, enabled: true },
  { id: "civai", name: "此外", category: "connect", kind: "keyword", lang: "zh", pattern: "此外", weight: 3, cap: 6, enabled: true },
  { id: "raner", name: "然而（高密度）", category: "connect", kind: "keyword", lang: "zh", pattern: "然而", weight: 2, cap: 8, enabled: true },
  { id: "wulun_heyang_all", name: "无论…还是…都…", category: "connect", kind: "regex", lang: "zh",
    pattern: "无论[^。！？；]{0,15}?还是[^。！？；]{0,20}?都", weight: 8, cap: 3, enabled: true },
  { id: "first_second_last", name: "首先…其次…最后", category: "connect", kind: "all", lang: "zh", pattern: ["首先", "其次", "最后"], weight: 10, cap: 2, enabled: true },
  { id: "first_second", name: "首先…其次", category: "connect", kind: "all", lang: "zh", pattern: ["首先", "其次"], weight: 6, cap: 3, enabled: true },

  // ── C 翻译腔/学术腔 ─────────────────────────────────────
  { id: "zai_dangjin", name: "在当今…", category: "academic", kind: "regex", lang: "zh", pattern: "在当今[^。！？；]{0,15}?(时代|社会|世界|背景下)", weight: 4, cap: 4, enabled: true },
  { id: "suiZhe_fazhan", name: "随着…发展", category: "academic", kind: "regex", lang: "zh", pattern: "随着[^。！？；]{0,20}?(?:的发展|的普及|的进步|的不断)", weight: 5, cap: 4, enabled: true },
  { id: "de_beijingxia", name: "在…背景下", category: "academic", kind: "keyword", lang: "zh", pattern: "背景下", weight: 4, cap: 4, enabled: true },
  { id: "congzhong_cheng", name: "从某种程度", category: "academic", kind: "keyword", lang: "zh", pattern: "从某种程度", weight: 4, cap: 3, enabled: true },
  { id: "zai_henda_chengdu", name: "在很大程度上", category: "academic", kind: "keyword", lang: "zh", pattern: "在很大程度上", weight: 4, cap: 3, enabled: true },
  { id: "congzhong_yiyi", name: "从某种意义上", category: "academic", kind: "keyword", lang: "zh", pattern: "从某种意义上", weight: 5, cap: 3, enabled: true },
  { id: "zhiguanzhongyao", name: "至关重要", category: "academic", kind: "keyword", lang: "zh", pattern: "至关重要", weight: 5, cap: 4, enabled: true },
  { id: "bukehuoque", name: "不可或缺", category: "academic", kind: "keyword", lang: "zh", pattern: "不可或缺", weight: 5, cap: 4, enabled: true },
  { id: "shenyuan_yinxiang", name: "深远的影响", category: "academic", kind: "regex", lang: "zh", pattern: "深远(?:的影响|影响|的意义)", weight: 5, cap: 3, enabled: true },
  { id: "banyan_juese", name: "扮演着…角色", category: "academic", kind: "all", lang: "zh", pattern: ["扮演着", "角色"], weight: 5, cap: 3, enabled: true },
  { id: "fahui_zuoyong", name: "发挥着…作用", category: "academic", kind: "all", lang: "zh", pattern: ["发挥着", "作用"], weight: 5, cap: 3, enabled: true },
  { id: "juyou_yiyi", name: "具有…意义", category: "academic", kind: "regex", lang: "zh", pattern: "具有[^。！？；]{0,15}?意义", weight: 4, cap: 4, enabled: true },
  { id: "qi_zhong_zuo_and", name: "起着重…作用", category: "academic", kind: "regex", lang: "zh", pattern: "起着[^。！？；]{0,10}?(?:重要|关键|举足轻重)?作用", weight: 4, cap: 3, enabled: true },

  // ── D 大词/营销腔 ────────────────────────────────────────
  { id: "funeng", name: "赋能", category: "buzzword", kind: "keyword", lang: "zh", pattern: "赋能", weight: 3, cap: 5, enabled: true },
  { id: "bihuan", name: "闭环", category: "buzzword", kind: "keyword", lang: "zh", pattern: "闭环", weight: 3, cap: 5, enabled: true },
  { id: "zhuashou", name: "抓手", category: "buzzword", kind: "keyword", lang: "zh", pattern: "抓手", weight: 3, cap: 5, enabled: true },
  { id: "diceng_luoji", name: "底层逻辑", category: "buzzword", kind: "keyword", lang: "zh", pattern: "底层逻辑", weight: 4, cap: 4, enabled: true },
  { id: "weidu", name: "维度", category: "buzzword", kind: "keyword", lang: "zh", pattern: "维度", weight: 2, cap: 8, enabled: true },
  { id: "chenjinshi", name: "沉浸式", category: "buzzword", kind: "keyword", lang: "zh", pattern: "沉浸式", weight: 3, cap: 4, enabled: true },
  { id: "dianfuxing", name: "颠覆性", category: "buzzword", kind: "keyword", lang: "zh", pattern: "颠覆性", weight: 3, cap: 4, enabled: true },
  { id: "gemingxing", name: "革命性", category: "buzzword", kind: "keyword", lang: "zh", pattern: "革命性", weight: 3, cap: 4, enabled: true },
  { id: "lichengbei", name: "里程碑", category: "buzzword", kind: "keyword", lang: "zh", pattern: "里程碑", weight: 3, cap: 4, enabled: true },
  { id: "quanfangwei", name: "全方位", category: "buzzword", kind: "keyword", lang: "zh", pattern: "全方位", weight: 3, cap: 4, enabled: true },
  { id: "shuangrenjian", name: "双刃剑", category: "buzzword", kind: "keyword", lang: "zh", pattern: "双刃剑", weight: 3, cap: 4, enabled: true },
  { id: "rixinyueyi", name: "日新月异", category: "buzzword", kind: "keyword", lang: "zh", pattern: "日新月异", weight: 3, cap: 3, enabled: true },
  { id: "pengbo_fazhan", name: "蓬勃发展", category: "buzzword", kind: "keyword", lang: "zh", pattern: "蓬勃发展", weight: 3, cap: 3, enabled: true },

  // ── E 开头结尾套路（真人也用，低权重）──────────────────
  { id: "jintian_womenliao", name: "今天我们来聊…", category: "outro", kind: "regex", lang: "zh", pattern: "今天我们(?:来聊|来聊聊|来谈谈|给大家(?:聊|讲|分享))", weight: 2, cap: 2, enabled: true },
  { id: "rangwomen_yiqi", name: "让我们一起来看看", category: "outro", kind: "regex", lang: "zh", pattern: "让我们(?:一起)?来看看", weight: 3, cap: 2, enabled: true },
  { id: "xiwang_dui_ni", name: "希望对你有所帮助", category: "outro", kind: "keyword", lang: "zh", pattern: "希望对你有所帮助", weight: 4, cap: 1, enabled: true },
  { id: "ganxie_guankan", name: "感谢观看/收听", category: "outro", kind: "regex", lang: "zh", pattern: "感谢(?:观看|收看|收听|大家的)?(?:观看|收看|收看|收听)?", weight: 2, cap: 2, enabled: true },
  { id: "women_xiaqi", name: "我们下期再见", category: "outro", kind: "keyword", lang: "zh", pattern: "下期再见", weight: 2, cap: 2, enabled: true },

  // ── F 结构统计特征（detector 按 lang 选 _zh / _en 实现）──
  { id: "struct_dash", name: "破折号密度偏高", category: "structure", kind: "structure", lang: "zh", pattern: "dash_density", weight: 4, cap: 4, enabled: true },
  { id: "struct_parallel3", name: "三连排比偏多", category: "structure", kind: "structure", lang: "zh", pattern: "parallel3", weight: 5, cap: 4, enabled: true },
  { id: "struct_uniform", name: "句长过于均匀", category: "structure", kind: "structure", lang: "zh", pattern: "sentence_uniform", weight: 3, cap: 3, enabled: true },
  { id: "struct_erzh", name: "“，而”转折偏多", category: "structure", kind: "structure", lang: "zh", pattern: "er_transition", weight: 3, cap: 4, enabled: true },

  // ── G 反向规则·人类口语（负权重）─────────────────────
  { id: "human_yuqici", name: "语气词密度（口语）", category: "human", kind: "structure", lang: "zh", pattern: "yuqici", weight: -4, cap: 5, enabled: true },
  { id: "human_koutouchan", name: "口头禅（那个/然后…）", category: "human", kind: "structure", lang: "zh", pattern: "koutouchan", weight: -3, cap: 5, enabled: true },
  { id: "human_self_correct", name: "自我纠正", category: "human", kind: "structure", lang: "zh", pattern: "self_correct", weight: -5, cap: 3, enabled: true }
];