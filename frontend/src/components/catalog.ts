// SPDX-License-Identifier: GPL-3.0-only

/**
 * 元件目录 —— 把 assets/parts.svg 拆成「刚性身体 + 可伸缩引线端子」。
 *
 * 模型：每个元件由一块刚性身体（可任意角度旋转）和若干「橡皮筋」引线组成；
 * 引线从身体上的端子连到面包板孔位，可各自拖拽伸缩。
 *
 * 端子坐标以 viewBox 单位给出，`x`/`y` 是相对 bodyOrigin 的偏移。
 * `styleOverrides` 用于给同一符号的不同型号上色（二极管/三极管/LED）。
 */

import type { ComponentKind } from "../types/domain";
import { SVG_NS } from "../render/svgAsset";

/** 引线端子定义（相对 bodyOrigin 的偏移）。 */
export interface TerminalDef {
  name: string;
  x: number;
  y: number;
  /** 默认引线方向（单位向量）。 */
  dx: number;
  dy: number;
  /** 默认引线长度（viewBox 单位；0 表示刚性固定引脚）。 */
  length: number;
}

/** 对克隆路径的样式覆盖（key = path id）。 */
export type StyleOverrides = Record<string, { fill?: string; stroke?: string }>;

/** 一个元件目录项。 */
export interface CatalogEntry {
  id: string;
  kind: ComponentKind;
  label: string;
  value: string;
  /** 单位（电阻/电容专用）。 */
  unit?: string;
  prefix: string;
  /** 构成刚性身体的 path id（不含可伸缩引线）。 */
  bodyPathIds: string[];
  /** body 归一化参考点（viewBox 坐标，通常为身体中心）。 */
  bodyOrigin: { x: number; y: number };
  /** 可伸缩引线端子（rigid 元件此处 length=0）。 */
  terminals: TerminalDef[];
  /** 刚性引脚元件（如 DIP-8）：引脚不可伸缩，按固定偏移摆放。 */
  rigid?: boolean;
  /** 克隆路径的样式覆盖（配色用）。 */
  styleOverrides?: StyleOverrides;
}

const DIODE_TERMINALS: TerminalDef[] = [
  { name: "a", x: 0, y: -12, dx: 0, dy: -1, length: 27 },
  { name: "k", x: 0, y: 12, dx: 0, dy: 1, length: 27 },
];

const LED_TERMINALS: TerminalDef[] = [
  { name: "a", x: 0, y: -10.8, dx: 0, dy: -1, length: 27 },
  { name: "k", x: 0, y: 10.8, dx: 0, dy: 1, length: 27 },
];

