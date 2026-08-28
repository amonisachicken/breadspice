// SPDX-License-Identifier: GPL-3.0-only

/**
 * 元件面板 —— 从 parts.svg 构建元件符号，渲染成可拖拽的面板项。
 */

import partsSvgSource from "../assets/parts.svg?raw";
import { CATALOG, buildSymbols, type BuiltSymbol } from "../components/catalog";
import { startComponentDrag, type DragContext } from "../interaction/drag";
import { SVG_NS, parseSvg } from "./svgAsset";

/** 加载并构建所有元件符号（key = 目录 id）。 */
export function loadComponentSymbols(): Map<string, BuiltSymbol> {
  const partsSvg = parseSvg(partsSvgSource);
  return buildSymbols(partsSvg);
}

/** 测量符号（含其归一化 translate）在最终坐标系中的包围盒。 */
function measureSymbolViewBox(
  template: SVGGElement,
  pad = 3,
): { x: number; y: number; width: number; height: number } {
  const host = document.createElementNS(SVG_NS, "svg");
  host.style.position = "absolute";
  host.style.visibility = "hidden";
  host.setAttribute("width", "200");
  host.setAttribute("height", "200");
  host.appendChild(template.cloneNode(true));
  document.body.appendChild(host);
  // 外层 <svg> 的 getBBox 已包含 template 自身 translate 的位移，
  // 得到的是归一化后（pin1 位于原点附近）的真实包围盒。
  const bbox = host.getBBox();
  document.body.removeChild(host);
  return {
    x: bbox.x - pad,
    y: bbox.y - pad,
    width: bbox.width + pad * 2,
    height: bbox.height + pad * 2,
  };
}

/** 渲染元件面板到指定容器。 */
export function renderComponentPalette(
  container: HTMLElement,
  symbols: Map<string, BuiltSymbol>,
  dragCtx: DragContext,
): void {
  container.replaceChildren();

  for (const entry of CATALOG) {
    const built = symbols.get(entry.id);
    if (!built) continue;

    const item = document.createElement("div");
    item.className = "palette-item";
    item.title = "拖拽到面包板放置（拖拽中按 R 旋转）；放置后双击可查看/设置属性";

    const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    if (entry.kind === "wire") {
      // 导线无身体符号，画一条示例折线
      svg.setAttribute("viewBox", "0 0 40 20");
      const line = document.createElementNS(SVG_NS, "polyline") as SVGPolylineElement;
      line.setAttribute("points", "4,10 20,10 36,14");
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#2563eb");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linejoin", "round");
      svg.appendChild(line);
      const dot = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      dot.setAttribute("cx", "20");
      dot.setAttribute("cy", "10");
      dot.setAttribute("r", "2.4");
      dot.setAttribute("fill", "#2563eb");
      svg.appendChild(dot);
    } else {
      const vb = measureSymbolViewBox(built.template);
      svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
      svg.appendChild(built.template.cloneNode(true));
    }
    item.appendChild(svg);

    const label = document.createElement("span");
    label.textContent = entry.label;
    item.appendChild(label);

    item.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startComponentDrag(dragCtx, entry, e.clientX, e.clientY);
    });

    container.appendChild(item);
  }
}
