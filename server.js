// server.js
const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = 8060;

// 设置静态文件路径
app.use(express.static(path.join(__dirname)));

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  console.log('新的客户端已连接');

  ws.on('message', function incoming(message) {
    // console.log('收到消息:', message);

    // 将消息广播给所有其他连接的客户端
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', function () {
    console.log('客户端已断开连接');
  });
});

// 启动服务器
server.listen(port, () => {
  console.log(`服务器正在运行在 http://localhost:${port}`);
});