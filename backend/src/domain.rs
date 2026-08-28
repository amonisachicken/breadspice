//! 领域模型 —— 与前端 `frontend/src/types/domain.ts` 一一对应。
//!
//! 这些结构体是前端与后端的共享契约核心：前端用 JSON 发送 {@link Circuit}，
//! 后端反序列化后生成网表并交给 ngspice。字段名通过 `rename_all = "camelCase"`
//! 与 TypeScript 侧的 camelCase 命名保持一致。

use serde::{Deserialize, Serialize};

/// 面包板插孔（tie point）的唯一稳定 id。
pub type NodeId = String;
/// 面包板内部金属条（net）的 id。
pub type NetId = String;

/// 面包板上的一个插孔。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadboardNode {
    pub id: NodeId,
    pub net_id: NetId,
    /// 行标签（"a".."j" 或 "+"/"-"）。
    pub row: String,
    /// 1 起始的行号（端子排）或轨序号（电源轨）。
    pub column: u32,
    /// 在 SVG viewBox 坐标系中的位置。
    pub x: f64,
    pub y: f64,
}

/// 一条电气网。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Net {
    pub id: NetId,
    pub node_ids: Vec<NodeId>,
}

/// 面包板布局。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadboardLayout {
    pub id: String,
    pub name: String,
    pub nodes: Vec<BreadboardNode>,
    pub nets: Vec<Net>,
}

/// 元件类型，与 ngspice 器件模型一一对应。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComponentKind {
    Resistor,
    Capacitor,
    Inductor,
    Diode,
    Led,
    Npn,
    Pnp,
    Nmos,
    Pmos,
    Opamp,
    Jumper,
    Wire,
    Power,
    Generic,
}

/// 元件引脚。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentPin {
    pub name: String,
    /// 引脚在元件 SVG 坐标空间中的焊点位置。
    pub x: f64,
    pub y: f64,
    /// 放置后所落插孔所属节点（可选）。
    pub node: Option<NodeId>,
}

/// 元件摆放旋转角（度）。与前端 `ComponentRotation = 0 | 90 | 180 | 270` 对应，
/// 用整数表示以保持 JSON 表示一致（避免 Rust 枚举序列化成字符串造成差异）。
pub type ComponentRotation = u16;

/// 一个已放置的元件实例。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentInstance {
    pub id: String,
    pub kind: ComponentKind,
    /// 引用名，如 "R1"、"C2"、"U1"。
    pub refdes: String,
    /// 参数值，如 "1k"、"10uF"。
    pub value: String,
    pub pins: Vec<ComponentPin>,
    /// 锚点引脚（pins[0]）所落插孔。
    pub anchor_node: NodeId,
    pub rotation: ComponentRotation,
}

/// 一个完整电路。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Circuit {
    pub breadboard: BreadboardLayout,
    pub components: Vec<ComponentInstance>,
}
