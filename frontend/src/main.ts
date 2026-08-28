// SPDX-License-Identifier: GPL-3.0-only

/**
 * 应用入口 —— 虚拟面包板前端。
 * 面包板绘制 + 元件拖拽放置（橡皮筋引脚 / 自由旋转）+ 画布缩放 + 接口预留。
 */

import { getBackend } from "./backend";
import { renderBreadboard } from "./render/breadboard";
import { loadComponentSymbols, renderComponentPalette } from "./render/parts";
import { renderPlacedComponents } from "./render/placedComponents";
import {
  clearPlaced,
  getPlaced,
  getPlacedItem,
  removePlaced,
  subscribe,
  updatePlaced,
} from "./store/circuitStore";
import {
  startBodyDrag,
  startPinDrag,
  startRotateDrag,
  type DragContext,
} from "./interaction/drag";
import { reSnapPins } from "./interaction/placement";
import type { Circuit } from "./types/domain";

import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <h1>虚拟面包板 <span>Virtual Breadboard</span></h1>
    <div class="topbar__actions">
      <label class="zoom">缩放
        <input id="zoom-slider" type="range" min="0.2" max="8" step="0.05" value="1" />
        <span id="zoom-label">100%</span>
      </label>
      <button id="zoom-fit" type="button">适应</button>
      <button id="toggle-holes" type="button">显示孔位</button>
      <button id="test-backend" type="button">生成网表</button>
      <button id="clear" type="button">清空电路</button>
    </div>
  </header>
  <main class="layout">
    <section class="canvas" id="canvas" aria-label="面包板画布"></section>
    <aside class="palette">
      <h2>元件库</h2>
      <p class="palette__hint">拖入面包板；拖元件可移动，拖蓝点旋转、拖绿点伸缩引脚，滚轮缩放</p>
      <div class="palette__list" id="palette-list"></div>
    </aside>
  </main>
  <footer class="statusbar" id="statusbar"></footer>
  <pre class="log" id="log"></pre>
  <div class="modal" id="value-dialog" hidden>
    <div class="modal__box">
      <h3 id="value-dialog-title">设置数值</h3>
      <div class="modal__row">
        <input id="value-input" type="text" autocomplete="off" />
        <select id="unit-select"></select>
      </div>
      <div class="modal__actions">
        <button id="value-cancel" type="button">取消</button>
        <button id="value-ok" type="button">确定</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLElement>("#canvas")!;
const paletteList = document.querySelector<HTMLElement>("#palette-list")!;
const statusbar = document.querySelector<HTMLElement>("#statusbar")!;
const log = document.querySelector<HTMLPreElement>("#log")!;
const zoomSlider = document.querySelector<HTMLInputElement>("#zoom-slider")!;
const zoomLabel = document.querySelector<HTMLElement>("#zoom-label")!;

// —— 渲染面包板 ——
const board = renderBreadboard(canvas);
const { layout, svg, baseWidth, baseHeight } = board;

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

// —— 已放置元件交互 + 画布平移（事件委托，统一挂在 canvas 上）——
canvas.addEventListener("pointerdown", (e) => {
  const el = e.target as Element;

  const rot = el.closest?.('[data-rotate="1"]');
  if (rot) {
    const id = rot.getAttribute("data-component-id")!;
    e.preventDefault();
    startRotateDrag(dragCtx, id, e.clientX, e.clientY);
    return;
  }

  const pin = el.closest?.("[data-pin-index]");
  if (pin) {
    const id = pin.getAttribute("data-component-id")!;
    const idx = Number(pin.getAttribute("data-pin-index"));
    e.preventDefault();
    startPinDrag(dragCtx, id, idx, e.clientX, e.clientY);
    return;
  }

  const body = el.closest?.("[data-component-id]");
  if (body) {
    const id = body.getAttribute("data-component-id")!;
    e.preventDefault();
    startBodyDrag(dragCtx, id, e.clientX, e.clientY, (moved) => {
      if (!moved) {
        selectedId = id;
        render();
      }
    });
    return;
  }

  // 空白区域：拖拽平移画布，点击取消选中
  startCanvasPan(e);
});

