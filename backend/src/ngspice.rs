// SPDX-License-Identifier: GPL-3.0-only

//! ngspice 驱动。
//!
//! 现阶段实现 **子进程 CLI** 策略：把网表写成临时文件，调用 `ngspice -b`
//! 批处理模式，强制输出 ASCII rawfile，再解析成结构化的 {@link SimulationResult}。
//!
//! 另一种策略（libngspice FFI）适合长时间交互与流式输出，留待后续按需接入。

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};

use crate::netlist::Netlist;
use crate::protocol::{AnalysisKind, SimulationResult, Trace};

/// AC 分析扫描方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcSweep {
    Dec,
    Oct,
    Lin,
}

/// 一次仿真分析参数（随 {@link AnalysisKind} 类型不同而不同）。
#[derive(Debug, Clone, PartialEq)]
pub enum AnalysisParams {
    Op,
    Dc {
        /// 被扫描的源（ngspice 器件名，如 `VB1`）。
        source: String,
        start: f64,
        stop: f64,
        step: f64,
    },
    Ac {
        sweep: AcSweep,
        points: u32,
        start: f64,
        stop: f64,
    },
    Tran {
        step: f64,
        /// 起始时间（秒）。
        start: f64,
        /// 持续时间（秒）；仿真到 start + duration。
        duration: f64,
    },
}

/// ngspice 驱动统一接口。
pub trait Ngspice {
    /// 运行一段网表并返回结构化仿真结果。
    fn run(
        &mut self,
        netlist: &Netlist,
        analysis: AnalysisKind,
        params: &AnalysisParams,
    ) -> Result<SimulationResult, String>;
}

/// 子进程 CLI 驱动。
pub struct CliNgspice {
    binary: String,
}

/// 跨实例共享的临时目录序号，保证并发运行时不互相覆盖。
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// 当前正在运行的 ngspice 子进程 pid（0 表示无运行中进程）。
static RUNNING_PID: AtomicI32 = AtomicI32::new(0);

/// 终止当前正在运行的 ngspice 仿真（若有）。返回是否确实发出了终止。
pub fn stop_running() -> bool {
    let pid = RUNNING_PID.load(Ordering::SeqCst);
    if pid <= 0 {
        return false;
    }
    // SIGKILL 强制结束（ngspice CLI 无优雅中断信号）
    let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output();
    true
}

impl CliNgspice {
    /// 用 `ngspice`（可用 `BREADSPICE_NGSPICE` 环境变量覆盖）构造。
    pub fn new() -> Self {
        let binary =
            std::env::var("BREADSPICE_NGSPICE").unwrap_or_else(|_| "ngspice".to_string());
        Self { binary }
    }
}

impl Default for CliNgspice {
    fn default() -> Self {
        Self::new()
    }
}

/// 把分析类型 + 参数编译成 ngspice 分析行。
pub fn analysis_line(analysis: AnalysisKind, params: &AnalysisParams) -> Result<String, String> {
    match (analysis, params) {
        (AnalysisKind::Op, _) => Ok(".op".to_string()),
        (AnalysisKind::Dc, AnalysisParams::Dc { source, start, stop, step }) => {
            Ok(format!(".dc {source} {start} {stop} {step}"))
        }
        (AnalysisKind::Ac, AnalysisParams::Ac { sweep, points, start, stop }) => {
            let s = match sweep {
                AcSweep::Dec => "dec",
                AcSweep::Oct => "oct",
                AcSweep::Lin => "lin",
            };
            Ok(format!(".ac {s} {points} {start} {stop}"))
        }
        (AnalysisKind::Tran, AnalysisParams::Tran { step, start, duration }) => {
            // .tran step stop start：从 start 开始保存，持续 duration
            Ok(format!(".tran {step} {} {start}", start + duration))
        }
        (a, p) => Err(format!("分析类型 {a:?} 与参数 {p:?} 不匹配")),
    }
}

