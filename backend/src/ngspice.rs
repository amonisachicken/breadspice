//! ngspice 接入占位。
//!
//! 后续实现两种策略（二选一或按需并存）：
//! 1. **子进程 CLI**：调用 `ngspice -b` 批处理模式，喂网表、取 stdout 结果；
//! 2. **libngspice FFI**：通过 `ngSpice_Init` / `ngSpice_Command` 等 C 接口
//!    在进程内驱动，适合长时间交互与流式输出。
//!
//! 现阶段本模块不引入任何依赖，只定义接口形状，确保 crate 可编译。

use crate::netlist::Netlist;

/// ngspice 驱动策略。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NgspiceBackend {
    /// 子进程批处理（`ngspice -b`）。
    Cli,
    /// libngspice 动态库 FFI。
    LibNgspice,
}

/// 一次仿真分析类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Analysis {
    Op,
    Dc,
    Ac,
    Tran,
}

/// ngspice 驱动的统一接口（占位实现见下）。
pub trait Ngspice {
    /// 运行一段网表并返回结果文本。
    fn run(&mut self, netlist: &Netlist, analysis: Analysis) -> Result<String, String>;
}

/// 占位驱动：不真正调用 ngspice。
pub struct StubNgspice {
    pub backend: NgspiceBackend,
}

impl StubNgspice {
    pub fn new(backend: NgspiceBackend) -> Self {
        Self { backend }
    }
}

impl Ngspice for StubNgspice {
    fn run(&mut self, _netlist: &Netlist, _analysis: Analysis) -> Result<String, String> {
        // TODO(backend): 接入 ngspice 后替换为真实调用。
        Err(format!(
            "ngspice ({:?}) 尚未接入：仅骨架",
            self.backend
        ))
    }
}
