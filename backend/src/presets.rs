// SPDX-License-Identifier: GPL-3.0-only

//! 内嵌预设音频（吉他音符 C / A / G / E / D）。
//!
//! 示例音频已提前经 ffmpeg 转码为 44.1kHz / 16-bit / 单声道 PCM，编译期通过
//! `include_bytes!` 内嵌到二进制里。运行时按需把 PCM 转成 PWL 文本并缓存，
//! 无需再调用 ffmpeg。

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use crate::audio::pcm_to_pwl;

/// 预设音符：名称 -> PCM 字节。
const PRESETS: &[(&str, &[u8])] = &[
    ("C", include_bytes!("../assets/presets/C.pcm")),
    ("A", include_bytes!("../assets/presets/A.pcm")),
    ("G", include_bytes!("../assets/presets/G.pcm")),
    ("E", include_bytes!("../assets/presets/E.pcm")),
    ("D", include_bytes!("../assets/presets/D.pcm")),
];

/// PWL 缓存（名称 -> PWL 文本）。
static CACHE: LazyLock<Mutex<HashMap<&'static str, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 预设音符名列表。
pub fn preset_names() -> Vec<&'static str> {
    PRESETS.iter().map(|(n, _)| *n).collect()
}

/// 预设音符的时长（秒）。
pub fn preset_duration(name: &str) -> Option<f64> {
    let (_, pcm) = PRESETS.iter().find(|(n, _)| *n == name)?;
    Some(pcm.len() as f64 / 2.0 / 44100.0)
}

/// 取预设音符的 PWL 文本（按需由 PCM 转换并缓存）。
pub fn lookup_preset(name: &str) -> Option<String> {
    let (key, pcm) = PRESETS.iter().find(|(n, _)| *n == name)?;
    let mut cache = CACHE.lock().ok()?;
    if let Some(pwl) = cache.get(key) {
        return Some(pwl.clone());
    }
    let (pwl, _duration) = pcm_to_pwl(pcm).ok()?;
    cache.insert(key, pwl.clone());
    Some(pwl)
}

/// 预设音符的 WAV 字节（44.1kHz / 16-bit / 单声道，供网页播放）。
pub fn preset_wav(name: &str) -> Option<Vec<u8>> {
    let (_, pcm) = PRESETS.iter().find(|(n, _)| *n == name)?;
    Some(pcm_to_wav(pcm))
}

/// 把 16-bit 单声道 PCM 包成 WAV（RIFF 头 + 数据）。
fn pcm_to_wav(pcm: &[u8]) -> Vec<u8> {
    let data_len = pcm.len() as u32;
    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&44100u32.to_le_bytes());
    out.extend_from_slice(&(44100u32 * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(pcm);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_are_present() {
        assert_eq!(preset_names(), vec!["C", "A", "G", "E", "D"]);
        for name in preset_names() {
            let pwl = lookup_preset(name).unwrap();
            assert!(!pwl.is_empty());
            let dur = preset_duration(name).unwrap();
            assert!(dur > 1.0 && dur < 15.0);
        }
    }
}