/// 在网表末尾（`.end` 之前）注入分析行。rawfile 由 `ngspice -r` 增量写出，
/// `filetype=ascii` 通过工作目录下的 `.spiceinit` 设置。
fn build_batch_netlist(netlist_text: &str, analysis_line: &str) -> String {
    let body = netlist_text.trim_end();
    let body = body.strip_suffix(".end").unwrap_or(body).trim_end();
    format!("{body}\n{analysis_line}\n.end\n")
}

/// 解析 ASCII rawfile（SPICE3 格式）。
struct ParsedRaw {
    variables: Vec<String>,
    points: Vec<Vec<f64>>,
}

#[derive(PartialEq)]
enum Section {
    Header,
    Variables,
    Values,
}

/// 解析单个数值；`complex` 时接受 `re,im`。独立变量（index_in_point == 0，如 ac 的
/// frequency）取实部（`-r` 模式下其虚部为未初始化垃圾值），其余取模长。
fn parse_value(token: &str, flags: &str, index_in_point: usize) -> Result<f64, String> {
    if flags == "complex" {
        let (re, im) = token
            .split_once(',')
            .ok_or_else(|| format!("非法复数 {token}"))?;
        let re: f64 = re.trim().parse().map_err(|_| format!("非法实部 {re}"))?;
        let im: f64 = im.trim().parse().map_err(|_| format!("非法虚部 {im}"))?;
        if index_in_point == 0 {
            Ok(re)
        } else {
            Ok((re * re + im * im).sqrt())
        }
    } else {
        token.parse::<f64>().map_err(|_| format!("非法数值 {token}"))
    }
}

fn parse_rawfile(text: &str) -> Result<ParsedRaw, String> {
    let mut flags = String::new();
    let mut n_vars = 0usize;
    let mut variables: Vec<String> = Vec::new();
    let mut values: Vec<f64> = Vec::new();

    let mut section = Section::Header;
    let mut value_count = 0usize;
    for line in text.lines() {
        match section {
            Section::Header => {
                if let Some(v) = line.strip_prefix("Flags: ") {
                    flags = v.trim().to_string();
                } else if let Some(v) = line.strip_prefix("No. Variables: ") {
                    n_vars = v
                        .trim()
                        .parse()
                        .map_err(|_| "No. Variables 解析失败".to_string())?;
                } else if line.trim() == "Variables:" {
                    section = Section::Variables;
                }
            }
            Section::Variables => {
                if line.trim() == "Values:" {
                    section = Section::Values;
                } else if !line.trim().is_empty() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        variables.push(parts[1].to_string());
                    }
                }
            }
            Section::Values => {
                if line.trim().is_empty() {
                    continue;
                }
                let token = line
                    .split_whitespace()
                    .last()
                    .ok_or_else(|| "rawfile Values 行为空".to_string())?;
                let idx = value_count % n_vars.max(1);
                values.push(parse_value(token, &flags, idx)?);
                value_count += 1;
            }
        }
    }

    if n_vars == 0 {
        return Err("rawfile 缺少 No. Variables".to_string());
    }
    if values.len() < n_vars {
        return Err(format!("rawfile 数值不足一个点：读取 {} 个值", values.len()));
    }
    // 容忍被截断的 rawfile（-r 增量写出、被提前终止时 No. Points 可能为 0 或与实际不符）：
    // 按完整点（每点 n_vars 个值）重塑，忽略尾部不完整的点。
    let n_points = values.len() / n_vars;
    let points: Vec<Vec<f64>> = (0..n_points)
        .map(|p| values[p * n_vars..(p + 1) * n_vars].to_vec())
        .collect();

    Ok(ParsedRaw { variables, points })
}

