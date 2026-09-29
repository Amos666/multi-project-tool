// 工作台新增 Tab 的 Webview JS（追加到现有脚本之后，复用全局 vscode / t() / shortcutCommandTree）
// 注意：本字符串内不使用模板字面量与 ${}，避免转义问题

export const WORKBENCH_JS = `
/* ==================== Workbench: state ==================== */
var WB = { data: { checklist: [], workflows: [], templates: [], history: [], hiddenTabs: [] }, batchIdx: 0, run: [] };
/* 画布/属性/监控已迁移至主编辑区 Flow Editor 面板；侧边栏仅保留运行锁与批量节点映射。
   WB.run 为运行实例数组（活动运行 + 失败暂停实例并存）；WF.runId 为批量运行的实例 id（事件过滤用） */
var WF = { running: false, batchNodeIds: [], runId: null };

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
/* 统一 SVG 图标（与其他页签一致，不使用 emoji） */
var WB_ICON_PATHS = {
    play: '<path d="M5.5 3.5v9l7.5-4.5z"/>',
    stop: '<rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1"/>',
    folder: '<path d="M2 4.5h4l1.5 2H14v6H2z"/>',
    template: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6h11"/><path d="M6 3v3"/>',
    bolt: '<path d="M8.8 2L4 9h3.2L7.2 14 12 7H8.8z"/>',
    keyboard: '<rect x="2" y="4.5" width="12" height="7" rx="1"/><path d="M4.5 7h1M7.5 7h1M10.5 7h1M5 9.5h6"/>',
    arrow: '<path d="M3 8h9M9 5l3 3-3 3"/>'
};
function wbIcon(name, color) {
    var style = color ? ' style="stroke:' + color + '"' : '';
    return '<svg class="wb-icon"' + style + ' viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">' + (WB_ICON_PATHS[name] || '') + '</svg>';
}
function wfHistIcon(result) {
    var color = result === 'success' ? 'var(--state-success)' : result === 'stopped' ? 'var(--brand-text-muted)' : 'var(--state-error)';
    var inner = result === 'success' ? '<path d="M5.3 8.2l1.9 1.9 3.5-4"/>'
        : result === 'stopped' ? '<rect x="6" y="6" width="4" height="4"/>'
            : '<path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>';
    return '<svg class="wb-icon" style="stroke:' + color + '" viewBox="0 0 16 16" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="8" cy="8" r="6.2"/>' + inner + '</svg>';
}

window.addEventListener('message', function (event) {
    var m = event.data;
    if (!m || !m.command) { return; }
    if (m.command === 'workbenchData') { wbOnData(m.data); }
    else if (m.command === 'workflowEvent') { wfOnEvent(m.event); }
    else if (m.command === 'runState') { WB.run = m.runs || []; renderRunningList(); }
    else if (m.command === 'batchRunStarted') { WF.runId = m.runId || null; }
});

function wbOnData(data) {
    if (!data) { return; }
    WB.data = data;
    renderChecklist();
    renderFlowList();
    renderRunningList();
    renderHistoryList();
    renderBatchGroups();
    applyHiddenTabs();
    applyTabToggles();
}

/* ==================== 通用确认弹窗（webview 中 window.confirm 被禁用） ==================== */
var wbConfirmCb = null;
function wbConfirm(msg, cb) {
    wbEl('wbConfirmText').textContent = msg;
    wbConfirmCb = cb;
    wbEl('wbConfirmModal').style.display = 'flex';
}
function wbConfirmOk() {
    var cb = wbConfirmCb;
    wbConfirmClose();
    if (cb) { cb(); }
}
function wbConfirmClose() {
    wbConfirmCb = null;
    wbEl('wbConfirmModal').style.display = 'none';
}

/* ==================== 通用输入弹窗（webview 中原生 prompt API 被禁用） ==================== */
var wbPromptCb = null;
function wbPrompt(msg, defVal, cb) {
    wbEl('wbPromptText').textContent = msg;
    var input = wbEl('wbPromptInput');
    input.value = defVal || '';
    wbPromptCb = cb;
    wbEl('wbPromptModal').style.display = 'flex';
    setTimeout(function () { input.focus(); input.select(); }, 50);
}
function wbPromptOk() {
    var cb = wbPromptCb;
    var val = wbEl('wbPromptInput').value;
    wbPromptClose();
    if (cb) { cb(val); }
}
function wbPromptClose() {
    wbPromptCb = null;
    wbEl('wbPromptModal').style.display = 'none';
}
function wbPromptKey(ev) {
    if (ev.key === 'Enter') { wbPromptOk(); }
    else if (ev.key === 'Escape') { wbPromptClose(); }
}

/* ==================== Checklist ==================== */
var CL_PRIO = ['urgent', 'normal', 'low'];
function renderChecklist() {
    var box = wbEl('clList');
    if (!box) { return; }
    var tasks = WB.data.checklist || [];
    var dateEl = wbEl('clDate');
    if (dateEl) { dateEl.textContent = new Date().toISOString().slice(0, 10); }
    var html = '';
    if (!tasks.length) {
        html = '<div class="wb-empty">' + wbEsc(t('wb.cl.empty')) + '</div>';
    }
    CL_PRIO.forEach(function (p) {
        var group = tasks.filter(function (x) { return x.priority === p; });
        if (!group.length) { return; }
        html += '<div class="wb-prio-label ' + p + '">' + wbEsc(t('wb.cl.prio.' + p)) + '</div>';
        group.forEach(function (task) {
            html += '<div class="wb-task' + (task.done ? ' done' : '') + '">' +
                '<input type="checkbox"' + (task.done ? ' checked' : '') + ' onchange="wbToggleTask(\\'' + task.id + '\\', this.checked)">' +
                '<span class="wb-task-text">' + wbEsc(task.text) + '</span>' +
                '<span class="wb-task-rm" onclick="wbDeleteTask(\\'' + task.id + '\\')">✕</span></div>';
        });
    });
    box.innerHTML = html;
    var done = tasks.filter(function (x) { return x.done; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    wbEl('clProgText').textContent = pct + '%';
    wbEl('clProgBar').style.width = pct + '%';
}
function wbSaveChecklist() {
    vscode.postMessage({ command: 'checklistSave', tasks: WB.data.checklist });
}
function wbAddTask() {
    var input = wbEl('clInput');
    var text = (input.value || '').trim();
    if (!text) { return; }
    WB.data.checklist.push({ id: wbId('task'), text: text, priority: wbEl('clPrio').value, done: false, createdAt: Date.now() });
    input.value = '';
    renderChecklist();
    wbSaveChecklist();
}
function wbToggleTask(id, done) {
    var task = WB.data.checklist.find(function (x) { return x.id === id; });
    if (task) { task.done = done; renderChecklist(); wbSaveChecklist(); }
}
function wbDeleteTask(id) {
    WB.data.checklist = WB.data.checklist.filter(function (x) { return x.id !== id; });
    renderChecklist();
    wbSaveChecklist();
}
function wbClearDone() {
    WB.data.checklist = WB.data.checklist.filter(function (x) { return !x.done; });
    renderChecklist();
    wbSaveChecklist();
}

/* ==================== Workflow: relay to Flow Editor（画布在主编辑区面板） ==================== */
function wfRelay(action) { vscode.postMessage({ command: 'flowEditorAction', action: action }); }
function wfOpenEditor() { wfRelay({ type: 'open' }); }






/* ==================== Workflow: list / templates / history ==================== */
function renderFlowList() {
    var box = wbEl('wfFlowList');
    if (!box) { return; }
    /* kind='batch' 的清单式工作流由 Batch 面板管理，不在 Flow 画布列表展示 */
    var flows = (WB.data.workflows || []).filter(function (w) { return w.kind !== 'batch'; });
    var tpls = WB.data.templates || [];
    if (!flows.length && !tpls.length) {
        box.innerHTML = '<div class="wf-list-item dim">' + wbEsc(t('wb.wf.noFlows')) + '</div>';
        return;
    }
    var html = flows.map(function (wf) {
        return '<div class="wf-list-item" onclick="wfSelectFlow(\\'' + wf.id + '\\')" title="' + wbEsc(wf.name) + '">' +
            '<span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(wf.name) + '</span>' +
            '<span class="wf-item-rm" onclick="event.stopPropagation();wfDeleteFlow(\\'' + wf.id + '\\')">✕</span></div>';
    }).join('');
    /* 模板并入 Workflows 分组（带模板图标），可点击编辑、可删除 */
    html += tpls.map(function (tpl) {
        var label = tpl.builtin ? t(tpl.name) : tpl.name;
        return '<div class="wf-list-item" onclick="wfLoadTemplate(\\'' + tpl.id + '\\')" title="' + wbEsc(label) + '">' +
            wbIcon('template') + ' <span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(label) + '</span>' +
            '<span class="wf-item-rm" onclick="event.stopPropagation();wfDeleteTemplate(\\'' + tpl.id + '\\')">✕</span></div>';
    }).join('');
    box.innerHTML = html;
}
function wfSelectFlow(id) { wfRelay({ type: 'openFlow', id: id }); }
function wfDeleteFlow(id) {
    var wf = (WB.data.workflows || []).find(function (w) { return w.id === id; });
    wbConfirm(t('wb.wf.deleteFlowConfirm') + (wf ? ' "' + wf.name + '"' : ''), function () {
        vscode.postMessage({ command: 'workflowDelete', id: id });
    });
}
function wfNew() { wfRelay({ type: 'new' }); }
function wfLoadTemplate(id) { wfRelay({ type: 'loadTemplate', id: id }); }
function wfDeleteTemplate(id) {
    wbConfirm(t('wb.wf.deleteTemplateConfirm'), function () {
        vscode.postMessage({ command: 'templateDelete', id: id });
    });
}
/* ---- 正在运行分组：点击打开 Flow Editor 执行详情 ---- */
function renderRunningList() {
    var box = wbEl('wfRunningList');
    if (!box) { return; }
    var runs = WB.run || [];
    if (!runs.length) {
        box.innerHTML = '<div class="wf-list-item dim">' + wbEsc(t('wb.wf.noRunning')) + '</div>';
        return;
    }
    var errIcon = '<svg class="wb-icon" style="stroke:var(--state-error)" viewBox="0 0 16 16" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>';
    var runIcon = '<svg class="wb-icon" style="stroke:var(--brand-primary)" viewBox="0 0 16 16" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M8 2a6 6 0 1 0 6 6"/><path d="M8 4.5A3.5 3.5 0 1 0 11.5 8"/></svg>';
    box.innerHTML = runs.map(function (r) {
        var failedPaused = r.phase === 'failed-paused';
        var phaseLabel = failedPaused ? t('wb.wf.failedPaused') : t('wb.wf.stRunning');
        return '<div class="wf-list-item" onclick="wfOpenRun(\\'' + r.id + '\\')" title="' + wbEsc(r.name) + '">' +
            (failedPaused ? errIcon : runIcon) + ' <span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(r.name) + ' · ' + wbEsc(phaseLabel) + '</span></div>';
    }).join('');
}
function wfOpenRun(runId) { wfRelay({ type: 'openRun', runId: runId }); }
/* ---- 历史记录：双击只读查看详情 / 单项删除 / 全部清空 ---- */
function renderHistoryList() {
    var box = wbEl('wfHistoryList');
    if (!box) { return; }
    var hist = WB.data.history || [];
    if (!hist.length) {
        box.innerHTML = '<div class="wf-list-item dim">' + wbEsc(t('wb.wf.noHistory')) + '</div>';
        return;
    }
    box.innerHTML = hist.map(function (h, i) {
        var icon = wfHistIcon(h.result);
        var time = new Date(h.time).toTimeString().slice(0, 8);
        return '<div class="wf-list-item" ondblclick="wfShowHistory(' + i + ')" title="' + wbEsc(h.workflowName) + '">' +
            icon + ' <span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(h.workflowName) + ' · ' + (h.duration / 1000).toFixed(1) + 's · ' + time + '</span>' +
            '<span class="wf-item-rm" onclick="event.stopPropagation();wfDeleteHistory(\\'' + h.id + '\\')">✕</span></div>';
    }).join('');
}
function wfShowHistory(idx) { wfRelay({ type: 'showHistory', idx: idx }); }
function wfDeleteHistory(id) {
    wbConfirm(t('wb.wf.deleteHistoryConfirm'), function () {
        vscode.postMessage({ command: 'historyDelete', id: id });
    });
}
function wfClearHistory() {
    wbConfirm(t('wb.wf.clearHistoryConfirm'), function () {
        vscode.postMessage({ command: 'historyClearAll' });
    });
}

/* ==================== Workflow: run / monitor ==================== */
/* 画布执行监控在主编辑区 Flow Editor 面板；侧边栏仅跟踪批量运行状态与输出 */
function wfStop() {
    if (!WF.running) { return; }
    vscode.postMessage({ command: 'workflowStop' });
}
function batchAppendOutput(level, text, stamp) {
    var out = wbEl('batchOutput');
    if (!out) { return; }
    var d = document.createElement('div');
    d.className = level;
    d.textContent = (stamp === false ? '' : '[' + wbNow() + '] ') + text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}
function wfOnEvent(ev) {
    if (!ev) { return; }
    /* 按 runId 过滤：多运行实例并存时，其他运行（如失败暂停实例被取消的终局事件）
       不影响批量执行的进度/状态展示 */
    if (ev.runId && WF.runId && ev.runId !== WF.runId) { return; }
    if (ev.type === 'nodeState') {
        var bIdx = WF.batchNodeIds.indexOf(ev.nodeId);
        if (bIdx >= 0) { batchUpdatePill(bIdx, ev.state, ev.dur); }
    } else if (ev.type === 'log') {
        if (WB.batchRunning) { batchAppendOutput(ev.level, ev.text); }
    } else if (ev.type === 'done') {
        WF.running = false;
        var key = ev.result === 'success' ? 'wb.wf.doneSuccess' : ev.result === 'stopped' ? 'wb.wf.doneStopped' : 'wb.wf.doneFailed';
        if (WB.batchRunning) {
            WB.batchRunning = false;
            wbEl('batchStatus').textContent = t(key);
            batchAppendOutput(ev.result === 'success' ? 'ok' : 'err', t(key) + ' · ' + (ev.duration / 1000).toFixed(1) + 's');
        }
    }
}
function batchClearLog() {
    var out = wbEl('batchOutput');
    if (out) { out.innerHTML = ''; }
}

/* ==================== Batch（清单式工作流：kind='batch' 的 Workflow，与 Flow 同一数据域） ==================== */
WB.batchRunning = false;
/* Batch 面板展示的工作流列表（workflows 中 kind='batch' 的子集，Flow 画布列表将其过滤掉） */
function batchFlows() {
    return (WB.data.workflows || []).filter(function (w) { return w.kind === 'batch'; });
}
function batchCurrent() { return batchFlows()[WB.batchIdx]; }
function batchLabel(name) { return name.indexOf('wb.batch.') === 0 ? t(name) : name; }
/* 从工作流图反推清单：serial = 沿链式边遍历；parallel = fork 出边目标按 y 排序 */
function batchExtract(wf) {
    if (!wf || !Array.isArray(wf.nodes)) { return { mode: 'serial', commands: [], ids: [] }; }
    var byId = {};
    wf.nodes.forEach(function (n) { byId[n.id] = n; });
    var edges = wf.edges || [];
    var cmdNodes = wf.nodes.filter(function (n) { return n.tag === 'cmd'; });
    var fork = wf.nodes.find(function (n) { return n.tag === 'fork'; });
    var ordered = [];
    if (fork) {
        ordered = edges.filter(function (e) { return e.from === fork.id; })
            .map(function (e) { return byId[e.to]; })
            .filter(function (n) { return n && n.tag === 'cmd'; })
            .sort(function (a, b) { return a.y - b.y; });
    } else {
        var inDeg = {};
        wf.nodes.forEach(function (n) { inDeg[n.id] = 0; });
        edges.forEach(function (e) { if (inDeg[e.to] !== undefined) { inDeg[e.to]++; } });
        var cur = cmdNodes.find(function (n) { return inDeg[n.id] === 0; });
        while (cur) {
            ordered.push(cur);
            var next = null;
            for (var k = 0; k < edges.length; k++) {
                if (edges[k].from === cur.id) {
                    var nn = byId[edges[k].to];
                    if (nn && nn.tag === 'cmd') { next = nn; break; }
                }
            }
            cur = next;
        }
        /* 容错：链式遍历与 cmd 节点数不符（手工改图等）时按坐标排序兜底 */
        if (ordered.length !== cmdNodes.length) {
            ordered = cmdNodes.slice().sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
        }
    }
    return {
        mode: fork ? 'parallel' : 'serial',
        commands: ordered.map(function (n) { return n.cmd; }),
        ids: ordered.map(function (n) { return n.id; })
    };
}
/* 清单 → 工作流图：serial = 链式；parallel = fork/join（与宿主迁移逻辑一致） */
function batchBuildGraph(mode, commands) {
    var nodes = [], edges = [], ids = [];
    if (mode === 'parallel') {
        var forkId = wbId('bn');
        var joinId = wbId('bn');
        nodes.push({ id: forkId, label: 'Fork', tag: 'fork', x: 40, y: 200, cmd: '', timeout: 300, failPolicy: 'stop' });
        commands.forEach(function (c, i) {
            var nid = wbId('bn');
            ids.push(nid);
            nodes.push({ id: nid, label: c.slice(0, 20) || ('cmd ' + (i + 1)), tag: 'cmd', x: 260, y: 40 + i * 90, cmd: c, timeout: 300, failPolicy: 'stop' });
            edges.push({ from: forkId, to: nid });
            edges.push({ from: nid, to: joinId });
        });
        nodes.push({ id: joinId, label: 'Join', tag: 'join', x: 560, y: 200, cmd: '', timeout: 300, failPolicy: 'stop' });
    } else {
        var prev = null;
        commands.forEach(function (c, i) {
            var nid = wbId('bn');
            ids.push(nid);
            nodes.push({ id: nid, label: c.slice(0, 20) || ('cmd ' + (i + 1)), tag: 'cmd', x: 40 + i * 150, y: 200, cmd: c, timeout: 300, failPolicy: 'stop' });
            if (prev) { edges.push({ from: prev, to: nid }); }
            prev = nid;
        });
    }
    return { nodes: nodes, edges: edges, ids: ids };
}
/* 按（可能被修改的）清单重建工作流图并持久化（复用 workflowSave，与 Flow 编辑器同一条保存路径） */
function batchSync(wf, mode, commands) {
    var g = batchBuildGraph(mode, commands);
    wf.nodes = g.nodes;
    wf.edges = g.edges;
    wf.updatedAt = Date.now();
    vscode.postMessage({ command: 'workflowSave', workflow: wf });
}
function renderBatchGroups() {
    var sel = wbEl('batchGroupSel');
    if (!sel) { return; }
    var flows = batchFlows();
    if (WB.batchIdx >= flows.length) { WB.batchIdx = 0; }
    sel.innerHTML = flows.map(function (wf, i) {
        return '<option value="' + i + '"' + (i === WB.batchIdx ? ' selected' : '') + '>' + wbEsc(batchLabel(wf.name)) + '</option>';
    }).join('');
    var cur = batchCurrent();
    var x = cur ? batchExtract(cur) : { mode: 'serial', commands: [] };
    wbEl('batchMode').value = x.mode;
    wbEl('batchGroupName').value = cur ? batchLabel(cur.name) : '';
    renderBatchList();
}
function renderBatchList() {
    var ul = wbEl('batchList');
    if (!ul) { return; }
    var wf = batchCurrent();
    var x = wf ? batchExtract(wf) : { commands: [] };
    if (!wf || !x.commands.length) {
        ul.innerHTML = '<li style="justify-content:center;color:var(--brand-text-muted)">' + wbEsc(t('wb.batch.empty')) + '</li>';
        return;
    }
    ul.innerHTML = x.commands.map(function (c, i) {
        return '<li draggable="true" data-bidx="' + i + '" ondragstart="batchDragStart(event,' + i + ')" ondragover="batchDragOver(event)" ondragleave="batchDragLeave(event)" ondrop="batchDrop(event,' + i + ')">' +
            '<span class="batch-handle">≡</span><span class="batch-idx">' + (i + 1) + '.</span>' +
            '<input class="batch-cmd-input" value="' + wbEsc(c) + '" onchange="batchEditCmd(' + i + ', this.value)">' +
            '<span class="batch-status" id="bstat-' + i + '">⏳</span>' +
            '<span class="batch-dur" id="bdur-' + i + '">--</span>' +
            '<span class="batch-rm" onclick="batchRemoveCmd(' + i + ')">✕</span></li>';
    }).join('');
}
function batchSelectGroup() { WB.batchIdx = Number(wbEl('batchGroupSel').value); renderBatchGroups(); }
function batchModeChange() {
    var wf = batchCurrent();
    if (!wf) { return; }
    var mode = wbEl('batchMode').value;
    var x = batchExtract(wf);
    if (x.mode === mode) { return; }
    batchSync(wf, mode, x.commands);
}
function batchRenameGroup() {
    var wf = batchCurrent();
    var name = (wbEl('batchGroupName').value || '').trim();
    if (!wf || !name) { return; }
    wf.name = name;
    wf.updatedAt = Date.now();
    vscode.postMessage({ command: 'workflowSave', workflow: wf });
    renderBatchGroups();
}
/* 原生 prompt API 在 webview 中被禁用，改用输入弹窗 */
function batchAddGroup() {
    wbPrompt(t('wb.batch.namePh'), 'group', function (name) {
        name = (name || '').trim();
        if (!name) { return; }
        var wf = { id: wbId('batch'), name: name, kind: 'batch', nodes: [], edges: [], updatedAt: Date.now() };
        WB.data.workflows.push(wf);
        WB.batchIdx = batchFlows().length - 1;
        vscode.postMessage({ command: 'workflowSave', workflow: wf });
        renderBatchGroups();
    });
}
function batchDeleteGroup() {
    var wf = batchCurrent();
    if (!wf) { return; }
    wbConfirm(t('wb.batch.deleteGroupConfirm') + ' "' + batchLabel(wf.name) + '"', function () {
        vscode.postMessage({ command: 'workflowDelete', id: wf.id });
    });
}
function batchAddCmd() {
    var wf = batchCurrent();
    if (!wf) { return; }
    var x = batchExtract(wf);
    x.commands.push('echo hello');
    batchSync(wf, x.mode, x.commands);
    renderBatchList();
}
function batchEditCmd(i, val) {
    var wf = batchCurrent();
    if (!wf) { return; }
    var x = batchExtract(wf);
    if (x.commands[i] === undefined) { return; }
    x.commands[i] = val;
    batchSync(wf, x.mode, x.commands);
}
function batchRemoveCmd(i) {
    var wf = batchCurrent();
    if (!wf) { return; }
    var x = batchExtract(wf);
    x.commands.splice(i, 1);
    batchSync(wf, x.mode, x.commands);
    renderBatchList();
}
var batchDragIdx = null;
function batchDragStart(e, i) { batchDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function batchDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function batchDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function batchDrop(e, i) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    var wf = batchCurrent();
    if (!wf || batchDragIdx === null || batchDragIdx === i) { return; }
    var x = batchExtract(wf);
    var item = x.commands.splice(batchDragIdx, 1)[0];
    x.commands.splice(i, 0, item);
    batchDragIdx = null;
    batchSync(wf, x.mode, x.commands);
    renderBatchList();
}
function batchRun() {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    var wf = batchCurrent();
    var x = wf ? batchExtract(wf) : null;
    if (!wf || !x.commands.length) { wbToast(t('wb.batch.empty'), 'err'); return; }
    WF.batchNodeIds = x.ids;
    WB.batchRunning = true;
    WF.running = true;
    WF.runId = null; // 宿主创建实例后经 batchRunStarted 消息回填
    wbEl('batchStatus').textContent = t('wb.wf.stRunning');
    batchResetPills();
    batchClearLog();
    batchAppendOutput('hdr', '━━ ' + batchLabel(wf.name) + ' · ' + (x.mode === 'parallel' ? t('wb.batch.parallel') : t('wb.batch.serial')) + ' · ' + wbEl('batchShell').value + ' ━━');
    vscode.postMessage({
        command: 'workflowRun',
        workflow: wf,
        shell: wbEl('batchShell').value
    });
}
function batchResetPills() {
    var wf = batchCurrent();
    var x = wf ? batchExtract(wf) : { commands: [] };
    x.commands.forEach(function (_, i) {
        var pill = wbEl('bstat-' + i);
        var dur = wbEl('bdur-' + i);
        if (pill) { pill.textContent = '⏳'; pill.className = 'batch-status'; }
        if (dur) { dur.textContent = '--'; }
    });
}
function batchUpdatePill(idx, state, dur) {
    var pill = wbEl('bstat-' + idx);
    var durEl = wbEl('bdur-' + idx);
    if (!pill) { return; }
    if (state === 'running') { pill.textContent = '↻'; pill.className = 'batch-status running'; }
    else if (state === 'success') { pill.textContent = '✓'; pill.className = 'batch-status success'; }
    else if (state === 'failed') { pill.textContent = '✗'; pill.className = 'batch-status failed'; }
    else { pill.textContent = '↓'; pill.className = 'batch-status'; }
    if (dur !== undefined && durEl) { durEl.textContent = (dur / 1000).toFixed(1) + 's'; }
}
function batchToFlow() {
    var wf = batchCurrent();
    if (!wf || !batchExtract(wf).commands.length) { wbToast(t('wb.batch.empty'), 'err'); return; }
    wfRelay({
        type: 'batchToFlow',
        name: batchLabel(wf.name),
        nodes: wf.nodes,
        edges: wf.edges
    });
}

/* ==================== Quick Launcher ==================== */
var launcherSel = 0, launcherItems = [];
function wfLauncherRun(id) {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    wfRelay({ type: 'runFlow', id: id });
}
function launcherBuild() {
    var items = [];
    if (WF.running) {
        items.push({
            icon: wbIcon('stop'), label: t('wb.launcher.stopFlow'), kind: t('wb.launcher.kindFlow'),
            run: function () { wfStop(); }
        });
    }
    (WB.data.workflows || []).forEach(function (wf) {
        items.push({
            icon: wbIcon('play'), label: wf.name, kind: t('wb.launcher.kindFlow'),
            run: function () { wfLauncherRun(wf.id); }
        });
        items.push({
            icon: wbIcon('folder'), label: wf.name, kind: t('wb.launcher.kindFlow'),
            run: function () { wfRelay({ type: 'openFlow', id: wf.id }); }
        });
    });
    (WB.data.templates || []).forEach(function (tpl) {
        items.push({
            icon: wbIcon('template'), label: tpl.builtin ? t(tpl.name) : tpl.name, kind: t('wb.launcher.kindTemplate'),
            run: function () { wfRelay({ type: 'loadTemplate', id: tpl.id }); }
        });
    });
    batchFlows().forEach(function (wf, i) {
        items.push({
            icon: wbIcon('bolt'), label: batchLabel(wf.name), kind: t('wb.launcher.kindBatch'),
            run: function () { WB.batchIdx = i; switchTab('batch'); renderBatchGroups(); }
        });
    });
    (function flatten(tree) {
        (tree || []).forEach(function (node) {
            if (node.type === 'command' && node.content) {
                items.push({
                    icon: wbIcon('keyboard'), label: node.name, kind: t('wb.launcher.kindShortcut'),
                    run: function () { vscode.postMessage({ command: 'runShortcutCmd', cmd: { alias: node.name, content: node.content, shell: node.shell } }); }
                });
            }
            if (node.children) { flatten(node.children); }
        });
    })(typeof shortcutCommandTree !== 'undefined' ? shortcutCommandTree : []);
    [
        ['git', 'tab.git'], ['custom', 'tab.custom'], ['shortcut', 'tab.shortcut'], ['txtcmd', 'tab.txtcmd'],
        ['settings', 'tab.settings'], ['checklist', 'tab.checklist'], ['workflow', 'tab.workflow'], ['batch', 'tab.batch']
    ].forEach(function (pair) {
        items.push({ icon: wbIcon('arrow'), label: t(pair[1]), kind: t('wb.launcher.kindTab'), run: function () { switchTab(pair[0]); } });
    });
    return items;
}
function launcherOpen() {
    launcherSel = 0;
    wbEl('launcherInput').value = '';
    wbEl('launcherMask').style.display = '';
    launcherRender();
    setTimeout(function () { wbEl('launcherInput').focus(); }, 30);
}
function launcherClose() { wbEl('launcherMask').style.display = 'none'; }
function launcherRender() {
    var q = (wbEl('launcherInput').value || '').trim().toLowerCase();
    var all = launcherBuild();
    launcherItems = all.filter(function (it) {
        if (!q) { return true; }
        var label = it.label.toLowerCase();
        return q.split(/\\s+/).every(function (tok) { return label.indexOf(tok) >= 0; });
    });
    launcherSel = Math.min(launcherSel, Math.max(0, launcherItems.length - 1));
    var list = wbEl('launcherList');
    if (!launcherItems.length) {
        list.innerHTML = '<div class="empty">' + wbEsc(t('wb.launcher.empty')) + '</div>';
        return;
    }
    list.innerHTML = launcherItems.map(function (it, i) {
        return '<div class="launcher-item' + (i === launcherSel ? ' sel' : '') + '" onmouseenter="launcherSel=' + i + ';launcherRender()" onclick="launcherExec(' + i + ')">' +
            '<span class="l-icon">' + it.icon + '</span><span class="l-label">' + wbEsc(it.label) + '</span>' +
            '<span class="l-kind">' + wbEsc(it.kind) + '</span></div>';
    }).join('');
}
function launcherKey(e) {
    if (e.key === 'ArrowDown') { launcherSel = Math.min(launcherSel + 1, launcherItems.length - 1); launcherRender(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { launcherSel = Math.max(launcherSel - 1, 0); launcherRender(); e.preventDefault(); }
    else if (e.key === 'Enter') { launcherExec(launcherSel); }
    else if (e.key === 'Escape') { launcherClose(); }
}
function launcherExec(i) {
    var it = launcherItems[i];
    if (!it) { return; }
    launcherClose();
    it.run();
}
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        launcherOpen();
    }
});

/* ==================== Hidden tabs ==================== */
/* 可隐藏的页签（settings 承载本开关面板，始终保留） */
var WB_ALL_TABS = ['git', 'custom', 'shortcut', 'txtcmd', 'checklist', 'workflow', 'batch'];
function applyHiddenTabs() {
    var hidden = WB.data.hiddenTabs || [];
    WB_ALL_TABS.forEach(function (id) {
        var btn = wbEl('tabBtn-' + id);
        if (!btn) { return; }
        btn.style.display = hidden.indexOf(id) >= 0 ? 'none' : '';
    });
    var hiddenSet = {};
    hidden.forEach(function (h) { hiddenSet[h] = true; });
    if (hiddenSet[currentTab]) {
        var next = WB_ALL_TABS.filter(function (id) { return !hiddenSet[id]; })[0];
        switchTab(next || 'settings');
    }
}
function wbToggleTab(id) {
    if (id === 'settings') { return; }
    var hidden = WB.data.hiddenTabs || [];
    var idx = hidden.indexOf(id);
    if (idx >= 0) { hidden.splice(idx, 1); } else { hidden.push(id); }
    WB.data.hiddenTabs = hidden;
    vscode.postMessage({ command: 'workbenchTabsSave', hiddenTabs: hidden });
    applyHiddenTabs();
    applyTabToggles();
}
function applyTabToggles() {
    var hidden = WB.data.hiddenTabs || [];
    WB_ALL_TABS.forEach(function (id) {
        var el = wbEl('wbTabToggle-' + id);
        if (el) { el.classList.toggle('active', hidden.indexOf(id) < 0); }
    });
}

/* ==================== Workbench init ==================== */
window.addEventListener('load', function () {
    renderChecklist();
    renderBatchGroups();
});
`;
