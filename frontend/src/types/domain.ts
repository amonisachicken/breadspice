// SPDX-License-Identifier: GPL-3.0-only

/**
 * 领域模型 —— 虚拟面包板的“物理世界”类型。
 *
 * 这些类型是前端与 Rust 后端共享契约的核心：前端用它描述用户在
 * 面包板上摆放出来的电路，后端（Rust + ngspice）据此生成网表并仿真。
 * 请保持与 backend/src/domain.rs 中的 Rust 结构体字段一一对应。
 */

/** 面包板插孔（tie point）的唯一稳定 id，例如 "a1"、"f10"、"rail_top_plus_5"。 */
export type NodeId = string;

/** 面包板内部金属条的 id —— 电气上连在一起的一串插孔构成一个“网”（net）。 */
export type NetId = string;

/**
 * 面包板上的一个插孔（tie point / hole）。
 * 元件引脚落在某个插孔上，即意味着该引脚电气连接到该插孔所属的 net。
 */
export interface BreadboardNode {
  /** 唯一 id，前端布局与后端网表共用。 */
  id: NodeId;
  /** 该插孔电气上所属的 net（面包板内部金属条）。 */
  netId: NetId;
  /** 行标签，如 "A".."J"（端子排）、"+" / "-"（电源轨）。 */
  row: string;
  /** 1 起始的列号。 */
  column: number;
  /** 在面包板 SVG 坐标空间中的位置（单位：逻辑单位，渲染时统一缩放）。 */
  x: number;
  y: number;
}

/** 一条电气网：面包板内部金属条把若干插孔连成等电位。 */
export interface Net {
  id: NetId;
  /** 组成该网的插孔 id 列表。 */
  nodeIds: NodeId[];
}

/**
 * 面包板布局：渲染与电气推导的共同数据源。
 * 渲染器据此画出插孔位置；网表生成器据此把“元件引脚落在哪个孔”映射为电气节点。
 */
export interface BreadboardLayout {
  id: string;
  /** 显示名称，例如 "MB-102 (830 孔)"。 */
  name: string;
  nodes: BreadboardNode[];
  nets: Net[];
}

/** 元件类型标识，与 ngspice 元件模型一一对应。 */
export type ComponentKind =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "led"
  | "npn"
  | "pnp"
  | "nmos"
  | "pmos"
  | "opamp"
  | "jumper" // 跳线（纯导线）
  | "wire" // 自由导线
  | "power" // 电源 / 地
  | "generic";

/**
 * 一个元件引脚：它是元件与面包板之间的电气连接点。
 * 在“橡皮筋引脚”模型下，`x`/`y` 是引脚在元件身体上的**端子**位置
 * （相对身体原点的偏移），`node` 是该引脚引线所连接的插孔。
 */
export interface ComponentPin {
  /** 引脚名，例如 "anode"/"cathode"、"1"/"2"、"B"/"C"/"E"。 */
  name: string;
  /** 引脚端子在元件身体局部坐标系中的位置（相对身体原点）。 */
  x: number;
  y: number;
  /** 该引脚引线所连接的插孔 id（= 布局中的节点）。 */
  node?: NodeId;
}

/** 元件的旋转角（度，任意实数；0 为默认朝向）。 */
export type ComponentRotation = number;

/** 面包板上一个已放置的元件实例。 */
export interface ComponentInstance {
  /** 实例唯一 id。 */
  id: string;
  kind: ComponentKind;
  /** 展示名，例如 "R1"、"C2"、"U1"。 */
  refdes: string;
  /** 元件参数值，例如 "1k"、"10uF"、"2N3904"（电阻/电容为数值，半导体/IC 为型号）。 */
  value: string;
  /** 单位（电阻/电容专用），例如 "kΩ"、"µF"。 */
  unit?: string;
  /** 引脚（端子 + 所连插孔）。 */
  pins: ComponentPin[];
  /** 元件身体原点在面包板 viewBox 坐标中的位置。 */
  x: number;
  y: number;
  /** 旋转角（度，任意实数）。 */
  rotation: ComponentRotation;
}

/**
 * 一个完整电路：面包板 + 其上的元件集合。
 * 这是发往后端进行仿真的最小自包含描述。
 */
export interface Circuit {
  /** 面包板布局快照。 */
  breadboard: BreadboardLayout;
  /** 已放置的元件。 */
  components: ComponentInstance[];
}
