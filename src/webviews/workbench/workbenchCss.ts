// 工作台新增 Tab 的样式：统一复用现有品牌变量（Tokyo Night）
export const WORKBENCH_CSS = `
/* ================= Checklist Tab ================= */
.wb-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wb-scroll { flex: 1; overflow-y: auto; padding: 10px; }
.wb-section-title {
    font-size: 11px; font-weight: 600; color: var(--brand-text-muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin: 10px 0 6px; display: flex; align-items: center; justify-content: space-between;
}
.wb-prio-label { font-size: 11px; font-weight: 600; margin: 10px 2px 4px; }
.wb-prio-label.urgent { color: var(--state-error); }
.wb-prio-label.normal { color: var(--state-warning); }
.wb-prio-label.low { color: var(--state-success); }
.wb-task {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: var(--radius-sm);
    cursor: default; transition: background-color 0.15s ease;
}
.wb-task:hover { background-color: var(--brand-surface-hover); }
.wb-task input[type="checkbox"] { accent-color: var(--brand-primary); cursor: pointer; flex: none; }
.wb-task .wb-task-text { flex: 1; font-size: 12px; word-break: break-all; }
.wb-task.done .wb-task-text { text-decoration: line-through; color: var(--brand-text-muted); }
.wb-task .wb-task-rm {
    display: none; color: var(--brand-text-muted); cursor: pointer;
    font-size: 12px; padding: 0 4px; flex: none;
}
.wb-task:hover .wb-task-rm { display: inline-block; }
.wb-task .wb-task-rm:hover { color: var(--state-error); }
.wb-add-row { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--brand-border-subtle); }
.wb-add-row input[type="text"] {
    flex: 1; background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    padding: 5px 8px; font-size: 12px; outline: none;
}
.wb-add-row input[type="text"]:focus { border-color: var(--brand-primary); }
.wb-add-row select {
    background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    font-size: 11px; padding: 2px 4px; outline: none;
}
.wb-progress-wrap { padding: 8px 10px; border-top: 1px solid var(--brand-border-subtle); }
.wb-progress-text { font-size: 11px; color: var(--brand-text-muted); margin-bottom: 4px; }
.wb-progress { height: 6px; background-color: var(--brand-surface-raised); border-radius: 3px; overflow: hidden; }
.wb-progress > div { height: 100%; background-color: var(--brand-primary); transition: width 0.3s ease; }
.wb-empty { color: var(--brand-text-muted); font-size: 12px; padding: 16px; text-align: center; }

/* ================= Workflow Tab ================= */
.wf-tab { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
/* 侧边栏 Flow Tab：列表 + 打开主编辑区入口（画布在主编辑区 Flow Editor 面板中） */
.wf-side { flex: 1; overflow-y: auto; padding-bottom: 8px; }
.wf-open-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin: 10px 10px 4px; padding: 8px 10px; font-size: 12px; cursor: pointer;
    background-color: var(--brand-primary-subtle); color: var(--brand-primary);
    border: 1px solid var(--brand-primary); border-radius: var(--radius-md);
    transition: all 0.15s ease; width: calc(100% - 20px);
}
.wf-open-btn:hover { background-color: var(--brand-primary); color: var(--brand-text-inverse); }
.wf-open-btn svg { width: 15px; height: 15px; flex: none; }
.wf-side-hint { font-size: 10px; color: var(--brand-text-muted); text-align: center; padding: 0 12px 2px; }
.wf-main { flex: 1; display: flex; min-height: 0; }
.wf-left {
    width: 148px; flex: none; border-right: 1px solid var(--brand-border-subtle);
    overflow-y: auto; background-color: var(--brand-surface);
}
.wf-canvas-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
.wf-toolbar {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    padding: 6px 8px; border-bottom: 1px solid var(--brand-border-subtle);
    background-color: var(--brand-surface); flex: none;
}
.wf-btn {
    padding: 3px 8px; font-size: 11px; border-radius: var(--radius-sm); cursor: pointer;
    background-color: var(--brand-surface-raised); color: var(--brand-text-secondary);
    border: 1px solid var(--brand-border); transition: all 0.15s ease; white-space: nowrap;
    display: inline-flex; align-items: center; gap: 4px;
}
.wf-btn:hover { background-color: var(--brand-surface-hover); color: var(--brand-text); }
.wf-btn.primary { background-color: var(--brand-primary-subtle); color: var(--brand-primary); border-color: var(--brand-primary); }
.wf-btn.primary:hover { background-color: var(--brand-primary); color: var(--brand-text-inverse); }
.wf-btn.danger:hover { color: var(--state-error); border-color: var(--state-error); }
.wf-btn.toggled { background-color: var(--brand-primary); color: var(--brand-text-inverse); border-color: var(--brand-primary); }
.wf-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.wf-btn svg { display: block; width: 13px; height: 13px; }
.wb-icon { vertical-align: -2px; flex: none; }
.wf-toolbar select {
    background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    font-size: 11px; padding: 2px 4px; outline: none;
}
.wf-hint { margin-left: auto; font-size: 10px; color: var(--brand-text-muted); }
.wf-svg-wrap {
    flex: 1; position: relative; overflow: hidden; min-height: 0;
    background-color: var(--brand-background);
    background-image: radial-gradient(circle, var(--brand-border-subtle) 1px, transparent 1px);
    background-size: 18px 18px;
}
.wf-svg-wrap.running-lock::after {
    content: ''; position: absolute; inset: 0; z-index: 3; cursor: not-allowed;
}
.wf-svg { width: 100%; height: 100%; display: block; }
.wf-props {
    width: 180px; flex: none; border-left: 1px solid var(--brand-border-subtle);
    overflow-y: auto; padding: 10px; background-color: var(--brand-surface);
}
.wf-props h4 { font-size: 12px; color: var(--brand-text); margin: 0 0 8px; }
.wf-props label { display: block; font-size: 10px; color: var(--brand-text-muted); margin: 8px 0 3px; }
.wf-props input, .wf-props select, .wf-props textarea {
    width: 100%; background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    padding: 4px 6px; font-size: 12px; outline: none;
}
.wf-props input:focus, .wf-props select:focus, .wf-props textarea:focus { border-color: var(--brand-primary); }
.wf-props textarea { resize: vertical; font-family: var(--mono-font, monospace); font-size: 11px; }
.wf-props .wf-deps { font-size: 10px; color: var(--brand-text-muted); margin-top: 10px; word-break: break-all; }
.wf-del-btn {
    margin-top: 12px; width: 100%; padding: 5px; font-size: 11px; cursor: pointer;
    background-color: transparent; color: var(--state-error);
    border: 1px solid var(--state-error); border-radius: var(--radius-sm);
}
.wf-del-btn:hover { background-color: var(--state-error); color: var(--brand-text-inverse); }

.wf-pal-node {
    display: flex; align-items: center; gap: 6px;
    margin: 4px 8px; padding: 5px 8px; font-size: 11px; cursor: pointer;
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    background-color: var(--brand-surface-raised); transition: all 0.15s ease;
}
.wf-pal-node:hover { border-color: var(--brand-primary); background-color: var(--brand-surface-hover); }
.wf-pal-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.wf-list-item {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px 4px 12px; font-size: 11px; cursor: pointer;
    color: var(--brand-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wf-list-item:hover { background-color: var(--brand-surface-hover); color: var(--brand-text); }
.wf-list-item .wf-item-rm { display: none; margin-left: auto; color: var(--brand-text-muted); flex: none; padding: 0 2px; }
.wf-list-item:hover .wf-item-rm { display: inline-block; }
.wf-list-item .wf-item-rm:hover { color: var(--state-error); }
.wf-list-item.dim { color: var(--brand-text-muted); cursor: default; }

/* SVG nodes */
.wf-node rect.body { fill: var(--brand-surface-raised); stroke: var(--brand-border); stroke-width: 1.5; cursor: grab; }
.wf-node text { fill: var(--brand-text); font-size: 11px; pointer-events: none; }
.wf-node text.tag { font-size: 9px; fill: var(--brand-text-muted); }
.wf-node.running rect.body { stroke: var(--brand-primary); stroke-width: 2.5; animation: wfPulse 1s infinite; }
.wf-node.success rect.body { stroke: var(--state-success); stroke-width: 2; }
.wf-node.failed rect.body { stroke: var(--state-error); stroke-width: 2.5; }
.wf-node.skipped rect.body { stroke: var(--brand-text-muted); stroke-dasharray: 4 3; opacity: 0.55; }
.wf-node.selected rect.body { stroke: var(--brand-text); stroke-width: 2; stroke-dasharray: 5 3; }
.wf-node.link-src rect.body { stroke: var(--state-warning); stroke-width: 2.5; }
@keyframes wfPulse {
    0%, 100% { filter: drop-shadow(0 0 2px var(--brand-primary)); }
    50% { filter: drop-shadow(0 0 8px var(--brand-primary)); }
}
.wf-edge { stroke: var(--brand-text-muted); stroke-width: 1.5; fill: none; marker-end: url(#wfArrow); pointer-events: none; }
.wf-edge.cond-true { stroke: var(--state-success); }
.wf-edge.cond-false { stroke: var(--state-error); }
.wf-edge-hit { stroke: transparent; stroke-width: 12; fill: none; cursor: pointer; }
.wf-edge-hit:hover { stroke: rgba(247, 118, 142, 0.35); }
.wf-region { fill: rgba(158, 206, 106, 0.05); stroke: var(--state-success); stroke-dasharray: 6 4; stroke-width: 1; }
.wf-region-label { fill: var(--state-success); font-size: 9px; }

/* monitor panel */
.wf-monitor {
    height: 170px; flex: none; border-top: 1px solid var(--brand-border-subtle);
    display: flex; flex-direction: column; background-color: var(--brand-surface);
}
.wf-monitor-head {
    display: flex; align-items: center; gap: 10px; padding: 4px 10px;
    font-size: 11px; color: var(--brand-text-muted);
    border-bottom: 1px solid var(--brand-border-subtle); flex: none;
}
.wf-monitor-head .wf-summary { margin-left: auto; }
.wf-confirm-bar {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px; flex: none;
    background: rgba(224, 175, 104, 0.12); border-bottom: 1px solid #e0af68;
    font-size: 12px; color: var(--brand-text); animation: wfConfirmPulse 1.2s ease-in-out infinite alternate;
}
.wf-confirm-bar .wf-confirm-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
@keyframes wfConfirmPulse { from { background: rgba(224, 175, 104, 0.08); } to { background: rgba(224, 175, 104, 0.2); } }
.wf-monitor-body { flex: 1; display: flex; min-height: 0; }
.wf-run-table-wrap { width: 46%; overflow-y: auto; border-right: 1px solid var(--brand-border-subtle); }
.wf-run-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.wf-run-table th {
    position: sticky; top: 0; background-color: var(--brand-surface);
    text-align: left; padding: 3px 8px; color: var(--brand-text-muted);
    font-weight: 400; border-bottom: 1px solid var(--brand-border-subtle);
}
.wf-run-table td { padding: 3px 8px; border-bottom: 1px solid var(--brand-border-subtle); }
.wf-run-table .wf-view-link { color: var(--brand-primary); cursor: pointer; font-size: 10px; }
.wf-output-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.wf-output-bar { display: flex; align-items: center; gap: 6px; padding: 3px 10px; border-bottom: 1px solid var(--brand-border-subtle); }
.wf-output-bar span { font-size: 10px; color: var(--brand-text-muted); }
.wf-output-bar select {
    background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm); font-size: 10px; padding: 1px 3px;
}
.wf-output {
    flex: 1; overflow-y: auto; padding: 6px 10px;
    font-family: var(--font-mono); font-size: 11px; line-height: 1.55; user-select: text;
}
.wf-output div.info { color: var(--brand-text-secondary); }
.wf-output div.ok { color: var(--state-success); }
.wf-output div.err { color: var(--state-error); }
.wf-output div.dim { color: var(--brand-text-muted); }
.wf-output div.hdr { color: var(--brand-primary); font-weight: 600; margin-top: 6px; }

/* ================= Batch Tab ================= */
.batch-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.batch-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px; border-bottom: 1px solid var(--brand-border-subtle); }
.batch-controls label { font-size: 11px; color: var(--brand-text-muted); display: flex; align-items: center; gap: 4px; }
.batch-controls select, .batch-controls input[type="text"] {
    background-color: var(--brand-surface-raised); color: var(--brand-text);
    border: 1px solid var(--brand-border); border-radius: var(--radius-sm);
    font-size: 12px; padding: 4px 6px; outline: none;
}
.batch-list { list-style: none; margin: 10px; padding: 0; border: 1px solid var(--brand-border); border-radius: var(--radius-md); overflow: hidden; }
.batch-list li {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border-bottom: 1px solid var(--brand-border-subtle);
    background-color: var(--brand-surface);
}
.batch-list li:last-child { border-bottom: none; }
.batch-list li.drag-over { border-top: 2px solid var(--brand-primary); }
.batch-list .batch-handle { cursor: grab; color: var(--brand-text-muted); flex: none; }
.batch-list .batch-idx { color: var(--brand-text-muted); font-size: 11px; width: 16px; flex: none; }
.batch-list .batch-cmd { flex: 1; font-family: var(--font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.batch-list .batch-cmd-input {
    flex: 1; background: transparent; border: none; outline: none;
    color: var(--brand-text); font-family: var(--font-mono); font-size: 12px;
    border-bottom: 1px solid var(--brand-border);
}
.batch-list .batch-status {
    font-size: 10px; padding: 1px 8px; border-radius: 9px; flex: none;
    background-color: var(--brand-surface-raised); color: var(--brand-text-muted); min-width: 52px; text-align: center;
}
.batch-list .batch-status.running { color: var(--brand-primary); }
.batch-list .batch-status.success { color: var(--state-success); }
.batch-list .batch-status.failed { color: var(--state-error); }
.batch-list .batch-dur { color: var(--brand-text-muted); font-size: 10px; min-width: 40px; text-align: right; flex: none; }
.batch-list .batch-rm { color: var(--brand-text-muted); cursor: pointer; flex: none; }
.batch-list .batch-rm:hover { color: var(--state-error); }
.batch-actions { display: flex; gap: 8px; padding: 0 10px 10px; flex-wrap: wrap; }
.batch-log-bar { display: flex; align-items: center; gap: 8px; padding: 2px 10px 6px; font-size: 11px; font-weight: 600; color: var(--brand-text-secondary); }
.batch-output {
    flex: 1; min-height: 60px; margin: 0 10px 10px;
    border: 1px solid var(--brand-border-subtle); border-radius: var(--radius-md);
    background-color: var(--brand-surface);
}

/* ================= Launcher ================= */
.launcher-mask {
    position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.45);
    z-index: 100; display: flex; justify-content: center; padding-top: 10vh;
}
.launcher {
    width: min(520px, 92%); max-height: 62vh; align-self: flex-start;
    background-color: var(--brand-surface-raised); border: 1px solid var(--brand-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
    overflow: hidden; display: flex; flex-direction: column;
}
.launcher input {
    background: transparent; border: none; border-bottom: 1px solid var(--brand-border);
    color: var(--brand-text); font-size: 14px; padding: 12px 16px; outline: none; width: 100%;
}
.launcher-list { overflow-y: auto; padding: 4px 0; }
.launcher-item { display: flex; align-items: center; gap: 10px; padding: 8px 16px; cursor: pointer; font-size: 12px; }
.launcher-item.sel, .launcher-item:hover { background-color: var(--brand-primary-subtle); }
.launcher-item .l-icon { width: 20px; text-align: center; flex: none; }
.launcher-item .l-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.launcher-item .l-kind {
    font-size: 10px; color: var(--brand-text-muted); flex: none;
    background-color: var(--brand-surface); border-radius: 3px; padding: 1px 7px;
}
.launcher .empty { padding: 16px; color: var(--brand-text-muted); text-align: center; font-size: 12px; }
`;