impl ParsedRaw {
    /// 转成前端协议里的 {@link SimulationResult}。
    fn into_simulation_result(self, analysis: AnalysisKind) -> SimulationResult {
        if analysis == AnalysisKind::Op {
            let mut op = HashMap::new();
            if let Some(row) = self.points.first() {
                for (i, name) in self.variables.iter().enumerate() {
                    if let Some(v) = row.get(i) {
                        op.insert(name.clone(), *v);
                    }
                }
            }
            SimulationResult {
                ok: true,
                cancelled: false,
                error: None,
                op: Some(op),
                traces: None,
            }
        } else {
            let mut traces: Vec<Trace> = Vec::new();
            if !self.variables.is_empty() && !self.points.is_empty() {
                // 第 0 列是独立变量（time / v-sweep / frequency）。
                let x: Vec<f64> = self.points.iter().map(|row| row[0]).collect();
                for i in 1..self.variables.len() {
                    let y: Vec<f64> = self.points.iter().map(|row| row[i]).collect();
                    traces.push(Trace {
                        name: self.variables[i].clone(),
                        x: x.clone(),
                        y,
                    });
                }
            }
            SimulationResult {
                ok: true,
                cancelled: false,
                error: None,
                op: None,
                traces: Some(traces),
            }
        }
    }
}

