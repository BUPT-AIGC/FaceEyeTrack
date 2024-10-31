// server.js
const express = require('express');
const path = require('path');

const app = express();
const port = 8060;

// 设置静态文件路径
app.use(express.static(path.join(__dirname)));

// 启动服务器
app.listen(port, () => {
  console.log(`服务器正在运行在 http://localhost:${port}`);
});