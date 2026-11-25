const clients = new Set();

export const SseBroadcaster = {
  connect(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write('retry: 3000\n\n');

    clients.add(res);

    const heartbeat = setInterval(() => {
      res.write(':ping\n\n');
    }, 30_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  },

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  },

  get clientCount() {
    return clients.size;
  },
};
