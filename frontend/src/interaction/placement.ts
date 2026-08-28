/**
 * 放置几何工具：旋转偏移、最近孔位查找、由目录项 + 锚点构造实例。
 */

import type {
  BreadboardLayout,
  BreadboardNode,
  ComponentInstance,
  ComponentRotation,
} from "../types/domain";
import type { CatalogEntry } from "../components/catalog";

/** 把一个相对偏移按角度旋转（围绕 pin1 原点）。 */
export function rotateOffset(
  dx: number,
  dy: number,
  deg: ComponentRotation,
): { x: number; y: number } {
  switch (deg) {
    case 0:
      return { x: dx, y: dy };
    case 90:
      return { x: -dy, y: dx };
    case 180:
      return { x: -dx, y: -dy };
    case 270:
      return { x: dy, y: -dx };
  }
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
 * 由目录项 + 锚点孔位 + 旋转角构造一个已放置的 {@link ComponentInstance}。
 * 每个引脚会根据旋转后的偏移吸附到最近的孔位，并把孔位所属节点写入 `pin.node`，
 * 这样电路可直接交给后端生成网表。
 */
export function buildInstance(
  entry: CatalogEntry,
  id: string,
  refdes: string,
  anchorNodeId: string,
  rotation: ComponentRotation,
  layout: BreadboardLayout,
): ComponentInstance {
  const anchor = layout.nodes.find((n) => n.id === anchorNodeId);
  if (!anchor) throw new Error(`锚点孔位不存在: ${anchorNodeId}`);

  const pins = entry.pins.map((pin) => {
    const r = rotateOffset(pin.x, pin.y, rotation);
    const abs = { x: anchor.x + r.x, y: anchor.y + r.y };
    const node = nearestNode(layout, abs.x, abs.y, 12); // 12 viewBox 单位内的孔位
    return { name: pin.name, x: pin.x, y: pin.y, node: node?.id };
  });

  return {
    id,
    kind: entry.kind,
    refdes,
    value: entry.value,
    pins,
    anchorNode: anchorNodeId,
    rotation,
  };
}
