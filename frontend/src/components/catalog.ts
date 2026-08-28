// SPDX-License-Identifier: GPL-3.0-only

/**
 * 元件目录 —— 把 assets/parts.svg 拆成「刚性身体 + 可伸缩引线端子」。
 *
 * 模型：每个元件由一块刚性身体（可任意角度旋转）和若干「橡皮筋」引线组成；
 * 引线从身体上的端子连到面包板孔位，可各自拖拽伸缩。
 *
 * 端子坐标以 viewBox 单位给出，`x`/`y` 是相对 bodyOrigin 的偏移。
 * 引线默认方向为单位向量（dx, dy），默认长度见 `length`。
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
  /** 默认引线长度（viewBox 单位）。 */
  length: number;
}

/** 一个元件目录项。 */
export interface CatalogEntry {
  id: string;
  kind: ComponentKind;
  label: string;
  value: string;
  prefix: string;
  /** 构成刚性身体的 path id（不含可伸缩引线）。 */
  bodyPathIds: string[];
  /** body 归一化参考点（viewBox 坐标，通常为身体中心）。 */
  bodyOrigin: { x: number; y: number };
  /** 可伸缩引线端子。 */
  terminals: TerminalDef[];
}

/** 元件目录（顺序即面板显示顺序）。 */
export const CATALOG: CatalogEntry[] = [
  {
    id: "diode",
    kind: "diode",
    label: "二极管",
    value: "1N4148",
    prefix: "D",
    bodyPathIds: ["path13", "path14", "path15"],
    bodyOrigin: { x: 441.6, y: 278.4 },
    terminals: [
      { name: "a", x: 0, y: -12, dx: 0, dy: -1, length: 27 },
      { name: "k", x: 0, y: 12, dx: 0, dy: 1, length: 27 },
    ],
  },
  {
    id: "led",
    kind: "led",
    label: "LED",
    value: "red",
    prefix: "D",
    bodyPathIds: ["path17", "path18", "path19"],
    bodyOrigin: { x: 489.6, y: 278.2 },
    terminals: [
      { name: "a", x: 0, y: -10.8, dx: 0, dy: -1, length: 27 },
      { name: "k", x: 0, y: 10.8, dx: 0, dy: 1, length: 27 },
    ],
  },
  {
    id: "capacitor",
    kind: "capacitor",
    label: "电容",
    value: "10u",
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
    value: "1k",
    prefix: "R",
    bodyPathIds: ["path27"],
    bodyOrigin: { x: 643.2, y: 278.07 },
    terminals: [
      { name: "1", x: 0, y: -13.11, dx: 0, dy: -1, length: 26 },
      { name: "2", x: 0, y: 13.11, dx: 0, dy: 1, length: 26 },
    ],
  },
  {
    id: "npn",
    kind: "npn",
    label: "NPN 三极管",
    value: "2N3904",
    prefix: "Q",
    bodyPathIds: ["path20", "path21", "path22", "path23"],
    bodyOrigin: { x: 547.2, y: 278.4 },
    terminals: [
      { name: "E", x: 0, y: -9.6, dx: -1, dy: 0, length: 12 },
      { name: "B", x: 0, y: 0, dx: -1, dy: 0, length: 12 },
      { name: "C", x: 0, y: 9.6, dx: -1, dy: 0, length: 12 },
    ],
  },
  {
    id: "ic8",
    kind: "generic",
    label: "IC (DIP-8)",
    value: "NE555",
    prefix: "U",
    bodyPathIds: ["path10", "path11"],
    bodyOrigin: { x: 379.2, y: 273.6 },
    terminals: [
      { name: "1", x: -14.4, y: -14.4, dx: -1, dy: 0, length: 12 },
      { name: "2", x: -14.4, y: -4.8, dx: -1, dy: 0, length: 12 },
      { name: "3", x: -14.4, y: 4.8, dx: -1, dy: 0, length: 12 },
      { name: "4", x: -14.4, y: 14.4, dx: -1, dy: 0, length: 12 },
      { name: "5", x: 14.4, y: -14.4, dx: 1, dy: 0, length: 12 },
      { name: "6", x: 14.4, y: -4.8, dx: 1, dy: 0, length: 12 },
      { name: "7", x: 14.4, y: 4.8, dx: 1, dy: 0, length: 12 },
      { name: "8", x: 14.4, y: 14.4, dx: 1, dy: 0, length: 12 },
    ],
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
      if (el) g.appendChild(el.cloneNode(true) as SVGElement);
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
