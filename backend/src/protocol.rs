// SPDX-License-Identifier: GPL-3.0-only

//! 通信协议类型 —— 与前端 `frontend/src/types/protocol.ts` 一一对应。
//!
//! 这些类型定义了两端如何交换数据：前端把 {@link Circuit} 交给后端，
//! 后端返回网表、仿真结果等。传输层可以是 HTTP + JSON 或 WebSocket，
//! 但“消息结构”与此传输层无关，先在这里稳定下来。
//!
//! 序列化约定与 TypeScript 侧保持一致：
//! - 结构体字段统一 camelCase（`requestId`、`componentId`）；
//! - 联合类型用 `kind` 作为标签，标签值统一 snake_case（`list_models`、
//!   `simulation_started`）。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::domain::{Circuit, ComponentKind};
use crate::netlist::Netlist;

/// ngspice 支持的仿真分析类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisKind {
    Op,
    Dc,
    Ac,
    Tran,
}

/// 一次仿真请求。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRequest {
    /// 要仿真的电路。
    pub circuit: Circuit,
    /// 仿真类型。
    pub analysis: AnalysisKind,
    /// 分析参数（随 analysis 类型不同而不同）。留宽泛结构，由 ngspice 驱动解析。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    /// 期望输出的节点/电压/电流列表。留空表示后端自行决定。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outputs: Option<Vec<String>>,
}

/// 仿真输出中的一条信号曲线。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    /// 信号名，例如 "V(out)"、"I(R1)"。
    pub name: String,
    /// 独立变量（时间/频率/扫描变量）。
    pub x: Vec<f64>,
    /// 信号值。
    pub y: Vec<f64>,
}

/// 仿真结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResult {
    /// 成功与否。
    pub ok: bool,
    /// 是否被用户提前取消（取消时仍可能带部分结果）。
    #[serde(default)]
    pub cancelled: bool,
    /// 错误信息（失败时非空）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 工作点（op 分析）结果：节点 -> 电压。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub op: Option<HashMap<String, f64>>,
    /// 曲线（dc/ac/tran 分析）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traces: Option<Vec<Trace>>,
}

/// 元件模型目录中一个引脚的定义（相对元件 SVG 坐标）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentModelPin {
    pub name: String,
    pub x: f64,
    pub y: f64,
}

/// 后端可提供的元件模型目录（用于前端元件面板）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentModel {
    pub kind: ComponentKind,
    /// 展示名。
    pub label: String,
    /// ngspice 模型名或子电路名（可选）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// 引脚定义（相对元件 SVG 坐标），供前端生成可拖拽元件。
    pub pins: Vec<ComponentModelPin>,
}

/// 后端请求/响应的统一封装（请求-响应式 RPC）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum BackendRequest {
    Ping,
    ListModels,
    BuildNetlist { circuit: Circuit },
    Simulate { request: SimulationRequest },
}

/// 后端对 {@link BackendRequest} 的统一响应。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum BackendResponse {
    Pong,
    Models { models: Vec<ComponentModel> },
    Netlist { netlist: Netlist },
    Simulation { result: SimulationResult },
    Error { code: String, message: String },
}

/// 后端状态枚举（`backend_status` 事件用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackendStatus {
    Idle,
    Busy,
    Error,
}

/// 后端主动推送的事件（进度、实时波形等）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum BackendEvent {
    SimulationStarted { request_id: String },
    SimulationProgress { request_id: String, percent: f64 },
    SimulationTrace { request_id: String, trace: Trace },
    SimulationDone { request_id: String },
    BackendStatus { status: BackendStatus, detail: Option<String> },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 把协议消息序列化后的 JSON 与前端 `protocol.ts` 的线格式逐字对拍，
    /// 锁定 `kind` 标签（snake_case）与字段名（camelCase）的命名约定。
    #[test]
    fn request_wire_format_matches_ts() {
        let req = BackendRequest::ListModels;
        assert_eq!(
            serde_json::to_string(&req).unwrap(),
            r#"{"kind":"list_models"}"#
        );

        let req = BackendRequest::Ping;
        assert_eq!(serde_json::to_string(&req).unwrap(), r#"{"kind":"ping"}"#);
    }

    #[test]
    fn response_wire_format_matches_ts() {
        let resp = BackendResponse::Pong;
        assert_eq!(serde_json::to_string(&resp).unwrap(), r#"{"kind":"pong"}"#);

        let resp = BackendResponse::Error {
            code: "E_NGSPICE".into(),
            message: "boom".into(),
        };
        assert_eq!(
            serde_json::to_string(&resp).unwrap(),
            r#"{"kind":"error","code":"E_NGSPICE","message":"boom"}"#
        );
    }

    #[test]
    fn event_wire_format_matches_ts() {
        let ev = BackendEvent::SimulationStarted {
            request_id: "r1".into(),
        };
        assert_eq!(
            serde_json::to_string(&ev).unwrap(),
            r#"{"kind":"simulation_started","requestId":"r1"}"#
        );

        let ev = BackendEvent::SimulationProgress {
            request_id: "r1".into(),
            percent: 42.5,
        };
        assert_eq!(
            serde_json::to_string(&ev).unwrap(),
            r#"{"kind":"simulation_progress","requestId":"r1","percent":42.5}"#
        );
    }
}
