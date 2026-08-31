// SPDX-License-Identifier: GPL-3.0-only

//! 网表生成。
//!
//! 把 {@link Circuit}（元件 + 引脚所落孔位）展开为 ngspice 可执行的
//! SPICE 文本。规则与前端 `MockBackend` 里的“参考实现”保持一致，便于两端对拍；
//! 并注入 {@link crate::models::MODELS_LIB}（.MODEL / .SUBCKT），使网表自包含。
//!
//! 关键映射：
//! - 引脚所落插孔 -> 该插孔所属 net -> SPICE 节点名（如 `n_t3L`）；
//! - 元件类型 -> 器件首字母：R/C/L/D/Q/M/J/X/V；
//! - 跳线/导线 -> 近零电阻；电源 -> 理想直流源。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::domain::{Circuit, ComponentInstance, ComponentKind, NetId, NodeId};
use crate::models::MODELS_LIB;

/// 后端返回的网表。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Netlist {
    pub text: String,
    pub devices: Vec<NetlistDevice>,
}

/// 网表中的一条器件行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetlistDevice {
    /// 器件首字母：R/C/L/D/Q/M/J/X/V。
    pub r#type: String,
    /// 器件引用名：R1/C2/U1。
    pub name: String,
    /// 对应前端的元件实例 id。
    pub component_id: String,
    /// 原始 SPICE 行。
    pub line: String,
}

/// 电气网 id -> SPICE 节点名。SPICE 节点名不能以数字开头，因此统一加 `n_` 前缀，
/// 并把非 `[A-Za-z0-9_]` 字符替换为 `_`。
fn node_name(net_id: &str) -> String {
    let sanitized: String = net_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("n_{sanitized}")
}

/// 元件种类 -> ngspice 器件首字母。
fn spice_prefix(kind: ComponentKind) -> &'static str {
    match kind {
        ComponentKind::Resistor => "R",
        ComponentKind::Capacitor => "C",
        ComponentKind::Inductor => "L",
        ComponentKind::Diode | ComponentKind::Led => "D",
        ComponentKind::Npn | ComponentKind::Pnp => "Q",
        ComponentKind::Nmos | ComponentKind::Pmos => "M",
        ComponentKind::Jfet => "J",
        ComponentKind::Opamp => "X",
        // 跳线 / 导线以近零电阻 R 近似
        ComponentKind::Jumper | ComponentKind::Wire => "R",
        ComponentKind::Power => "V",
        // 接地标记：不产生器件（占位，实际在 build_netlist 中跳过）
        ComponentKind::Gnd => "0",
        // 正弦波发生器 -> 正弦电压源
        ComponentKind::Vsine => "V",
        // 电压表 -> 大电阻采样
        ComponentKind::Voltmeter => "R",
        // 电流表 -> 小电阻采样
        ComponentKind::Ammeter => "R",
        // 示波器 -> 探针（读取 raw 波形）
        ComponentKind::Oscilloscope => "X",
        ComponentKind::Generic => "X",
    }
}

/// 把「数值 + 单位」折叠成 SPICE 后缀表示（µ→u, kΩ→k, MΩ→Meg, Ω→""）。
/// 单位未识别时原样拼接，与前端 Mock 参考实现一致。
fn spice_value(value: &str, unit: Option<&str>) -> String {
    let Some(unit) = unit else {
        return value.to_string();
    };
    let suffix = match unit {
        "Ω" => "",
        "kΩ" => "k",
        "MΩ" => "Meg",
        "GΩ" => "G",
        "pF" => "p",
        "nF" => "n",
        "µF" | "uF" => "u",
        "mF" => "m",
        "F" => "",
        "µH" | "uH" => "u",
        "mH" => "m",
        "H" => "",
        "V" => "",
        "mV" => "m",
        other => other,
    };
    format!("{value}{suffix}")
}

