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

/** 导线默认颜色。 */
export const DEFAULT_WIRE_COLOR = "#2563eb";

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
  /** 双击元件时的介绍文本（半导体/IC 用，可含换行）。 */
  info?: string;
  /** 程序化绘制身体（无 SVG 资产的元件，如电池）。 */
  bodyFactory?: () => SVGGElement;
  /** 弯导线（kind="wire" 且 curve=true 时为平滑贝塞尔曲线）。 */
  curve?: boolean;
  /** 元件默认参数（如正弦源的 freq/ac/dc/phase），放置时复制到实例。 */
  params?: Record<string, string>;
}

const DIODE_TERMINALS: TerminalDef[] = [
  { name: "a", x: 0, y: -12, dx: 0, dy: -1, length: 27 },
  { name: "k", x: 0, y: 12, dx: 0, dy: 1, length: 27 },
];

const LED_TERMINALS: TerminalDef[] = [
  { name: "a", x: 0, y: -10.8, dx: 0, dy: -1, length: 27 },
  { name: "k", x: 0, y: 10.8, dx: 0, dy: 1, length: 27 },
];

/** 程序化绘制电池身体（局部坐标，原点为身体中心）。 */
function batteryBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;

  const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  rect.setAttribute("x", "-7");
  rect.setAttribute("y", "-10");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "20");
  rect.setAttribute("rx", "2");
  rect.setAttribute("fill", "#f59e0b");
  rect.setAttribute("stroke", "#b45309");
  rect.setAttribute("stroke-width", "1");
  g.appendChild(rect);

  const plus = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  plus.setAttribute("x", "0");
  plus.setAttribute("y", "-4");
  plus.setAttribute("text-anchor", "middle");
  plus.setAttribute("font-size", "6");
  plus.setAttribute("font-weight", "bold");
  plus.setAttribute("fill", "#111827");
  plus.textContent = "+";
  g.appendChild(plus);

  const minus = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  minus.setAttribute("x", "0");
  minus.setAttribute("y", "6");
  minus.setAttribute("text-anchor", "middle");
  minus.setAttribute("font-size", "6");
  minus.setAttribute("font-weight", "bold");
  minus.setAttribute("fill", "#111827");
  minus.textContent = "−";
  g.appendChild(minus);

  return g;
}

/** 程序化绘制正弦波发生器身体（圆 + 正弦曲线）。 */
function sineSourceBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;

  const circle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  circle.setAttribute("cx", "0");
  circle.setAttribute("cy", "0");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "#ffffff");
  circle.setAttribute("stroke", "#111827");
  circle.setAttribute("stroke-width", "1");
  g.appendChild(circle);

  const wave = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  wave.setAttribute("d", "M -5 0 C -3.5 -5, -1.5 5, 0 0 C 1.5 -5, 3.5 5, 5 0");
  wave.setAttribute("fill", "none");
  wave.setAttribute("stroke", "#111827");
  wave.setAttribute("stroke-width", "1");
  g.appendChild(wave);

  return g;
}

/** 程序化绘制电压表身体（圆 + V）。 */
function voltmeterBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const circle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  circle.setAttribute("cx", "0");
  circle.setAttribute("cy", "0");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "#ffffff");
  circle.setAttribute("stroke", "#111827");
  circle.setAttribute("stroke-width", "1");
  g.appendChild(circle);

  const v = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  v.setAttribute("x", "0");
  v.setAttribute("y", "2.5");
  v.setAttribute("text-anchor", "middle");
  v.setAttribute("font-size", "7");
  v.setAttribute("font-weight", "bold");
  v.setAttribute("fill", "#2563eb");
  v.textContent = "V";
  g.appendChild(v);
  return g;
}

