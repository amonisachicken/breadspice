// SPDX-License-Identifier: GPL-3.0-only

//! 后端二进制入口：启动 HTTP/WebSocket 服务。
//!
//! 监听 127.0.0.1:8787（前端 vite 代理已把 /api、/ws 转发到该地址）。

#[tokio::main]
async fn main() {
    breadboard_backend::server::serve().await;
}