/// 元件 -> ngspice 模型/子电路名。
///
/// 大多数器件的模型名即 `value`（如 `1N4148`、`BC549C`、`J201`），少数需要映射：
/// - LED 的 `value` 是颜色（red/green/blue），模型名是 LedRed/LedGreen/LedBLUE；
/// - 运放的 `value` 是 OP07，子电路名是 OP07A。
fn model_name(comp: &ComponentInstance) -> String {
    match comp.kind {
        ComponentKind::Led => match comp.value.as_str() {
            "red" => "LedRed".to_string(),
            "green" => "LedGreen".to_string(),
            "blue" => "LedBLUE".to_string(),
            other => other.to_string(),
        },
        ComponentKind::Opamp => match comp.value.as_str() {
            "OP07" => "OP07A".to_string(),
            other => other.to_string(),
        },
        _ => comp.value.clone(),
    }
}

/// 取第 `index` 个节点，越界时退化为接地 `0`（与 Mock 的 `?? "0"` 一致）。
fn node_or_ground(nodes: &[String], index: usize) -> &str {
    nodes.get(index).map(String::as_str).unwrap_or("0")
}

/// 从元件 `params` 里取字符串参数，缺省时回退到 `default`。
fn param_or<'a>(
    params: Option<&'a HashMap<String, String>>,
    key: &str,
    default: &'a str,
) -> &'a str {
    params
        .and_then(|p| p.get(key))
        .map(String::as_str)
        .unwrap_or(default)
}

/// 解析电路的地网集合（映射到 ngspice 节点 0）。
///
/// 只有显式接地元件（`gnd`）能定义地：每个 Gnd 引脚所在 net 都接地。
/// 电池不再自动接地。
fn resolve_ground_nets(
    circuit: &Circuit,
    node_to_net: &HashMap<NodeId, NetId>,
) -> HashSet<NetId> {
    let mut grounds = HashSet::new();

    for comp in &circuit.components {
        if comp.kind == ComponentKind::Gnd {
            if let Some(pin) = comp.pins.first() {
                if let Some(net) = pin.node.as_ref().and_then(|n| node_to_net.get(n)) {
                    grounds.insert(net.clone());
                }
            }
        }
    }

    grounds
}

