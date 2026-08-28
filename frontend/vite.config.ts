// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig } from "vite";

// 前端开发服务器。后续与 Rust 后端联调时，可在 server.proxy 里
// 把 /api 与 /ws 转发到 ngspice 后端进程。
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // 预留：Rust 后端 HTTP 接口（ngspice 仿真）
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      // 预留：Rust 后端 WebSocket（实时仿真进度/波形流）
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