function startCanvasPan(e: PointerEvent): void {
  const startX = e.clientX;
  const startY = e.clientY;
  const sl = canvas.scrollLeft;
  const st = canvas.scrollTop;
  let moved = false;

  const onMove = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.hypot(dx, dy) > 2) moved = true;
    canvas.scrollLeft = sl - dx;
    canvas.scrollTop = st - dy;
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (!moved && selectedId) {
      selectedId = null;
      render();
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// —— 画布缩放 ——
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
let zoom = 1;

function applyZoom(): void {
  svg.style.width = `${baseWidth * zoom}px`;
  svg.style.height = `${baseHeight * zoom}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  zoomSlider.value = String(zoom);
}

function fitZoom(): void {
  const cw = Math.max(60, canvas.clientWidth - 32);
  const ch = Math.max(60, canvas.clientHeight - 32);
  zoom = Math.min(cw / baseWidth, ch / baseHeight);
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  applyZoom();
}

fitZoom();

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    applyZoom();
  },
  { passive: false },
);

zoomSlider.addEventListener("input", () => {
  zoom = Number(zoomSlider.value);
  applyZoom();
});

document.querySelector<HTMLButtonElement>("#zoom-fit")!.addEventListener("click", fitZoom);

// Delete / Backspace 删除选中元件；R 旋转选中元件并重置引脚连接。
window.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    removePlaced(selectedId);
    selectedId = null;
    render();
    return;
  }
  if ((e.key === "r" || e.key === "R") && selectedId) {
    const item = getPlacedItem(selectedId);
    const entry = item ? symbols.get(item.symbolId)?.entry : undefined;
    if (item && entry && !entry.rigid) {
      updatePlaced(selectedId, (ins) => {
        ins.rotation = (ins.rotation + 90) % 360;
        reSnapPins(entry, ins, layout);
      });
    }
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

// —— 双击元件：设置数值 + 单位（电阻/电容）——
const UNIT_SETS: Record<string, string[]> = {
  resistor: ["Ω", "kΩ", "MΩ"],
  capacitor: ["pF", "nF", "µF", "mF", "F"],
};

const valueDialog = document.querySelector<HTMLDivElement>("#value-dialog")!;
const valueInput = document.querySelector<HTMLInputElement>("#value-input")!;
const unitSelect = document.querySelector<HTMLSelectElement>("#unit-select")!;
let dialogTargetId: string | null = null;

function openValueDialog(id: string, value: string, unit: string | undefined, units: string[]): void {
  dialogTargetId = id;
  valueInput.value = value;
  unitSelect.replaceChildren(
    ...units.map((u) => {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = u;
      return o;
    }),
  );
  unitSelect.value = unit && units.includes(unit) ? unit : units[0];
  valueDialog.hidden = false;
  valueInput.focus();
  valueInput.select();
}

function closeValueDialog(): void {
  valueDialog.hidden = true;
  dialogTargetId = null;
}

canvas.addEventListener("dblclick", (e) => {
  const el = e.target as Element;
  const wrap = el.closest?.("[data-component-id]");
  if (!wrap) return;
  const id = wrap.getAttribute("data-component-id")!;
  const item = getPlacedItem(id);
  if (!item) return;
  const units = UNIT_SETS[item.instance.kind];
  if (!units) return; // 只有电阻/电容支持数值对话框
  openValueDialog(id, item.instance.value, item.instance.unit, units);
});

document.querySelector<HTMLButtonElement>("#value-ok")!.addEventListener("click", () => {
  if (!dialogTargetId) return;
  const v = valueInput.value.trim();
  updatePlaced(dialogTargetId, (ins) => {
    ins.value = v || "1";
    ins.unit = unitSelect.value;
  });
  closeValueDialog();
});

document.querySelector<HTMLButtonElement>("#value-cancel")!.addEventListener("click", closeValueDialog);

valueInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.querySelector<HTMLButtonElement>("#value-ok")!.click();
  if (e.key === "Escape") closeValueDialog();
});

valueDialog.addEventListener("click", (e) => {
  if (e.target === valueDialog) closeValueDialog();
});

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