/// 单个元件 -> 一行 SPICE 器件文本。
fn build_device_line(
    comp: &ComponentInstance,
    resolve_node: &mut dyn FnMut(&NetId) -> String,
    node_to_net: &HashMap<NodeId, NetId>,
) -> String {
    let prefix = spice_prefix(comp.kind);

    // 引脚所落插孔 -> 该插孔所属 net -> SPICE 节点名；未连接默认接地（占位）。
    let nodes: Vec<String> = comp
        .pins
        .iter()
        .map(|pin| match &pin.node {
            Some(node) => match node_to_net.get(node) {
                Some(net_id) => resolve_node(net_id),
                None => "0".to_string(),
            },
            None => "0".to_string(),
        })
        .collect();

    // 按引脚名解析节点（用于需要特定引脚顺序的器件，如运放的 5 端口）。
    let mut pin_node = |name: &str| -> String {
        comp.pins
            .iter()
            .find(|p| p.name == name)
            .and_then(|p| p.node.as_ref())
            .and_then(|node| node_to_net.get(node))
            .map(|net_id| resolve_node(net_id))
            .unwrap_or_else(|| "0".to_string())
    };

    let n0 = node_or_ground(&nodes, 0);
    let n1 = node_or_ground(&nodes, 1);
    let refdes = comp.refdes.as_str();
    let value = comp.value.as_str();

    match comp.kind {
        // 理想直流源：V<name> <+> <-> <value>
        ComponentKind::Power => {
            format!(
                "{prefix}{refdes} {n0} {n1} {}",
                spice_value(value, comp.unit.as_deref())
            )
        }
        // 正弦电压源：V<name> <+> <-> SIN(dc ac freq 0 0 phase)
        ComponentKind::Vsine => {
            let params = comp.params.as_ref();
            let dc = param_or(params, "dc", "0");
            let ac = param_or(params, "ac", "1");
            let freq = param_or(params, "freq", "1k");
            let phase = param_or(params, "phase", "0");
            format!("{prefix}{refdes} {n0} {n1} SIN({dc} {ac} {freq} 0 0 {phase})")
        }
        // 电压表：10000MΩ 采样电阻，后端读两端节点电压差
        ComponentKind::Voltmeter => format!("{prefix}{refdes} {n0} {n1} 10000Meg"),
        // 电流表：1mΩ 采样电阻，后端读流经自身的电流
        ComponentKind::Ammeter => format!("{prefix}{refdes} {n0} {n1} 1m"),
        // 示波器：不产生器件，仅记录探针节点，后端读 raw 波形
        ComponentKind::Oscilloscope => format!("* probe {refdes}: V({n0})"),
        // 导线 / 跳线：近零电阻
        ComponentKind::Jumper | ComponentKind::Wire => {
            format!("{prefix}{refdes} {n0} {n1} 0.001")
        }
        // 运放：X<name> <IN+> <IN-> <V+> <V-> <OUT> <subckt>（端口按子电路定义顺序）
        ComponentKind::Opamp => format!(
            "X{refdes} {} {} {} {} {} {}",
            pin_node("IN+"),
            pin_node("IN-"),
            pin_node("V+"),
            pin_node("V-"),
            pin_node("OUT"),
            model_name(comp)
        ),
        // 二极管 / LED：D<name> <阳极> <阴极> <模型名>
        ComponentKind::Diode | ComponentKind::Led => {
            format!("{prefix}{refdes} {n0} {n1} {}", model_name(comp))
        }
        // 无源器件（R/C/L）：数值 + 单位后缀
        ComponentKind::Resistor | ComponentKind::Capacitor | ComponentKind::Inductor => {
            format!(
                "{prefix}{refdes} {n0} {n1} {}",
                spice_value(value, comp.unit.as_deref())
            )
        }
        // 三端器件：BJT / MOS / JFET，引脚顺序即标准 SPICE 顺序（C/B/E、D/G/S）
        ComponentKind::Npn
        | ComponentKind::Pnp
        | ComponentKind::Nmos
        | ComponentKind::Pmos
        | ComponentKind::Jfet => {
            format!("{prefix}{refdes} {} {}", nodes.join(" "), model_name(comp))
        }
        // 接地标记：不产生器件（在 build_netlist 中被跳过）
        ComponentKind::Gnd => String::new(),
        // 其余（generic）：2 引脚 -> 数值；3+ 引脚 -> 退化连接 + 参数
        ComponentKind::Generic => {
            if nodes.len() == 2 {
                format!(
                    "{prefix}{refdes} {n0} {n1} {}",
                    spice_value(value, comp.unit.as_deref())
                )
            } else {
                format!("{prefix}{refdes} {} {value}", nodes.join(" "))
            }
        }
    }
}

