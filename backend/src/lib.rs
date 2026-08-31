// SPDX-License-Identifier: GPL-3.0-only

//! 虚拟面包板后端库。
//!
//! 模块划分：
//! - [`domain`]：与前端共享的电路领域模型（JSON 契约）；
//! - [`protocol`]：与前端 `protocol.ts` 对应的通信协议类型；
//! - [`models`]：ngspice 器件模型库（`.MODEL` / `.SUBCKT`）；
//! - [`netlist`]：把电路布局编译为 ngspice 网表；
//! - [`ngspice`]：ngspice 驱动接口（CLI / FFI）；
//! - [`server`]：HTTP/WebSocket 服务（/api RPC + /ws 事件流）。

pub mod domain;
pub mod models;
pub mod netlist;
pub mod ngspice;
pub mod protocol;
pub mod server;
