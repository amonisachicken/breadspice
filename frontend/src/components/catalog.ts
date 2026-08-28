// SPDX-License-Identifier: GPL-3.0-only

/**
 * 元件目录 —— 把 assets/parts.svg 拆成独立元件符号，并标注引脚。
 *
 * parts.svg 是一张“符号表”，每个元件由若干 <path> 组成（各自带 transform）。
 * 这里按 path id 把每个元件聚成一组，并归一化到「pin1 为原点」的局部坐标系；
 * 引脚坐标以 viewBox 单位表示（与面包板孔位同一坐标系，便于直接吸附）。
 *
 * 几何要点（已从 SVG 实测）：
 * - 两脚元件（电阻/LED/电容/电解电容）引脚尖端相距 160（局部）= 76.8（viewBox）= 8 个孔距；
 * - 三脚（三极管）与 IC 引脚间距 20（局部）= 9.6（viewBox）= 1 个孔距，
 *   正好与面包板孔距一致，可逐孔对齐。
 */

import type { ComponentKind } from "../types/domain";
import { SVG_NS } from "../render/svgAsset";

/** 引脚定义（相对 pin1 的偏移，viewBox 单位）。 */
export interface PinDef {
  name: string;
  x: number;
  y: number;
}

/** 一个元件目录项。 */
export interface CatalogEntry {
  /** 唯一 id（同 kind 可以有多个不同符号，如两种电容）。 */
  id: string;
  kind: ComponentKind;
  label: string;
  /** 默认参数值。 */
  value: string;
  /** 引用名前缀（R/C/D/Q/U…）。 */
  prefix: string;
  /** parts.svg 中构成该符号的 path id 列表。 */
  pathIds: string[];
  /** pin1 在 parts.svg viewBox 坐标系中的绝对位置（用于归一化）。 */
  origin: { x: number; y: number };
  pins: PinDef[];
}

/** 元件目录（顺序即面板显示顺序）。 */
export const CATALOG: CatalogEntry[] = [
  {
    id: "diode",
    kind: "diode",
    label: "二极管",
    value: "1N4148",
    prefix: "D",
    pathIds: ["path12", "path13", "path14", "path15"],
    origin: { x: 441.6, y: 239.04 },
    pins: [
      { name: "a", x: 0, y: 0 },
      { name: "k", x: 0, y: 76.8 },
    ],
  },
  {
    id: "led",
    kind: "led",
    label: "LED",
    value: "red",
    prefix: "D",
    pathIds: ["path16", "path17", "path18", "path19"],
    origin: { x: 489.6, y: 239.04 },
    pins: [
      { name: "a", x: 0, y: 0 },
      { name: "k", x: 0, y: 76.8 },
    ],
  },
  {
    id: "capacitor",
    kind: "capacitor",
    label: "电容",
    value: "10u",
    prefix: "C",
    pathIds: ["path24", "path25"],
    origin: { x: 585.6, y: 239.04 },
    pins: [
      { name: "1", x: 0, y: 0 },
      { name: "2", x: 0, y: 76.8 },
    ],
  },
  {
    id: "resistor",
    kind: "resistor",
    label: "电阻",
    value: "1k",
    prefix: "R",
    pathIds: ["path26", "path27"],
    origin: { x: 643.2, y: 239.04 },
    pins: [
      { name: "1", x: 0, y: 0 },
      { name: "2", x: 0, y: 76.8 },
    ],
  },
  {
    id: "npn",
    kind: "npn",
    label: "NPN 三极管",
    value: "2N3904",
    prefix: "Q",
    pathIds: ["path20", "path21", "path22", "path23"],
    origin: { x: 547.2, y: 268.8 },
    pins: [
      { name: "E", x: 0, y: 0 },
      { name: "B", x: 0, y: 9.6 },
      { name: "C", x: 0, y: 19.2 },
    ],
  },
  {
    id: "ic8",
    kind: "generic",
    label: "IC (DIP-8)",
    value: "NE555",
    prefix: "U",
    pathIds: ["path2", "path3", "path4", "path5", "path6", "path7", "path8", "path9", "path10", "path11"],
    origin: { x: 364.8, y: 259.2 },
    pins: [
      { name: "1", x: 0, y: 0 },
      { name: "2", x: 0, y: 9.6 },
      { name: "3", x: 0, y: 19.2 },
      { name: "4", x: 0, y: 28.8 },
      { name: "5", x: 28.8, y: 0 },
      { name: "6", x: 28.8, y: 9.6 },
      { name: "7", x: 28.8, y: 19.2 },
      { name: "8", x: 28.8, y: 28.8 },
    ],
  },
];

/** 已构建好的符号（归一化后的模板 + 目录元数据）。 */
export interface BuiltSymbol {
  entry: CatalogEntry;
  /** 归一化后的符号组：pin1 位于原点，可直接 clone 到放置层。 */
  template: SVGGElement;
}

/** 从 parts.svg 构建所有元件符号（key = catalog id）。 */
export function buildSymbols(partsSvg: SVGSVGElement): Map<string, BuiltSymbol> {
  const map = new Map<string, BuiltSymbol>();
  for (const entry of CATALOG) {
    const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("transform", `translate(${-entry.origin.x} ${-entry.origin.y})`);
    g.dataset.symbolId = entry.id;
    for (const pid of entry.pathIds) {
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
