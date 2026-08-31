// SPDX-License-Identifier: GPL-3.0-only

//! HTTP/WebSocket 服务。
//!
//! 监听 127.0.0.1:8787（前端 vite 已把 /api、/ws 代理到这里）：
//! - `POST /api`：RPC（ping / list_models / build_netlist / simulate）；
//! - `GET /ws`：事件流（仿真进度 / 状态）。
//!
//! 消息结构与前端 `protocol.ts` / 后端 `protocol.rs` 一致。

use std::sync::atomic::{AtomicU64, Ordering};

use axum::{
    body::Bytes,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tokio::sync::broadcast;

use crate::audio;
use crate::domain::ComponentKind;
use crate::netlist::build_netlist;
use crate::ngspice::{AcSweep, AnalysisParams, CliNgspice, Ngspice};
use crate::protocol::{
    AnalysisKind, BackendEvent, BackendRequest, BackendResponse, BackendStatus, ComponentModel,
    ComponentModelPin, SimulationRequest, SimulationResult,
};

/// 共享状态：事件广播（WebSocket 客户端订阅）。
#[derive(Clone)]
pub struct AppState {
    events: broadcast::Sender<BackendEvent>,
}

/// 仿真请求序号（用于 requestId）。
static REQ_SEQ: AtomicU64 = AtomicU64::new(0);

/// 构建带状态的 axum 路由。
pub fn router() -> Router {
    let (tx, _rx) = broadcast::channel::<BackendEvent>(256);
    let state = AppState { events: tx };
    Router::new()
        .route("/", get(root))
        .route("/api", post(handle_api))
        .route("/api/upload", post(handle_upload))
        .route("/api/stop", post(handle_stop))
        .route("/ws", get(handle_ws))
        .with_state(state)
}

async fn root() -> &'static str {
    "breadboard-backend ok"
}

/// 音频上传：原始字节 -> ffmpeg 转码 -> PWL 注册表；返回 { id, duration }。
async fn handle_upload(body: Bytes) -> (StatusCode, Json<serde_json::Value>) {
    match audio::ingest_audio(&body) {
        Ok((id, duration)) => (
            StatusCode::OK,
            Json(serde_json::json!({ "id": id, "duration": duration })),
        ),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
    }
}

/// 提前终止正在运行的仿真。
async fn handle_stop() -> Json<serde_json::Value> {
    let stopped = crate::ngspice::stop_running();
    Json(serde_json::json!({ "stopped": stopped }))
}

/// RPC 分发。
async fn handle_api(
    State(state): State<AppState>,
    Json(req): Json<BackendRequest>,
) -> Json<BackendResponse> {
    let resp = match req {
        BackendRequest::Ping => BackendResponse::Pong,
        BackendRequest::ListModels => BackendResponse::Models {
            models: list_component_models(),
        },
        BackendRequest::BuildNetlist { circuit } => BackendResponse::Netlist {
            netlist: build_netlist(&circuit),
        },
        BackendRequest::Simulate { request } => match run_simulation(&state, request).await {
            Ok(result) => BackendResponse::Simulation { result },
            Err((code, message)) => BackendResponse::Error { code, message },
        },
    };
    Json(resp)
}

/// WebSocket 升级：把后端事件转发给客户端。
async fn handle_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| forward_events(socket, state))
}

async fn forward_events(mut socket: WebSocket, state: AppState) {
    let mut rx = state.events.subscribe();
    loop {
        tokio::select! {
            ev = rx.recv() => {
                match ev {
                    Ok(event) => {
                        let Ok(text) = serde_json::to_string(&event) else { continue };
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(_)) => {} // 忽略客户端消息
                    Some(Err(_)) | None => break,
                }
            }
        }
    }
}

/// 执行一次仿真：生成网表 -> 跑 ngspice（阻塞放到 spawn_blocking）-> 返回结果。
async fn run_simulation(
    state: &AppState,
    req: SimulationRequest,
) -> Result<SimulationResult, (String, String)> {
    let params = parse_analysis_params(req.analysis, req.params.as_ref())
        .map_err(|e| ("E_PARAMS".to_string(), e))?;

    let netlist = build_netlist(&req.circuit);

    let request_id = format!("sim-{}", REQ_SEQ.fetch_add(1, Ordering::Relaxed));
    let _ = state
        .events
        .send(BackendEvent::SimulationStarted { request_id: request_id.clone() });
    let _ = state.events.send(BackendEvent::BackendStatus {
        status: BackendStatus::Busy,
        detail: None,
    });

    let events = state.events.clone();
    let rid = request_id;
    let analysis = req.analysis;
    let result = tokio::task::spawn_blocking(move || {
        let mut spice = CliNgspice::new();
        spice.run(&netlist, analysis, &params)
    })
    .await;

    let _ = events.send(BackendEvent::SimulationDone { request_id: rid });
    let _ = events.send(BackendEvent::BackendStatus {
        status: BackendStatus::Idle,
        detail: None,
    });

    match result {
        Ok(Ok(sim)) => Ok(sim),
        Ok(Err(e)) => Err(("E_NGSPICE".to_string(), e)),
        Err(e) => Err(("E_TASK".to_string(), e.to_string())),
    }
}

