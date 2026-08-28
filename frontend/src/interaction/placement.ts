// SPDX-License-Identifier: GPL-3.0-only

/**
 * 放置几何工具：旋转偏移、最近孔位查找、由目录项构造实例。
 */

import type {
  BreadboardLayout,
  BreadboardNode,
  ComponentInstance,
  ComponentRotation,
} from "../types/domain";
import type { CatalogEntry } from "../components/catalog";

/** 把相对偏移按任意角度旋转（围绕原点）。 */
export function rotateOffset(
  dx: number,
  dy: number,
  deg: ComponentRotation,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** 在 viewBox 坐标中查找最近的孔位（可选最大距离，返回 null 表示超出）。 */
export function nearestNode(
  layout: BreadboardLayout,
  x: number,
  y: number,
  maxDist = Infinity,
): BreadboardNode | null {
  let best: BreadboardNode | null = null;
  let bestDist = Infinity;
  for (const node of layout.nodes) {
    const dx = node.x - x;
    const dy = node.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  if (best === null || Math.sqrt(bestDist) > maxDist) return null;
  return best;
}

/**
 * 由目录项构造一个已放置实例：身体位于 (x, y)、旋转 rotation，
 * 每个引脚的默认端点按「端子 + 默认引线向量」计算并吸附到最近孔位。
 */
export function buildInstance(
  entry: CatalogEntry,
  id: string,
  refdes: string,
  x: number,
  y: number,
  rotation: ComponentRotation,
  layout: BreadboardLayout,
): ComponentInstance {
  let bx = x;
  let by = y;

  // 刚性引脚元件（如 DIP-8）：整体吸附，使 pin1 落在最近孔位，其余引脚保持固定偏移。
  if (entry.rigid && entry.terminals.length > 0) {
    const p1 = entry.terminals[0];
    const r = rotateOffset(p1.x, p1.y, rotation);
    const p1abs = { x: bx + r.x, y: by + r.y };
    const hole = nearestNode(layout, p1abs.x, p1abs.y, 40);
    if (hole) {
      bx += hole.x - p1abs.x;
      by += hole.y - p1abs.y;
    }
  }

  const pins = entry.terminals.map((t) => {
    const term = rotateOffset(t.x, t.y, rotation);
    const lead = rotateOffset(t.dx * t.length, t.dy * t.length, rotation);
    const end = { x: bx + term.x + lead.x, y: by + term.y + lead.y };
    const node = nearestNode(layout, end.x, end.y, 22);
    return { name: t.name, x: t.x, y: t.y, node: node?.id };
  });

  return {
    id,
    kind: entry.kind,
    refdes,
    value: entry.value,
    unit: entry.unit,
    pins,
    x: bx,
    y: by,
    rotation,
    params: entry.params ? { ...entry.params } : undefined,
  };
}

/**
 * 刚性引脚元件（DIP-8）的锁定 x 坐标：让最左引脚落在端子排 e 列，
 * 从而最右引脚自然落在 f 列（跨过中间凹槽）。非 rigid 返回 null。
 */
export function getRigidLockX(
  layout: BreadboardLayout,
  entry: CatalogEntry,
): number | null {
  if (!entry.rigid) return null;
  const colE = layout.nodes.find((n) => n.row === "e");
  const minX = entry.terminals.reduce((m, t) => Math.min(m, t.x), Infinity);
  if (!colE || minX === Infinity) return null;
  return colE.x - minX;
}

/**
 * 重新计算（重置）某个已放置元件的引脚连接：按「端子 + 默认引线向量」
 * 重新吸附到最近孔位。旋转后调用，使引脚跟随新朝向。
 */
export function reSnapPins(
  entry: CatalogEntry,
  ins: ComponentInstance,
  layout: BreadboardLayout,
): void {
  ins.pins = entry.terminals.map((t) => {
    const term = rotateOffset(t.x, t.y, ins.rotation);
    const lead = rotateOffset(t.dx * t.length, t.dy * t.length, ins.rotation);
    const end = { x: ins.x + term.x + lead.x, y: ins.y + term.y + lead.y };
    const node = nearestNode(layout, end.x, end.y, 22);
    return { name: t.name, x: t.x, y: t.y, node: node?.id };
  });
}

/** 刚性元件（DIP-8）在 x 已锁定到 e/f 列后，把 y 吸附到孔位行。 */
export function snapRigidY(
  layout: BreadboardLayout,
  entry: CatalogEntry,
  x: number,
  y: number,
  rotation: ComponentRotation,
): number {
  const p1 = entry.terminals[0];
  const r1 = rotateOffset(p1.x, p1.y, rotation);
  const target = { x: x + r1.x, y: y + r1.y };
  const hole = nearestNode(layout, target.x, target.y, 40);
  return hole ? hole.y - r1.y : y;
}

/**
 * 构造导线实例：端点 1 吸附在 (x, y) 附近孔位，端点 2 默认向
 * 右（或向下，vertical=true）延伸 36 单位后吸附最近孔位。
 * curve=true 时为弯导线，附加一个位于两端点中点的贝塞尔控制点。
 */
export function buildWireInstance(
  id: string,
  refdes: string,
  x: number,
  y: number,
  vertical: boolean,
  curve: boolean,
  color: string,
  layout: BreadboardLayout,
): ComponentInstance {
  const h1 = nearestNode(layout, x, y, 40);
  const s1 = { x: h1 ? h1.x : x, y: h1 ? h1.y : y };
  const ex = vertical ? s1.x : s1.x + 36;
  const ey = vertical ? s1.y + 36 : s1.y;
  const h2 = nearestNode(layout, ex, ey, 40) ?? nearestNode(layout, ex, ey);
  const s2 = { x: h2 ? h2.x : ex, y: h2 ? h2.y : ey };

  return {
    id,
    kind: "wire",
    refdes,
    value: "",
    pins: [
      { name: "1", x: s1.x, y: s1.y, node: h1?.id },
      { name: "2", x: s2.x, y: s2.y, node: h2?.id },
    ],
    x: (s1.x + s2.x) / 2,
    y: (s1.y + s2.y) / 2,
    rotation: 0,
    control: curve ? { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 } : undefined,
    color,
  };
}

/** 把导线整体绕两端点中点旋转 90°（控制点跟随），并重新吸附端点。 */
export function rotateWire(ins: ComponentInstance, layout: BreadboardLayout): void {
  const e0 = ins.pins[0];
  const e1 = ins.pins[1];
  if (!e0 || !e1) return;
  const cx = (e0.x + e1.x) / 2;
  const cy = (e0.y + e1.y) / 2;
  const rot = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: cx - (p.y - cy),
    y: cy + (p.x - cx),
  });

  const n0 = rot(e0);
  const n1 = rot(e1);
  e0.x = n0.x;
  e0.y = n0.y;
  e1.x = n1.x;
  e1.y = n1.y;
  const h0 = nearestNode(layout, e0.x, e0.y, 24);
  const h1 = nearestNode(layout, e1.x, e1.y, 24);
  if (h0) {
    e0.x = h0.x;
    e0.y = h0.y;
    e0.node = h0.id;
  }
  if (h1) {
    e1.x = h1.x;
    e1.y = h1.y;
    e1.node = h1.id;
  }
  if (ins.control) {
    const nc = rot(ins.control);
    ins.control.x = nc.x;
    ins.control.y = nc.y;
  }
}
