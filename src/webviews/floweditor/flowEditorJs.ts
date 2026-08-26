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
    drag: null, counts: { failed: 0, skipped: 0 }
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
    else if (m.command === 'workflowRunStarted') { wfOnRunStarted(m.workflow); }
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

/* ==================== 侧边栏动作分发 ==================== */
function wfApplyAction(action) {
    if (!action || !action.type) { return; }
    if (action.type === 'new') { wfNew(); }
    else if (action.type === 'openFlow') { wfSelectFlow(action.id); }
    else if (action.type === 'loadTemplate') { wfLoadTemplate(action.id); }
    else if (action.type === 'runFlow') {
        if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
        wfSelectFlow(action.id);
        wfRun();
    }
    else if (action.type === 'batchToFlow') {
        if (WF.running) { wbToast(t('wb.wf.runningLock'), 'err'); return; }
        WF.currentId = null;
        WF.nodes = action.nodes || [];
        WF.edges = action.edges || [];
        WF.states = {}; WF.selected = null;
        wbEl('wfName').value = action.name || 'batch';
        wfDraw();
        wbToast(t('wb.batch.flowGenerated'), 'ok');
    }
    else if (action.type === 'showHistory') { wfShowHistory(action.idx); }
    else if (action.type === 'saveAsTemplate') { wfSaveAsTemplate(); }
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

/* ==================== 工作流存取 ==================== */
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
    wfDraw();
    wbToast(t('wb.wf.templateLoaded'), 'ok');
}
function wfSaveAsTemplate() {
    if (!WF.nodes.length) { wbToast(t('wb.wf.emptyCanvas'), 'err'); return; }
    var name = window.prompt(t('wb.wf.templateName'), 'template');
    if (!name) { return; }
    vscode.postMessage({ command: 'templateSave', name: name, nodes: WF.nodes, edges: WF.edges });
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
    wfPrepareRun();
    vscode.postMessage({
        command: 'workflowRun',
        workflow: wfCurrentWorkflowObj(),
        shell: wbEl('wfShell').value
    });
}
/* 侧边栏（Batch 等）发起的运行：载入工作流并初始化监控 */
function wfOnRunStarted(workflow) {
    if (!workflow || !Array.isArray(workflow.nodes)) { return; }
    WF.currentId = null;
    WF.nodes = workflow.nodes;
    WF.edges = workflow.edges || [];
    WF.selected = null;
    wbEl('wfName').value = workflow.name || 'workflow';
    wfPrepareRun();
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
