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
  const pins = entry.terminals.map((t) => {
    const term = rotateOffset(t.x, t.y, rotation);
    const lead = rotateOffset(t.dx * t.length, t.dy * t.length, rotation);
    const end = { x: x + term.x + lead.x, y: y + term.y + lead.y };
    const node = nearestNode(layout, end.x, end.y, 22);
    return { name: t.name, x: t.x, y: t.y, node: node?.id };
  });

  return {
    id,
    kind: entry.kind,
    refdes,
    value: entry.value,
    pins,
    x,
    y,
    rotation,
  };
}
