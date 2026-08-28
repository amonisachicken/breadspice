// SPDX-License-Identifier: GPL-3.0-only

/**
 * 应用入口 —— 虚拟面包板前端。
 * 当前：面包板绘制 + 元件拖拽放置（橡皮筋引脚 / 自由旋转）+ 接口预留。
 */

import { getBackend } from "./backend";
import { renderBreadboard } from "./render/breadboard";
import { loadComponentSymbols, renderComponentPalette } from "./render/parts";
import { renderPlacedComponents } from "./render/placedComponents";
import {
  clearPlaced,
  getPlaced,
  removePlaced,
  subscribe,
  updatePlaced,
} from "./store/circuitStore";
import {
  startPinDrag,
  startRotateDrag,
  type DragContext,
} from "./interaction/drag";
import type { Circuit } from "./types/domain";

import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <h1>虚拟面包板 <span>Virtual Breadboard</span></h1>
    <div class="topbar__actions">
      <button id="toggle-holes" type="button">显示孔位</button>
      <button id="test-backend" type="button">生成网表</button>
      <button id="clear" type="button">清空电路</button>
    </div>
  </header>
  <main class="layout">
    <section class="canvas" id="canvas" aria-label="面包板画布"></section>
    <aside class="palette">
      <h2>元件库</h2>
      <p class="palette__hint">拖入面包板；选中后拖蓝点旋转、拖绿点伸缩引脚、滚轮微调</p>
      <div class="palette__list" id="palette-list"></div>
    </aside>
  </main>
  <footer class="statusbar" id="statusbar"></footer>
  <pre class="log" id="log"></pre>
`;

const canvas = document.querySelector<HTMLElement>("#canvas")!;
const paletteList = document.querySelector<HTMLElement>("#palette-list")!;
const statusbar = document.querySelector<HTMLElement>("#statusbar")!;
const log = document.querySelector<HTMLPreElement>("#log")!;

// —— 渲染面包板 ——
const board = renderBreadboard(canvas);
const { layout, svg } = board;

// —— 元件符号 + 面板 ——
const symbols = loadComponentSymbols();
const dragCtx: DragContext = { svg, layout, symbols };
renderComponentPalette(paletteList, symbols, dragCtx);

// —— 放置状态与选中 ——
let selectedId: string | null = null;

function render(): void {
  renderPlacedComponents({ svg, layout, symbols, selectedId }, getPlaced());
}

subscribe(() => {
  updateStatus();
  render();
});
render();

// —— 已放置元件的交互（事件委托）——
svg.addEventListener("pointerdown", (e) => {
  const el = e.target as Element;
  const rot = el.closest?.('[data-rotate="1"]');
  if (rot) {
    const id = rot.getAttribute("data-component-id")!;
    e.preventDefault();
    e.stopPropagation();
    startRotateDrag(dragCtx, id, e.clientX, e.clientY);
    return;
  }
  const pin = el.closest?.("[data-pin-index]");
  if (pin) {
    const id = pin.getAttribute("data-component-id")!;
    const idx = Number(pin.getAttribute("data-pin-index"));
    e.preventDefault();
    e.stopPropagation();
    startPinDrag(dragCtx, id, idx, e.clientX, e.clientY);
  }
});

svg.addEventListener("click", (e) => {
  const el = e.target as Element;
  if (el.closest?.('[data-rotate="1"]') || el.closest?.("[data-pin-index]")) return;
  const body = el.closest?.("[data-component-id]");
  selectedId = body ? body.getAttribute("data-component-id") : null;
  render();
});

// 滚轮微调选中元件的旋转角。
svg.addEventListener("wheel", (e) => {
  if (!selectedId) return;
  const step = e.deltaY < 0 ? 5 : -5;
  updatePlaced(selectedId, (ins) => {
    ins.rotation = ((ins.rotation + step) % 360 + 360) % 360;
  });
  e.preventDefault();
});

// Delete / Backspace 删除选中元件。
window.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    removePlaced(selectedId);
    selectedId = null;
    render();
  }
});

// —— 状态栏 ——
const backend = getBackend();
function updateStatus(): void {
  statusbar.textContent =
    `后端: ${backend.kind} · 已放置 ${getPlaced().length} 个元件 · ` +
    `孔位 ${layout.nodes.length} · 网 ${layout.nets.length}`;
}
updateStatus();

// —— 显示/隐藏逻辑孔位 ——
let holesVisible = false;
document.querySelector<HTMLButtonElement>("#toggle-holes")!.addEventListener("click", () => {
  holesVisible = !holesVisible;
  board.setHolesVisible(holesVisible);
});

// —— 清空电路 ——
document.querySelector<HTMLButtonElement>("#clear")!.addEventListener("click", () => {
  clearPlaced();
  selectedId = null;
  render();
  log.textContent = "";
});

// —— 生成网表（把当前放置的电路交给 MockBackend，打通接口链路） ——
document.querySelector<HTMLButtonElement>("#test-backend")!.addEventListener("click", async () => {
  const circuit: Circuit = {
    breadboard: layout,
    components: getPlaced().map((p) => p.instance),
  };

  if (circuit.components.length === 0) {
    log.textContent = "（电路为空，请先拖入元件）";
    return;
  }

  const models = await backend.listModels();
  const netlist = await backend.buildNetlist(circuit);
  log.textContent = [
    `后端种类: ${backend.kind}`,
    `可用模型: ${models.map((m) => m.label).join("、")}`,
    `已放置: ${circuit.components.map((c) => `${c.refdes}(${c.value})`).join("、")}`,
    ``,
    `—— 当前电路网表（Mock 参考实现）——`,
    netlist.text,
  ].join("\n");
});
