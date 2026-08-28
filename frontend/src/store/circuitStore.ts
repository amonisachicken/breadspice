// SPDX-License-Identifier: GPL-3.0-only

/**
 * 电路存储 —— 记录已放置到面包板上的元件实例，并提供快照式撤销/重做。
 *
 * - 状态主体是 {@link PlacedItem}[]（实例 + 符号 id，用于渲染）。
 * - 连续手势（拖拽移动/引脚/旋转/导线端点/控制点）通过
 *   {@link beginMutation}/{@link endMutation} 合并为一步；
 * - 离散操作（放置/删除/清空/数值/颜色/旋转）通过 {@link commit} /
 *   {@link commitUpdate} 记录为一步。
 * - 撤销/重做栈保存的是“整张画板”的快照（便于清空电路也能整体恢复）。
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
const historyListeners = new Set<Listener>();
const refdesCounters = new Map<string, number>();
let seq = 0;

// —— 撤销/重做 ——
const undoStack: PlacedItem[][] = [];
const redoStack: PlacedItem[][] = [];
let mutationDepth = 0;
let beforeSnapshot: PlacedItem[] | null = null;

const deepClone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function snapshot(): PlacedItem[] {
  return deepClone(items);
}

function deepEqual(a: PlacedItem[], b: PlacedItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 依据当前 items 重建 refdes 计数与 id 序号（撤销/重做/导入后保持一致）。 */
function rebuildCounters(): void {
  refdesCounters.clear();
  seq = 0;
  for (const it of items) {
    const m = /^([A-Za-z]+)(\d+)$/.exec(it.instance.refdes);
    if (m) {
      const n = parseInt(m[2], 10);
      refdesCounters.set(m[1], Math.max(refdesCounters.get(m[1]) ?? 0, n));
    }
    const im = /^c(\d+)$/.exec(it.instance.id);
    if (im) seq = Math.max(seq, parseInt(im[1], 10));
  }
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function notifyHistory(): void {
  historyListeners.forEach((fn) => fn());
}

function pushHistory(before: PlacedItem[]): void {
  undoStack.push(before);
  redoStack.length = 0;
  notifyHistory();
}

function restoreItems(snap: PlacedItem[]): void {
  items.length = 0;
  items.push(...deepClone(snap));
  rebuildCounters();
  emit();
}

// —— 事务（连续拖拽手势：开始/结束合并为一步）——
export function beginMutation(): void {
  if (mutationDepth === 0) beforeSnapshot = snapshot();
  mutationDepth++;
}

export function endMutation(): void {
  if (mutationDepth === 0) return;
  mutationDepth--;
  if (mutationDepth === 0 && beforeSnapshot) {
    const before = beforeSnapshot;
    beforeSnapshot = null;
    if (!deepEqual(before, items)) pushHistory(before);
  }
}

/** 离散单步提交（mutate 内部不应自行 emit，提交后统一 emit）。 */
export function commit(mutate: () => void): void {
  const before = snapshot();
  mutate();
  emit();
  if (!deepEqual(before, items)) pushHistory(before);
}

/** 离散更新（value/color/rotation 等），复用 updatePlaced 的一次 emit，不重复渲染。 */
export function commitUpdate(id: string, updater: (instance: ComponentInstance) => void): void {
  const before = snapshot();
  updatePlaced(id, updater);
  if (!deepEqual(before, items)) pushHistory(before);
}

// —— 基本操作 ——
export function addPlaced(symbolId: string, instance: ComponentInstance): void {
  commit(() => items.push({ symbolId, instance }));
}

export function removePlaced(id: string): void {
  commit(() => {
    const i = items.findIndex((it) => it.instance.id === id);
    if (i >= 0) items.splice(i, 1);
  });
}

export function clearPlaced(): void {
  commit(() => {
    items.length = 0;
    refdesCounters.clear();
  });
}

export function updatePlaced(id: string, updater: (instance: ComponentInstance) => void): void {
  const item = items.find((it) => it.instance.id === id);
  if (item) {
    updater(item.instance);
    emit();
  }
}

// —— 查询 ——
export function getPlacedItem(id: string): PlacedItem | undefined {
  return items.find((it) => it.instance.id === id);
}

export function getPlaced(): PlacedItem[] {
  return [...items];
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onHistoryChange(fn: Listener): () => void {
  historyListeners.add(fn);
  return () => historyListeners.delete(fn);
}

// —— 撤销 / 重做 ——
export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undo(): void {
  const before = undoStack.pop();
  if (!before) return;
  redoStack.push(snapshot());
  restoreItems(before);
  notifyHistory();
}

export function redo(): void {
  const after = redoStack.pop();
  if (!after) return;
  undoStack.push(snapshot());
  restoreItems(after);
  notifyHistory();
}

/** 清空历史（保存时调用，使撤销/重做按钮变灰）。 */
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  beforeSnapshot = null;
  mutationDepth = 0;
  notifyHistory();
}

/** 整体替换（导入 .bread / 从缓存恢复），并清空历史。 */
export function replaceAll(next: PlacedItem[]): void {
  items.length = 0;
  items.push(...deepClone(next));
  rebuildCounters();
  undoStack.length = 0;
  redoStack.length = 0;
  beforeSnapshot = null;
  mutationDepth = 0;
  emit();
  notifyHistory();
}

// —— 持久化（.breadcache）所需的完整历史状态 ——
export interface HistoryState {
  current: PlacedItem[];
  undo: PlacedItem[][];
  redo: PlacedItem[][];
}

export function getHistoryState(): HistoryState {
  return {
    current: snapshot(),
    undo: undoStack.map((s) => deepClone(s)),
    redo: redoStack.map((s) => deepClone(s)),
  };
}

export function restoreHistoryState(state: HistoryState): void {
  items.length = 0;
  items.push(...deepClone(state.current));
  undoStack.length = 0;
  redoStack.length = 0;
  for (const s of state.undo ?? []) undoStack.push(deepClone(s));
  for (const s of state.redo ?? []) redoStack.push(deepClone(s));
  rebuildCounters();
  emit();
  notifyHistory();
}

// —— id / refdes ——
export function nextId(): string {
  seq += 1;
  return `c${seq}`;
}

export function nextRefdes(prefix: string): string {
  const n = (refdesCounters.get(prefix) ?? 0) + 1;
  refdesCounters.set(prefix, n);
  return `${prefix}${n}`;
}
