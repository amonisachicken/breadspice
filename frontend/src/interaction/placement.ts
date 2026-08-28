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
    pins,
    x: bx,
    y: by,
    rotation,
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