/** 程序化绘制电流表身体（圆 + A）。 */
function ammeterBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const circle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  circle.setAttribute("cx", "0");
  circle.setAttribute("cy", "0");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "#ffffff");
  circle.setAttribute("stroke", "#111827");
  circle.setAttribute("stroke-width", "1");
  g.appendChild(circle);

  const a = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  a.setAttribute("x", "0");
  a.setAttribute("y", "2.5");
  a.setAttribute("text-anchor", "middle");
  a.setAttribute("font-size", "7");
  a.setAttribute("font-weight", "bold");
  a.setAttribute("fill", "#dc2626");
  a.textContent = "A";
  g.appendChild(a);
  return g;
}

/** 程序化绘制示波器身体（暗色屏幕 + 绿色迹线）。 */
function oscilloscopeBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;

  const screen = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  screen.setAttribute("x", "-11");
  screen.setAttribute("y", "-8");
  screen.setAttribute("width", "22");
  screen.setAttribute("height", "16");
  screen.setAttribute("rx", "2");
  screen.setAttribute("fill", "#0f172a");
  screen.setAttribute("stroke", "#111827");
  screen.setAttribute("stroke-width", "1");
  g.appendChild(screen);

  const trace = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  trace.setAttribute("d", "M -9 0 L -6 -1 L -3 1 L 0 -1 L 3 1 L 6 -1 L 9 0");
  trace.setAttribute("fill", "none");
  trace.setAttribute("stroke", "#22c55e");
  trace.setAttribute("stroke-width", "1");
  g.appendChild(trace);

  return g;
}

/** 程序化绘制接地符号（竖线 + 横条 + 三条递减斜线）。 */
function groundBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const stroke = "#111827";
  const w = "1.5";

  const addLine = (x1: number, y1: number, x2: number, y2: number): void => {
    const l = document.createElementNS(SVG_NS, "line") as SVGLineElement;
    l.setAttribute("x1", String(x1));
    l.setAttribute("y1", String(y1));
    l.setAttribute("x2", String(x2));
    l.setAttribute("y2", String(y2));
    l.setAttribute("stroke", stroke);
    l.setAttribute("stroke-width", w);
    g.appendChild(l);
  };

  addLine(0, -8, 0, 0); // 从引脚到横条
  addLine(-7, 0, 7, 0); // 横条
  addLine(-6, 3, 6, 3); // 三条递减斜线
  addLine(-3.5, 5.5, 3.5, 5.5);
  addLine(-1, 8, 1, 8);

  return g;
}

