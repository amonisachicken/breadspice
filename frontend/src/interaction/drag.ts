// SPDX-License-Identifier: GPL-3.0-only

/**
 * 拖拽交互 ——
 * 1. 从元件面板拖入放置；
 * 2. 拖拽已放置元件的引脚手柄（伸缩引线）；
 * 3. 拖拽旋转手柄（任意角度旋转）。
 *
 * 采用指针事件（pointerdown/move/up）并注册到 window，便于跨元素拖动。
 */

import type { BreadboardLayout, ComponentRotation } from "../types/domain";
import type { BuiltSymbol, CatalogEntry } from "../components/catalog";
import { SVG_NS, clientToViewBox } from "../render/svgAsset";
import {
  addPlaced,
  getPlacedItem,
  nextId,
  nextRefdes,
  updatePlaced,
} from "../store/circuitStore";
import { buildInstance, nearestNode } from "./placement";

export interface DragContext {
  svg: SVGSVGElement;
  layout: BreadboardLayout;
  symbols: Map<string, BuiltSymbol>;
}

const DRAG_LAYER_ID = "component-drag-layer";

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

/** 1. 从面板拖入元件，松手时以光标位置为身体原点放置。 */
export function startComponentDrag(
  ctx: DragContext,
  entry: CatalogEntry,
  startClientX: number,
  startClientY: number,
): void {
  const symbol = ctx.symbols.get(entry.id);
  if (!symbol) return;

  const layer = ensureDragLayer(ctx.svg);
  const ghost = document.createElementNS(SVG_NS, "g") as SVGGElement;
  ghost.setAttribute("opacity", "0.85");
  ghost.appendChild(symbol.template.cloneNode(true));
  layer.appendChild(ghost);

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
    ghost.remove();
  };

  function onMove(e: PointerEvent): void {
    last = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    apply();
    e.preventDefault();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "r" || e.key === "R") {
      rotation = (rotation + 90) % 360;
      apply();
      e.preventDefault();
    }
  }

  function onUp(e: PointerEvent): void {
    cleanup();
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    // 只有落在面包板附近（距离某孔位 40 单位内）才放置。
    if (nearestNode(ctx.layout, p.x, p.y, 40)) {
      const instance = buildInstance(
        entry,
        nextId(),
        nextRefdes(entry.prefix),
        p.x,
        p.y,
        rotation,
        ctx.layout,
      );
      addPlaced(entry.id, instance);
    }
  }

  function onCancel(): void {
    cleanup();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey);
}

/** 2. 拖拽引脚手柄：把该引脚引线端点吸附到最近孔位（伸缩引线）。 */
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

/** 3. 拖拽旋转手柄：绕身体原点任意角度旋转。 */
export function startRotateDrag(
  ctx: DragContext,
  componentId: string,
  startClientX: number,
  startClientY: number,
): void {
  const item = getPlacedItem(componentId);
  if (!item) return;
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
