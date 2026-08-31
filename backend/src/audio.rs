// SPDX-License-Identifier: GPL-3.0-only

//! 音频输入处理：ffmpeg 转码 + PCM → PWL 转换 + 内存注册表。
//!
//! 上传的音频经 ffmpeg 转码成 44.1kHz / 16-bit / 单声道 PCM，再把每个采样点
//! 展开成内联 PWL 电压源点（采样值归一化到 ±1V）。PWL 文本存入内存注册表，
//! 网表生成时按 id 取出内联进 `V<name> n+ n- PWL(...)`。

use std::collections::HashMap;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

/// 采样率（固定 44.1kHz）。
pub const AUDIO_SAMPLE_RATE: f64 = 44100.0;

struct AudioEntry {
    /// PWL 主体（"t0 v0 t1 v1 ..."，空格分隔，不含 `PWL(...)` 包裹）。
    pwl: String,
}

static REGISTRY: LazyLock<Mutex<HashMap<String, AudioEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

static SEQ: AtomicU64 = AtomicU64::new(0);

/// 把上传的音频字节转码成 PCM 并转成 PWL，存入注册表；返回 (id, 时长秒)。
pub fn ingest_audio(bytes: &[u8]) -> Result<(String, f64), String> {
    let id = format!("a{}", SEQ.fetch_add(1, Ordering::Relaxed));
    let workdir = std::env::temp_dir().join(format!(
        "breadspice-audio-{}-{}",
        std::process::id(),
        id
    ));
    std::fs::create_dir_all(&workdir).map_err(|e| format!("创建临时目录失败：{e}"))?;

    let in_path = workdir.join("input.bin");
    let pcm_path = workdir.join("out.pcm");
    std::fs::write(&in_path, bytes).map_err(|e| format!("写输入文件失败：{e}"))?;

    let out = Command::new("ffmpeg")
        .arg("-y")
        .arg("-nostdin")
        .arg("-i")
        .arg(&in_path)
        .arg("-vn")
        .arg("-f")
        .arg("s16le")
        .arg("-acodec")
        .arg("pcm_s16le")
        .arg("-ar")
        .arg("44100")
        .arg("-ac")
        .arg("1")
        .arg(&pcm_path)
        .output()
        .map_err(|e| format!("无法启动 ffmpeg：{e}"))?;

    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr);
        let _ = std::fs::remove_dir_all(&workdir);
        let last = msg.lines().last().unwrap_or("未知错误");
        return Err(format!("ffmpeg 转码失败：{last}"));
    }

    let pcm = std::fs::read(&pcm_path).map_err(|e| format!("读取 PCM 失败：{e}"))?;
    let _ = std::fs::remove_dir_all(&workdir);

    let (pwl, duration) = pcm_to_pwl(&pcm)?;

    REGISTRY
        .lock()
        .map_err(|_| "音频注册表锁失败".to_string())?
        .insert(id.clone(), AudioEntry { pwl });

    Ok((id, duration))
}

/// 取 PWL 主体（供网表生成内联）。
pub fn lookup_pwl(id: &str) -> Option<String> {
    // 预设音频：id 形如 "preset:C"
    if let Some(name) = id.strip_prefix("preset:") {
        return crate::presets::lookup_preset(name);
    }
    REGISTRY.lock().ok()?.get(id).map(|e| e.pwl.clone())
}

/// 16-bit 小端单声道 PCM → (PWL 主体, 时长秒)。采样值归一化到 ±1V。
pub fn pcm_to_pwl(pcm: &[u8]) -> Result<(String, f64), String> {
    if pcm.len() % 2 != 0 {
        return Err("PCM 数据长度不是偶数".to_string());
    }
    let n = pcm.len() / 2;
    if n == 0 {
        return Err("音频为空".to_string());
    }
    let mut body = String::with_capacity(n * 18);
    for i in 0..n {
        let raw = i16::from_le_bytes([pcm[i * 2], pcm[i * 2 + 1]]);
        let t = i as f64 / AUDIO_SAMPLE_RATE;
        let v = raw as f64 / 32768.0;
        if i > 0 {
            body.push(' ');
        }
        body.push_str(&format!("{t:.9} {v:.6}"));
    }
    let duration = n as f64 / AUDIO_SAMPLE_RATE;
    Ok((body, duration))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_to_pwl_converts_samples() {
        // 两个 16-bit 样本：0 和 16384（0x4000 → 0.5V）
        let pcm = [0x00u8, 0x00, 0x00, 0x40];
        let (pwl, dur) = pcm_to_pwl(&pcm).unwrap();
        assert_eq!(dur, 2.0 / 44100.0);
        let parts: Vec<&str> = pwl.split_whitespace().collect();
        assert_eq!(parts.len(), 4); // t0 v0 t1 v1
        assert_eq!(parts[0], "0.000000000");
        assert_eq!(parts[1], "0.000000");
        assert_eq!(parts[3], "0.500000");
    }

    #[test]
    fn empty_pcm_errors() {
        assert!(pcm_to_pwl(&[]).is_err());
    }
}