/** 元件目录（顺序即面板显示顺序）。 */
export const CATALOG: CatalogEntry[] = [
  // —— 二极管 ×2 ——
  {
    id: "diode-1n4148",
    kind: "diode",
    label: "二极管 1N4148",
    value: "1N4148",
    prefix: "D",
    bodyPathIds: ["path13", "path14", "path15"],
    bodyOrigin: { x: 441.6, y: 278.4 },
    styleOverrides: { path13: { fill: "#1f2937" }, path14: { fill: "#ef4444" } },
    terminals: DIODE_TERMINALS,
  },
  {
    id: "diode-1n5817",
    kind: "diode",
    label: "二极管 1N5817",
    value: "1N5817",
    prefix: "D",
    bodyPathIds: ["path13", "path14", "path15"],
    bodyOrigin: { x: 441.6, y: 278.4 },
    styleOverrides: { path13: { fill: "#1f2937" }, path14: { fill: "#3b82f6" } },
    terminals: DIODE_TERMINALS,
  },

  // —— LED ×3 ——
  {
    id: "led-red",
    kind: "led",
    label: "LED 红",
    value: "red",
    prefix: "D",
    bodyPathIds: ["path17", "path18", "path19"],
    bodyOrigin: { x: 489.6, y: 278.2 },
    styleOverrides: { path17: { fill: "#ef4444" }, path18: { stroke: "#b91c1c" }, path19: { stroke: "#b91c1c" } },
    terminals: LED_TERMINALS,
  },
  {
    id: "led-green",
    kind: "led",
    label: "LED 绿",
    value: "green",
    prefix: "D",
    bodyPathIds: ["path17", "path18", "path19"],
    bodyOrigin: { x: 489.6, y: 278.2 },
    styleOverrides: { path17: { fill: "#22c55e" }, path18: { stroke: "#16a34a" }, path19: { stroke: "#16a34a" } },
    terminals: LED_TERMINALS,
  },
  {
    id: "led-blue",
    kind: "led",
    label: "LED 蓝",
    value: "blue",
    prefix: "D",
    bodyPathIds: ["path17", "path18", "path19"],
    bodyOrigin: { x: 489.6, y: 278.2 },
    styleOverrides: { path17: { fill: "#3b82f6" }, path18: { stroke: "#1d4ed8" }, path19: { stroke: "#1d4ed8" } },
    terminals: LED_TERMINALS,
  },

  // —— 电容 / 电阻 ——
  {
    id: "capacitor",
    kind: "capacitor",
    label: "电容",
    value: "10",
    unit: "µF",
    prefix: "C",
    bodyPathIds: ["path25"],
    bodyOrigin: { x: 585.6, y: 278.55 },
    terminals: [
      { name: "1", x: 0, y: -9.45, dx: 0, dy: -1, length: 27 },
      { name: "2", x: 0, y: 9.45, dx: 0, dy: 1, length: 27 },
    ],
  },
  {
    id: "resistor",
    kind: "resistor",
    label: "电阻",
    value: "1",
    unit: "kΩ",
    prefix: "R",
    bodyPathIds: ["path27"],
    bodyOrigin: { x: 643.2, y: 278.07 },
    terminals: [
      { name: "1", x: 0, y: -13.11, dx: 0, dy: -1, length: 26 },
      { name: "2", x: 0, y: 13.11, dx: 0, dy: 1, length: 26 },
    ],
  },

  // —— 三极管 ×4 ——
  {
    id: "npn-bc549c",
    kind: "npn",
    label: "BC549C",
    value: "BC549C",
    prefix: "Q",
    bodyPathIds: ["path20", "path21", "path22", "path23"],
    bodyOrigin: { x: 547.2, y: 278.4 },
    styleOverrides: { path23: { stroke: "#2563eb" } },
    terminals: [
      { name: "C", x: 0, y: -9.6, dx: -1, dy: 0, length: 12 },
      { name: "B", x: 0, y: 0, dx: -1, dy: 0, length: 12 },
      { name: "E", x: 0, y: 9.6, dx: -1, dy: 0, length: 12 },
    ],
  },
  {
    id: "pnp-bc559c",
    kind: "pnp",
    label: "BC559C",
    value: "BC559C",
    prefix: "Q",
    bodyPathIds: ["path20", "path21", "path22", "path23"],
    bodyOrigin: { x: 547.2, y: 278.4 },
    styleOverrides: { path23: { stroke: "#dc2626" } },
    terminals: [
      { name: "C", x: 0, y: -9.6, dx: -1, dy: 0, length: 12 },
      { name: "B", x: 0, y: 0, dx: -1, dy: 0, length: 12 },
      { name: "E", x: 0, y: 9.6, dx: -1, dy: 0, length: 12 },
    ],
  },
  {
    id: "jfet-j201",
    kind: "generic",
    label: "J201",
    value: "J201",
    prefix: "J",
    bodyPathIds: ["path20", "path21", "path22", "path23"],
    bodyOrigin: { x: 547.2, y: 278.4 },
    styleOverrides: { path23: { stroke: "#16a34a" } },
    terminals: [
      { name: "D", x: 0, y: -9.6, dx: -1, dy: 0, length: 12 },
      { name: "G", x: 0, y: 0, dx: -1, dy: 0, length: 12 },
      { name: "S", x: 0, y: 9.6, dx: -1, dy: 0, length: 12 },
    ],
  },
  {
    id: "nmos-2n7000",
    kind: "nmos",
    label: "2N7000",
    value: "2N7000",
    prefix: "M",
    bodyPathIds: ["path20", "path21", "path22", "path23"],
    bodyOrigin: { x: 547.2, y: 278.4 },
    styleOverrides: { path23: { stroke: "#111827" } },
    terminals: [
      { name: "D", x: 0, y: -9.6, dx: -1, dy: 0, length: 12 },
      { name: "G", x: 0, y: 0, dx: -1, dy: 0, length: 12 },
      { name: "S", x: 0, y: 9.6, dx: -1, dy: 0, length: 12 },
    ],
  },

  // —— 运放 OP07（DIP-8，标准单运放引脚）——
  {
    id: "op07",
    kind: "generic",
    label: "OP07 运放",
    value: "OP07",
    prefix: "U",
    bodyPathIds: ["path10", "path11", "path2", "path3", "path4", "path5", "path6", "path7", "path8", "path9"],
    bodyOrigin: { x: 379.2, y: 273.6 },
    terminals: [
      { name: "OFFSET", x: -14.4, y: -14.4, dx: 0, dy: 0, length: 0 },
      { name: "IN-", x: -14.4, y: -4.8, dx: 0, dy: 0, length: 0 },
      { name: "IN+", x: -14.4, y: 4.8, dx: 0, dy: 0, length: 0 },
      { name: "V-", x: -14.4, y: 14.4, dx: 0, dy: 0, length: 0 },
      { name: "OFFSET", x: 14.4, y: -14.4, dx: 0, dy: 0, length: 0 },
      { name: "OUT", x: 14.4, y: -4.8, dx: 0, dy: 0, length: 0 },
      { name: "V+", x: 14.4, y: 4.8, dx: 0, dy: 0, length: 0 },
      { name: "NC", x: 14.4, y: 14.4, dx: 0, dy: 0, length: 0 },
    ],
    rigid: true,
  },
];

/** 已构建好的符号（归一化身体模板 + 目录元数据）。 */
export interface BuiltSymbol {
  entry: CatalogEntry;
  /** 归一化后的身体 <g>：bodyOrigin 位于原点，可直接 clone。 */
  template: SVGGElement;
}

/** 从 parts.svg 构建所有元件的身体符号（key = 目录 id）。 */
export function buildSymbols(partsSvg: SVGSVGElement): Map<string, BuiltSymbol> {
  const map = new Map<string, BuiltSymbol>();
  for (const entry of CATALOG) {
    const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("transform", `translate(${-entry.bodyOrigin.x} ${-entry.bodyOrigin.y})`);
    g.dataset.symbolId = entry.id;
    for (const pid of entry.bodyPathIds) {
      const el = partsSvg.querySelector(`#${pid}`);
      if (!el) continue;
      const clone = el.cloneNode(true) as SVGElement;
      const ov = entry.styleOverrides?.[pid];
      if (ov) {
        if (ov.fill) clone.setAttribute("fill", ov.fill);
        if (ov.stroke) clone.setAttribute("stroke", ov.stroke);
      }
      g.appendChild(clone);
    }
    map.set(entry.id, { entry, template: g });
  }
  return map;
}

/** 按目录 id 查找。 */
export function getEntry(id: string): CatalogEntry {
  const e = CATALOG.find((c) => c.id === id);
  if (!e) throw new Error(`未知元件目录项: ${id}`);
  return e;
}