/** 程序化绘制音频输入符号（圆角矩形 + WAV 字样）。 */
function audioBody(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;

  const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  rect.setAttribute("x", "-11");
  rect.setAttribute("y", "-9");
  rect.setAttribute("width", "22");
  rect.setAttribute("height", "18");
  rect.setAttribute("rx", "2");
  rect.setAttribute("fill", "#e0f2fe");
  rect.setAttribute("stroke", "#0284c7");
  rect.setAttribute("stroke-width", "1");
  g.appendChild(rect);

  const text = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  text.setAttribute("x", "0");
  text.setAttribute("y", "2.5");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "6");
  text.setAttribute("font-weight", "bold");
  text.setAttribute("fill", "#0369a1");
  text.textContent = "WAV";
  g.appendChild(text);

  return g;
}

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
    info: "1N4148 硅开关二极管\n正向压降 VF ≈ 0.7 V\n引脚：a 阳极（+）、k 阴极（−，色环端）",
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
    info: "1N5817 肖特基二极管\n正向压降 VF ≈ 0.3 V\n引脚：a 阳极（+）、k 阴极（−，色环端）",
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
    info: "红色 LED 发光二极管\n正向压降 VF ≈ 1.8–2.2 V\n引脚：a 阳极（+，长脚）、k 阴极（−，短脚/平边）",
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
    info: "绿色 LED 发光二极管\n正向压降 VF ≈ 2.0–3.0 V\n引脚：a 阳极（+，长脚）、k 阴极（−，短脚/平边）",
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
    info: "蓝色 LED 发光二极管\n正向压降 VF ≈ 2.8–3.4 V\n引脚：a 阳极（+，长脚）、k 阴极（−，短脚/平边）",
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

  // —— 电位器（3 脚：1/2/3，后端展开为两个串联电阻 R1、R2）——
  {
    id: "potentiometer",
    kind: "potentiometer",
    label: "电位器",
    value: "10",
    unit: "kΩ",
    prefix: "P",
    bodyPathIds: ["pot5", "pot6", "pot7", "pot8", "pot2", "pot3", "pot4"],
    bodyOrigin: { x: 30.24, y: 30.24 },
    terminals: [
      { name: "1", x: -19.44, y: 39.12, dx: 0, dy: 1, length: 18 },
      { name: "2", x: -0.24, y: 39.12, dx: 0, dy: 1, length: 18 },
      { name: "3", x: 23.76, y: 39.12, dx: 0, dy: 1, length: 18 },
    ],
    params: { percent: "0.5" },
    info:
      "电位器（可变电阻）\n" +
      "引脚 1/3 为两端，2 为滑动端（中间抽头）\n" +
      "总阻值 = R1 + R2，R1 = 引脚 1–2，R2 = 引脚 2–3\n" +
      "双击设置总阻值与百分比（R1/(R1+R2)）",
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
    info: "BC549C NPN 三极管\n极性：NPN（C 集电极流入、E 发射极流出）\n引脚（上→下）：C 集电极、B 基极、E 发射极",
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
    info: "BC559C PNP 三极管\n极性：PNP（E 发射极流入、C 集电极流出）\n引脚（上→下）：C 集电极、B 基极、E 发射极",
  },
  {
    id: "jfet-j201",
    kind: "jfet",
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
    info: "J201 N 沟道结型场效应管（JFET）\n引脚（上→下）：D 漏极、G 栅极、S 源极",
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
    info: "2N7000 N 沟道 MOSFET\n引脚（上→下）：D 漏极、G 栅极、S 源极",
  },

  // —— 运放 OP07（DIP-8，标准单运放引脚）——
  {
    id: "op07",
    kind: "opamp",
    label: "OP07 运放",
    value: "OP07",
    prefix: "U",
    bodyPathIds: ["path10", "path11", "path2", "path3", "path4", "path5", "path6", "path7", "path8", "path9"],
    bodyOrigin: { x: 379.2, y: 273.6 },
    terminals: [
      { name: "OFFSET", x: -14.4, y: -14.4, dx: 0, dy: 0, length: 0 }, // pin 1
      { name: "IN-", x: -14.4, y: -4.8, dx: 0, dy: 0, length: 0 }, // pin 2
      { name: "IN+", x: -14.4, y: 4.8, dx: 0, dy: 0, length: 0 }, // pin 3
      { name: "V-", x: -14.4, y: 14.4, dx: 0, dy: 0, length: 0 }, // pin 4
      { name: "NC", x: 14.4, y: -14.4, dx: 0, dy: 0, length: 0 }, // pin 8（右上）
      { name: "V+", x: 14.4, y: -4.8, dx: 0, dy: 0, length: 0 }, // pin 7
      { name: "OUT", x: 14.4, y: 4.8, dx: 0, dy: 0, length: 0 }, // pin 6
      { name: "OFFSET", x: 14.4, y: 14.4, dx: 0, dy: 0, length: 0 }, // pin 5（右下）
    ],
    rigid: true,
    info:
      "OP07 精密运算放大器（DIP-8）\n" +
      "       ┌──────┐\n" +
      " OFFSET│1    8│NC\n" +
      "   IN- │2    7│V+\n" +
      "   IN+ │3    6│OUT\n" +
      "    V- │4    5│OFFSET\n" +
      "       └──────┘\n" +
      "1/5 OFFSET 调零，2 IN−，3 IN+，4 V−，6 OUT，7 V+，8 NC",
  },

  // —— OP207 双运放（DIP-8，内部两个 OP07A 单运放，共用 V+/V-）——
  {
    id: "op207",
    kind: "opamp2",
    label: "OP207 双运放",
    value: "OP207",
    prefix: "U",
    bodyPathIds: ["path10", "path11", "path2", "path3", "path4", "path5", "path6", "path7", "path8", "path9"],
    bodyOrigin: { x: 379.2, y: 273.6 },
    terminals: [
      { name: "OUTA", x: -14.4, y: -14.4, dx: 0, dy: 0, length: 0 },
      { name: "INA-", x: -14.4, y: -4.8, dx: 0, dy: 0, length: 0 },
      { name: "INA+", x: -14.4, y: 4.8, dx: 0, dy: 0, length: 0 },
      { name: "V-", x: -14.4, y: 14.4, dx: 0, dy: 0, length: 0 },
      { name: "V+", x: 14.4, y: -14.4, dx: 0, dy: 0, length: 0 },
      { name: "OUTB", x: 14.4, y: -4.8, dx: 0, dy: 0, length: 0 },
      { name: "INB-", x: 14.4, y: 4.8, dx: 0, dy: 0, length: 0 },
      { name: "INB+", x: 14.4, y: 14.4, dx: 0, dy: 0, length: 0 },
    ],
    rigid: true,
    styleOverrides: {
      path2: { fill: "#C9A227", stroke: "#9A7A1C" },
      path3: { fill: "#C9A227", stroke: "#9A7A1C" },
      path4: { fill: "#C9A227", stroke: "#9A7A1C" },
      path5: { fill: "#C9A227", stroke: "#9A7A1C" },
      path6: { fill: "#C9A227", stroke: "#9A7A1C" },
      path7: { fill: "#C9A227", stroke: "#9A7A1C" },
      path8: { fill: "#C9A227", stroke: "#9A7A1C" },
      path9: { fill: "#C9A227", stroke: "#9A7A1C" },
    },
    info:
      "OP207 双运算放大器（DIP-8，内部两个 OP07A 单运放）\n" +
      "       ┌──────┐\n" +
      " OUT A │1    8│V+\n" +
      " IN− A │2    7│OUT B\n" +
      " IN+ A │3    6│IN− B\n" +
      "    V− │4    5│IN+ B\n" +
      "       └──────┘\n" +
      "两个运放共用 V+（8 脚）与 V−（4 脚）",
  },

  // —— 电池（直流电压源，映射到 ngspice V 器件）——
  {
    id: "battery",
    kind: "power",
    label: "电池",
    value: "9",
    unit: "V",
    prefix: "B",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: batteryBody,
    terminals: [
      { name: "+", x: 0, y: -10, dx: 0, dy: -1, length: 27 },
      { name: "−", x: 0, y: 10, dx: 0, dy: 1, length: 27 },
    ],
    info: "电池 / 直流电压源\n双击蓝点设置电压\n后端映射为 ngspice 电压源（V 器件）",
  },

  // —— 接地 / GND（引脚映射到 ngspice 节点 0）——
  {
    id: "gnd",
    kind: "gnd",
    label: "接地",
    value: "",
    prefix: "G",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: groundBody,
    terminals: [
      { name: "gnd", x: 0, y: -8, dx: 0, dy: -1, length: 20 },
    ],
    info: "接地 / GND\n引脚所在之处映射到 ngspice 节点 0（地）\n用于显式指定地参考",
  },

  // —— 导线（直导线 + 弯导线）——
  {
    id: "wire",
    kind: "wire",
    label: "直导线",
    value: "",
    prefix: "W",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    terminals: [
      { name: "1", x: 0, y: 0, dx: 0, dy: 0, length: 0 },
      { name: "2", x: 0, y: 0, dx: 0, dy: 0, length: 0 },
    ],
    info: "直导线（跳线）\n只能拖动两个端点改接孔位\n双击蓝点设置颜色，R 键旋转\n后端映射为近零电阻",
  },
  {
    id: "wire-curve",
    kind: "wire",
    label: "弯导线",
    value: "",
    prefix: "W",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    terminals: [
      { name: "1", x: 0, y: 0, dx: 0, dy: 0, length: 0 },
      { name: "2", x: 0, y: 0, dx: 0, dy: 0, length: 0 },
    ],
    curve: true,
    info: "弯导线（平滑曲线）\n拖动两端点改接孔位，拖动蓝点调整曲率\n双击蓝点设置颜色，R 键旋转\n后端映射为近零电阻",
  },

  // —— 正弦波发生器（ngspice 正弦电压源）——
  {
    id: "vsine",
    kind: "vsine",
    label: "正弦波发生器",
    value: "",
    prefix: "S",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: sineSourceBody,
    terminals: [
      { name: "+", x: 0, y: -9, dx: 0, dy: -1, length: 27 },
      { name: "−", x: 0, y: 9, dx: 0, dy: 1, length: 27 },
    ],
    params: { freq: "1k", ac: "0.2", dc: "0", phase: "0" },
    info: "正弦波发生器\n双击设置频率/交流电压/直流电压/相位\n后端映射为 ngspice 正弦电压源（SIN）",
  },

  // —— 音频输入（wave 文件转码后作为电压源）——
  {
    id: "audio",
    kind: "audio",
    label: "音频输入",
    value: "",
    prefix: "W",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: audioBody,
    terminals: [
      { name: "+", x: 0, y: -9, dx: 0, dy: -1, length: 27 },
      { name: "−", x: 0, y: 9, dx: 0, dy: 1, length: 27 },
    ],
    params: {},
    info: "音频输入\n双击上传音频文件（后端经 ffmpeg 转码为 44.1kHz/16-bit/单声道）\n作为电压源输入；含音频时仅允许 tran 仿真",
  },

  // —— 电压表（10GΩ 采样 + 读节点电压）——
  {
    id: "voltmeter",
    kind: "voltmeter",
    label: "电压表",
    value: "",
    prefix: "VM",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: voltmeterBody,
    terminals: [
      { name: "+", x: 0, y: -9, dx: 0, dy: -1, length: 27 },
      { name: "−", x: 0, y: 9, dx: 0, dy: 1, length: 27 },
    ],
    info: "电压表\n双击显示两端电压差\n后端映射为大电阻（10000MΩ）+ 读节点电压",
  },

  // —— 电流表（0V 电压源电流探针 + 读电流）——
  {
    id: "ammeter",
    kind: "ammeter",
    label: "电流表",
    value: "",
    prefix: "A",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: ammeterBody,
    terminals: [
      { name: "1", x: 0, y: -9, dx: 0, dy: -1, length: 27 },
      { name: "2", x: 0, y: 9, dx: 0, dy: 1, length: 27 },
    ],
    info: "电流表\n双击显示流经自身的电流\n后端映射为 0V 电压源电流探针（读 i(v<refdes>)）",
  },

  // —— 示波器（读 raw 波形）——
  {
    id: "oscilloscope",
    kind: "oscilloscope",
    label: "示波器",
    value: "",
    prefix: "X",
    bodyPathIds: [],
    bodyOrigin: { x: 0, y: 0 },
    bodyFactory: oscilloscopeBody,
    terminals: [
      { name: "tip", x: 0, y: -8, dx: 0, dy: -1, length: 27 },
      { name: "gnd", x: 0, y: 8, dx: 0, dy: 1, length: 27 },
    ],
    info: "示波器\n双击打开示波器屏幕\n后端读取 ngspice raw 文件并绘制波形",
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
    if (entry.bodyFactory) {
      g.appendChild(entry.bodyFactory());
    } else {
      for (const pid of entry.bodyPathIds) {
        const el = partsSvg.querySelector(`#${pid}`);
        if (!el) continue;
        const clone = el.cloneNode(true) as SVGElement;
        const ov = entry.styleOverrides?.[pid];
        if (ov) {
          // 源 SVG 的 fill/stroke 写在 style 属性里，优先级高于 presentation
          // attribute，因此必须改写内联 style 才能生效。
          if (ov.fill) clone.style.setProperty("fill", ov.fill);
          if (ov.stroke) clone.style.setProperty("stroke", ov.stroke);
        }
        g.appendChild(clone);
      }
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
