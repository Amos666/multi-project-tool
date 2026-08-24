// 工作台新增 Tab 的 Webview JS（追加到现有脚本之后，复用全局 vscode / t() / shortcutCommandTree）
// 注意：本字符串内不使用模板字面量与 ${}，避免转义问题

export const WORKBENCH_JS = `
/* ==================== Workbench: state ==================== */
var WB = { data: { checklist: [], workflows: [], templates: [], history: [], batchGroups: [], hiddenTabs: [] }, batchIdx: 0 };
var WF = {
    nodes: [], edges: [], states: {}, selected: null, linkMode: false, linkFrom: null,
    running: false, idSeq: 1, currentId: null, logs: [], logFilter: '', durTimer: null,
    batchNodeIds: [], drag: null, counts: { failed: 0, skipped: 0 }
};
var WF_W = 118, WF_H = 44, WF_VB_W = 1000, WF_VB_H = 460;
var WF_TAG_COLOR = { start: '#48bfe3', cmd: '#7aa2f7', condition: '#e0af68', fork: '#9ece6a', join: '#2ac3de', notify: '#f7768e', confirm: '#ff9e64', ref: '#bb9af7' };

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
});

function wbOnData(data) {
    if (!data) { return; }
    WB.data = data;
    renderChecklist();
    renderFlowList();
    renderTemplateList();
    renderHistoryList();
    renderBatchGroups();
    applyHiddenTabs();
    applyTabToggles();
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

/* ==================== Workflow: canvas render ==================== */
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
var WF_POLICY_KEY = { stop: 'wb.wf.policyStop', skip: 'wb.wf.policySkip', retry1: 'wb.wf.policyRetry' };
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
}

/* ==================== Workflow: interactions ==================== */
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
        if (WF.running) { return; }
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
        if (edgeHit && !WF.running) {
            WF.edges.splice(Number(edgeHit.dataset.edge), 1);
            wfDraw();
            wbToast(t('wb.wf.edgeDeleted'), 'ok');
            return;
        }
        var g = e.target.closest('.wf-node');
        if (!g) { return; }
        var id = g.dataset.id;
        if (WF.linkMode && !WF.running) { wfLinkClick(id); return; }
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
/* cmd 字段：start 隐藏；ref 仅在选择 git 页签时作为参数字段显示 */
function wfSyncCmdField(n) {
    var show = n.tag !== 'start' && !(n.tag === 'ref' && (n.refTab || 'cmd') !== 'git');
    wbEl('wfPCmdLabel').style.display = show ? '' : 'none';
    wbEl('wfPCmd').style.display = show ? '' : 'none';
    wbEl('wfPCmdLabel').textContent = t(wfCmdLabelKey(n));
}
/* ---- ref 节点：引用各页签已保存命令 ---- */
var WF_GIT_OPS = ['pull', 'commit', 'push', 'fetch', 'switch-branch', 'create-branch'];
function wfRefTree(tab) {
    if (tab === 'pyt') { return typeof pythonTxtCommandTree !== 'undefined' ? pythonTxtCommandTree : []; }
    if (tab === 'shortcut') { return typeof shortcutCommandTree !== 'undefined' ? shortcutCommandTree : []; }
    return typeof customCommandTree !== 'undefined' ? customCommandTree : [];
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
/* ref→git 时参数必填的分支类操作 */
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
    wbEl('wfConfirmBar').style.display = 'none';
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
    if (WF.edges[idx]) { WF.edges[idx].condition = val; wfDraw(); }
}
function wfEditProp(key, val) {
    var n = wfNodeById(WF.selected);
    if (!n) { return; }
    n[key] = val;
    if (key === 'notifyType') { wfSyncNotifyFields(n); wfSyncCmdField(n); }
    wfDraw();
}
function wfDeleteSelected() {
    if (!WF.selected || WF.running) { return; }
    WF.nodes = WF.nodes.filter(function (n) { return n.id !== WF.selected; });
    WF.edges = WF.edges.filter(function (e) { return e.from !== WF.selected && e.to !== WF.selected; });
    WF.selected = null;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wbToast(t('wb.wf.nodeDeleted'), 'ok');
}
function wfAddNode(tag) {
    if (WF.running) { return; }
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

/* ==================== Workflow: list / templates / history ==================== */
function renderFlowList() {
    var box = wbEl('wfFlowList');
    if (!box) { return; }
    var flows = WB.data.workflows || [];
    if (!flows.length) {
        box.innerHTML = '<div class="wf-list-item dim">' + wbEsc(t('wb.wf.noFlows')) + '</div>';
        return;
    }
    box.innerHTML = flows.map(function (wf) {
        return '<div class="wf-list-item" onclick="wfSelectFlow(\\'' + wf.id + '\\')" title="' + wbEsc(wf.name) + '">' +
            '<span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(wf.name) + '</span>' +
            '<span class="wf-item-rm" onclick="event.stopPropagation();wfDeleteFlow(\\'' + wf.id + '\\')">✕</span></div>';
    }).join('');
}
function wfCurrentWorkflowObj() {
    return {
        id: WF.currentId || wbId('wf'),
        name: (wbEl('wfName').value || 'workflow').trim() || 'workflow',
        nodes: WF.nodes, edges: WF.edges, updatedAt: Date.now()
    };
}
function wfSave() {
    if (!WF.nodes.length && !WF.edges.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    var obj = wfCurrentWorkflowObj();
    WF.currentId = obj.id;
    vscode.postMessage({ command: 'workflowSave', workflow: obj });
    wbToast(t('wb.wf.saved'), 'ok');
}
function wfSelectFlow(id) {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    var wf = (WB.data.workflows || []).find(function (w) { return w.id === id; });
    if (!wf) { return; }
    WF.currentId = wf.id;
    WF.nodes = JSON.parse(JSON.stringify(wf.nodes || []));
    WF.edges = JSON.parse(JSON.stringify(wf.edges || []));
    WF.states = {}; WF.selected = null;
    wbEl('wfName').value = wf.name;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
}
function wfDeleteFlow(id) {
    vscode.postMessage({ command: 'workflowDelete', id: id });
    if (WF.currentId === id) { WF.currentId = null; }
}
function wfNew() {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    WF.currentId = null;
    WF.nodes = []; WF.edges = []; WF.states = {}; WF.selected = null;
    wbEl('wfName').value = 'workflow-' + new Date().toISOString().slice(5, 16).replace(/[-:]/g, '');
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
}
function wfClear() {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    WF.nodes = []; WF.edges = []; WF.states = {}; WF.selected = null;
    wbEl('wfPropsForm').style.display = 'none';
    wbEl('wfPropsEmpty').style.display = '';
    wfDraw();
    wbToast(t('wb.wf.cleared'));
}
function renderTemplateList() {
    var box = wbEl('wfTemplateList');
    if (!box) { return; }
    var tpls = WB.data.templates || [];
    box.innerHTML = tpls.map(function (tpl) {
        var label = tpl.builtin ? t(tpl.name) : tpl.name;
        return '<div class="wf-list-item" onclick="wfLoadTemplate(\\'' + tpl.id + '\\')" title="' + wbEsc(label) + '">' +
            '<span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(label) + '</span>' +
            (tpl.builtin ? '' : '<span class="wf-item-rm" onclick="event.stopPropagation();wfDeleteTemplate(\\'' + tpl.id + '\\')">✕</span>') +
            '</div>';
    }).join('');
}
function wfCloneNodesEdges(tpl) {
    var idMap = {};
    var nodes = (tpl.nodes || []).map(function (n) {
        var nid = wbId('n');
        idMap[n.id] = nid;
        return Object.assign({}, n, { id: nid });
    });
    var edges = (tpl.edges || []).filter(function (e) { return idMap[e.from] && idMap[e.to]; })
        .map(function (e) { return { from: idMap[e.from], to: idMap[e.to], condition: e.condition }; });
    return { nodes: nodes, edges: edges };
}
function wfLoadTemplate(id) {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    var tpl = (WB.data.templates || []).find(function (x) { return x.id === id; });
    if (!tpl) { return; }
    var cloned = wfCloneNodesEdges(tpl);
    WF.currentId = null;
    WF.nodes = cloned.nodes;
    WF.edges = cloned.edges;
    WF.states = {}; WF.selected = null;
    var label = tpl.builtin ? t(tpl.name) : tpl.name;
    wbEl('wfName').value = label;
    switchTab('workflow');
    wfDraw();
    wbToast(t('wb.wf.templateLoaded'), 'ok');
}
function wfDeleteTemplate(id) {
    if (!window.confirm(t('wb.wf.deleteTemplateConfirm'))) { return; }
    vscode.postMessage({ command: 'templateDelete', id: id });
}
function wfSaveAsTemplate() {
    if (!WF.nodes.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    var name = window.prompt(t('wb.wf.templateName'), 'template');
    if (!name) { return; }
    vscode.postMessage({ command: 'templateSave', name: name, nodes: WF.nodes, edges: WF.edges });
}
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
        return '<div class="wf-list-item" onclick="wfShowHistory(' + i + ')" title="' + wbEsc(h.workflowName) + '">' +
            icon + ' <span style="overflow:hidden;text-overflow:ellipsis">' + wbEsc(h.workflowName) + ' · ' + (h.duration / 1000).toFixed(1) + 's · ' + time + '</span></div>';
    }).join('');
}
function wfSetCounters(failed, skipped) {
    if (failed !== undefined) { WF.counts.failed = failed; }
    if (skipped !== undefined) { WF.counts.skipped = skipped; }
    var f = wbEl('wfFailed'), s = wbEl('wfSkipped');
    if (f) { f.textContent = String(WF.counts.failed); }
    if (s) { s.textContent = String(WF.counts.skipped); }
}
function wfHistoryView(nodeId) {
    if (wfNodeById(nodeId)) { wfSelectNode(nodeId); } else { wbToast(t('wb.wf.historyDetail')); }
}
function wfShowHistory(idx) {
    var h = (WB.data.history || [])[idx];
    if (!h) { return; }
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
    var out = wbEl('wfOutput');
    out.innerHTML = '<div class="dim">' + wbEsc(t('wb.wf.historyDetail')) + '</div>';
}

/* ==================== Workflow: run / monitor ==================== */
function wfSetRunningUI(running) {
    WF.running = running;
    wbEl('wfCanvasWrap').classList.toggle('running-lock', running);
    wbEl('wfRunBtn').disabled = running;
    if (running) {
        var t0 = Date.now();
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
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    if (!WF.nodes.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    WF.batchNodeIds = [];
    wfPrepareRun();
    vscode.postMessage({
        command: 'workflowRun',
        workflow: wfCurrentWorkflowObj(),
        shell: wbEl('wfShell').value
    });
}
function wfPrepareRun() {
    WF.states = {};
    WF.logs = [];
    WF.logFilter = '';
    wfSetCounters(0, 0);
    wbEl('wfRunTbody').innerHTML = '';
    wbEl('wfOutput').innerHTML = '';
    wbEl('wfConfirmBar').style.display = 'none';
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
        var bIdx = WF.batchNodeIds.indexOf(ev.nodeId);
        if (bIdx >= 0) { batchUpdatePill(bIdx, ev.state, ev.dur); }
        wfDraw();
    } else if (ev.type === 'log') {
        WF.logs.push({ nodeId: ev.nodeId, level: ev.level, text: ev.text });
        if (!WF.logFilter || WF.logFilter === ev.nodeId) {
            wfAppendOutput(ev.level, ev.text);
        }
    } else if (ev.type === 'confirm') {
        wbEl('wfConfirmText').textContent = t('wb.wf.confirmAsk') + ': ' + ev.text;
        wbEl('wfConfirmBar').style.display = '';
    } else if (ev.type === 'done') {
        wbEl('wfConfirmBar').style.display = 'none';
        wfSetRunningUI(false);
        var key = ev.result === 'success' ? 'wb.wf.doneSuccess' : ev.result === 'stopped' ? 'wb.wf.doneStopped' : 'wb.wf.doneFailed';
        wbEl('wfState').textContent = ev.result === 'success' ? t('wb.wf.stSuccess') : ev.result === 'stopped' ? t('wb.wf.stStopped') : t('wb.wf.stFailed');
        wbEl('wfDur').textContent = (ev.duration / 1000).toFixed(1) + 's';
        wfAppendOutput(ev.result === 'success' ? 'ok' : 'err', t(key) + ' · ' + (ev.duration / 1000).toFixed(1) + 's');
        wbToast(t(key), ev.result === 'success' ? 'ok' : 'err');
        if (WB.batchRunning) { WB.batchRunning = false; wbEl('batchStatus').textContent = t(key); }
    }
}
function wfWriteLine(container, level, text, stamp) {
    if (!container) { return; }
    var d = document.createElement('div');
    d.className = level;
    d.textContent = (stamp === false ? '' : '[' + wbNow() + '] ') + text;
    container.appendChild(d);
    container.scrollTop = container.scrollHeight;
}
function wfAppendOutput(level, text, stamp) {
    var out = wbEl('wfOutput');
    wfWriteLine(out, level, text, stamp);
    if (out) { out.scrollTop = out.scrollHeight; }
    if (WB.batchRunning) {
        var bOut = wbEl('batchOutput');
        wfWriteLine(bOut, level, text, stamp);
        if (bOut) { bOut.scrollTop = bOut.scrollHeight; }
    }
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
function batchClearLog() {
    var out = wbEl('batchOutput');
    if (out) { out.innerHTML = ''; }
}

/* ==================== Batch ==================== */
WB.batchRunning = false;
function batchCurrent() { return (WB.data.batchGroups || [])[WB.batchIdx]; }
function renderBatchGroups() {
    var sel = wbEl('batchGroupSel');
    if (!sel) { return; }
    var groups = WB.data.batchGroups || [];
    if (WB.batchIdx >= groups.length) { WB.batchIdx = 0; }
    sel.innerHTML = groups.map(function (g, i) {
        var label = g.name.indexOf('wb.batch.') === 0 ? t(g.name) : g.name;
        return '<option value="' + i + '"' + (i === WB.batchIdx ? ' selected' : '') + '>' + wbEsc(label) + '</option>';
    }).join('');
    var cur = batchCurrent();
    wbEl('batchMode').value = cur ? cur.mode : 'serial';
    wbEl('batchGroupName').value = cur ? (cur.name.indexOf('wb.batch.') === 0 ? t(cur.name) : cur.name) : '';
    renderBatchList();
}
function renderBatchList() {
    var ul = wbEl('batchList');
    if (!ul) { return; }
    var g = batchCurrent();
    if (!g || !g.commands.length) {
        ul.innerHTML = '<li style="justify-content:center;color:var(--brand-text-muted)">' + wbEsc(t('wb.batch.empty')) + '</li>';
        return;
    }
    ul.innerHTML = g.commands.map(function (c, i) {
        return '<li draggable="true" data-bidx="' + i + '" ondragstart="batchDragStart(event,' + i + ')" ondragover="batchDragOver(event)" ondragleave="batchDragLeave(event)" ondrop="batchDrop(event,' + i + ')">' +
            '<span class="batch-handle">≡</span><span class="batch-idx">' + (i + 1) + '.</span>' +
            '<input class="batch-cmd-input" value="' + wbEsc(c) + '" onchange="batchEditCmd(' + i + ', this.value)">' +
            '<span class="batch-status" id="bstat-' + i + '">⏳</span>' +
            '<span class="batch-dur" id="bdur-' + i + '">--</span>' +
            '<span class="batch-rm" onclick="batchRemoveCmd(' + i + ')">✕</span></li>';
    }).join('');
}
function batchSave() { vscode.postMessage({ command: 'batchSave', groups: WB.data.batchGroups }); }
function batchSelectGroup() { WB.batchIdx = Number(wbEl('batchGroupSel').value); renderBatchGroups(); }
function batchModeChange() {
    var g = batchCurrent();
    if (g) { g.mode = wbEl('batchMode').value; batchSave(); }
}
function batchRenameGroup() {
    var g = batchCurrent();
    var name = (wbEl('batchGroupName').value || '').trim();
    if (!g || !name) { return; }
    g.name = name;
    batchSave();
    renderBatchGroups();
}
function batchAddGroup() {
    var name = window.prompt(t('wb.batch.namePh'), 'group');
    if (!name) { return; }
    WB.data.batchGroups.push({ id: wbId('batch'), name: name, mode: 'serial', commands: [] });
    WB.batchIdx = WB.data.batchGroups.length - 1;
    batchSave();
    renderBatchGroups();
}
function batchDeleteGroup() {
    if (WB.data.batchGroups.length <= 1) { wbToast(t('wb.batch.keepOne'), 'err'); return; }
    WB.data.batchGroups.splice(WB.batchIdx, 1);
    WB.batchIdx = 0;
    batchSave();
    renderBatchGroups();
}
function batchAddCmd() {
    var g = batchCurrent();
    if (!g) { return; }
    g.commands.push('echo hello');
    batchSave();
    renderBatchList();
}
function batchEditCmd(i, val) {
    var g = batchCurrent();
    if (g && g.commands[i] !== undefined) { g.commands[i] = val; batchSave(); }
}
function batchRemoveCmd(i) {
    var g = batchCurrent();
    if (g) { g.commands.splice(i, 1); batchSave(); renderBatchList(); }
}
var batchDragIdx = null;
function batchDragStart(e, i) { batchDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function batchDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function batchDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function batchDrop(e, i) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    var g = batchCurrent();
    if (!g || batchDragIdx === null || batchDragIdx === i) { return; }
    var item = g.commands.splice(batchDragIdx, 1)[0];
    g.commands.splice(i, 0, item);
    batchDragIdx = null;
    batchSave();
    renderBatchList();
}
function batchBuildWorkflow() {
    var g = batchCurrent();
    if (!g || !g.commands.length) { return null; }
    var nodes = [], edges = [], ids = [];
    if (g.mode === 'parallel') {
        var forkId = wbId('bn');
        var joinId = wbId('bn');
        nodes.push({ id: forkId, label: 'Fork', tag: 'fork', x: 40, y: 200, cmd: '', timeout: 300, failPolicy: 'stop' });
        g.commands.forEach(function (c, i) {
            var nid = wbId('bn');
            ids.push(nid);
            nodes.push({ id: nid, label: c.slice(0, 20) || ('cmd ' + (i + 1)), tag: 'cmd', x: 260, y: 40 + i * 90, cmd: c, timeout: 300, failPolicy: 'stop' });
            edges.push({ from: forkId, to: nid });
            edges.push({ from: nid, to: joinId });
        });
        nodes.push({ id: joinId, label: 'Join', tag: 'join', x: 560, y: 200, cmd: '', timeout: 300, failPolicy: 'stop' });
    } else {
        var prev = null;
        g.commands.forEach(function (c, i) {
            var nid = wbId('bn');
            ids.push(nid);
            nodes.push({ id: nid, label: c.slice(0, 20) || ('cmd ' + (i + 1)), tag: 'cmd', x: 40 + i * 150, y: 200, cmd: c, timeout: 300, failPolicy: 'stop' });
            if (prev) { edges.push({ from: prev, to: nid }); }
            prev = nid;
        });
    }
    return { workflow: { id: wbId('batchrun'), name: g.name, nodes: nodes, edges: edges, updatedAt: Date.now() }, ids: ids };
}
function batchRun() {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    var built = batchBuildWorkflow();
    if (!built) { wbToast(t('wb.batch.empty'), 'err'); return; }
    WF.batchNodeIds = built.ids;
    WB.batchRunning = true;
    wbEl('batchStatus').textContent = t('wb.wf.stRunning');
    batchResetPills();
    wfPrepareRun();
    batchClearLog();
    var g = batchCurrent();
    var gLabel = g ? (g.name.indexOf('wb.batch.') === 0 ? t(g.name) : g.name) : '';
    wfAppendOutput('hdr', '━━ ' + gLabel + ' · ' + (g && g.mode === 'parallel' ? t('wb.batch.parallel') : t('wb.batch.serial')) + ' · ' + wbEl('batchShell').value + ' ━━');
    vscode.postMessage({
        command: 'workflowRun',
        workflow: built.workflow,
        shell: wbEl('batchShell').value
    });
}
function batchResetPills() {
    var g = batchCurrent();
    if (!g) { return; }
    g.commands.forEach(function (_, i) {
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
    var built = batchBuildWorkflow();
    if (!built) { wbToast(t('wb.batch.empty'), 'err'); return; }
    WF.currentId = null;
    WF.nodes = built.workflow.nodes;
    WF.edges = built.workflow.edges;
    WF.states = {}; WF.selected = null;
    wbEl('wfName').value = built.workflow.name;
    switchTab('workflow');
    wfDraw();
    wbToast(t('wb.batch.flowGenerated'), 'ok');
}

/* ==================== Quick Launcher ==================== */
var launcherSel = 0, launcherItems = [];
function wfLauncherRun(id) {
    if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
    wfSelectFlow(id);
    switchTab('workflow');
    wfRun();
}
function launcherBuild() {
    var items = [];
    if (WF.running) {
        items.push({
            icon: wbIcon('stop'), label: t('wb.launcher.stopFlow'), kind: t('wb.launcher.kindFlow'),
            run: function () { switchTab('workflow'); wfStop(); }
        });
    }
    (WB.data.workflows || []).forEach(function (wf) {
        items.push({
            icon: wbIcon('play'), label: wf.name, kind: t('wb.launcher.kindFlow'),
            run: function () { wfLauncherRun(wf.id); }
        });
        items.push({
            icon: wbIcon('folder'), label: wf.name, kind: t('wb.launcher.kindFlow'),
            run: function () { wfSelectFlow(wf.id); switchTab('workflow'); }
        });
    });
    (WB.data.templates || []).forEach(function (tpl) {
        items.push({
            icon: wbIcon('template'), label: tpl.builtin ? t(tpl.name) : tpl.name, kind: t('wb.launcher.kindTemplate'),
            run: function () { wfLoadTemplate(tpl.id); }
        });
    });
    (WB.data.batchGroups || []).forEach(function (g, i) {
        var label = g.name.indexOf('wb.batch.') === 0 ? t(g.name) : g.name;
        items.push({
            icon: wbIcon('bolt'), label: label, kind: t('wb.launcher.kindBatch'),
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
    renderPalette();
    wfInitCanvasEvents();
    wbEl('wfHint').textContent = t('wb.wf.hint');
    renderChecklist();
    renderBatchGroups();
});
`;