impl Ngspice for CliNgspice {
    fn run(
        &mut self,
        netlist: &Netlist,
        analysis: AnalysisKind,
        params: &AnalysisParams,
    ) -> Result<SimulationResult, String> {
        let aline = analysis_line(analysis, params)?;

        let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let workdir = std::env::temp_dir().join(format!("breadspice-{}-{}", std::process::id(), seq));
        std::fs::create_dir_all(&workdir).map_err(|e| format!("创建临时目录失败：{e}"))?;

        let batch = build_batch_netlist(&netlist.text, &aline);
        std::fs::write(workdir.join("circuit.cir"), batch).map_err(|e| format!("写网表失败：{e}"))?;
        // 通过 .spiceinit 强制 ASCII rawfile（-r 增量写出）
        std::fs::write(workdir.join(".spiceinit"), "set filetype=ascii\n")
            .map_err(|e| format!("写 .spiceinit 失败：{e}"))?;

        let child = Command::new(&self.binary)
            .arg("-b")
            .arg("-r")
            .arg("result.raw")
            .arg("circuit.cir")
            .current_dir(&workdir)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法启动 ngspice（{}）：{e}", self.binary))?;

        // 记录 pid，供 stop_running() 提前终止
        RUNNING_PID.store(child.id() as i32, Ordering::SeqCst);
        let output = child.wait_with_output();
        RUNNING_PID.store(0, Ordering::SeqCst);

        let output = output.map_err(|e| format!("等待 ngspice 结束失败：{e}"))?;

        // ngspice 对 tran/dc/ac 若无 .print/.plot/.fourier 会以非零码退出，
        // 但 rawfile 此时已正确写入；因此以 rawfile 是否可解析作为成功依据。
        let parsed: Result<ParsedRaw, String> = std::fs::read_to_string(workdir.join("result.raw"))
            .map_err(|e| format!("读取 rawfile 失败：{e}"))
            .and_then(|text| parse_rawfile(&text));

        let _ = std::fs::remove_dir_all(&workdir);

        match parsed {
            Ok(data) => {
                let mut result = data.into_simulation_result(analysis);
                // 被信号终止（退出码为 None）→ 保留部分结果并标记取消
                if output.status.code().is_none() {
                    result.cancelled = true;
                }
                Ok(result)
            }
            Err(parse_err) => {
                // 被信号终止且无 rawfile 可解析 → 返回空结果并标记取消
                if output.status.code().is_none() {
                    return Ok(SimulationResult {
                        ok: true,
                        cancelled: true,
                        error: None,
                        op: None,
                        traces: None,
                    });
                }
                let mut msg = format!("ngspice 仿真失败：{parse_err}");
                msg.push_str(&format!(
                    "\n退出码 {:?}\n--- stderr ---\n{}",
                    output.status.code(),
                    String::from_utf8_lossy(&output.stderr),
                ));
                Err(msg)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analysis_lines() {
        assert_eq!(analysis_line(AnalysisKind::Op, &AnalysisParams::Op).unwrap(), ".op");
        assert_eq!(
            analysis_line(
                AnalysisKind::Dc,
                &AnalysisParams::Dc { source: "VB1".into(), start: 0.0, stop: 9.0, step: 0.5 }
            )
            .unwrap(),
            ".dc VB1 0 9 0.5"
        );
        assert_eq!(
            analysis_line(
                AnalysisKind::Ac,
                &AnalysisParams::Ac { sweep: AcSweep::Dec, points: 10, start: 1.0, stop: 1e6 }
            )
            .unwrap(),
            ".ac dec 10 1 1000000"
        );
        assert_eq!(
            analysis_line(
                AnalysisKind::Tran,
                &AnalysisParams::Tran { step: 0.00001, start: 0.19, duration: 0.01 }
            )
            .unwrap(),
            ".tran 0.00001 0.2 0.19"
        );
    }

    #[test]
    fn parses_op_rawfile() {
        let raw = "\
Title: test
Date: Fri Aug 28 08:33:56  2026
Plotname: Operating Point
Flags: real
No. Variables: 3
No. Points: 1
Variables:
\t0\tv(in)\tvoltage
\t1\tv(out)\tvoltage
\t2\ti(v1)\tcurrent
Values:
 0\t9.000000000000000e+00
\t4.500000000000001e+00
\t-4.500000000000000e-03
";
        let parsed = parse_rawfile(raw).unwrap();
        assert_eq!(parsed.variables, vec!["v(in)", "v(out)", "i(v1)"]);
        assert_eq!(parsed.points.len(), 1);
        assert_eq!(parsed.points[0], vec![9.0, 4.500000000000001, -0.0045]);
    }

    #[test]
    fn parses_tran_rawfile_to_traces() {
        let raw = "\
Title: rc
Plotname: Transient Analysis
Flags: real
No. Variables: 3
No. Points: 2
Variables:
\t0\ttime\ttime
\t1\tv(out)\tvoltage
\t2\ti(v1)\tcurrent
Values:
 0\t0.000000000000000e+00
\t0.000000000000000e+00
\t1.000000000000000e-03

 1\t1.000000000000000e-08
\t6.283185303045417e-05
\t2.000000000000000e-03
";
        let parsed = parse_rawfile(raw).unwrap();
        let result = parsed.into_simulation_result(AnalysisKind::Tran);
        let traces = result.traces.unwrap();
        assert_eq!(traces.len(), 2);
        assert_eq!(traces[0].name, "v(out)");
        assert_eq!(traces[0].x, vec![0.0, 1e-8]);
        assert_eq!(traces[0].y, vec![0.0, 6.283185303045417e-05]);
        assert_eq!(traces[1].name, "i(v1)");
    }

    #[test]
    fn parses_truncated_rawfile() {
        // -r 增量写出时被提前终止：头部 No. Points 为 0，Values 只有部分完整点
        let raw = "\
Title: t
Plotname: Transient Analysis
Flags: real
No. Variables: 3
No. Points: 0
Variables:
\t0\ttime\ttime
\t1\tv(out)\tvoltage
\t2\ti(v1)\tcurrent
Values:
 0\t0.000000000000000e+00
\t0.000000000000000e+00
\t1.000000000000000e-03
";
        let parsed = parse_rawfile(raw).unwrap();
        assert_eq!(parsed.points.len(), 1);
        assert_eq!(parsed.points[0], vec![0.0, 0.0, 1e-3]);
    }

    #[test]
    fn parses_ac_complex_as_magnitude() {
        let raw = "\
Title: ac
Plotname: AC Analysis
Flags: complex
No. Variables: 2
No. Points: 1
Variables:
\t0\tfrequency\tfrequency grid=3
\t1\tv(out)\tvoltage
Values:
 0\t1.000000000000000e+01,0.000000000000000e+00
\t3.000000000000000e+00,4.000000000000000e+00
";
        let parsed = parse_rawfile(raw).unwrap();
        let result = parsed.into_simulation_result(AnalysisKind::Ac);
        let traces = result.traces.unwrap();
        assert_eq!(traces[0].name, "v(out)");
        assert_eq!(traces[0].x, vec![10.0]);
        // |3+4j| = 5
        assert!((traces[0].y[0] - 5.0).abs() < 1e-9);
    }

    /// `-r` 模式下 ac 的 frequency 变量带未初始化虚部垃圾值，应取实部。
    #[test]
    fn ac_frequency_uses_real_part() {
        let raw = "\
Title: ac
Plotname: AC Analysis
Flags: complex
No. Variables: 2
No. Points: 1
Variables:
\t0\tfrequency\tfrequency grid=3
\t1\tv(out)\tvoltage
Values:
 0\t2.000000000000000e+01,1.738308331656823e+142
\t2.000000000000000e-01,0.000000000000000e+00
";
        let parsed = parse_rawfile(raw).unwrap();
        let result = parsed.into_simulation_result(AnalysisKind::Ac);
        let traces = result.traces.unwrap();
        assert_eq!(traces[0].name, "v(out)");
        // 频率取实部 20，忽略垃圾虚部
        assert_eq!(traces[0].x, vec![20.0]);
        // v(out) = 0.2 + 0j → 模长 0.2
        assert!((traces[0].y[0] - 0.2).abs() < 1e-12);
    }

    /// 真跑 ngspice：电压分压器 op + tran（找不到 ngspice 时自动跳过）。
    #[test]
    fn real_ngspice_op_and_tran() {
        if Command::new("ngspice").arg("--version").output().is_err() {
            eprintln!("跳过：未找到 ngspice");
            return;
        }

        let netlist = Netlist {
            text: "* voltage divider test\nV1 in 0 9\nR1 in out 1k\nR2 out 0 1k\n.end\n"
                .to_string(),
            devices: Vec::new(),
        };
        let mut spice = CliNgspice::new();

        let op = spice
            .run(&netlist, AnalysisKind::Op, &AnalysisParams::Op)
            .unwrap();
        assert!(op.ok);
        let vout = op.op.as_ref().unwrap().get("v(out)").copied().unwrap_or(f64::NAN);
        assert!((vout - 4.5).abs() < 1e-6, "v(out) = {vout}");

        let tran = spice
            .run(
                &netlist,
                AnalysisKind::Tran,
                &AnalysisParams::Tran { step: 1e-5, start: 0.0, duration: 1e-3 },
            )
            .unwrap();
        assert!(tran.ok);
        let traces = tran.traces.as_ref().unwrap();
        assert!(traces.iter().any(|t| t.name == "v(out)"));
    }

    /// 端到端：ac 分析应产出非零幅值，且 frequency 轴取实部（回归：AC 关键字缺失 / 频率垃圾虚部）。
    #[test]
    fn real_ngspice_ac_nonzero_magnitude() {
        if Command::new("ngspice").arg("--version").output().is_err() {
            eprintln!("跳过：未找到 ngspice");
            return;
        }
        // vsine 带 DC/AC，1k/1k 分压：v(out) 应为 0.5（AC=1）。
        let netlist = Netlist {
            text: "* ac divider\nV1 in 0 DC 0 AC 1 SIN(0 1 1k 0 0 0)\nR1 in out 1k\nR2 out 0 1k\n.end\n"
                .to_string(),
            devices: Vec::new(),
        };
        let mut spice = CliNgspice::new();
        let ac = spice
            .run(
                &netlist,
                AnalysisKind::Ac,
                &AnalysisParams::Ac { sweep: AcSweep::Dec, points: 10, start: 1.0, stop: 1e6 },
            )
            .unwrap();
        assert!(ac.ok, "ac 失败：{:?}", ac.error);
        let traces = ac.traces.as_ref().expect("ac 应有 traces");
        let vout = traces.iter().find(|t| t.name == "v(out)").expect("应有 v(out)");
        // x 轴频率应单调递增且为正（垃圾虚部被剔除）
        assert!(vout.x.iter().all(|f| f.is_finite() && *f > 0.0), "频率轴异常：{:?}", &vout.x[..8.min(vout.x.len())]);
        assert!(vout.x.windows(2).all(|w| w[1] > w[0]), "频率轴应单调递增");
        // 幅值非零（约 0.5）
        let max_amp = vout.y.iter().cloned().fold(0.0f64, f64::max);
        assert!((max_amp - 0.5).abs() < 1e-6, "v(out) 幅值应为 0.5，实际 {max_amp}");
    }

    /// 端到端：build_netlist（含 GND 元件接地）-> ngspice op。
    #[test]
    fn real_ngspice_full_pipeline_battery_divider() {
        if Command::new("ngspice").arg("--version").output().is_err() {
            eprintln!("跳过：未找到 ngspice");
            return;
        }
        use crate::domain::{
            BreadboardLayout, BreadboardNode, Circuit, ComponentInstance, ComponentKind,
            ComponentPin, Net,
        };
        use crate::netlist::build_netlist;

        let nets = vec![
            Net { id: "t1L".into(), node_ids: vec!["t1a".into(), "t1b".into()] },
            Net { id: "rail_Lp".into(), node_ids: vec!["rail_Lp_1".into()] },
            Net { id: "rail_Lm".into(), node_ids: vec!["rail_Lm_1".into()] },
        ];
        let nodes = vec![
            BreadboardNode { id: "t1a".into(), net_id: "t1L".into(), row: "a".into(), column: 1, x: 0.0, y: 0.0 },
            BreadboardNode { id: "t1b".into(), net_id: "t1L".into(), row: "b".into(), column: 1, x: 0.0, y: 0.0 },
            BreadboardNode { id: "rail_Lp_1".into(), net_id: "rail_Lp".into(), row: "+".into(), column: 1, x: 0.0, y: 0.0 },
            BreadboardNode { id: "rail_Lm_1".into(), net_id: "rail_Lm".into(), row: "-".into(), column: 1, x: 0.0, y: 0.0 },
        ];
        let pin = |name: &str, node: &str| ComponentPin {
            name: name.into(),
            x: 0.0,
            y: 0.0,
            node: Some(node.into()),
        };
        let mk = |id: &str, kind: ComponentKind, refdes: &str, value: &str, unit: Option<&str>, pins: Vec<ComponentPin>| {
            ComponentInstance {
                id: id.into(),
                kind,
                refdes: refdes.into(),
                value: value.into(),
                unit: unit.map(|s| s.to_string()),
                pins,
                x: 0.0,
                y: 0.0,
                rotation: 0.0,
                control: None,
                color: None,
                params: None,
            }
        };
        let components = vec![
            mk("c1", ComponentKind::Power, "B1", "9", Some("V"), vec![pin("+", "rail_Lp_1"), pin("−", "rail_Lm_1")]),
            mk("c2", ComponentKind::Resistor, "R1", "1", Some("kΩ"), vec![pin("1", "t1a"), pin("2", "rail_Lp_1")]),
            mk("c3", ComponentKind::Resistor, "R2", "1", Some("kΩ"), vec![pin("1", "t1b"), pin("2", "rail_Lm_1")]),
            mk("c4", ComponentKind::Gnd, "G1", "", None, vec![pin("gnd", "rail_Lm_1")]),
        ];
        let circuit = Circuit {
            breadboard: BreadboardLayout { id: "mb".into(), name: "mb".into(), nodes, nets },
            components,
        };

        let netlist = build_netlist(&circuit);
        assert!(netlist.text.contains("VB1 n_rail_Lp 0 9"));
        assert!(netlist.text.contains("RR2 n_t1L 0 1k"));

        let mut spice = CliNgspice::new();
        let op = spice.run(&netlist, AnalysisKind::Op, &AnalysisParams::Op).unwrap();
        assert!(op.ok);
        let voltages: Vec<f64> = op.op.as_ref().unwrap().values().copied().filter(|v| v.abs() > 1e-9).collect();
        assert!(voltages.iter().any(|v| (v - 9.0).abs() < 1e-6), "应有 9V 节点：{voltages:?}");
        assert!(voltages.iter().any(|v| (v - 4.5).abs() < 1e-6), "应有 4.5V 节点：{voltages:?}");
    }
}
