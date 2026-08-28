// SPDX-License-Identifier: GPL-3.0-only

/**
 * 前端 <-> Rust 后端 通信协议类型。
 *
 * 这些类型定义了两端如何交换数据：前端把 {@link Circuit} 交给后端，
 * 后端返回网表、仿真结果等。传输层可以是 HTTP + JSON 或 WebSocket，
 * 但“消息结构”与此传输层无关，先在这里稳定下来。
 *
 * 与 backend/src/domain.rs 以及未来的 backend/src/netlist.rs 对应。
 */

import type { Circuit, ComponentKind } from "./domain";

/** ngspice 支持的仿真分析类型（先预留最常用的几种）。 */
export type AnalysisKind = "op" | "dc" | "ac" | "tran";

/** 一次仿真请求。 */
export interface SimulationRequest {
  /** 要仿真的电路。 */
  circuit: Circuit;
  /** 仿真类型。 */
  analysis: AnalysisKind;
  /**
   * 分析参数（随 analysis 类型不同而不同），先留宽泛结构：
   * - op: {}
   * - dc: { source: string; start: number; stop: number; step: number }
   * - ac: { type: "dec"|"oct"|"lin"; points: number; start: number; stop: number }
   * - tran: { step: number; stop: number }
   */
  params?: Record<string, unknown>;
  /**
   * 期望输出的节点/电压/电流列表。留空表示后端自行决定。
   */
  outputs?: string[];
}

/** 后端返回的网表（ngspice 可直接执行的 SPICE 文本）。 */
export interface Netlist {
  /** 原始 SPICE 网表文本。 */
  text: string;
  /** 网表中的器件行列表，便于前端高亮/诊断。 */
  devices: NetlistDevice[];
}

export interface NetlistDevice {
  /** 器件首字母：R/C/L/D/Q/M/X/V... */
  type: string;
  /** 器件引用名：R1/C2/U1... */
  name: string;
  /** 该器件对应的元件实例 id（关联回前端 ComponentInstance）。 */
  componentId: string;
  /** 原始 SPICE 行。 */
  line: string;
}

/** 仿真输出中的一条信号曲线。 */
export interface Trace {
  /** 信号名，例如 "V(out)"、"I(R1)"。 */
  name: string;
  /** 独立变量（时间/频率/扫描变量）。 */
  x: number[];
  /** 信号值。 */
  y: number[];
}

/** 仿真结果。 */
export interface SimulationResult {
  /** 成功与否。 */
  ok: boolean;
  /** 错误信息（失败时非空）。 */
  error?: string;
  /** 工作点（op 分析）结果：节点 -> 电压。 */
  op?: Record<string, number>;
  /** 曲线（dc/ac/tran 分析）。 */
  traces?: Trace[];
}

/** 后端可提供的元件模型目录（用于前端元件面板）。 */
export interface ComponentModel {
  kind: ComponentKind;
  /** 展示名。 */
  label: string;
  /** ngspice 模型名或子电路名（可选）。 */
  model?: string;
  /** 引脚定义（相对元件 SVG 坐标），供前端生成可拖拽元件。 */
  pins: { name: string; x: number; y: number }[];
}

/**
 * 后端请求/响应的统一封装（请求-响应式 RPC，可用于 HTTP 或 WS 单工）。
 * 事件（进度、实时波形）走单独的 {@link BackendEvent}。
 */
export type BackendRequest =
  | { kind: "ping" }
  | { kind: "list_models" }
  | { kind: "build_netlist"; circuit: Circuit }
  | { kind: "simulate"; request: SimulationRequest };

export type BackendResponse =
  | { kind: "pong" }
  | { kind: "models"; models: ComponentModel[] }
  | { kind: "netlist"; netlist: Netlist }
  | { kind: "simulation"; result: SimulationResult }
  | { kind: "error"; code: string; message: string };

/** 后端主动推送的事件（进度、实时波形等）。 */
export type BackendEvent =
  | { kind: "simulation_started"; requestId: string }
  | { kind: "simulation_progress"; requestId: string; percent: number }
  | { kind: "simulation_trace"; requestId: string; trace: Trace }
  | { kind: "simulation_done"; requestId: string }
  | { kind: "backend_status"; status: "idle" | "busy" | "error"; detail?: string };