/// 把电路编译为 ngspice 网表。
pub fn build_netlist(circuit: &Circuit) -> Netlist {
    let mut devices: Vec<NetlistDevice> = Vec::new();
    let mut lines: Vec<String> = vec![
        "* Virtual breadboard netlist (reference)".to_string(),
        String::new(),
    ];

    // 建立 node id -> net id 索引。
    let mut node_to_net: HashMap<NodeId, NetId> = HashMap::new();
    for net in &circuit.breadboard.nets {
        for node_id in &net.node_ids {
            node_to_net.insert(node_id.clone(), net.id.clone());
        }
    }

    // 地网 -> ngspice 节点 0。
    let ground_nets = resolve_ground_nets(circuit, &node_to_net);

    // net id -> 节点名缓存。
    let mut node_cache: HashMap<NetId, String> = HashMap::new();
    let mut resolve_node = |net_id: &NetId| -> String {
        if ground_nets.contains(net_id) {
            return "0".to_string();
        }
        if let Some(n) = node_cache.get(net_id) {
            return n.clone();
        }
        let n = node_name(net_id);
        node_cache.insert(net_id.clone(), n.clone());
        n
    };

    for comp in &circuit.components {
        if comp.kind == ComponentKind::Gnd {
            // 接地标记：不产生器件，仅记录其把所在 net 接到节点 0。
            lines.push(format!("* gnd {}: node 0", comp.refdes));
            continue;
        }
        let prefix = spice_prefix(comp.kind);
        let line = build_device_line(comp, &mut resolve_node, &node_to_net);

        lines.push(line.clone());
        devices.push(NetlistDevice {
            r#type: prefix.to_string(),
            name: comp.refdes.clone(),
            component_id: comp.id.clone(),
            line,
        });
    }

    // 注入器件模型库（.MODEL / .SUBCKT），使网表自包含、可直接交给 ngspice 仿真。
    lines.push(String::new());
    lines.push(MODELS_LIB.trim().to_string());

    lines.push(".end".to_string());
    lines.push(String::new());

    Netlist {
        text: lines.join("\n"),
        devices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        BreadboardLayout, BreadboardNode, ComponentPin, ComponentInstance, Net,
    };

    fn node(id: &str, net_id: &str) -> BreadboardNode {
        BreadboardNode {
            id: id.into(),
            net_id: net_id.into(),
            row: "a".into(),
            column: 1,
            x: 0.0,
            y: 0.0,
        }
    }

    fn net(id: &str, node_ids: &[&str]) -> Net {
        Net {
            id: id.into(),
            node_ids: node_ids.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn pin(name: &str, node: Option<&str>) -> ComponentPin {
        ComponentPin {
            name: name.into(),
            x: 0.0,
            y: 0.0,
            node: node.map(|s| s.to_string()),
        }
    }

    fn comp(
        id: &str,
        kind: ComponentKind,
        refdes: &str,
        value: &str,
        unit: Option<&str>,
        pins: Vec<ComponentPin>,
    ) -> ComponentInstance {
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
    }

    fn sample_circuit() -> Circuit {
        let nets = vec![
            net("t1L", &["t1a", "t1b"]),
            net("t1R", &["t1f"]),
            net("rail_Lp", &["rail_Lp_1"]),
            net("rail_Lm", &["rail_Lm_1"]),
        ];
        let nodes = vec![
            node("t1a", "t1L"),
            node("t1b", "t1L"),
            node("t1f", "t1R"),
            node("rail_Lp_1", "rail_Lp"),
            node("rail_Lm_1", "rail_Lm"),
        ];

        let components = vec![
            // 电阻 1kΩ：t1L -> 电源正轨
            comp(
                "c1",
                ComponentKind::Resistor,
                "R1",
                "1",
                Some("kΩ"),
                vec![pin("1", Some("t1a")), pin("2", Some("rail_Lp_1"))],
            ),
            // 电池 9V：正轨 -> 负轨
            comp(
                "c2",
                ComponentKind::Power,
                "B1",
                "9",
                Some("V"),
                vec![pin("+", Some("rail_Lp_1")), pin("−", Some("rail_Lm_1"))],
            ),
            // 电容 10µF：t1R -> 负轨
            comp(
                "c3",
                ComponentKind::Capacitor,
                "C1",
                "10",
                Some("µF"),
                vec![pin("1", Some("t1f")), pin("2", Some("rail_Lm_1"))],
            ),
        ];

        Circuit {
            breadboard: BreadboardLayout {
                id: "mb102-rotated".into(),
                name: "面包板".into(),
                nodes,
                nets,
            },
            components,
        }
    }

    #[test]
    fn resistor_battery_capacitor_lines_match_mock_reference() {
        let circuit = sample_circuit();
        let netlist = build_netlist(&circuit);

        assert_eq!(netlist.devices.len(), 3);

        // R1 1kΩ
        assert_eq!(netlist.devices[0].r#type, "R");
        assert_eq!(netlist.devices[0].name, "R1");
        assert_eq!(netlist.devices[0].component_id, "c1");
        assert_eq!(netlist.devices[0].line, "RR1 n_t1L n_rail_Lp 1k");

        // B1 9V 电池（不自动接地）
        assert_eq!(netlist.devices[1].r#type, "V");
        assert_eq!(netlist.devices[1].line, "VB1 n_rail_Lp n_rail_Lm 9");

        // C1 10µF -> 10u
        assert_eq!(netlist.devices[2].r#type, "C");
        assert_eq!(netlist.devices[2].line, "CC1 n_t1R n_rail_Lm 10u");

        assert!(netlist.text.ends_with(".end\n"));
        assert!(netlist.text.starts_with("* Virtual breadboard netlist (reference)"));
    }

    #[test]
    fn vsine_meters_and_wire_match_mock_reference() {
        let mut circuit = sample_circuit();
        circuit.components = vec![
            // 正弦源：freq=1k, ac=1, dc=0, phase=0
            ComponentInstance {
                params: Some(HashMap::from([
                    ("freq".into(), "1k".into()),
                    ("ac".into(), "1".into()),
                    ("dc".into(), "0".into()),
                    ("phase".into(), "0".into()),
                ])),
                ..comp(
                    "s1",
                    ComponentKind::Vsine,
                    "S1",
                    "",
                    None,
                    vec![pin("+", Some("rail_Lp_1")), pin("−", Some("rail_Lm_1"))],
                )
            },
            // 电压表
            comp(
                "vm1",
                ComponentKind::Voltmeter,
                "VM1",
                "",
                None,
                vec![pin("+", Some("t1f")), pin("−", Some("rail_Lm_1"))],
            ),
            // 电流表
            comp(
                "am1",
                ComponentKind::Ammeter,
                "A1",
                "",
                None,
                vec![pin("1", Some("t1f")), pin("2", Some("rail_Lm_1"))],
            ),
            // 跳线
            comp(
                "w1",
                ComponentKind::Wire,
                "W1",
                "",
                None,
                vec![pin("1", Some("t1a")), pin("2", Some("t1b"))],
            ),
            // 示波器（探针）
            comp(
                "o1",
                ComponentKind::Oscilloscope,
                "X1",
                "",
                None,
                vec![pin("tip", Some("t1f")), pin("gnd", Some("rail_Lm_1"))],
            ),
        ];

        let netlist = build_netlist(&circuit);

        let lines: Vec<&str> = netlist.devices.iter().map(|d| d.line.as_str()).collect();
        assert_eq!(
            lines,
            vec![
                "VS1 n_rail_Lp n_rail_Lm SIN(0 1 1k 0 0 0)",
                "RVM1 n_t1R n_rail_Lm 10000Meg",
                "RA1 n_t1R n_rail_Lm 1m",
                "RW1 n_t1L n_t1L 0.001",
                "* probe X1: V(n_t1R)",
            ]
        );
    }

    #[test]
    fn diode_and_npn_match_mock_reference() {
        let mut circuit = sample_circuit();
        circuit.components = vec![
            comp(
                "d1",
                ComponentKind::Diode,
                "D1",
                "1N4148",
                None,
                vec![pin("a", Some("t1a")), pin("k", Some("t1b"))],
            ),
            comp(
                "q1",
                ComponentKind::Npn,
                "Q1",
                "BC549C",
                None,
                vec![
                    pin("C", Some("rail_Lp_1")),
                    pin("B", Some("t1a")),
                    pin("E", Some("rail_Lm_1")),
                ],
            ),
        ];

        let netlist = build_netlist(&circuit);
        let lines: Vec<&str> = netlist.devices.iter().map(|d| d.line.as_str()).collect();

        assert_eq!(
            lines,
            vec![
                "DD1 n_t1L n_t1L 1N4148",
                "QQ1 n_rail_Lp n_t1L n_rail_Lm BC549C",
            ]
        );
    }

    #[test]
    fn led_value_maps_to_model_name() {
        let mut circuit = sample_circuit();
        circuit.components = vec![comp(
            "led1",
            ComponentKind::Led,
            "D1",
            "red",
            None,
            vec![pin("a", Some("t1a")), pin("k", Some("t1b"))],
        )];

        let netlist = build_netlist(&circuit);
        assert_eq!(netlist.devices[0].line, "DD1 n_t1L n_t1L LedRed");
    }

    #[test]
    fn jfet_uses_j_prefix_and_model() {
        let mut circuit = sample_circuit();
        circuit.components = vec![comp(
            "j1",
            ComponentKind::Jfet,
            "J1",
            "J201",
            None,
            vec![
                pin("D", Some("rail_Lp_1")),
                pin("G", Some("t1a")),
                pin("S", Some("rail_Lm_1")),
            ],
        )];

        let netlist = build_netlist(&circuit);
        assert_eq!(netlist.devices[0].r#type, "J");
        assert_eq!(netlist.devices[0].line, "JJ1 n_rail_Lp n_t1L n_rail_Lm J201");
    }

    #[test]
    fn opamp_maps_ports_by_name() {
        let mut circuit = sample_circuit();
        circuit.components = vec![comp(
            "u1",
            ComponentKind::Opamp,
            "U1",
            "OP07",
            None,
            vec![
                pin("OFFSET", Some("t1a")), // 忽略
                pin("IN-", Some("t1b")),
                pin("IN+", Some("t1f")),
                pin("V-", Some("rail_Lm_1")),
                pin("OFFSET", Some("t1a")), // 忽略
                pin("OUT", Some("t1f")),
                pin("V+", Some("rail_Lp_1")),
                pin("NC", None), // 忽略
            ],
        )];

        let netlist = build_netlist(&circuit);
        assert_eq!(netlist.devices[0].r#type, "X");
        assert_eq!(
            netlist.devices[0].line,
            "XU1 n_t1R n_t1L n_rail_Lp n_rail_Lm n_t1R OP07A"
        );
    }

    #[test]
    fn unconnected_pin_defaults_to_ground() {
        let mut circuit = sample_circuit();
        circuit.components = vec![comp(
            "r1",
            ComponentKind::Resistor,
            "R1",
            "1",
            Some("kΩ"),
            vec![pin("1", Some("t1a")), pin("2", None)], // 引脚 2 悬空
        )];

        let netlist = build_netlist(&circuit);
        assert_eq!(netlist.devices[0].line, "RR1 n_t1L 0 1k");
    }

    #[test]
    fn gnd_component_grounds_its_net_and_skips_device() {
        let mut circuit = sample_circuit();
        // GND 接到 t1R（与电池无关的网）
        circuit.components.push(comp(
            "g1",
            ComponentKind::Gnd,
            "G1",
            "",
            None,
            vec![pin("gnd", Some("t1f"))],
        ));

        let netlist = build_netlist(&circuit);
        // 只有 R1/B1/C1 三个器件（GND 不产生器件）
        assert_eq!(netlist.devices.len(), 3);
        let lines: Vec<&str> = netlist.devices.iter().map(|d| d.line.as_str()).collect();
        assert_eq!(
            lines,
            vec![
                "RR1 n_t1L n_rail_Lp 1k",
                "VB1 n_rail_Lp n_rail_Lm 9",
                "CC1 0 n_rail_Lm 10u", // t1R -> 0
            ]
        );
        assert!(netlist.text.contains("* gnd G1: node 0"));
    }

    #[test]
    fn model_library_is_injected() {
        let circuit = sample_circuit();
        let netlist = build_netlist(&circuit);

        assert!(netlist.text.contains(".MODEL J201 NJF"));
        assert!(netlist.text.contains(".model 1N4148 D"));
        assert!(netlist.text.contains(".SUBCKT OP07A"));
        assert!(netlist.text.contains(".ENDS OP07A"));
        // 模型库位于器件行之后、.end 之前
        let end_idx = netlist.text.rfind(".end").unwrap();
        let subckt_idx = netlist.text.find(".SUBCKT OP07A").unwrap();
        assert!(subckt_idx < end_idx);
    }
}
