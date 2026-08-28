// SPDX-License-Identifier: GPL-3.0-only

/**
 * 电路存储 —— 记录已放置到面包板上的元件实例。
 *
 * 极简的观察者式 store：前端布局用它保存 {@link ComponentInstance}，
 * 后续接后端时，把 `getPlaced()` 组合成 {@link Circuit} 即可发送仿真。
 */

import type { ComponentInstance } from "../types/domain";

export interface PlacedItem {
  instance: ComponentInstance;
  /** 对应元件目录 id（用于渲染时查找符号）。 */
  symbolId: string;
}

type Listener = () => void;

const items: PlacedItem[] = [];
const listeners = new Set<Listener>();
const refdesCounters = new Map<string, number>();
let seq = 0;

/** 放置一个元件。 */
export function addPlaced(symbolId: string, instance: ComponentInstance): void {
  items.push({ symbolId, instance });
  emit();
}

/** 按实例 id 删除。 */
export function removePlaced(id: string): void {
  const i = items.findIndex((it) => it.instance.id === id);
  if (i >= 0) {
    items.splice(i, 1);
    emit();
  }
}

/** 按 id 查找。 */
export function getPlacedItem(id: string): PlacedItem | undefined {
  return items.find((it) => it.instance.id === id);
}

/** 按 id 就地更新实例字段（移动身体、改引脚节点、旋转等）。 */
export function updatePlaced(id: string, updater: (instance: ComponentInstance) => void): void {
  const item = items.find((it) => it.instance.id === id);
  if (item) {
    updater(item.instance);
    emit();
  }
}

/** 清空整个电路。 */
export function clearPlaced(): void {
  items.length = 0;
  refdesCounters.clear();
  emit();
}

export function getPlaced(): PlacedItem[] {
  return [...items];
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 生成实例唯一 id。 */
export function nextId(): string {
  seq += 1;
  return `c${seq}`;
}

/** 按前缀生成引用名（R1/R2/C1…）。 */
export function nextRefdes(prefix: string): string {
  const n = (refdesCounters.get(prefix) ?? 0) + 1;
  refdesCounters.set(prefix, n);
  return `${prefix}${n}`;
}

function emit(): void {
  listeners.forEach((fn) => fn());
}
