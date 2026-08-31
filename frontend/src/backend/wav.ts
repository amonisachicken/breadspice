// SPDX-License-Identifier: GPL-3.0-only

/**
 * 把仿真曲线（time, voltage）导出成 16-bit 单声道 WAV（44.1kHz）。
 */

import type { Trace } from "../types/protocol";

const SAMPLE_RATE = 44100;

/** 线性插值取 trace 在时刻 t 的值。 */
function sampleAt(trace: Trace, t: number): number {
  const xs = trace.x;
  const ys = trace.y;
  if (xs.length === 0) return 0;
  if (t <= xs[0]) return ys[0];
  if (t >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  if (span <= 0) return ys[lo];
  const k = (t - xs[lo]) / span;
  return ys[lo] + (ys[hi] - ys[lo]) * k;
}

/** trace → 44.1kHz 16-bit 单声道 PCM 字节。 */
export function traceToPcm(trace: Trace): Uint8Array {
  const duration = trace.x.length ? trace.x[trace.x.length - 1] - trace.x[0] : 0;
  const n = Math.max(1, Math.round(duration * SAMPLE_RATE));
  const pcm = new Int16Array(n);
  const t0 = trace.x.length ? trace.x[0] : 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / SAMPLE_RATE;
    const v = sampleAt(trace, t);
    const s = Math.max(-1, Math.min(1, v));
    pcm[i] = Math.round(s * 32767);
  }
  return new Uint8Array(pcm.buffer);
}

/** trace → WAV Blob（44.1kHz 16-bit 单声道）。 */
export function traceToWavBlob(trace: Trace): Blob {
  const pcm = traceToPcm(trace);
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: "audio/wav" });
}

/** 下载 trace 为 WAV 文件。 */
export function downloadTraceAsWav(trace: Trace, filename: string): void {
  const blob = traceToWavBlob(trace);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
