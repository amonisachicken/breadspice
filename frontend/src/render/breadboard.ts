// SPDX-License-Identifier: GPL-3.0-only

/**
 * 面包板渲染器 —— 把 assets/breadboard.svg 内联到 DOM，并在其上叠加
 * “逻辑孔位”覆盖层（命中区 + 可选的可视孔点）。
 *
 * 叠加层使用与 SVG viewBox 相同的坐标系，节点坐标由
 * {@link createBreadboardLayout} 生成（已对齐真实孔位）。
 */

import breadboardSvgSource from "../assets/breadboard.svg?raw";
import { BREADBOARD_ASSET, createBreadboardLayout } from "../layout/breadboardLayout";
import type { BreadboardLayout } from "../types/domain";
import { SVG_NS, ensureOverlayLayer, parseSvg } from "./svgAsset";

export interface RenderedBreadboard {
  svg: SVGSVGElement;
  layout: BreadboardLayout;
  /** 显示/隐藏逻辑孔位可视化（调试用）。 */
  setHolesVisible(visible: boolean): void;
  /** 通过屏幕坐标命中一个孔位（供后续拖拽吸附使用）。 */
  hitTest(clientX: number, clientY: number): string | null;
}

export function renderBreadboard(container: HTMLElement): RenderedBreadboard {
  const layout = createBreadboardLayout();
  const svg = parseSvg(breadboardSvgSource);

  const { width, height } = BREADBOARD_ASSET.viewBox;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", layout.name);

  const layer = ensureOverlayLayer(svg, "breadboard-overlay");

  // 可视孔位（默认隐藏）
  const holeGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  holeGroup.setAttribute("id", "logical-holes");
  holeGroup.style.display = "none";

  // 命中区（透明，用于拖拽/悬停）
  const hitGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  hitGroup.setAttribute("id", "logical-holes-hit");

  for (const node of layout.nodes) {
    const cx = node.x.toFixed(3);
    const cy = node.y.toFixed(3);

    const hole = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    hole.setAttribute("cx", cx);
    hole.setAttribute("cy", cy);
    hole.setAttribute("r", "2.3");
    hole.setAttribute("fill", "rgba(20,120,255,0.35)");
    hole.setAttribute("stroke", "rgba(20,90,200,0.7)");
    hole.setAttribute("stroke-width", "0.4");
    holeGroup.appendChild(hole);

    const hit = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    hit.setAttribute("cx", cx);
    hit.setAttribute("cy", cy);
    hit.setAttribute("r", "3.2");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("pointer-events", "all");
    hit.dataset.nodeId = node.id;
    hit.dataset.netId = node.netId;
    hitGroup.appendChild(hit);
  }

  layer.appendChild(holeGroup);
  layer.appendChild(hitGroup);
  container.appendChild(svg);

  return {
    svg,
    layout,
    setHolesVisible(visible: boolean) {
      holeGroup.style.display = visible ? "" : "none";
    },
    hitTest(clientX: number, clientY: number): string | null {
      const el = document.elementFromPoint(clientX, clientY);
      const hit = el?.closest?.("[data-node-id]") as SVGCircleElement | null;
      return hit?.dataset.nodeId ?? null;
    },
  };
}
