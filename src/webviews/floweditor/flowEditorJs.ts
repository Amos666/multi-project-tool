// Flow 编辑器面板（主编辑区 WebviewPanel）的 Webview JS
// 画布 / 节点面板 / 属性 / 执行监控逻辑从侧边栏 workbenchJs 迁移至此
// 注意：本字符串内不使用模板字面量与 ${}，避免转义问题

export const FLOW_EDITOR_JS = `
/* ==================== Flow editor: state ==================== */
var vscode = acquireVsCodeApi();
var WB = { data: { workflows: [], templates: [], history: [] } };
var WF = {
    nodes: [], edges: [], states: {}, selected: null, linkMode: false, linkFrom: null,
    running: false, idSeq: 1, currentId: null, logs: [], logFilter: '', durTimer: null,
    drag: null, counts: { failed: 0, skipped: 0 },
    /* 面板三模式：edit=编辑 / run=执行详情（可 Resume/Cancel）/ history=历史只读回放 */
    mode: 'edit', runPhase: '', runDuration: 0, editSnapshot: null,
    /* 当前编辑的是模板（保存时更新模板而非工作流） */
    templateId: null,
    /* 节点上方操作条状态：{ id, kind: 'confirm'|'failed' } */
    actionsNode: null,
    /* 当前展示的运行实例 id（引擎事件按 runId 过滤，多运行并存时不互相污染） */
    runId: null,
    /* 后台运行标志：宿主侧运行实例是否仍活跃（running 或 failed-paused）。
       与 WF.running 区分——后者仅表示"本面板正在监控"。切换到其他 Flow 编辑时
       WF.running 释放为 false，但 bgRunning 保持 true，运行仍保留在"正在运行"分组。 */
    bgRunning: false
};
var WF_W = 118, WF_H = 44, WF_VB_W = 1000, WF_VB_H = 460;
var WF_TAG_COLOR = { start: '#48bfe3', cmd: '#7aa2f7', condition: '#e0af68', fork: '#9ece6a', join: '#2ac3de', notify: '#f7768e', confirm: '#ff9e64', ref: '#bb9af7' };
/* ref 节点引用的命令树（由宿主推送更新） */
var customCommandTree = [];
var pythonTxtCommandTree = [];
var shortcutCommandTree = [];

function wbEsc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}
function wbId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function wbEl(id) { return document.getElementById(id); }
function wbNow() { return new Date().toTimeString().slice(0, 8); }
function wbToast(msg, type) {
    var d = document.createElement('div');
    d.textContent = msg;
    var color = type === 'err' ? 'var(--state-error)' : (type === 'ok' ? 'var(--state-success)' : 'var(--brand-primary)');
    d.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:200;background:var(--brand-surface-raised);' +
        'border:1px solid var(--brand-border);border-left:3px solid ' + color + ';color:var(--brand-text);' +
        'padding:8px 14px;border-radius:var(--radius-md);font-size:12px;box-shadow:var(--shadow-md);' +
        'opacity:0;transition:opacity .25s;max-width:80%;';
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.style.opacity = '1'; });
    setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 300); }, 2400);
}

/* ==================== 消息接收 ==================== */
window.addEventListener('message', function (event) {
    var m = event.data;
    if (!m || !m.command) { return; }
    if (m.command === 'flowEditorInit') {
        WB.data = m.data || WB.data;
        applyTrees(m.trees);
        if (m.language) { currentLang = m.language; }
        applyTranslations();
        renderPalette();
        wfDraw();
        /* 面板重载后恢复后台运行标志：仅 running 时引擎占用，阻止并发启动；
           failed-paused 已空闲，允许发起新运行（旧实例保留在"正在运行"分组供稍后续跑） */
        var ph = m.runPhase || '';
        WF.bgRunning = (ph === 'running');
    }
    else if (m.command === 'workbenchData') { WB.data = m.data || WB.data; }
    else if (m.command === 'updateCommandTree') { setTree(m.tabId, m.tree); wfDraw(); }
    else if (m.command === 'setLanguage') {
        currentLang = m.language;
        applyTranslations();
        renderPalette();
        wfDraw();
    }
    else if (m.command === 'workflowEvent') { wfOnEvent(m.event); }
    else if (m.command === 'workflowRunStarted') { wfOnRunStarted(m.workflow, m.runId); }
    else if (m.command === 'runPhase') { wfOnRunPhase(m.phase, m.durationMs, m.runId, m.engineBusy); }
    else if (m.command === 'flowEditorAction') { wfApplyAction(m.action); }
});
function setTree(tabId, tree) {
    if (tabId === 'pyt') { pythonTxtCommandTree = tree || []; }
    else if (tabId === 'shortcut') { shortcutCommandTree = tree || []; }
    else { customCommandTree = tree || []; }
}
function applyTrees(trees) {
    if (!trees) { return; }
    setTree('cmd', trees.cmd);
    setTree('pyt', trees.pyt);
    setTree('shortcut', trees.shortcut);
}

/* ==================== 面板模式管理：edit / run（执行详情）/ history（只读回放） ==================== */
/* 暂存编辑现场（进入 run/history 模式前调用；已有暂存则不覆盖） */
function wfSnapshotEdit() {
    if (WF.editSnapshot) { return; }
    WF.editSnapshot = {
        currentId: WF.currentId, name: wbEl('wfName').value,
        nodes: WF.nodes, edges: WF.edges, selected: WF.selected,
        templateId: WF.templateId
    };
}
/* 恢复编辑现场并回到 edit 模式 */
function wfRestoreEdit() {
    var s = WF.editSnapshot;
    WF.editSnapshot = null;
    WF.mode = 'edit';
    WF.runPhase = '';
    if (s) {
        WF.currentId = s.currentId;
        WF.templateId = s.templateId || null;
        WF.nodes = s.nodes;
        WF.edges = s.edges;
        WF.selected = s.selected;
        wbEl('wfName').value = s.name;
    } else {
        WF.templateId = null;
    }
    WF.states = {}; WF.selected = null;
    WF.linkMode = false; WF.linkFrom = null;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wfSyncModeUI();
}
function wfBackToEdit() {
    /* 允许从执行详情返回编辑现场：释放本地监控锁，后台运行不受影响 */
    wfLeaveRunView();
    wfRestoreEdit();
}
/* 离开执行详情模式：释放本地监控锁与运行表，但宿主侧运行实例继续运行（仍保留在"正在运行"分组）。
   用于切换到其他 Flow 编辑/查看历史等场景。editSnapshot 不在此清除，供 wfBackToEdit 恢复。 */
function wfLeaveRunView() {
    var wasMonitoring = WF.running || WF.mode !== 'edit';
    if (!wasMonitoring) { return; }
    wfSetRunningUI(false);
    WF.mode = 'edit';
    WF.runPhase = '';
    WF.states = {}; WF.logs = []; WF.logFilter = '';
    wfSetCounters(0, 0);
    var tb = wbEl('wfRunTbody'); if (tb) { tb.innerHTML = ''; }
    var out = wbEl('wfOutput'); if (out) { out.innerHTML = ''; }
    wfHideNodeActions();
    var sel = wbEl('wfLogFilter'); if (sel) { sel.innerHTML = '<option value="">' + wbEsc(t('wb.wf.allNodes')) + '</option>'; }
    var st = wbEl('wfState'); if (st) { st.textContent = ''; }
    var du = wbEl('wfDur'); if (du) { du.textContent = ''; }
    wfSyncModeUI();
    /* 离开仍在运行的监控时提示用户：任务继续在后台，可在"正在运行"分组返回 */
    if (WF.bgRunning) { wbToast(t('wb.wf.runBackground'), 'ok'); }
}
/* 只读属性面板：禁用/恢复所有输入控件（删除节点按钮仅编辑模式显示） */
function wfSetPropsDisabled(dis) {
    var form = wbEl('wfPropsForm');
    if (form) {
        form.querySelectorAll('input,select,textarea').forEach(function (el) { el.disabled = dis; });
    }
    var del = wbEl('wfDelBtn');
    if (del) { del.style.display = (dis || WF.mode !== 'edit') ? 'none' : ''; }
}
/* 按当前模式刷新工具栏/徽标/面板可用性 */
function wfSyncModeUI() {
    var edit = WF.mode === 'edit';
    ['wfRunBtn', 'wfLinkBtn', 'wfSaveBtn', 'wfClearBtn'].forEach(function (id) {
        var el = wbEl(id); if (el) { el.style.display = edit ? '' : 'none'; }
    });
    var shell = wbEl('wfShell'); if (shell) { shell.style.display = edit ? '' : 'none'; }
    var name = wbEl('wfName'); if (name) { name.readOnly = !edit; }
    var stop = wbEl('wfStopBtn');
    var back = wbEl('wfBackBtn');
    if (stop) { stop.style.display = (WF.mode === 'run' && WF.runPhase === 'running') ? '' : 'none'; }
    /* Resume/Cancel 按钮移至画布节点上方操作条，由 wfShowNodeActions/wfHideNodeActions 管理 */
    if (back) { back.style.display = edit ? 'none' : ''; }
    var badge = wbEl('wfModeBadge');
    if (badge) {
        badge.style.display = edit ? 'none' : '';
        if (!edit) {
            if (WF.mode === 'history') { badge.textContent = t('wb.wf.viewMode'); badge.className = 'wf-mode-badge'; }
            else if (WF.runPhase === 'failed-paused') { badge.textContent = t('wb.wf.failedPaused'); badge.className = 'wf-mode-badge err'; }
            else if (WF.runPhase === 'ended') { badge.textContent = t('wb.wf.runEnded'); badge.className = 'wf-mode-badge'; }
            else { badge.textContent = t('wb.wf.runMode'); badge.className = 'wf-mode-badge run'; }
        }
    }
    var palette = wbEl('wfPalette');
    if (palette) { palette.classList.toggle('locked', !edit); }
    /* 失败暂停：允许修改未成功节点的命令（Resume 时生效）；其余只读 */
    var editable = edit || (WF.mode === 'run' && WF.runPhase === 'failed-paused');
    wfSetPropsDisabled(!editable);
    var hint = wbEl('wfHint');
    if (hint) {
        hint.textContent = edit ? t('wb.wf.hint')
            : (WF.mode === 'history' ? t('wb.wf.historyDetail')
                : (WF.runPhase === 'failed-paused' ? t('wb.wf.failedPausedHint') : t('wb.wf.runMode')));
    }
}

/* ==================== 侧边栏动作分发 ==================== */
function wfApplyAction(action) {
    if (!action || !action.type) { return; }
    if (action.type === 'new') { wfNew(); }
    else if (action.type === 'openFlow') { wfSelectFlow(action.id); }
    else if (action.type === 'loadTemplate') { wfLoadTemplate(action.id); }
    else if (action.type === 'runFlow') {
        /* 切换到目标 Flow（释放可能正在监控的运行，后台不受影响）再发起运行；
           wfRun 会检查 bgRunning，后台仍有活跃运行时给出提示而非启动并发运行 */
        wfSelectFlow(action.id);
        wfRun();
    }
    else if (action.type === 'batchToFlow') {
        wfLeaveRunView();
        WF.editSnapshot = null;
        WF.currentId = null;
        WF.templateId = null;
        WF.nodes = action.nodes || [];
        WF.edges = action.edges || [];
        WF.states = {}; WF.selected = null;
        wbEl('wfName').value = action.name || 'batch';
        wfDraw();
        wbToast(t('wb.batch.flowGenerated'), 'ok');
    }
    else if (action.type === 'openRun') { wfShowRunDetail(action.run); }
    else if (action.type === 'showHistory') { wfShowHistory(action.idx); }
}

/* ==================== 节点上方浮动操作条：人工确认 / 失败续跑 ==================== */
/* 显示操作条：kind='confirm'（等待人工确认的节点）或 'failed'（失败暂停，可 Resume/Cancel） */
function wfShowNodeActions(nodeId, kind) {
    var bar = wbEl('wfNodeActions');
    if (!bar || !wfNodeById(nodeId)) { return; }
    bar.style.display = '';
    wbEl('wfNodeActionsText').style.display = kind === 'confirm' ? '' : 'none';
    wbEl('wfConfirmOkBtn').style.display = kind === 'confirm' ? '' : 'none';
    wbEl('wfConfirmNoBtn').style.display = kind === 'confirm' ? '' : 'none';
    wbEl('wfPauseBtn').style.display = kind === 'confirm' ? '' : 'none';
    wbEl('wfResumeBtn').style.display = kind === 'failed' ? '' : 'none';
    wbEl('wfCancelBtn').style.display = kind === 'failed' ? '' : 'none';
    WF.actionsNode = { id: nodeId, kind: kind };
    wfPositionNodeActions(nodeId);
}
function wfHideNodeActions() {
    var bar = wbEl('wfNodeActions');
    if (bar) { bar.style.display = 'none'; }
    WF.actionsNode = null;
}
/* 将 viewBox 坐标映射为画布容器内的像素坐标，操作条水平居中于节点、置于节点上方（太靠上则放下方） */
function wfPositionNodeActions(nodeId) {
    var bar = wbEl('wfNodeActions');
    var wrap = wbEl('wfSvgWrap');
    var svg = wfSvg();
    var n = wfNodeById(nodeId);
    if (!bar || !wrap || !svg || !n || bar.style.display === 'none') { return; }
    var srect = svg.getBoundingClientRect();
    var wrect = wrap.getBoundingClientRect();
    var scale = Math.min(srect.width / WF_VB_W, srect.height / WF_VB_H);
    var ox = (srect.width - WF_VB_W * scale) / 2;
    var oy = (srect.height - WF_VB_H * scale) / 2;
    var nodeCx = srect.left - wrect.left + ox + (n.x + WF_W / 2) * scale;
    var nodeTop = srect.top - wrect.top + oy + n.y * scale;
    var barW = bar.offsetWidth || 220;
    var barH = bar.offsetHeight || 28;
    var left = nodeCx - barW / 2;
    if (left < 2) { left = 2; }
    if (left + barW > wrect.width - 2) { left = Math.max(2, wrect.width - barW - 2); }
    var top = nodeTop - barH - 8;
    if (top < 2) { top = nodeTop + WF_H * scale + 8; }
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
}
/* 失败暂停：操作条定位到第一个失败节点上方 */
function wfShowFailedActions() {
    var failedId = null;
    for (var i = 0; i < WF.nodes.length; i++) {
        if (WF.states[WF.nodes[i].id] === 'failed') { failedId = WF.nodes[i].id; break; }
    }
    if (failedId) { wfShowNodeActions(failedId, 'failed'); }
}
/* 恢复待确认操作条（暂停后重开详情时使用）：显示确认文案 + 继续/取消/暂停按钮 */
function wfShowConfirmActions(pc) {
    if (!pc || !pc.nodeId || !wfNodeById(pc.nodeId)) { return; }
    wbEl('wfNodeActionsText').textContent = t('wb.wf.confirmAsk') + (pc.text ? ': ' + pc.text : '');
    wfShowNodeActions(pc.nodeId, 'confirm');
}
/* 暂停人工确认：仅隐藏操作条，流程仍留在"正在运行"分组；稍后点击运行项可恢复按钮 */
function wfPause() {
    wfHideNodeActions();
    wbToast(t('wb.wf.pausedHint'));
}
window.addEventListener('resize', function () {
    if (WF.actionsNode) { wfPositionNodeActions(WF.actionsNode.id); }
});

/* ==================== 运行详情（"正在运行"分组点击打开） ==================== */
function wfShowRunDetail(run) {
    if (!run || !run.workflow || !Array.isArray(run.workflow.nodes)) { return; }
    /* 已在展示该运行：仅恢复被"暂停"隐藏的确认操作条，无需重建视图 */
    if (WF.mode === 'run' && WF.runId && run.id === WF.runId) {
        if (run.pendingConfirm && !WF.actionsNode) { wfShowConfirmActions(run.pendingConfirm); }
        return;
    }
    /* 切换到其他运行详情（如引擎执行新任务时查看失败暂停实例）：事件按 runId 过滤互不污染，
       原运行进度由宿主保留，可随时从"正在运行"分组切回。 */
    if (WF.mode === 'edit') { wfSnapshotEdit(); }
    WF.mode = 'run';
    WF.runPhase = run.phase || 'running';
    WF.runDuration = run.durationMs || 0;
    WF.currentId = null;
    WF.templateId = null;
    WF.runId = run.id || null;
    WF.nodes = run.workflow.nodes;
    WF.edges = run.workflow.edges || [];
    WF.selected = null;
    wbEl('wfName').value = run.name || 'workflow';
    wfPrepareRun();
    /* 回放已收集的节点状态与监控表 */
    var startedLabel = new Date(run.startedAt || Date.now()).toTimeString().slice(0, 8);
    var states = run.states || {};
    Object.keys(states).forEach(function (id) {
        var s = states[id];
        WF.states[id] = s.state;
        if (s.state === 'failed') { WF.counts.failed++; }
        else if (s.state === 'skipped') { WF.counts.skipped++; }
        var node = wfNodeById(id);
        wfAddLogFilterOption(id, node ? node.label : id);
        if (node) {
            var st = s.state === 'success' ? '✓ ' + t('wb.wf.stSuccess') : s.state === 'failed' ? '✗ ' + t('wb.wf.stFailed') : '↓ ' + t('wb.wf.stSkipped');
            var tr = document.createElement('tr');
            tr.id = 'wfrow-' + id;
            tr.innerHTML = '<td>' + startedLabel + '</td><td>' + wbEsc(node.label) + '</td><td>' + st + '</td>' +
                '<td class="wf-dur">' + ((s.dur || 0) / 1000).toFixed(1) + 's</td><td></td>';
            wbEl('wfRunTbody').appendChild(tr);
        }
    });
    wfSetCounters();
    /* 回放已收集的日志 */
    (run.logs || []).forEach(function (l) {
        WF.logs.push(l);
        wfAppendOutput(l.level, l.text, false);
    });
    if (WF.runPhase === 'running') {
        wfSetRunningUI(true);
        /* 暂停后重开：待确认节点的操作条（继续/取消/暂停）恢复显示 */
        wfShowConfirmActions(run.pendingConfirm);
    } else {
        wfSetRunningUI(false);
        wbEl('wfState').textContent = t('wb.wf.failedPaused');
        wbEl('wfDur').textContent = (WF.runDuration / 1000).toFixed(1) + 's';
        /* 回放后定位失败节点：操作条置于其上方供 Resume/Cancel */
        wfShowFailedActions();
    }
    wfDraw();
    wfSyncModeUI();
}
/* 宿主推送的运行阶段变化（携带 runId 与 engineBusy）。
   engineBusy 精确反映引擎占用状态（可能存在多个失败暂停实例，取消其一不影响引擎）。
   runId 不匹配当前展示的运行时仅更新 bgRunning，视图不切换。
   画布/UI 更新仅在执行详情模式下执行，切走后状态由宿主保留，重开详情时回放。 */
function wfOnRunPhase(phase, durationMs, runId, engineBusy) {
    if (engineBusy !== undefined) { WF.bgRunning = !!engineBusy; }
    else { WF.bgRunning = phase === 'running'; }
    if (runId && WF.runId && runId !== WF.runId) { return; } // 其他运行的阶段变化：不切换视图
    if (runId) { WF.runId = runId; }
    if (WF.mode !== 'run') { return; }
    if (phase === 'running') {
        if (!WF.running) {
            if (durationMs) { WF.runDuration = durationMs; }
            wfSetRunningUI(true); // 恢复执行：保留已回放的监控内容
        }
        wfHideNodeActions();
    }
    WF.runPhase = phase === 'running' ? 'running' : phase;
    if (phase === 'failed-paused') { wfShowFailedActions(); }
    if (phase === 'ended') { wfHideNodeActions(); }
    wfSyncModeUI();
}
/* 从失败节点恢复执行：携带面板上修改后的节点数据（失败节点按新命令重跑）。
   runId 定位目标实例——失败暂停实例可能已被新运行换下，仍在"正在运行"分组中。 */
function wfResume() {
    if (WF.mode !== 'run' || WF.runPhase !== 'failed-paused' || WF.running) { return; }
    if (WF.bgRunning) { wbToast(t('wb.wf.engineBusy'), 'err'); return; } // 引擎被其他运行占用
    vscode.postMessage({ command: 'workflowResume', runId: WF.runId, nodes: WF.nodes });
    wbToast(t('wb.wf.resumed'));
}
/* 取消整个流程（运行中停止 / 失败暂停直接终局；失败暂停实例取消不依赖引擎空闲） */
function wfCancelRun() {
    if (WF.mode !== 'run') { return; }
    vscode.postMessage({ command: 'workflowCancel', runId: WF.runId });
}

/* ==================== 画布渲染 ==================== */
function wfSvg() { return wbEl('wfSvg'); }
function wfByLabel(tag) { return t('wb.node.' + tag); }
function renderPalette() {
    var box = wbEl('wfPalette');
    if (!box) { return; }
    var html = '';
    ['start', 'cmd', 'condition', 'fork', 'join', 'confirm', 'notify', 'ref'].forEach(function (tag) {
        html += '<div class="wf-pal-node" onclick="wfAddNode(\\'' + tag + '\\')">' +
            '<span class="wf-pal-dot" style="background:' + WF_TAG_COLOR[tag] + '"></span>' + wbEsc(wfByLabel(tag)) + '</div>';
    });
    box.innerHTML = html;
}
function wfComputeRegions() {
    var depth = {};
    WF.nodes.forEach(function (n) { depth[n.id] = 0; });
    for (var i = 0; i < WF.nodes.length; i++) {
        WF.edges.forEach(function (e) {
            if (depth[e.from] !== undefined && depth[e.to] !== undefined) {
                depth[e.to] = Math.max(depth[e.to], depth[e.from] + 1);
            }
        });
    }
    var groups = {};
    WF.nodes.forEach(function (n) {
        var d = depth[n.id];
        (groups[d] = groups[d] || []).push(n);
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return g.length >= 2; })
        .map(function (g) {
            var xs = g.map(function (n) { return n.x; });
            var ys = g.map(function (n) { return n.y; });
            return {
                x: Math.min.apply(null, xs) - 12, y: Math.min.apply(null, ys) - 16,
                w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + WF_W + 24,
                h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + WF_H + 30, n: g.length
            };
        });
}
function wfNodeById(id) { return WF.nodes.find(function (n) { return n.id === id; }); }
function wfDraw() {
    var svg = wfSvg();
    if (!svg) { return; }
    var s = '<defs><marker id="wfArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#565f89"/></marker></defs>';
    wfComputeRegions().forEach(function (r) {
        s += '<rect class="wf-region" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="8"/>' +
            '<text class="wf-region-label" x="' + (r.x + 8) + '" y="' + (r.y + 12) + '">' + wbEsc(t('wb.wf.parallelRegion')) + ' · ' + r.n + '</text>';
    });
    WF.edges.forEach(function (e, i) {
        var a = wfNodeById(e.from), b = wfNodeById(e.to);
        if (!a || !b) { return; }
        var x1 = a.x + WF_W, y1 = a.y + WF_H / 2, x2 = b.x, y2 = b.y + WF_H / 2, mx = (x1 + x2) / 2;
        var d = 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
        var cls = 'wf-edge' + (e.condition === 'true' ? ' cond-true' : e.condition === 'false' ? ' cond-false' : '');
        s += '<path class="' + cls + '" d="' + d + '"/>' +
            '<path class="wf-edge-hit" data-edge="' + i + '" d="' + d + '"><title>' + wbEsc(t('wb.wf.delEdge')) + '</title></path>';
        if (e.condition) {
            s += '<text x="' + mx + '" y="' + ((y1 + y2) / 2 - 6) + '" font-size="9" text-anchor="middle" fill="' + (e.condition === 'true' ? '#9ece6a' : '#f7768e') + '">' + (e.condition === 'true' ? 'T' : 'F') + '</text>';
        }
    });
    WF.nodes.forEach(function (n) {
        var st = WF.states[n.id] || '';
        var sel = n.id === WF.selected ? ' selected' : '';
        var src = n.id === WF.linkFrom ? ' link-src' : '';
        var badge = st === 'success' ? '✓' : st === 'failed' ? '✗' : st === 'running' ? '↻' : st === 'skipped' ? '↓' : '';
        var badgeColor = st === 'success' ? '#9ece6a' : st === 'failed' ? '#f7768e' : st === 'running' ? '#7dcfff' : '#565f89';
        var cmdText = n.tag === 'cmd' || n.tag === 'condition' || n.tag === 'confirm' ? (n.cmd || '').slice(0, 14)
            : n.tag === 'start' ? wfStartDesc(n).slice(0, 14)
            : n.tag === 'ref' ? (wfRefName(n) || t('wb.wf.refChoose')).slice(0, 14) : '';
        s += '<g class="wf-node ' + st + sel + src + '" data-id="' + n.id + '">' +
            '<rect class="body" x="' + n.x + '" y="' + n.y + '" width="' + WF_W + '" height="' + WF_H + '" rx="6"/>' +
            '<rect x="' + n.x + '" y="' + n.y + '" width="5" height="' + WF_H + '" rx="2" fill="' + (WF_TAG_COLOR[n.tag] || '#888') + '"/>' +
            '<text x="' + (n.x + 14) + '" y="' + (n.y + 18) + '">' + wbEsc(n.label) + '</text>' +
            '<text class="tag" x="' + (n.x + 14) + '" y="' + (n.y + 33) + '">' + wbEsc(wfByLabel(n.tag)) + (cmdText ? ' · ' + wbEsc(cmdText) : '') + '</text>' +
            '<text x="' + (n.x + WF_W - 16) + '" y="' + (n.y + 16) + '" font-size="11" fill="' + badgeColor + '">' + badge + '</text></g>';
    });
    svg.innerHTML = s;
    /* 重绘后保持节点操作条贴在目标节点上方（失败暂停时常驻） */
    if (WF.actionsNode) { wfPositionNodeActions(WF.actionsNode.id); }
}

/* ==================== 画布交互 ==================== */
function wfSvgPoint(evt) {
    var svg = wfSvg();
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function wfSnap(v) { return Math.round(v / 10) * 10; }
function wfInitCanvasEvents() {
    var svg = wfSvg();
    if (!svg || svg.dataset.wired) { return; }
    svg.dataset.wired = '1';
    svg.addEventListener('mousedown', function (e) {
        if (WF.running || WF.mode !== 'edit') { return; }
        var g = e.target.closest('.wf-node');
        if (!g) { return; }
        var n = wfNodeById(g.dataset.id);
        if (!n) { return; }
        var p = wfSvgPoint(e);
        WF.drag = { id: n.id, ox: p.x - n.x, oy: p.y - n.y, moved: false };
        e.preventDefault();
    });
    svg.addEventListener('mousemove', function (e) {
        if (!WF.drag) { return; }
        var p = wfSvgPoint(e);
        var n = wfNodeById(WF.drag.id);
        if (!n) { return; }
        WF.drag.moved = true;
        n.x = Math.max(2, Math.min(WF_VB_W - WF_W - 2, wfSnap(p.x - WF.drag.ox)));
        n.y = Math.max(2, Math.min(WF_VB_H - WF_H - 2, wfSnap(p.y - WF.drag.oy)));
        wfDraw();
    });
    window.addEventListener('mouseup', function () { WF.drag = null; });
    svg.addEventListener('click', function (e) {
        var edgeHit = e.target.closest('.wf-edge-hit');
        if (edgeHit && !WF.running && WF.mode === 'edit') {
            WF.edges.splice(Number(edgeHit.dataset.edge), 1);
            wfDraw();
            wbToast(t('wb.wf.edgeDeleted'), 'ok');
            return;
        }
        var g = e.target.closest('.wf-node');
        if (!g) { return; }
        var id = g.dataset.id;
        if (WF.linkMode && !WF.running && WF.mode === 'edit') { wfLinkClick(id); return; }
        wfSelectNode(id);
    });
}
function wfWouldCycle(from, to) {
    var seen = {}; seen[to] = true;
    var q = [to];
    while (q.length) {
        var cur = q.shift();
        if (cur === from) { return true; }
        WF.edges.filter(function (e) { return e.from === cur; }).forEach(function (e) {
            if (!seen[e.to]) { seen[e.to] = true; q.push(e.to); }
        });
    }
    return false;
}
function wfLinkClick(id) {
    if (!WF.linkFrom) {
        WF.linkFrom = id;
        wfDraw();
        wbToast(t('wb.wf.linkHint'));
        return;
    }
    if (WF.linkFrom === id) { WF.linkFrom = null; wfDraw(); return; }
    if (WF.edges.some(function (e) { return e.from === WF.linkFrom && e.to === id; })) {
        wbToast(t('wb.wf.edgeExists'), 'err'); WF.linkFrom = null; wfDraw(); return;
    }
    if (wfWouldCycle(WF.linkFrom, id)) {
        wbToast(t('wb.wf.cycleDetected'), 'err'); WF.linkFrom = null; wfDraw(); return;
    }
    var fromNode = wfNodeById(WF.linkFrom);
    var edge = { from: WF.linkFrom, to: id };
    if (fromNode && fromNode.tag === 'condition') {
        var outs = WF.edges.filter(function (e) { return e.from === WF.linkFrom; });
        var hasTrue = outs.some(function (e) { return e.condition === 'true'; });
        edge.condition = hasTrue ? 'false' : 'true';
    }
    WF.edges.push(edge);
    wbToast(t('wb.wf.linked'), 'ok');
    WF.linkFrom = null;
    wfDraw();
}
function wfToggleLink() {
    WF.linkMode = !WF.linkMode;
    WF.linkFrom = null;
    wbEl('wfLinkBtn').classList.toggle('toggled', WF.linkMode);
    wbEl('wfHint').textContent = WF.linkMode ? t('wb.wf.linkModeHint') : t('wb.wf.hint');
    wfDraw();
}

/* ==================== 属性面板 ==================== */
function wfCmdLabelKey(n) {
    if (n.tag === 'condition') { return 'wb.wf.expr'; }
    if (n.tag === 'confirm') { return 'wb.wf.confirmText'; }
    if (n.tag === 'ref') { return 'wb.wf.refParam'; }
    if (n.tag === 'notify') {
        var nt = n.notifyType || 'text';
        return nt === 'cmd' ? 'wb.wf.cmd' : nt === 'http' ? 'wb.wf.notifyUrl' : 'wb.wf.notifyText';
    }
    return 'wb.wf.cmd';
}
function wfIsHttp(n) { return n.tag === 'notify' && (n.notifyType || 'text') === 'http'; }
function wfSyncNotifyFields(n) {
    var isNotify = n.tag === 'notify';
    var isHttp = wfIsHttp(n);
    wbEl('wfPNotifyTypeLabel').style.display = isNotify ? '' : 'none';
    wbEl('wfPNotifyType').style.display = isNotify ? '' : 'none';
    if (isNotify) { wbEl('wfPNotifyType').value = n.notifyType || 'text'; }
    ['wfPHttpMethod', 'wfPHttpHeaders', 'wfPHttpBody'].forEach(function (id) {
        wbEl(id + 'Label').style.display = isHttp ? '' : 'none';
        wbEl(id).style.display = isHttp ? '' : 'none';
    });
    if (isHttp) {
        wbEl('wfPHttpMethod').value = n.httpMethod || 'GET';
        wbEl('wfPHttpHeaders').value = n.httpHeaders || '';
        wbEl('wfPHttpBody').value = n.httpBody || '';
    }
}
function wfSyncCmdField(n) {
    var show = n.tag !== 'start' && !(n.tag === 'ref' && (n.refTab || 'cmd') !== 'git');
    wbEl('wfPCmdLabel').style.display = show ? '' : 'none';
    wbEl('wfPCmd').style.display = show ? '' : 'none';
    wbEl('wfPCmdLabel').textContent = t(wfCmdLabelKey(n));
}
/* ---- ref 节点：引用各页签已保存命令 ---- */
var WF_GIT_OPS = ['pull', 'commit', 'push', 'fetch', 'switch-branch', 'create-branch'];
function wfRefTree(tab) {
    if (tab === 'pyt') { return pythonTxtCommandTree; }
    if (tab === 'shortcut') { return shortcutCommandTree; }
    return customCommandTree;
}
function wfRefCommands(tab) {
    if (tab === 'git') {
        return WF_GIT_OPS.map(function (op) { return { id: 'git:' + op, name: t('wb.wf.gitOp.' + op) }; });
    }
    var out = [];
    (function walk(nodes, prefix) {
        (nodes || []).forEach(function (nn) {
            if (nn.type === 'command') { out.push({ id: nn.id, name: (prefix ? prefix + ' / ' : '') + nn.name }); }
            if (nn.children) { walk(nn.children, (prefix ? prefix + ' / ' : '') + nn.name); }
        });
    })(wfRefTree(tab), '');
    return out;
}
function wfGitRefNeedsParam(cmdId) {
    return cmdId === 'git:switch-branch' || cmdId === 'git:create-branch' || cmdId === 'git:commit';
}
function wfRefName(n) {
    var cmds = wfRefCommands(n.refTab || 'cmd');
    var found = cmds.filter(function (c) { return c.id === n.refCommandId; });
    return found.length ? found[0].name : '';
}
function wfFillRefCmdSelect(n) {
    var sel = wbEl('wfPRefCmd');
    var cmds = wfRefCommands(n.refTab || 'cmd');
    var html = '<option value="">(' + wbEsc(t('wb.wf.refChoose')) + ')</option>';
    cmds.forEach(function (c) {
        html += '<option value="' + wbEsc(c.id) + '"' + (c.id === n.refCommandId ? ' selected' : '') + '>' + wbEsc(c.name) + '</option>';
    });
    if (n.refCommandId && !cmds.some(function (c) { return c.id === n.refCommandId; })) {
        html += '<option value="' + wbEsc(n.refCommandId) + '" selected>' + wbEsc(t('wb.wf.refMissing')) + '</option>';
    }
    sel.innerHTML = html;
}
function wfRefTabChange(val) {
    var n = wfNodeById(WF.selected);
    if (!n) { return; }
    n.refTab = val;
    n.refCommandId = '';
    wfFillRefCmdSelect(n);
    wfSyncCmdField(n);
    wfDraw();
}
function wfSchedModeChange() {
    var n = wfNodeById(WF.selected);
    if (!n || n.tag !== 'start') { return; }
    var mode = n.scheduleMode || 'none';
    var label = wbEl('wfPSchedValueLabel');
    var input = wbEl('wfPSchedValue');
    if (mode === 'countdown') {
        label.textContent = t('wb.wf.schedSeconds');
        input.placeholder = '30';
    } else if (mode === 'clock') {
        label.textContent = t('wb.wf.schedTime');
        input.placeholder = '08:30';
    } else {
        label.textContent = t('wb.wf.schedSeconds');
        input.placeholder = '';
    }
    label.style.display = mode === 'none' ? 'none' : '';
    input.style.display = mode === 'none' ? 'none' : '';
}
function wfStartDesc(n) {
    var mode = n.scheduleMode || 'none';
    if (mode === 'countdown' && n.scheduleValue) { return 'T-' + n.scheduleValue + 's'; }
    if (mode === 'clock' && n.scheduleValue) { return '@' + n.scheduleValue; }
    return '';
}
function wfConfirm(approved) {
    wfHideNodeActions();
    vscode.postMessage({ command: 'workflowConfirm', approved: approved });
}
function wfSelectNode(id) {
    WF.selected = id;
    var n = wfNodeById(id);
    if (!n) { return; }
    wbEl('wfPropsEmpty').style.display = 'none';
    wbEl('wfPropsForm').style.display = '';
    wbEl('wfPName').value = n.label;
    wbEl('wfPCmd').value = n.cmd || '';
    wbEl('wfPTimeout').value = n.timeout || 300;
    wbEl('wfPFail').value = n.failPolicy || 'stop';
    wfSyncNotifyFields(n);
    var isRef = n.tag === 'ref';
    wbEl('wfPRefTabLabel').style.display = isRef ? '' : 'none';
    wbEl('wfPRefTab').style.display = isRef ? '' : 'none';
    wbEl('wfPRefCmdLabel').style.display = isRef ? '' : 'none';
    wbEl('wfPRefCmd').style.display = isRef ? '' : 'none';
    if (isRef) {
        wbEl('wfPRefTab').value = n.refTab || 'cmd';
        wfFillRefCmdSelect(n);
    }
    var isStart = n.tag === 'start';
    wbEl('wfPSchedModeLabel').style.display = isStart ? '' : 'none';
    wbEl('wfPSchedMode').style.display = isStart ? '' : 'none';
    wbEl('wfPSchedValueLabel').style.display = isStart ? '' : 'none';
    wbEl('wfPSchedValue').style.display = isStart ? '' : 'none';
    if (isStart) {
        wbEl('wfPSchedMode').value = n.scheduleMode || 'none';
        wbEl('wfPSchedValue').value = n.scheduleValue || '';
        wfSchedModeChange();
    }
    wfSyncCmdField(n);
    var deps = WF.edges.filter(function (e) { return e.to === id; })
        .map(function (e) { var u = wfNodeById(e.from); return u ? u.label : '?'; });
    wbEl('wfPDeps').textContent = deps.length ? deps.join(', ') : t('wb.wf.noDeps');
    var outBox = wbEl('wfPOutEdges');
    if (n.tag === 'condition') {
        var html = '<label>' + wbEsc(t('wb.wf.branches')) + '</label>';
        WF.edges.forEach(function (e, i) {
            if (e.from !== id) { return; }
            var target = wfNodeById(e.to);
            html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">' +
                '<span style="flex:1;font-size:11px;color:var(--brand-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ' + wbEsc(target ? target.label : '?') + '</span>' +
                '<select style="width:auto" onchange="wfSetEdgeCond(' + i + ', this.value)">' +
                '<option value="true"' + (e.condition === 'true' ? ' selected' : '') + '>' + wbEsc(t('wb.wf.branchTrue')) + '</option>' +
                '<option value="false"' + (e.condition === 'false' ? ' selected' : '') + '>' + wbEsc(t('wb.wf.branchFalse')) + '</option>' +
                '</select></div>';
        });
        outBox.innerHTML = html;
    } else {
        outBox.innerHTML = '';
    }
    wfDraw();
}
function wfSetEdgeCond(idx, val) {
    if (WF.mode !== 'edit') { return; }
    if (WF.edges[idx]) { WF.edges[idx].condition = val; wfDraw(); }
}
function wfEditProp(key, val) {
    var n = wfNodeById(WF.selected);
    if (!n) { return; }
    if (WF.mode === 'edit') {
        n[key] = val;
        if (key === 'notifyType') { wfSyncNotifyFields(n); wfSyncCmdField(n); }
        wfDraw();
        return;
    }
    /* 失败暂停：允许修改未成功节点的命令/参数，Resume 时随快照一起生效 */
    if (WF.mode === 'run' && WF.runPhase === 'failed-paused') {
        if (WF.states[n.id] === 'success') { wbToast(t('wb.wf.cannotEditDoneNode'), 'err'); return; }
        n[key] = val;
        if (key === 'notifyType') { wfSyncNotifyFields(n); wfSyncCmdField(n); }
        wfDraw();
    }
}
function wfDeleteSelected() {
    if (!WF.selected || WF.running || WF.mode !== 'edit') { return; }
    WF.nodes = WF.nodes.filter(function (n) { return n.id !== WF.selected; });
    WF.edges = WF.edges.filter(function (e) { return e.from !== WF.selected && e.to !== WF.selected; });
    WF.selected = null;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wbToast(t('wb.wf.nodeDeleted'), 'ok');
}
function wfAddNode(tag) {
    if (WF.running || WF.mode !== 'edit') { return; }
    var id = wbId('n');
    WF.nodes.push({
        id: id, label: t('wb.node.' + tag), tag: tag,
        x: wfSnap(260 + Math.random() * 240), y: wfSnap(80 + Math.random() * 240),
        cmd: tag === 'cmd' ? 'echo hello' : '', timeout: 300, failPolicy: 'stop',
        notifyType: tag === 'notify' ? 'text' : undefined,
        refTab: tag === 'ref' ? 'cmd' : undefined, refCommandId: tag === 'ref' ? '' : undefined,
        scheduleMode: tag === 'start' ? 'none' : undefined, scheduleValue: tag === 'start' ? '' : undefined
    });
    wfDraw();
    wfSelectNode(id);
}

/* ==================== 工作流存取 ==================== */
function wfCurrentWorkflowObj() {
    return {
        id: WF.currentId || wbId('wf'),
        name: (wbEl('wfName').value || 'workflow').trim() || 'workflow',
        nodes: WF.nodes, edges: WF.edges, updatedAt: Date.now()
    };
}
function wfSave() {
    if (WF.mode !== 'edit') { wbToast(t('wb.wf.readonlyLock'), 'err'); return; }
    if (!WF.nodes.length && !WF.edges.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    if (WF.templateId) {
        /* 当前编辑的是模板（含内置模板被修改）：保存回模板，同 id 覆盖 */
        var tplName = (wbEl('wfName').value || 'template').trim() || 'template';
        vscode.postMessage({ command: 'templateSave', id: WF.templateId, name: tplName, nodes: WF.nodes, edges: WF.edges });
    } else {
        var obj = wfCurrentWorkflowObj();
        WF.currentId = obj.id;
        vscode.postMessage({ command: 'workflowSave', workflow: obj });
    }
    wbToast(t('wb.wf.saved'), 'ok');
}
function wfSelectFlow(id) {
    /* 切换到其他 Flow 编辑：释放执行详情监控（后台运行不受影响），丢弃原编辑现场快照 */
    wfLeaveRunView();
    WF.editSnapshot = null;
    var wf = (WB.data.workflows || []).find(function (w) { return w.id === id; });
    if (!wf) { return; }
    WF.currentId = wf.id;
    WF.templateId = null;
    WF.nodes = JSON.parse(JSON.stringify(wf.nodes || []));
    WF.edges = JSON.parse(JSON.stringify(wf.edges || []));
    WF.states = {}; WF.selected = null;
    wbEl('wfName').value = wf.name;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
}
function wfNew() {
    wfLeaveRunView();
    WF.editSnapshot = null;
    WF.currentId = null;
    WF.templateId = null;
    WF.nodes = []; WF.edges = []; WF.states = {}; WF.selected = null;
    wbEl('wfName').value = 'workflow-' + new Date().toISOString().slice(5, 16).replace(/[-:]/g, '');
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
}
function wfClear() {
    /* 清空画布仅在编辑模式可用；后台运行不阻止编辑其他 Flow 的画布 */
    if (WF.mode !== 'edit') { wbToast(t('wb.wf.readonlyLock'), 'err'); return; }
    WF.nodes = []; WF.edges = []; WF.states = {}; WF.selected = null;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wbToast(t('wb.wf.cleared'));
}
/* 模板并入 Workflows 列表后，点击模板即原地编辑：保留节点 id，保存时按 templateId 更新模板 */
function wfLoadTemplate(id) {
    /* 双击模板就地编辑：释放执行详情监控（后台运行不受影响），丢弃原编辑现场快照 */
    wfLeaveRunView();
    WF.editSnapshot = null;
    var tpl = (WB.data.templates || []).find(function (x) { return x.id === id; });
    if (!tpl) { return; }
    WF.currentId = null;
    WF.templateId = tpl.id;
    WF.nodes = JSON.parse(JSON.stringify(tpl.nodes || []));
    WF.edges = JSON.parse(JSON.stringify(tpl.edges || []));
    WF.states = {}; WF.selected = null;
    var label = tpl.builtin ? t(tpl.name) : tpl.name;
    wbEl('wfName').value = label;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wbToast(t('wb.wf.templateLoaded'), 'ok');
}
/* 历史详情：复用 Flow Editor 只读回放（画布节点状态 + 监控表 + 日志），不允许修改 */
function wfShowHistory(idx) {
    var h = (WB.data.history || [])[idx];
    if (!h) { return; }
    /* 查看历史只读回放：释放执行详情监控（后台运行不受影响） */
    wfLeaveRunView();
    if (WF.mode === 'edit' && !WF.editSnapshot) { wfSnapshotEdit(); }
    WF.mode = 'history';
    WF.runPhase = '';
    WF.currentId = null;
    WF.selected = null;
    /* 画布：优先使用历史记录中的工作流快照；旧记录无快照时退化为平铺节点列表 */
    if (h.workflow && Array.isArray(h.workflow.nodes)) {
        WF.nodes = JSON.parse(JSON.stringify(h.workflow.nodes));
        WF.edges = JSON.parse(JSON.stringify(h.workflow.edges || []));
    } else {
        WF.nodes = (h.nodes || []).map(function (n, i) {
            return { id: n.id, label: n.label, tag: 'cmd', x: 40 + (i % 4) * 170, y: 50 + Math.floor(i / 4) * 90, cmd: '', timeout: 300, failPolicy: 'stop' };
        });
        WF.edges = [];
    }
    WF.states = {};
    (h.nodes || []).forEach(function (n) { WF.states[n.id] = n.state; });
    wbEl('wfName').value = h.workflowName || 'workflow';
    /* 监控表 */
    var time = new Date(h.time).toTimeString().slice(0, 8);
    var tbody = wbEl('wfRunTbody');
    tbody.innerHTML = (h.nodes || []).map(function (n) {
        var st = n.state === 'success' ? '✓ ' + t('wb.wf.stSuccess') : n.state === 'failed' ? '✗ ' + t('wb.wf.stFailed') : '↓ ' + t('wb.wf.stSkipped');
        return '<tr><td>' + time + '</td><td>' + wbEsc(n.label) + '</td><td>' + st + '</td><td>' + (n.dur / 1000).toFixed(1) + 's</td>' +
            '<td><span class="wf-view-link" onclick="wfHistoryView(\\'' + n.id + '\\')">' + wbEsc(t('wb.wf.view')) + '</span></td></tr>';
    }).join('');
    wbEl('wfState').textContent = h.result === 'success' ? t('wb.wf.stSuccess') : h.result === 'stopped' ? t('wb.wf.stStopped') : t('wb.wf.stFailed');
    wbEl('wfDur').textContent = (h.duration / 1000).toFixed(1) + 's';
    wfSetCounters(
        (h.nodes || []).filter(function (n) { return n.state === 'failed'; }).length,
        (h.nodes || []).filter(function (n) { return n.state === 'skipped'; }).length
    );
    /* 日志回放 */
    WF.logs = [];
    WF.logFilter = '';
    var sel = wbEl('wfLogFilter');
    sel.innerHTML = '<option value="">' + wbEsc(t('wb.wf.allNodes')) + '</option>';
    var out = wbEl('wfOutput');
    out.innerHTML = '';
    if (h.logs && h.logs.length) {
        (h.nodes || []).forEach(function (n) { wfAddLogFilterOption(n.id, n.label); });
        h.logs.forEach(function (l) {
            WF.logs.push(l);
            wfAppendOutput(l.level, l.text, false);
        });
    } else {
        out.innerHTML = '<div class="dim">' + wbEsc(t('wb.wf.historyDetail')) + '</div>';
    }
    wfHideNodeActions();
    wfSetRunningUI(false);
    wfDraw();
    wfSyncModeUI();
}
function wfHistoryView(nodeId) {
    if (wfNodeById(nodeId)) { wfSelectNode(nodeId); } else { wbToast(t('wb.wf.historyDetail')); }
}

/* ==================== 运行 / 监控 ==================== */
function wfSetCounters(failed, skipped) {
    if (failed !== undefined) { WF.counts.failed = failed; }
    if (skipped !== undefined) { WF.counts.skipped = skipped; }
    var f = wbEl('wfFailed'), s = wbEl('wfSkipped');
    if (f) { f.textContent = String(WF.counts.failed); }
    if (s) { s.textContent = String(WF.counts.skipped); }
}
function wfSetRunningUI(running) {
    WF.running = running;
    wbEl('wfCanvasWrap').classList.toggle('running-lock', running);
    wbEl('wfRunBtn').disabled = running;
    if (running) {
        /* 时长计时以累计时长为基数（resume 场景显示总时长） */
        var t0 = Date.now() - (WF.runDuration || 0);
        WF.durTimer = setInterval(function () {
            wbEl('wfDur').textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's';
        }, 250);
        wbEl('wfState').textContent = t('wb.wf.stRunning');
    } else if (WF.durTimer) {
        clearInterval(WF.durTimer);
        WF.durTimer = null;
    }
}
function wfRun() {
    /* 引擎被占用（有运行正在执行，含人工确认等待）时不允许并发启动新运行；
       失败暂停的实例不占用引擎，可发起新运行（旧实例保留在"正在运行"分组供稍后续跑）。 */
    if (WF.bgRunning) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    if (WF.mode !== 'edit') { wbToast(t('wb.wf.readonlyLock'), 'err'); return; }
    if (!WF.nodes.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    /* 编辑 → 执行详情模式：暂存编辑现场 */
    wfSnapshotEdit();
    WF.mode = 'run';
    WF.runPhase = 'running';
    WF.runDuration = 0;
    WF.bgRunning = true;
    WF.runId = null; // 宿主创建实例后经 runPhase 消息回填
    wfPrepareRun();
    wfSyncModeUI();
    vscode.postMessage({
        command: 'workflowRun',
        workflow: wfCurrentWorkflowObj(),
        shell: wbEl('wfShell').value
    });
}
/* 侧边栏（Batch 等）发起的运行：载入工作流并切换到执行详情模式 */
function wfOnRunStarted(workflow, runId) {
    if (!workflow || !Array.isArray(workflow.nodes)) { return; }
    if (WF.mode === 'edit') { wfSnapshotEdit(); }
    WF.mode = 'run';
    WF.runPhase = 'running';
    WF.runDuration = 0;
    WF.bgRunning = true;
    WF.runId = runId || null;
    WF.currentId = null;
    WF.templateId = null;
    WF.nodes = workflow.nodes;
    WF.edges = workflow.edges || [];
    WF.selected = null;
    wbEl('wfName').value = workflow.name || 'workflow';
    wfPrepareRun();
    wfSyncModeUI();
}
function wfPrepareRun() {
    WF.states = {};
    WF.logs = [];
    WF.logFilter = '';
    wfSetCounters(0, 0);
    wbEl('wfRunTbody').innerHTML = '';
    wbEl('wfOutput').innerHTML = '';
    wfHideNodeActions();
    var sel = wbEl('wfLogFilter');
    sel.innerHTML = '<option value="">' + wbEsc(t('wb.wf.allNodes')) + '</option>';
    wfSetRunningUI(true);
    wfDraw();
}
function wfStop() {
    if (!WF.running) { return; }
    vscode.postMessage({ command: 'workflowStop' });
}
function wfOnEvent(ev) {
    if (!ev) { return; }
    /* 按 runId 过滤：多运行实例并存时（引擎执行新任务 + 失败暂停实例），
       其他运行的事件不污染当前展示的运行详情视图 */
    if (ev.runId && WF.runId && ev.runId !== WF.runId) { return; }
    /* 已切到其他 Flow 编辑时忽略后台运行事件：节点状态/日志由宿主保留，
       重开"正在运行"详情时从 run.states/run.logs 回放，避免污染当前编辑画布 */
    if (WF.mode !== 'run') { return; }
    if (ev.type === 'nodeState') {
        WF.states[ev.nodeId] = ev.state;
        if (ev.state === 'failed') { WF.counts.failed++; wfSetCounters(); }
        else if (ev.state === 'skipped') { WF.counts.skipped++; wfSetCounters(); }
        var node = wfNodeById(ev.nodeId);
        var row = wbEl('wfrow-' + ev.nodeId);
        if (ev.state === 'running') {
            if (!row && node) {
                var tr = document.createElement('tr');
                tr.id = 'wfrow-' + ev.nodeId;
                tr.innerHTML = '<td>' + wbNow() + '</td><td>' + wbEsc(node.label) + '</td><td>↻ ' + wbEsc(t('wb.wf.stRunning')) + '</td><td class="wf-dur">--</td>' +
                    '<td><span class="wf-view-link" onclick="wfSelectNode(\\'' + ev.nodeId + '\\')">' + wbEsc(t('wb.wf.view')) + '</span></td>';
                wbEl('wfRunTbody').appendChild(tr);
            }
            wfAddLogFilterOption(ev.nodeId, node ? node.label : ev.nodeId);
        } else if (row) {
            var label = ev.state === 'success' ? '✓ ' + t('wb.wf.stSuccess') : ev.state === 'failed' ? '✗ ' + t('wb.wf.stFailed') : '↓ ' + t('wb.wf.stSkipped');
            row.cells[2].textContent = label;
            if (ev.dur !== undefined) { row.querySelector('.wf-dur').textContent = (ev.dur / 1000).toFixed(1) + 's'; }
        }
        wfDraw();
    } else if (ev.type === 'log') {
        WF.logs.push({ nodeId: ev.nodeId, level: ev.level, text: ev.text });
        if (!WF.logFilter || WF.logFilter === ev.nodeId) {
            wfAppendOutput(ev.level, ev.text);
        }
    } else if (ev.type === 'confirm') {
        /* 人工确认：操作条置于待确认节点上方 */
        wbEl('wfNodeActionsText').textContent = t('wb.wf.confirmAsk') + (ev.text ? ': ' + ev.text : '');
        wfShowNodeActions(ev.nodeId, 'confirm');
    } else if (ev.type === 'done') {
        wfSetRunningUI(false);
        var key = ev.result === 'success' ? 'wb.wf.doneSuccess' : ev.result === 'stopped' ? 'wb.wf.doneStopped' : 'wb.wf.doneFailed';
        wbEl('wfState').textContent = ev.result === 'success' ? t('wb.wf.stSuccess') : ev.result === 'stopped' ? t('wb.wf.stStopped') : t('wb.wf.stFailed');
        wbEl('wfDur').textContent = (ev.duration / 1000).toFixed(1) + 's';
        wfAppendOutput(ev.result === 'success' ? 'ok' : 'err', t(key) + ' · ' + (ev.duration / 1000).toFixed(1) + 's');
        wbToast(t(key), ev.result === 'success' ? 'ok' : 'err');
        /* 执行详情模式：failed → 失败暂停（保留 Resume/Cancel 操作条）；success/stopped → 终局 */
        if (WF.mode === 'run') {
            WF.runDuration = ev.duration;
            if (ev.result === 'failed') {
                WF.runPhase = 'failed-paused';
                wfShowFailedActions();
            } else {
                WF.runPhase = 'ended';
                wfHideNodeActions();
            }
            wfSyncModeUI();
        } else {
            wfHideNodeActions();
        }
    }
}
function wfAppendOutput(level, text, stamp) {
    var out = wbEl('wfOutput');
    if (!out) { return; }
    var d = document.createElement('div');
    d.className = level;
    d.textContent = (stamp === false ? '' : '[' + wbNow() + '] ') + text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}
function wfAddLogFilterOption(nodeId, label) {
    var sel = wbEl('wfLogFilter');
    if (sel.querySelector('option[value="' + nodeId + '"]')) { return; }
    var opt = document.createElement('option');
    opt.value = nodeId;
    opt.textContent = label;
    sel.appendChild(opt);
}
function wfApplyLogFilter() {
    WF.logFilter = wbEl('wfLogFilter').value;
    var out = wbEl('wfOutput');
    out.innerHTML = '';
    WF.logs.forEach(function (l) {
        if (!WF.logFilter || WF.logFilter === l.nodeId) { wfAppendOutput(l.level, l.text, false); }
    });
}
function wfClearOutput() {
    wbEl('wfOutput').innerHTML = '';
    WF.logs = [];
}
/* 导出监控日志：收集结构化日志（回退到输出区 DOM），由宿主打开新编辑器并全选 */
function wfExportLog() {
    var lines = [];
    if (WF.logs && WF.logs.length) {
        WF.logs.forEach(function (l) { lines.push(l.text); });
    } else {
        var out = wbEl('wfOutput');
        if (out) {
            Array.prototype.forEach.call(out.children, function (el) {
                if (el.textContent) { lines.push(el.textContent); }
            });
        }
    }
    var content = lines.join('\\n');
    if (!content.trim()) { wbToast(t('wb.wf.noLogs'), 'err'); return; }
    vscode.postMessage({ command: 'exportLog', content: content, tabId: 'workflow' });
}

/* ==================== monitor splitter（画布/监控上下拖拽调高） ==================== */
var WF_MON_KEY = 'wfMonitorHeight';
function wfMonClamp(h) {
    var max = Math.max(160, Math.floor(window.innerHeight * 0.75));
    return Math.min(max, Math.max(90, Math.round(h)));
}
function wfSetMonitorH(h, save) {
    var px = wfMonClamp(h) + 'px';
    document.documentElement.style.setProperty('--wf-monitor-h', px);
    if (save) { try { localStorage.setItem(WF_MON_KEY, String(wfMonClamp(h))); } catch (e) {} }
}
function wfInitSplitter() {
    var splitter = wbEl('wfMonitorSplitter');
    if (!splitter) { return; }
    try {
        var saved = Number(localStorage.getItem(WF_MON_KEY));
        if (saved >= 90) { wfSetMonitorH(saved, false); }
    } catch (e) {}
    var startY = 0, startH = 0;
    splitter.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        startY = ev.clientY;
        startH = wbEl('wfMonitor').getBoundingClientRect().height;
        splitter.classList.add('dragging');
        document.body.classList.add('wf-resizing');
        function onMove(e) { wfSetMonitorH(startH + (startY - e.clientY), false); }
        function onUp() {
            splitter.classList.remove('dragging');
            document.body.classList.remove('wf-resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            wfSetMonitorH(wbEl('wfMonitor').getBoundingClientRect().height, true);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    /* 分隔条双击：恢复默认高度 */
    splitter.addEventListener('dblclick', function () {
        wfSetMonitorH(250, true);
    });
}

/* ==================== init ==================== */
window.addEventListener('load', function () {
    renderPalette();
    wfInitCanvasEvents();
    wfInitSplitter();
    wbEl('wfHint').textContent = t('wb.wf.hint');
    vscode.postMessage({ command: 'flowEditorReady' });
});
`;
