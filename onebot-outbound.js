const crypto = require('crypto');

class OneBotOutbound {
  constructor() {
    this.ws = null;
    this.actionWaiters = new Map();
    this.state = {
      connectedAt: null,
      lastSendAt: null,
      lastSendError: null,
      lastEchoAt: null,
      lastEchoError: null,
      pending: 0,
    };
  }

  bind(ws) {
    this.ws = ws;
    this.state.connectedAt = new Date().toISOString();
    this.state.lastSendError = null;
    if (ws && typeof ws.on === 'function') {
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null;
      });
      ws.on('error', err => {
        this.state.lastSendError = err?.message || String(err);
      });
      ws.on('message', data => this._handleIncoming(data));
    }
  }

  unbind(ws) {
    if (!ws || this.ws === ws) this.ws = null;
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === 1;
  }

  _handleIncoming(data) {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!payload || !payload.echo) return;
    const waiter = this.actionWaiters.get(payload.echo);
    if (!waiter) return;

    this.actionWaiters.delete(payload.echo);
    this.state.pending = this.actionWaiters.size;
    this.state.lastEchoAt = new Date().toISOString();

    clearTimeout(waiter.timer);
    if (payload.status === 'failed' || Number(payload.retcode || 0) !== 0) {
      const err = new Error(payload.wording || payload.message || `action ${waiter.action} failed`);
      err.retcode = payload.retcode;
      err.raw = payload;
      this.state.lastEchoError = err.message;
      waiter.reject(err);
      return;
    }
    waiter.resolve(payload);
  }

  sendAction(action, params = {}, timeoutMs = 10000) {
    if (!this.isOpen()) {
      throw new Error('OneBot WebSocket is not connected');
    }
    const echo = crypto.randomUUID();
    const payload = { action, params, echo };
    this.state.lastSendAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.actionWaiters.delete(echo);
        this.state.pending = this.actionWaiters.size;
        reject(new Error(`${action} timeout`));
      }, timeoutMs);

      this.actionWaiters.set(echo, {
        action,
        resolve,
        reject,
        timer,
      });
      this.state.pending = this.actionWaiters.size;

      this.ws.send(JSON.stringify(payload), err => {
        if (err) {
          clearTimeout(timer);
          this.actionWaiters.delete(echo);
          this.state.pending = this.actionWaiters.size;
          this.state.lastSendError = err.message || String(err);
          reject(err);
        }
      });
    });
  }

  sendGroupMsg(groupId, message, timeoutMs = 10000) {
    return this.sendAction('send_group_msg', {
      group_id: Number(groupId),
      message: String(message),
    }, timeoutMs);
  }

  sendPrivateMsg(userId, message, timeoutMs = 10000) {
    return this.sendAction('send_private_msg', {
      user_id: Number(userId),
      message: String(message),
    }, timeoutMs);
  }

  reply(event, message, timeoutMs = 10000) {
    if (!event || !event.message_type) {
      throw new Error('invalid event');
    }
    if (event.message_type === 'group') {
      return this.sendGroupMsg(event.group_id, message, timeoutMs);
    }
    return this.sendPrivateMsg(event.user_id, message, timeoutMs);
  }

  getStatus() {
    return {
      connected: this.isOpen(),
      connectedAt: this.state.connectedAt,
      lastSendAt: this.state.lastSendAt,
      lastSendError: this.state.lastSendError,
      lastEchoAt: this.state.lastEchoAt,
      lastEchoError: this.state.lastEchoError,
      pending: this.state.pending,
    };
  }
}

module.exports = {
  OneBotOutbound,
};
