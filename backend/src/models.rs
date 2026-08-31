// SPDX-License-Identifier: GPL-3.0-only

//! ngspice 器件模型库。
//!
//! 前端元件目录里的半导体/IC 器件（二极管、LED、三极管、JFET、MOSFET、运放）
//! 在 ngspice 中都需要对应的 `.MODEL` / `.SUBCKT` 定义。这些定义集中存放在
//! `assets/models.lib`，编译期用 `include_str!` 嵌入二进制，网表生成与仿真时
//! 直接引用，无需运行时读文件。

/// 完整模型库文本（`.MODEL` / `.SUBCKT`），供网表生成与 ngspice 仿真使用。
pub const MODELS_LIB: &str = include_str!("../assets/models.lib");