/// 把协议层的 `params`（serde_json）解析成 ngspice 驱动的分析参数。
fn parse_analysis_params(
    analysis: AnalysisKind,
    params: Option<&serde_json::Value>,
) -> Result<AnalysisParams, String> {
    match analysis {
        AnalysisKind::Op => Ok(AnalysisParams::Op),
        AnalysisKind::Dc => {
            let p = params.ok_or_else(|| "dc 分析缺少参数".to_string())?;
            Ok(AnalysisParams::Dc {
                source: p
                    .get("source")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "dc 缺少 source".to_string())?
                    .to_string(),
                start: num(p.get("start"), "start")?,
                stop: num(p.get("stop"), "stop")?,
                step: num(p.get("step"), "step")?,
            })
        }
        AnalysisKind::Ac => {
            let p = params.ok_or_else(|| "ac 分析缺少参数".to_string())?;
            let sweep = match p.get("type").and_then(|v| v.as_str()) {
                Some("dec") => AcSweep::Dec,
                Some("oct") => AcSweep::Oct,
                Some("lin") => AcSweep::Lin,
                other => return Err(format!("ac 的 type 无效：{other:?}")),
            };
            Ok(AnalysisParams::Ac {
                sweep,
                points: num_u32(p.get("points"), "points")?,
                start: num(p.get("start"), "start")?,
                stop: num(p.get("stop"), "stop")?,
            })
        }
        AnalysisKind::Tran => {
            let p = params.ok_or_else(|| "tran 分析缺少参数".to_string())?;
            Ok(AnalysisParams::Tran {
                step: num(p.get("step"), "step")?,
                stop: num(p.get("stop"), "stop")?,
            })
        }
    }
}

fn num(v: Option<&serde_json::Value>, name: &str) -> Result<f64, String> {
    v.and_then(|v| v.as_f64())
        .ok_or_else(|| format!("参数 {name} 必须是数字"))
}

fn num_u32(v: Option<&serde_json::Value>, name: &str) -> Result<u32, String> {
    v.and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .ok_or_else(|| format!("参数 {name} 必须是整数"))
}

/// 元件模型目录（与前端 catalog 对齐的静态列表）。
fn list_component_models() -> Vec<ComponentModel> {
    use ComponentKind::*;
    fn model(kind: ComponentKind, label: &str, pin_names: &[&str]) -> ComponentModel {
        ComponentModel {
            kind,
            label: label.to_string(),
            model: None,
            pins: pin_names
                .iter()
                .enumerate()
                .map(|(i, name)| ComponentModelPin {
                    name: name.to_string(),
                    x: 0.0,
                    y: i as f64 * 20.0,
                })
                .collect(),
        }
    }
    vec![
        model(Resistor, "电阻", &["1", "2"]),
        model(Capacitor, "电容", &["1", "2"]),
        model(Inductor, "电感", &["1", "2"]),
        model(Diode, "二极管", &["a", "k"]),
        model(Led, "LED", &["a", "k"]),
        model(Npn, "NPN 三极管", &["C", "B", "E"]),
        model(Pnp, "PNP 三极管", &["C", "B", "E"]),
        model(Jfet, "JFET", &["D", "G", "S"]),
        model(Nmos, "NMOS", &["D", "G", "S"]),
        model(Opamp, "运放 OP07", &["IN+", "IN-", "V+", "V-", "OUT"]),
        model(Power, "电池", &["+", "−"]),
        model(Gnd, "接地", &["gnd"]),
        model(Vsine, "正弦波发生器", &["+", "−"]),
        model(Audio, "音频输入", &["+", "−"]),
        model(Voltmeter, "电压表", &["+", "−"]),
        model(Ammeter, "电流表", &["1", "2"]),
        model(Oscilloscope, "示波器", &["tip", "gnd"]),
        model(Jumper, "跳线", &["1", "2"]),
        model(Wire, "导线", &["1", "2"]),
    ]
}

/// 启动 HTTP/WebSocket 服务（监听 127.0.0.1:8787，可用 `BREADSPICE_BIND` 覆盖）。
pub async fn serve() {
    let bind = std::env::var("BREADSPICE_BIND").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .unwrap_or_else(|e| panic!("绑定 {bind} 失败：{e}"));
    println!(
        "breadboard-backend listening on http://{}",
        listener.local_addr().unwrap()
    );
    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_analysis_params_op() {
        assert_eq!(
            parse_analysis_params(AnalysisKind::Op, None).unwrap(),
            AnalysisParams::Op
        );
    }

    #[test]
    fn parse_analysis_params_dc_ac_tran() {
        let json: serde_json::Value =
            serde_json::json!({ "source": "VB1", "start": 0, "stop": 9, "step": 0.5 });
        assert_eq!(
            parse_analysis_params(AnalysisKind::Dc, Some(&json)).unwrap(),
            AnalysisParams::Dc { source: "VB1".into(), start: 0.0, stop: 9.0, step: 0.5 }
        );

        let json: serde_json::Value =
            serde_json::json!({ "type": "dec", "points": 10, "start": 1, "stop": 1e6 });
        assert_eq!(
            parse_analysis_params(AnalysisKind::Ac, Some(&json)).unwrap(),
            AnalysisParams::Ac { sweep: AcSweep::Dec, points: 10, start: 1.0, stop: 1e6 }
        );

        let json: serde_json::Value = serde_json::json!({ "step": 1e-5, "stop": 1e-3 });
        assert_eq!(
            parse_analysis_params(AnalysisKind::Tran, Some(&json)).unwrap(),
            AnalysisParams::Tran { step: 1e-5, stop: 1e-3 }
        );
    }

    #[test]
    fn parse_analysis_params_missing_gives_error() {
        assert!(parse_analysis_params(AnalysisKind::Dc, None).is_err());
        assert!(parse_analysis_params(AnalysisKind::Tran, None).is_err());
    }

    #[test]
    fn models_catalog_non_empty() {
        let models = list_component_models();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.kind == ComponentKind::Gnd));
    }
}
