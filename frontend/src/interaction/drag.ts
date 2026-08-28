// SPDX-License-Identifier: GPL-3.0-only

/**
 * 元件拖拽 —— 从元件面板拖到面包板，吸附到最近孔位后放置。
 *
 * 采用指针事件（pointerdown/move/up）而非 HTML5 DnD，便于精确控制
 * “幽灵”元件与旋转。拖拽期间按 R 键可 90° 旋转。
 */

import type { BreadboardLayout, ComponentRotation } from "../types/domain";
import type { BuiltSymbol, CatalogEntry } from "../components/catalog";
import { SVG_NS, clientToViewBox } from "../render/svgAsset";
import { addPlaced, nextId, nextRefdes } from "../store/circuitStore";
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
      rotation = ((rotation + 90) % 360) as ComponentRotation;
      apply();
      e.preventDefault();
    }
  }

  function onUp(e: PointerEvent): void {
    cleanup();
    const p = clientToViewBox(ctx.svg, e.clientX, e.clientY);
    const node = nearestNode(ctx.layout, p.x, p.y, 26);
    if (node) {
      const instance = buildInstance(
        entry,
        nextId(),
        nextRefdes(entry.prefix),
        node.id,
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
