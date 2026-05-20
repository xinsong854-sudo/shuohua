# shuohua

这个仓库放 QQ 机器人新人机可复用的最小功能模块：

1. **OneBot outbound 发消息链路**
2. **D站查词 / Danbooru 标签匹配能力**

## 内容

- `onebot-outbound.js`
  - 统一封装 OneBot v11 outbound 发包
  - 支持 `send_group_msg`
  - 支持 `send_private_msg`
  - 支持 echo 回包匹配
  - 支持超时处理
  - 支持连接状态查询
  - 支持 `poke(event)` 戳一戳
  - 支持 `setMsgEmojiLike(messageId, emojiId)` 给消息点 emoji

- `dtag-search.js`
  - 把用户输入的中文/自然语言拆成 D站 Danbooru 词条
  - 支持 `/查词，描述` 命令
  - 支持本地词库召回 + LLM 语义匹配
  - 自动过滤常见废词/泛词
  - 可输出一行可复制英文 tags

- `data/dtags/`
  - `tags.json`：D站词库
  - `keyword_index.json`：分类索引
  - `adjective_combos.json`：组合词/形容词词表

- `DTAG_SEARCH.md`
  - D站查词能力拆分说明、词库说明、对接示例

- `package.json`
  - 最小依赖声明

## D站查词怎么接

详见：[DTAG_SEARCH.md](./DTAG_SEARCH.md)

最小用法：

```js
const { createDtagSearch } = require('./dtag-search');

const dtags = createDtagSearch({
  callConfiguredLLM,
  isLLMConfigured: () => true,
  sendReply: (ws, event, text) => outbound.reply(event, text),
  config: {
    DTAGS_DIR: require('path').join(__dirname, 'data', 'dtags'),
    DTAGS_ENABLED: true,
  },
});

if (await dtags.handleDtagsCommand(ws, event, text)) return;
```

用户发送：

```text
/查词，蓝色眼睛白色长发
```

返回可复制的 Danbooru tags。

## OneBot outbound 怎么接

把这个模块引入到你现有的 3000 后端中，然后：

1. 在 OneBot WS 连接成功时：

```js
const { OneBotOutbound } = require('./onebot-outbound');
const outbound = new OneBotOutbound();

wss.on('connection', ws => {
  outbound.bind(ws);
});
```

2. 需要回复消息时：

```js
await outbound.reply(event, '回复内容');
```

3. 如果只发群消息：

```js
await outbound.sendGroupMsg(groupId, '群消息');
```

4. 如果只发私聊：

```js
await outbound.sendPrivateMsg(userId, '私聊消息');
```

5. 戳一戳当前发言者：

```js
await outbound.poke(event);
```

6. 给一条消息点 emoji：

```js
await outbound.setMsgEmojiLike(messageId, '66');
```

7. 想看状态：

```js
console.log(outbound.getStatus());
```

## 核心要求

OneBot v11 发送消息不是 HTTP 返回值，而是向反向 WebSocket 发 action：

```json
{
  "action": "send_group_msg",
  "params": { "group_id": 123, "message": "hello" },
  "echo": "uuid"
}
```

对方回包要带同一个 `echo`，并且 `retcode = 0` 才算成功。

## 依赖

- Node.js 18+
- `ws`

安装：

```bash
npm install ws
```

