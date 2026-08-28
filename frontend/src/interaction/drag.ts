// SPDX-License-Identifier: GPL-3.0-only

/**
 * 拖拽交互 ——
 * 1. 从元件面板拖入放置（引脚端点吸附孔位）；
 * 2. 拖拽元件身体移动；
 * 3. 拖拽引脚端点（伸缩/改变方向，吸附孔位）；
 * 4. 拖拽旋转手柄（任意角度旋转，刚性 IC 除外）。
 *
 * 刚性 IC 锁定在端子排 e/f 两列，拖拽时高亮该两列。
 */

import type { BreadboardLayout, ComponentRotation } from "../types/domain";
import type { BuiltSymbol, CatalogEntry } from "../components/catalog";
import { DEFAULT_WIRE_COLOR } from "../components/catalog";
import { SVG_NS, clientToViewBox } from "../render/svgAsset";
import {
  addPlaced,
  getPlacedItem,
  nextId,
  nextRefdes,
  updatePlaced,
} from "../store/circuitStore";
import { buildInstance, buildWireInstance, getRigidLockX, nearestNode, rotateOffset, snapRigidY } from "./placement";

export interface DragContext {
  svg: SVGSVGElement;
  layout: BreadboardLayout;
  symbols: Map<string, BuiltSymbol>;
}

const DRAG_LAYER_ID = "component-drag-layer";
const IC_HIGHLIGHT_ID = "ic-column-highlight";

function ensureDragLayer(svg: SVGSVGElement): SVGGElement {
  let layer = svg.querySelector<SVGGElement>(`#${DRAG_LAYER_ID}`);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
    layer.setAttribute("id", DRAG_LAYER_ID);
    layer.setAttribute("pointer-events", "none");
    svg.appendChild(layer);
  }
  return layer;
}

/** 高亮/清除端子排 e、f 两列（IC 可放置区域）。 */
function setIcColumnHighlight(ctx: DragContext, visible: boolean): void {
  let layer = ctx.svg.querySelector<SVGGElement>(`#${IC_HIGHLIGHT_ID}`);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
    layer.setAttribute("id", IC_HIGHLIGHT_ID);
    layer.setAttribute("pointer-events", "none");
    ctx.svg.appendChild(layer);
  }
  layer.replaceChildren();
  if (!visible) return;

  const colE = ctx.layout.nodes.find((n) => n.row === "e");
  const colF = ctx.layout.nodes.find((n) => n.row === "f");
  if (!colE || !colF) return;
  const ys = ctx.layout.nodes.filter((n) => n.row === "e" || n.row === "f").map((n) => n.y);
  const minY = Math.min(...ys) - 6;
  const maxY = Math.max(...ys) + 6;

  const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  rect.setAttribute("x", (colE.x - 5).toFixed(2));
  rect.setAttribute("y", minY.toFixed(2));
  rect.setAttribute("width", (colF.x - colE.x + 10).toFixed(2));
  rect.setAttribute("height", (maxY - minY).toFixed(2));
  rect.setAttribute("fill", "rgba(37,99,235,0.16)");
  layer.appendChild(rect);
}

/** 1. 从面板拖入元件。 */
export function startComponentDrag(
  ctx: DragContext,
  entry: CatalogEntry,
  startClientX: number,
  startClientY: number,
): void {
  if (entry.kind === "wire") {
    startWireDrag(ctx, entry, startClientX, startClientY);
    return;
  }

  const symbol = ctx.symbols.get(entry.id);
  if (!symbol) return;

  const layer = ensureDragLayer(ctx.svg);
  const ghost = document.createElementNS(SVG_NS, "g") as SVGGElement;
  ghost.setAttribute("opacity", "0.85");
  ghost.appendChild(symbol.template.cloneNode(true));
  layer.appendChild(ghost);

  if (entry.rigid) setIcColumnHighlight(ctx, true);

  let rotation: ComponentRotation = 0;
  let last = clientToViewBox(ctx.svg, startClientX, startClientY);

  const apply = (): void => {
    ghost.setAttribute("transform", `translate(${last.x} ${last.y}) rotate(${rotation})`);
  };
  apply();

  const cleanup = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
    setIcColumnHighlight(ctx, false);
    ghost.remove();
  };

  function onMove(e: PointerEvent): void {
    last = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    apply();
    e.preventDefault();
  }

  function onKey(e: KeyboardEvent): void {
    if ((e.key === "r" || e.key === "R") && !entry.rigid) {
      rotation = (rotation + 90) % 360;
      apply();
      e.preventDefault();
    }
  }

  function onUp(e: PointerEvent): void {
    cleanup();
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    if (!nearestNode(ctx.layout, p.x, p.y, 40)) return;

    let px = p.x;
    let rot = rotation;
    const lockX = getRigidLockX(ctx.layout, entry);
    if (lockX !== null) {
      px = lockX;
      rot = 0;
    }
    const instance = buildInstance(entry, nextId(), nextRefdes(entry.prefix), px, p.y, rot, ctx.layout);
    addPlaced(entry.id, instance);
  }

  function onCancel(): void {
    cleanup();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey);
}

