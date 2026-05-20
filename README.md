# shuohua

这个仓库只放**发消息相关**的最小补丁代码，方便把已有的 QQ 机器人后端补齐 outbound 链路。

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

- `package.json`
  - 最小依赖声明

## 怎么接到现有后端里

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

