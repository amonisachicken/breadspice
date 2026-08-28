// SPDX-License-Identifier: GPL-3.0-only

//! 网表生成（占位）。
//!
//! 最终实现：把 {@link Circuit}（元件 + 引脚所落孔位）展开为 ngspice 可执行的
//! SPICE 文本。规则与前端 MockBackend 里的“参考实现”保持一致，便于两端对拍。
//!
//! 关键映射：
//! - 引脚所落插孔 -> 该插孔所属 net -> SPICE 节点名（如 `n_t3L`）；
//! - 元件类型 -> 器件首字母：R/C/L/D/Q/M/X/V；
//! - 跳线/导线 -> 近零电阻；电源 -> 理想直流源。

use serde::{Deserialize, Serialize};

use crate::domain::Circuit;

/// 后端返回的网表。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Netlist {
    pub text: String,
    pub devices: Vec<NetlistDevice>,
}

/// 网表中的一条器件行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetlistDevice {
    /// 器件首字母：R/C/L/D/Q/M/X/V。
    pub r#type: String,
    /// 器件引用名：R1/C2/U1。
    pub name: String,
    /// 对应前端的元件实例 id。
    pub component_id: String,
    /// 原始 SPICE 行。
    pub line: String,
}

/// 把电路编译为 ngspice 网表。
///
/// TODO(backend): 实现完整网表展开逻辑（当前仅返回占位空网表，
/// 保证接口可编译、可联调）。
pub fn build_netlist(_circuit: &Circuit) -> Netlist {
    Netlist {
        text: "* TODO: netlist generation not yet implemented\n.end\n".to_string(),
        devices: Vec::new(),
    }
}
