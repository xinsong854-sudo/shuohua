# D站查词 / Danbooru 标签匹配模块

这个模块把“用户输入中文/自然语言 → 推荐 D站 Danbooru 词条 → 输出可复制 prompt tags”的能力拆成独立组件，方便新人机直接加载。

## 文件结构

```text
.
├── dtag-search.js                 # 核心查词模块
└── data/dtags/
    ├── tags.json                  # D站词库：name / zh / category / post_count / deprecated 等
    ├── keyword_index.json         # 分类到高频词条的索引，用于缩小候选范围
    └── adjective_combos.json      # 形容词/组合词规则词表，预留给扩展使用
```

> `data/dtags` 必须和运行目录配置对齐。默认读取 `process.cwd()/data/dtags`。

## 能力说明

`dtag-search.js` 提供：

- `/查词，xxx` 命令处理
- 中文意图粗分类：头发、眼睛、表情、服装、场景、动作、魔法、动物、时间、光影、构图、质量、风格、武器、交通、身体等
- 从本地 D站词库检索候选词条
- 自动过滤废词/泛词：例如 `solo`、`1girl`、`masterpiece`、`looking_at_viewer` 等，除非用户明确提到镜头、构图、背景等
- 调用外部 LLM 做语义匹配和翻译补全
- 返回格式化回复，包含：
  - 编号词条
  - 中文说明
  - `✓` 表示来自本地词库
  - `↗` 表示 LLM 翻译生成
  - 一行可直接复制的英文 tags

## 最小接入

```js
const { createDtagSearch } = require('./dtag-search');

const dtags = createDtagSearch({
  callConfiguredLLM,
  isLLMConfigured: () => true,
  sendReply: async (ws, event, text) => outbound.reply(event, text),
  logLine: console.log,
  summarizeEvent: event => ({
    message_type: event.message_type,
    group_id: event.group_id,
    user_id: event.user_id,
  }),
  state: { stats: { llmErrors: 0 } },
  config: {
    DTAGS_DIR: require('path').join(process.cwd(), 'data', 'dtags'),
    DTAGS_ENABLED: true,
  },
});
```

然后在收到消息文本时调用：

```js
const handled = await dtags.handleDtagsCommand(ws, event, text);
if (handled) return;
```

用户发：

```text
/查词，蓝色眼睛白色长发
```

机器人回：

```text
【D站查词】蓝色眼睛白色长发
1. blue_eyes｜蓝眼睛 ✓
2. white_hair｜白发 ✓
...

复制：blue_eyes, white_hair, ...
```

## 只调用查词函数，不接命令

如果你的新人机不是 OneBot，只想复用能力：

```js
const { createDtagSearch } = require('./dtag-search');

const dtags = createDtagSearch({ callConfiguredLLM, isLLMConfigured: () => true });

const result = await dtags.searchDtags('精致的衣领，黑白裙子');
console.log(result.tags.map(t => t.name).join(', '));
```

## LLM 适配器要求

模块不会绑定任何模型服务，只要求你传入一个 `callConfiguredLLM(messages, options)`，返回 OpenAI 兼容结构即可：

```js
async function callConfiguredLLM(messages, options = {}) {
  const resp = await fetch(process.env.LLM_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_JSON || 'qwen3.6-plus',
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 2048,
    }),
    signal: options.signal,
  });
  if (!resp.ok) throw new Error(`LLM failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}
```

必须让模型只返回 JSON。模块内部已经用 system prompt 约束：`只返回 JSON`。

## 配置项

```js
config: {
  DTAGS_DIR: '/绝对路径/data/dtags',
  DTAGS_ENABLED: true,
  DTAGS_MAX_REFERENCE_TAGS: 200, // 给 LLM 的候选词上限
  DTAGS_MAX_RESULTS: 18,         // 最终输出词条数
  DTAGS_LLM_MAX_TOKENS: 2048,
  DTAGS_LLM_TEMPERATURE: 0.3,
  LLM_TIMEOUT_MS: 30000,
  LLM_MODEL_JSON: 'qwen3.6-plus',
}
```

## 对接 OneBot 新人机完整示例

```js
const { OneBotOutbound } = require('./onebot-outbound');
const { createDtagSearch } = require('./dtag-search');

const outbound = new OneBotOutbound();

const dtags = createDtagSearch({
  callConfiguredLLM,
  isLLMConfigured: () => Boolean(process.env.LLM_API_KEY),
  sendReply: (ws, event, text) => outbound.reply(event, text),
  state: { stats: { llmErrors: 0 } },
  config: {
    DTAGS_DIR: require('path').join(__dirname, 'data', 'dtags'),
    DTAGS_ENABLED: true,
  },
});

wss.on('connection', ws => {
  outbound.bind(ws);

  ws.on('message', async raw => {
    const event = JSON.parse(raw.toString());
    const text = typeof event.message === 'string'
      ? event.message
      : Array.isArray(event.message)
        ? event.message.map(seg => seg.type === 'text' ? seg.data?.text || '' : '').join('')
        : '';

    if (await dtags.handleDtagsCommand(ws, event, text)) return;

    // 其它命令继续往下走
  });
});
```

## 词库更新

替换这三个文件即可：

```text
data/dtags/tags.json
data/dtags/keyword_index.json
data/dtags/adjective_combos.json
```

要求：

- `tags.json` 至少包含 `name` 字段，推荐包含 `zh`、`category`、`post_count`、`is_deprecated`
- `keyword_index.json` 是 `{ 分类名: [tagName, ...] }`
- tag name 使用 Danbooru 风格：小写英文，下划线分隔

## 注意

- 这个模块只做全年龄标签匹配，不主动补 NSFW 词。
- 本地词库是优先参考；词库没有时，会让 LLM 按 Danbooru 命名规则生成翻译型词条。
- 如果 LLM 失败，命令模式会降级为本地词库直搜。