/** 2. 拖拽元件身体移动。 */
export function startBodyDrag(
  ctx: DragContext,
  componentId: string,
  startClientX: number,
  startClientY: number,
  onDone: (moved: boolean) => void,
): void {
  const item = getPlacedItem(componentId);
  if (!item) {
    onDone(false);
    return;
  }
  const entry = ctx.symbols.get(item.symbolId)?.entry;
  const ins = item.instance;
  const lockX = entry ? getRigidLockX(ctx.layout, entry) : null;
  const start = clientToViewBox(ctx.svg, startClientX, startClientY);
  const baseX = ins.x;
  const baseY = ins.y;
  let moved = false;

  if (entry?.rigid) setIcColumnHighlight(ctx, true);

  const onMove = (e: PointerEvent): void => {
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (Math.hypot(dx, dy) > 2) moved = true;
    updatePlaced(componentId, (i) => {
      if (entry?.rigid && lockX !== null) {
        i.x = lockX;
        i.y = snapRigidY(ctx.layout, entry, lockX, baseY + dy, i.rotation);
        i.pins.forEach((pin, idx) => {
          const t = entry.terminals[idx];
          const r = rotateOffset(t.x, t.y, i.rotation);
          const node = nearestNode(ctx.layout, i.x + r.x, i.y + r.y, 22);
          pin.node = node?.id;
        });
      } else {
        i.x = baseX + dx;
        i.y = baseY + dy;
      }
    });
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    setIcColumnHighlight(ctx, false);
    onDone(moved);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** 3. 拖拽引脚端点：伸缩/改变方向并吸附孔位。 */
export function startPinDrag(
  ctx: DragContext,
  componentId: string,
  pinIndex: number,
  startClientX: number,
  startClientY: number,
): void {
  const move = (clientX: number, clientY: number): void => {
    const p = clientToViewBox(ctx.svg, clientX, clientY);
    const node = nearestNode(ctx.layout, p.x, p.y, 24);
    updatePlaced(componentId, (ins) => {
      const pin = ins.pins[pinIndex];
      if (pin) pin.node = node?.id;
    });
  };
  move(startClientX, startClientY);

  const onMove = (e: PointerEvent): void => {
    move(e.clientX, e.clientY);
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** 4. 拖拽旋转手柄：绕身体原点任意角度旋转（刚性 IC 锁定，不旋转）。 */
export function startRotateDrag(
  ctx: DragContext,
  componentId: string,
  startClientX: number,
  startClientY: number,
): void {
  const item = getPlacedItem(componentId);
  if (!item) return;
  const entry = ctx.symbols.get(item.symbolId)?.entry;
  if (entry?.rigid) return; // 刚性 IC 不可旋转

  const ins = item.instance;
  const p0 = clientToViewBox(ctx.svg, startClientX, startClientY);
  const baseAngle = Math.atan2(p0.y - ins.y, p0.x - ins.x);
  const baseRotation = ins.rotation;

  const onMove = (e: PointerEvent): void => {
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    const angle = Math.atan2(p.y - ins.y, p.x - ins.x);
    const deg = baseRotation + ((angle - baseAngle) * 180) / Math.PI;
    updatePlaced(componentId, (i) => {
      i.rotation = ((deg % 360) + 360) % 360;
    });
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** 5. 从面板拖入导线（默认水平直线，R 切换垂直）。 */
export function startWireDrag(
  ctx: DragContext,
  entry: CatalogEntry,
  startClientX: number,
  startClientY: number,
): void {
  const layer = ensureDragLayer(ctx.svg);
  const ghost = document.createElementNS(SVG_NS, "line") as SVGLineElement;
  ghost.setAttribute("stroke", DEFAULT_WIRE_COLOR);
  ghost.setAttribute("stroke-width", "1.6");
  ghost.setAttribute("opacity", "0.85");
  layer.appendChild(ghost);

  let last = clientToViewBox(ctx.svg, startClientX, startClientY);
  let vertical = false;

  const apply = (): void => {
    ghost.setAttribute("x1", last.x.toFixed(2));
    ghost.setAttribute("y1", last.y.toFixed(2));
    ghost.setAttribute("x2", (vertical ? last.x : last.x + 36).toFixed(2));
    ghost.setAttribute("y2", (vertical ? last.y + 36 : last.y).toFixed(2));
  };
  apply();

  const cleanup = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
    ghost.remove();
  };

  const onMove = (e: PointerEvent): void => {
    last = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    apply();
    e.preventDefault();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "r" || e.key === "R") {
      vertical = !vertical;
      apply();
      e.preventDefault();
    }
  };
  const onUp = (e: PointerEvent): void => {
    cleanup();
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    if (!nearestNode(ctx.layout, p.x, p.y, 40)) return;
    const ins = buildWireInstance(
      nextId(),
      nextRefdes(entry.prefix),
      p.x,
      p.y,
      vertical,
      DEFAULT_WIRE_COLOR,
      ctx.layout,
    );
    addPlaced(entry.id, ins);
  };
  const onCancel = (): void => cleanup();

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey);
}

/** 6. 拖拽导线端点：更新绝对坐标并吸附孔位。 */
export function startWireEndpointDrag(
  ctx: DragContext,
  componentId: string,
  endpointIndex: number,
  startClientX: number,
  startClientY: number,
): void {
  const move = (cx: number, cy: number): void => {
    const p = clientToViewBox(ctx.svg, cx, cy);
    const node = nearestNode(ctx.layout, p.x, p.y, 24);
    updatePlaced(componentId, (ins) => {
      const pin = ins.pins[endpointIndex];
      if (!pin) return;
      pin.x = node ? node.x : p.x;
      pin.y = node ? node.y : p.y;
      pin.node = node?.id;
    });
  };
  move(startClientX, startClientY);

  const onMove = (e: PointerEvent): void => {
    move(e.clientX, e.clientY);
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** 7. 拖拽导线折点（移动已存在的折点）。 */
export function startWireBendDrag(
  ctx: DragContext,
  componentId: string,
  bendIndex: number,
  startClientX: number,
  startClientY: number,
): void {
  const move = (cx: number, cy: number): void => {
    const p = clientToViewBox(ctx.svg, cx, cy);
    updatePlaced(componentId, (ins) => {
      const b = ins.bends?.[bendIndex];
      if (b) {
        b.x = p.x;
        b.y = p.y;
      }
    });
  };
  move(startClientX, startClientY);

  const onMove = (e: PointerEvent): void => {
    move(e.clientX, e.clientY);
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** 8. 拖拽导线线段中点：在该处插入新折点并继续拖拽。 */
export function startWireAddBend(
  ctx: DragContext,
  componentId: string,
  segmentIndex: number,
  startClientX: number,
  startClientY: number,
): void {
  let inserted = false;

  const move = (cx: number, cy: number): void => {
    const p = clientToViewBox(ctx.svg, cx, cy);
    updatePlaced(componentId, (ins) => {
      const e0 = ins.pins[0];
      const e1 = ins.pins[1];
      if (!e0 || !e1) return;
      const bends = ins.bends ?? (ins.bends = []);
      if (!inserted) {
        const pts = [e0, ...bends, e1];
        const a = pts[segmentIndex];
        const b = pts[segmentIndex + 1];
        if (!a || !b) return;
        bends.splice(segmentIndex, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        inserted = true;
      }
      const b = bends[segmentIndex];
      if (b) {
        b.x = p.x;
        b.y = p.y;
      }
    });
  };
  move(startClientX, startClientY);

  const onMove = (e: PointerEvent): void => {
    move(e.clientX, e.clientY);
    e.preventDefault();
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
