//! 后端二进制入口（骨架）。
//!
//! 当前只打印启动信息并退出。后续在此启动 HTTP/WebSocket 服务，
//! 监听 127.0.0.1:8787（前端 vite 代理已把 /api、/ws 转发到该地址）。

use breadboard_backend::domain;
use breadboard_backend::netlist;
use breadboard_backend::ngspice::{Ngspice, StubNgspice};

fn main() {
    println!("breadboard-backend skeleton started (ngspice not yet wired)");

    // 演示：领域模型与网表/驱动接口均已可编译、可调用（返回占位结果）。
    let circuit = domain::Circuit {
        breadboard: domain::BreadboardLayout {
            id: "demo".into(),
            name: "demo".into(),
            nodes: Vec::new(),
            nets: Vec::new(),
        },
        components: Vec::new(),
    };
    let netlist = netlist::build_netlist(&circuit);
    let mut spice = StubNgspice::new(ngspice::NgspiceBackend::Cli);
    let _ = spice.run(&netlist, ngspice::Analysis::Op);
}
