// SPDX-License-Identifier: GPL-3.0-only

//! 虚拟面包板后端库。
//!
//! 模块划分：
//! - [`domain`]：与前端共享的电路领域模型（JSON 契约）；
//! - [`netlist`]：把电路布局编译为 ngspice 网表；
//! - [`ngspice`]：ngspice 驱动接口（CLI / FFI）。

pub mod domain;
pub mod netlist;
pub mod ngspice;
