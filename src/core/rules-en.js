// 英文默认规则库。每条带 lang:'en'，detector 对 regex 自动用 'gi' flag（ASR 无大写可靠）。
// 来源：社区 AI-slop 抱怨调研（Reddit r/ChatGPT、HN、GPTZero/Originality.ai 博客、El País 学术用词研究）。
// 设计要点：
//   - 正则不强依赖标点（英文字幕多为 ASR 转写，常无句末标点）
//   - 用 \b 词边界防止子串误匹配（如 unlike 误命中 like）
//   - 陷阱词（actually/basically/just/really/literally 等真人高频词）不收录，避免误伤 YouTuber
//   - 反向 human 类用负权重，明显口语特征压分

export const EN_RULES = [
  // ── A 成对句式（证据最强）──────────────────────────────
  { id: "en_not_only_but", name: "not only…but…", category: "pair", kind: "regex", lang: "en",
    pattern: "not only\\b[^.!?;]{0,80}?\\bbut\\b", weight: 10, cap: 4, enabled: true },
  { id: "en_not_but_rather", name: "not…but rather", category: "pair", kind: "regex", lang: "en",
    pattern: "not\\s+\\w+\\s+but\\s+rather", weight: 10, cap: 3, enabled: true },
  { id: "en_is_not_x_but", name: "is not just/merely…but", category: "pair", kind: "regex", lang: "en",
    pattern: "is not (?:just|merely|simply)\\b[^.!?;]{0,40}?\\bbut\\b", weight: 9, cap: 3, enabled: true },
  { id: "en_not_only_that", name: "not only that", category: "pair", kind: "regex", lang: "en",
    pattern: "not only that\\b", weight: 7, cap: 2, enabled: true },
  { id: "en_whether_or", name: "whether…or", category: "pair", kind: "regex", lang: "en",
    pattern: "whether\\b[^.!?;]{0,60}?\\bor\\b", weight: 8, cap: 3, enabled: true },
  { id: "en_both_and", name: "both…and", category: "pair", kind: "regex", lang: "en",
    pattern: "both\\b[^.!?;]{0,40}?\\band\\b", weight: 6, cap: 3, enabled: true },
  { id: "en_either_or", name: "either…or", category: "pair", kind: "regex", lang: "en",
    pattern: "either\\b[^.!?;]{0,60}?\\bor\\b", weight: 5, cap: 3, enabled: true },
  { id: "en_neither_nor", name: "neither…nor", category: "pair", kind: "regex", lang: "en",
    pattern: "neither\\b[^.!?;]{0,60}?\\bnor\\b", weight: 9, cap: 3, enabled: true },

  // ── B AI 高频连接/总结语（口语几乎不用）────────────────
  { id: "en_moreover", name: "moreover", category: "connect", kind: "keyword", lang: "en", pattern: "moreover", weight: 8, cap: 3, enabled: true },
  { id: "en_furthermore", name: "furthermore", category: "connect", kind: "keyword", lang: "en", pattern: "furthermore", weight: 9, cap: 3, enabled: true },
  { id: "en_additionally", name: "additionally", category: "connect", kind: "keyword", lang: "en", pattern: "additionally", weight: 8, cap: 3, enabled: true },
  { id: "en_in_conclusion", name: "in conclusion", category: "connect", kind: "keyword", lang: "en", pattern: "in conclusion", weight: 10, cap: 4, enabled: true },
  { id: "en_worth_noting", name: "it's worth noting", category: "connect", kind: "regex", lang: "en", pattern: "it(?:'s| is) worth noting", weight: 11, cap: 3, enabled: true },
  { id: "en_needless", name: "needless to say", category: "connect", kind: "keyword", lang: "en", pattern: "needless to say", weight: 8, cap: 2, enabled: true },
  { id: "en_goes_without", name: "it goes without saying", category: "connect", kind: "keyword", lang: "en", pattern: "it goes without saying", weight: 9, cap: 2, enabled: true },
  { id: "en_in_summary", name: "in summary", category: "connect", kind: "keyword", lang: "en", pattern: "in summary", weight: 7, cap: 3, enabled: true },
  { id: "en_when_it_comes", name: "when it comes to", category: "connect", kind: "keyword", lang: "en", pattern: "when it comes to", weight: 5, cap: 3, enabled: true },
  { id: "en_firstly_lastly", name: "firstly…lastly", category: "connect", kind: "all", lang: "en", pattern: ["firstly", "lastly"], weight: 7, cap: 2, enabled: true },

  // ── C 翻译腔/学术腔（社区公认 AI spike 词）─────────────
  { id: "en_delve", name: "delve(incl. variants)", category: "academic", kind: "regex", lang: "en", pattern: "delve\\w*", weight: 12, cap: 5, enabled: true },
  { id: "en_meticulous", name: "meticulous(meticulously)", category: "academic", kind: "regex", lang: "en", pattern: "meticulous\\w*", weight: 11, cap: 4, enabled: true },
  { id: "en_intricate", name: "intricate", category: "academic", kind: "keyword", lang: "en", pattern: "intricate", weight: 10, cap: 4, enabled: true },
  { id: "en_testament", name: "a testament to", category: "academic", kind: "regex", lang: "en", pattern: "(?:a|an)? testament to", weight: 10, cap: 3, enabled: true },
  { id: "en_plays_role", name: "plays a (crucial) role", category: "academic", kind: "regex", lang: "en", pattern: "plays? (?:a|an|the) \\w+ role", weight: 7, cap: 3, enabled: true },
  { id: "en_navigate_complex", name: "navigate the complexities", category: "academic", kind: "regex", lang: "en", pattern: "navigate the complex", weight: 11, cap: 3, enabled: true },
  { id: "en_todays_world", name: "in today's world", category: "academic", kind: "regex", lang: "en", pattern: "in today('s|s)? world", weight: 9, cap: 4, enabled: true },
  { id: "en_serves_as", name: "serves as", category: "academic", kind: "keyword", lang: "en", pattern: "serves as", weight: 7, cap: 3, enabled: true },
  { id: "en_multifaceted", name: "multifaceted", category: "academic", kind: "keyword", lang: "en", pattern: "multifaceted", weight: 9, cap: 3, enabled: true },
  { id: "en_digital_age", name: "in the digital age", category: "academic", kind: "keyword", lang: "en", pattern: "in the digital age", weight: 9, cap: 3, enabled: true },
  { id: "en_tapestry", name: "tapestry", category: "academic", kind: "keyword", lang: "en", pattern: "tapestry", weight: 10, cap: 2, enabled: true },

  // ── D 营销大词（误伤风险较高，权重适中）──────────────
  { id: "en_synergy", name: "synergy", category: "buzzword", kind: "keyword", lang: "en", pattern: "synergy", weight: 8, cap: 2, enabled: true },
  { id: "en_paradigm", name: "paradigm", category: "buzzword", kind: "keyword", lang: "en", pattern: "paradigm", weight: 7, cap: 3, enabled: true },
  { id: "en_holistic", name: "holistic", category: "buzzword", kind: "keyword", lang: "en", pattern: "holistic", weight: 6, cap: 2, enabled: true },
  { id: "en_leverage", name: "leverage", category: "buzzword", kind: "regex", lang: "en", pattern: "leverag\\w*", weight: 6, cap: 3, enabled: true },
  { id: "en_seamless", name: "seamless", category: "buzzword", kind: "regex", lang: "en", pattern: "seamless\\w*", weight: 6, cap: 3, enabled: true },
  { id: "en_unlock", name: "unlock", category: "buzzword", kind: "regex", lang: "en", pattern: "unlock\\w*", weight: 5, cap: 2, enabled: true },
  { id: "en_game_changer", name: "game-changer", category: "buzzword", kind: "regex", lang: "en", pattern: "game[-\\s]?changer", weight: 5, cap: 2, enabled: true },

  // ── E YouTuber 套话（真人也高频，低权重）──────────────
  { id: "en_without_ado", name: "without further ado", category: "outro", kind: "keyword", lang: "en", pattern: "without further ado", weight: 4, cap: 2, enabled: true },
  { id: "en_lets_dive_in", name: "let's dive in", category: "outro", kind: "regex", lang: "en", pattern: "let(?:'s|s)? dive in", weight: 4, cap: 2, enabled: true },
  { id: "en_stick_around", name: "stick around", category: "outro", kind: "keyword", lang: "en", pattern: "stick around", weight: 3, cap: 2, enabled: true },
  { id: "en_smash_subscribe", name: "smash that subscribe", category: "outro", kind: "regex", lang: "en", pattern: "smash (?:that|the) (?:subscribe|like|bell)", weight: 2, cap: 2, enabled: true },
  { id: "en_break_down", name: "let's break it down", category: "outro", kind: "regex", lang: "en", pattern: "let(?:'s|s)? break (?:it|this) down", weight: 3, cap: 2, enabled: true },
  { id: "en_today_were", name: "today we're going to", category: "outro", kind: "regex", lang: "en", pattern: "today we(?:'re| are) going to (?:talk about|discuss|explore)", weight: 3, cap: 2, enabled: true },
  { id: "en_thanks_watching", name: "thanks for watching", category: "outro", kind: "keyword", lang: "en", pattern: "thanks for watching", weight: 1, cap: 1, enabled: true },
  { id: "en_before_we_begin", name: "before we begin", category: "outro", kind: "regex", lang: "en", pattern: "before we (?:begin|get started|dive in)", weight: 3, cap: 2, enabled: true },

  // ── F 结构统计（detector 按 lang=en 选 *_en 实现）─────
  { id: "en_struct_dash", name: "破折号密度偏高", category: "structure", kind: "structure", lang: "en", pattern: "dash_density", weight: 4, cap: 4, enabled: true },
  { id: "en_struct_parallel3", name: "三连排比偏多", category: "structure", kind: "structure", lang: "en", pattern: "parallel3", weight: 5, cap: 4, enabled: true },
  { id: "en_struct_uniform", name: "句长过于均匀", category: "structure", kind: "structure", lang: "en", pattern: "sentence_uniform", weight: 4, cap: 3, enabled: true },
  { id: "en_struct_but", name: "however/nevertheless 转折偏多", category: "structure", kind: "structure", lang: "en", pattern: "but_transition", weight: 6, cap: 4, enabled: true },

  // ── G 反向规则·人类口语（负权重）─────────────────────
  { id: "en_human_uh", name: "uh（口语填充）", category: "human", kind: "regex", lang: "en", pattern: "\\buh\\b", weight: -4, cap: 2, enabled: true },
  { id: "en_human_um", name: "um（口语填充）", category: "human", kind: "regex", lang: "en", pattern: "\\bum\\b", weight: -4, cap: 2, enabled: true },
  { id: "en_human_you_know", name: "you know", category: "human", kind: "keyword", lang: "en", pattern: "you know", weight: -3, cap: 3, enabled: true },
  { id: "en_human_i_mean", name: "I mean", category: "human", kind: "keyword", lang: "en", pattern: "i mean", weight: -3, cap: 3, enabled: true },
  { id: "en_human_i_guess", name: "I guess", category: "human", kind: "keyword", lang: "en", pattern: "i guess", weight: -3, cap: 2, enabled: true },
  { id: "en_human_kind_of", name: "kind of / sort of", category: "human", kind: "regex", lang: "en", pattern: "(?:kind|sort) of", weight: -3, cap: 3, enabled: true },
  { id: "en_human_i_dunno", name: "I dunno / I don't know", category: "human", kind: "regex", lang: "en", pattern: "i (?:dunno|don'?t know)", weight: -4, cap: 3, enabled: true },
  { id: "en_human_so_yeah", name: "so yeah", category: "human", kind: "keyword", lang: "en", pattern: "so yeah", weight: -4, cap: 2, enabled: true }
];