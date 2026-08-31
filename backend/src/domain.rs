// SPDX-License-Identifier: GPL-3.0-only

//! 领域模型 —— 与前端 `frontend/src/types/domain.ts` 一一对应。
//!
//! 这些结构体是前端与后端的共享契约核心：前端用 JSON 发送 {@link Circuit}，
//! 后端反序列化后生成网表并交给 ngspice。字段名通过 `rename_all = "camelCase"`
//! 与 TypeScript 侧的 camelCase 命名保持一致。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    Jfet,
    Opamp,
    Jumper,
    Wire,
    Power,
    Gnd,
    Vsine,
    Voltmeter,
    Ammeter,
    Oscilloscope,
    Generic,
}

/// 元件引脚。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentPin {
    pub name: String,
    /// 引脚端子在元件身体局部坐标系中的位置（相对身体原点）。
    pub x: f64,
    pub y: f64,
    /// 该引脚引线所连接的插孔 id（可选）。
    pub node: Option<NodeId>,
}

/// 元件旋转角（度，任意实数）。与前端 `ComponentRotation = number` 对应。
pub type ComponentRotation = f64;

/// 导线控制点（viewBox 绝对坐标）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BendPoint {
    pub x: f64,
    pub y: f64,
}

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
    /// 单位（电阻/电容专用），如 "kΩ"、"µF"。
    pub unit: Option<String>,
    pub pins: Vec<ComponentPin>,
    /// 元件身体原点在面包板 viewBox 坐标中的位置。
    pub x: f64,
    pub y: f64,
    pub rotation: ComponentRotation,
    /// 弯导线控制点（二次贝塞尔曲线，仅 kind=Wire 使用）。
    pub control: Option<BendPoint>,
    /// 导线颜色（仅 kind=Wire 使用）。
    pub color: Option<String>,
    /// 元件专属参数（如正弦源的 freq/ac/dc/phase）。
    pub params: Option<HashMap<String, String>>,
}

/// 一个完整电路。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Circuit {
    pub breadboard: BreadboardLayout,
    pub components: Vec<ComponentInstance>,
}
