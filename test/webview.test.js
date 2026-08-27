'use strict';
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, testAsync, summary } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

console.log('webview + host integration');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-web-'));
setWorkspace(dir);

const { MainViewProvider } = require('../out/views/MainViewProvider');
const { translations } = require('../out/utils/i18n');
const { FLOW_EDITOR_BODY } = require('../out/webviews/floweditor/flowEditorHtml');
const { FLOW_EDITOR_JS } = require('../out/webviews/floweditor/flowEditorJs');
const { Uri } = require('vscode');

const provider = new MainViewProvider(Uri.file(dir));
const css = provider.getCss();
const html = provider.getHtmlBody();
const js = provider.getJavaScript();
// Flow 编辑器（主编辑区 WebviewPanel）：画布/属性/执行监控
const flowHtml = FLOW_EDITOR_BODY;
const flowJs = FLOW_EDITOR_JS;
// 宿主源码缓存（源码级断言用）
const mvpSrcCache = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'MainViewProvider.ts'), 'utf8');

// ---------- webview JS syntax ----------
test('webview JavaScript parses without syntax errors', () => {
    new vm.Script(js, { filename: 'webview.js' });
});

test('flow editor panel JavaScript parses without syntax errors', () => {
    new vm.Script(flowJs, { filename: 'flowEditor.js' });
});

// ---------- unified tree CSS ----------
test('CSS: unified tree styles exist for both tabs', () => {
    for (const sel of [
        '.tree-category', '.category-row', '.cat-arrow', '.cat-icon', '.cat-name', '.cat-count',
        '.tree-children', '.tree-row-draggable', '.tree-row-draggable.dragging',
        '.tree-row-draggable.drop-before', '.tree-row-draggable.drop-after',
        '.tree-row-draggable.drop-inside', '.drag-over-root',
        '.cmd-action-btn svg', '.cmd-action-btn.add', '.cmd-action-btn.add-sub',
        '.editor-title-bar', '.editor-error', '.btn-danger'
    ]) {
        assert.ok(css.includes(sel), 'missing CSS selector: ' + sel);
    }
});

test('CSS: hierarchy guide line + horizontal action row', () => {
    const childrenBlock = css.split('.tree-children').slice(1).join('');
    assert.ok(childrenBlock.includes('border-left'), 'tree-children should draw indent guide line');
    assert.ok(/\.category-row\s*\{[^}]*display:\s*flex/s.test(css), 'category-row is a flex row');
    assert.ok(/\.category-row\s*\{[^}]*flex-wrap:\s*nowrap/s.test(css) || !/\.category-row\s*\{[^}]*flex-wrap:\s*wrap/s.test(css), 'category-row does not wrap');
    assert.ok(/\.cmd-action-btn\s*\{[^}]*display:\s*(inline-)?flex/s.test(css), 'action buttons are flex items, staying on one line');
    assert.ok(/\.category-row\s+\.actions/.test(css), 'category-row .actions rule exists');
    const actionsBlock = css.split('.category-row .actions').slice(1)[0] || '';
    assert.ok(/display:\s*flex/.test(actionsBlock.split('}')[0]), 'category-row .actions is horizontal flex (buttons never stack vertically)');
});

test('JS: folder row only expands/collapses; rename is via pencil button', () => {
    assert.ok(js.includes('row.onclick = function() { toggleCategory(tabId, node.id); };'), 'whole category row toggles');
    assert.ok(!js.includes("name.onclick = function() { showCategoryEditor"), 'category name click no longer opens editor');
});

test('JS: pyt category editor hides Run button, command editor shows it', () => {
    assert.ok(html.includes('id="pythonTxtCmdRunBtn"'), 'Run button has an id');
    const catFn = js.split('function showCategoryEditor').slice(1)[0].split('function hideEditor')[0];
    assert.ok(catFn.includes("els.RunBtn.style.display = 'none'"), 'category mode hides Run');
    const cmdFn = js.split('function showCommandEditor').slice(1)[0].split('function showCategoryEditor')[0];
    assert.ok(cmdFn.includes("els.RunBtn.style.display = ''"), 'command mode restores Run');
});

// ---------- HTML structure ----------
test('HTML: cmd tab has category + command buttons and editor', () => {
    assert.ok(html.includes("showCategoryEditor('cmd', null, null)"), 'cmd + Category button');
    assert.ok(html.includes("showCommandEditor('cmd', null, null)"), 'cmd + Add button');
    assert.ok(html.includes('id="commandList"'), 'commandList container');
    assert.ok(html.includes('id="commandEditor"'), 'command editor');
    assert.ok(html.includes("saveEditor('cmd')"), 'cmd save wired to unified editor');
    assert.ok(html.includes('id="commandEditorError"'), 'cmd editor error slot');
});

test('HTML: pyt tab has category + command buttons and unified editor', () => {
    assert.ok(html.includes("showCategoryEditor('pyt', null, null)"), 'pyt + Category button');
    assert.ok(html.includes("showCommandEditor('pyt', null, null)"), 'pyt + Add button');
    assert.ok(html.includes('id="pythonTxtCmdList"'), 'pythonTxtCmdList container');
    assert.ok(html.includes('id="pythonTxtCmdEditor"'), 'pyt editor');
    assert.ok(html.includes("saveEditor('pyt')"), 'pyt save wired to unified editor');
    assert.ok(html.includes('runPythonTxtCmdFromEditor()'), 'pyt editor keeps Run button');
    assert.ok(html.includes('id="pythonTxtCmdContentGroup"'), 'pyt editor content group');
});

test('HTML: shortcut tab has shell selector, buttons, editor and list, but no project list', () => {
    assert.ok(html.includes('id="tab-shortcut"'), 'shortcut panel');
    assert.ok(html.includes("switchTab('shortcut')"), 'shortcut tab button');
    assert.ok(html.includes('id="shortcutShellSelector"'), 'shortcut shell selector');
    assert.ok(html.includes("showCategoryEditor('shortcut', null, null)"), 'shortcut + Category button');
    assert.ok(html.includes("showCommandEditor('shortcut', null, null)"), 'shortcut + Add button');
    assert.ok(html.includes('id="shortcutCommandList"'), 'shortcutCommandList container');
    assert.ok(html.includes('id="shortcutCmdEditor"'), 'shortcut editor');
    assert.ok(html.includes("saveEditor('shortcut')"), 'shortcut save wired to unified editor');
    assert.ok(html.includes('runShortcutCmdFromEditor()'), 'shortcut editor Run button');
    const panel = html.split('id="tab-shortcut"')[1].split('id="tab-settings"')[0];
    assert.ok(!panel.includes('project-list-container'), 'shortcut tab has no project list');
});

test('HTML: delete-category confirmation modal exists', () => {
    assert.ok(html.includes('id="deleteCategoryModal"'), 'deleteCategoryModal');
    assert.ok(html.includes('confirmDeleteCategory()'), 'confirm handler');
    assert.ok(html.includes('closeDeleteCategoryModal()'), 'close handler');
});

// ---------- workbench tabs (checklist / workflow / batch) ----------
test('HTML: workbench tab buttons + panels + launcher overlay', () => {
    for (const id of ['tabBtn-checklist', 'tabBtn-workflow', 'tabBtn-batch',
        'tab-checklist', 'tab-workflow', 'tab-batch', 'launcherMask', 'launcherInput']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing element: ' + id);
    }
});

test('HTML: checklist panel (input/priority/progress)', () => {
    for (const id of ['clInput', 'clPrio', 'clList', 'clProgText', 'clProgBar']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing checklist element: ' + id);
    }
    assert.ok(html.includes('wbAddTask()'), 'add handler');
    assert.ok(html.includes('wbClearDone()'), 'clear-done handler');
});

test('HTML: workflow canvas, props, monitor with failed/skipped summary', () => {
    // 侧边栏 Flow Tab：列表 + 打开主编辑区入口（模板已并入 Workflows 列表）
    for (const id of ['wfFlowList', 'wfHistoryList']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing workflow list element: ' + id);
    }
    assert.ok(!html.includes('id="wfTemplateList"'), 'templates merged into workflows list');
    assert.ok(html.includes('id="wbConfirmModal"'), 'confirm modal for deletions');
    assert.ok(html.includes('wfOpenEditor()'), 'open flow editor button');
    // 主编辑区 Flow Editor 面板：画布 / 属性 / 执行监控
    for (const id of ['wfSvg', 'wfPalette',
        'wfName', 'wfShell', 'wfPropsForm', 'wfPName', 'wfPCmd', 'wfPNotifyType', 'wfPTimeout', 'wfPFail',
        'wfPHttpMethod', 'wfPHttpHeaders', 'wfPHttpBody',
        'wfRunTbody', 'wfOutput', 'wfLogFilter', 'wfState', 'wfDur', 'wfFailed', 'wfSkipped']) {
        assert.ok(flowHtml.includes('id="' + id + '"'), 'missing workflow element: ' + id);
    }
    assert.ok(!html.includes('id="wfEnv"'), 'dev/test/prod dropdown removed from flow tab');
    assert.ok(!html.includes('id="batchEnv"'), 'env dropdown removed from batch panel');
    assert.ok(flowHtml.includes('onclick="wfRun()"'), 'run button');
    assert.ok(flowHtml.includes('onclick="wfStop()"'), 'stop button');
    assert.ok(flowHtml.includes("wfEditProp('notifyType',this.value)"), 'notify type selector wired');
    assert.ok(flowHtml.includes('wb.wf.notifyTypeHttp'), 'http notify option i18n key');
    assert.ok(flowHtml.includes("wfEditProp('httpMethod',this.value)") && flowHtml.includes("wfEditProp('httpHeaders',this.value)") && flowHtml.includes("wfEditProp('httpBody',this.value)"), 'full http request params wired');
    assert.ok(flowHtml.includes('value="POST"') && flowHtml.includes('value="DELETE"'), 'http method choices');
    assert.ok(!/class="wf-btn[^"]*"[^>]*>[▶⏹🔗💾🗑]/.test(flowHtml), 'flow toolbar uses SVG icons, not emoji');
});

test('JS: notify node property label switches by notifyType', () => {
    assert.ok(flowJs.includes('wfCmdLabelKey'), 'label key helper exists');
    assert.ok(flowJs.includes("wbEl('wfPNotifyType').value = n.notifyType || 'text'"), 'selector synced on select');
    assert.ok(flowJs.includes("notifyType: tag === 'notify' ? 'text' : undefined"), 'new notify nodes default to text');
});

test('HTML+JS: ref node (reference saved commands from other tabs)', () => {
    for (const id of ['wfPRefTabLabel', 'wfPRefTab', 'wfPRefCmdLabel', 'wfPRefCmd']) {
        assert.ok(flowHtml.includes('id="' + id + '"'), 'missing ref property element: ' + id);
    }
    assert.ok(flowHtml.includes('wfRefTabChange(this.value)'), 'tab selector wired');
    assert.ok(flowHtml.includes("wfEditProp('refCommandId',this.value)"), 'command selector wired');
    assert.ok(flowJs.includes("['start', 'cmd', 'condition', 'fork', 'join', 'confirm', 'notify', 'ref']"), 'palette includes ref');
    assert.ok(flowJs.includes('ref: '), 'tag color defined');
    assert.ok(flowJs.includes("refTab: tag === 'ref' ? 'cmd' : undefined"), 'new ref node defaults');
    assert.ok(flowJs.includes('function wfRefCommands'), 'command flattener with category paths');
    assert.ok(flowJs.includes('shortcutCommandTree'), 'reads shortcut tree');
    assert.ok(flowJs.includes('pythonTxtCommandTree'), 'reads pyt tree');
    assert.ok(flowJs.includes('customCommandTree'), 'reads cmd tree');
    assert.ok(translations.en['wb.node.ref'] && translations.zh['wb.node.ref'], 'node label i18n');
    assert.ok(translations.en['wb.wf.refTab'] && translations.zh['wb.wf.refCmd'], 'property i18n');
});

test('HTML+JS: ref node supports git tab operations', () => {
    assert.ok(flowHtml.includes('value="git"'), 'source tab selector offers git');
    assert.ok(flowJs.includes('WF_GIT_OPS'), 'fixed git operation list in webview');
    for (const op of ['pull', 'commit', 'push', 'fetch', 'switch-branch', 'create-branch']) {
        assert.ok(flowJs.includes("'" + op + "'"), 'git op listed: ' + op);
        assert.ok(translations.en['wb.wf.gitOp.' + op] && translations.zh['wb.wf.gitOp.' + op], 'git op i18n: ' + op);
    }
    assert.ok(flowJs.includes("if (tab === 'git')"), 'wfRefCommands returns git ops');
    assert.ok(translations.en['wb.wf.refParam'] && translations.zh['wb.wf.refParam'], 'parameter field i18n');
    assert.ok(flowJs.includes('function wfSyncCmdField'), 'cmd field doubles as git ref parameter');
});

test('HTML+JS: start node (scheduled start) and confirm node (manual approval)', () => {
    assert.ok(flowJs.includes("['start', 'cmd', 'condition', 'fork', 'join', 'confirm', 'notify', 'ref']"), 'palette includes start & confirm');
    for (const id of ['wfPSchedModeLabel', 'wfPSchedMode', 'wfPSchedValueLabel', 'wfPSchedValue']) {
        assert.ok(flowHtml.includes('id="' + id + '"'), 'missing schedule element: ' + id);
    }
    assert.ok(flowHtml.includes('value="countdown"') && flowHtml.includes('value="clock"') && flowHtml.includes('value="none"'), 'schedule modes offered');
    assert.ok(flowHtml.includes('id="wfNodeActions"') && flowHtml.includes('id="wfNodeActionsText"'), 'node actions bar above node');
    assert.ok(flowHtml.includes('onclick="wfConfirm(true)"') && flowHtml.includes('onclick="wfConfirm(false)"'), 'approve/cancel buttons');
    assert.ok(flowJs.includes("command: 'workflowConfirm'"), 'confirm answer sent to host');
    assert.ok(flowJs.includes("ev.type === 'confirm'"), 'webview handles confirm event');
    assert.ok(flowJs.includes("scheduleMode: tag === 'start' ? 'none' : undefined"), 'start node defaults');
    assert.ok(flowJs.includes('function wfStartDesc'), 'schedule shown on canvas node');
    assert.ok(flowJs.includes('function wfSchedModeChange'), 'value input adapts to mode');
    for (const k of ['wb.node.start', 'wb.node.confirm', 'wb.wf.schedMode', 'wb.wf.schedCountdown', 'wb.wf.schedClock', 'wb.wf.confirmApprove', 'wb.wf.confirmCancel']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
});

test('HTML: batch panel has own shell selector and live log area', () => {
    for (const id of ['batchGroupSel', 'batchMode', 'batchShell', 'batchList', 'batchStatus', 'batchOutput']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing batch element: ' + id);
    }
    assert.ok(html.includes('onclick="batchRun()"'), 'batch run');
    assert.ok(html.includes('onclick="batchToFlow()"'), 'batch to flowchart');
    assert.ok(html.includes('onclick="batchClearLog()"'), 'batch log clear');
});

test('JS: workbench behaviors wired (run/stop, template delete confirm, launcher run, counters)', () => {
    // 侧边栏：列表/批量/启动器
    for (const sym of ['wbAddTask', 'wbToggleTask', 'wfStop', 'wfRelay', 'wfOpenEditor',
        'wfLauncherRun', 'launcherOpen', 'launcherKey', 'applyHiddenTabs', 'wbToggleTab',
        'batchRun', 'batchToFlow', 'batchAppendOutput', 'batchClearLog']) {
        assert.ok(js.includes(sym), 'missing workbench JS symbol: ' + sym);
    }
    // 主编辑区 Flow Editor 面板：画布/属性/监控
    for (const sym of ['wfRun', 'wfSave', 'wfDraw', 'wfWouldCycle', 'wfSetCounters',
        'wfHistoryView', 'wfAppendOutput', 'wfApplyAction', 'wfOnRunStarted']) {
        assert.ok(flowJs.includes(sym), 'missing flow editor JS symbol: ' + sym);
    }
    assert.ok(js.includes("wbConfirm(t('wb.wf.deleteTemplateConfirm')"), 'template delete requires confirmation modal');
    assert.ok(translations.en['wb.wf.deleteTemplateConfirm'] && translations.zh['wb.wf.deleteTemplateConfirm'], 'delete-confirm i18n in both languages');
    assert.ok(!js.includes('wfEnv') && !js.includes('batchEnv') && !js.includes('prodConfirm'), 'dev/test/prod dropdowns fully removed');
    assert.ok(flowJs.includes('wfFailed') && flowJs.includes('wfSkipped'), 'monitor counters updated');
    assert.ok(js.includes("command: 'workflowRun'") && js.includes("command: 'workflowStop'"), 'run/stop messages');
    assert.ok(!/command: 'workflowRun'[\s\S]{0,160}\benv:/.test(js), 'run message no longer carries env');
    assert.ok(js.includes("command: 'checklistSave'") && js.includes("command: 'workbenchTabsSave'"), 'persistence messages');
    assert.ok(js.includes("command: 'flowEditorAction'"), 'sidebar relays actions to flow editor panel');
    assert.ok(js.includes('wbNow()'), 'log lines carry timestamps');
    assert.ok(/WB\.batchRunning[\s\S]{0,200}batchAppendOutput/.test(js), 'batch run mirrors logs into batch tab');
});

test('JS: log export button + template in-place editing + node actions bar', () => {
    // 监控日志导出：按钮 + webview 收集日志发 exportLog，宿主打开新编辑器并全选
    assert.ok(flowHtml.includes('onclick="wfExportLog()"'), 'export log button in output bar');
    assert.ok(flowJs.includes('function wfExportLog'), 'export log implementation');
    assert.ok(flowJs.includes("command: 'exportLog'"), 'export log message to host');
    const mvpSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'MainViewProvider.ts'), 'utf8');
    assert.ok(mvpSrc.includes('case \'exportLog\'') && mvpSrc.includes('handleExportLog'), 'host handles exportLog');
    assert.ok(mvpSrc.includes('openTextDocument'), 'host opens new text document for exported log');
    for (const k of ['wb.wf.exportLog', 'wb.wf.noLogs']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
    // 模板原地编辑：点击模板保留 templateId，保存时按 id 更新模板
    assert.ok(flowJs.includes('WF.templateId = tpl.id'), 'loading template tracks templateId');
    assert.ok(flowJs.includes("command: 'templateSave', id: WF.templateId"), 'save routes to template update');
    assert.ok(flowJs.includes('templateId: WF.templateId'), 'edit snapshot keeps templateId');
    // 节点上方操作条：确认/续跑按钮动态定位
    for (const sym of ['wfShowNodeActions', 'wfHideNodeActions', 'wfPositionNodeActions', 'wfShowFailedActions']) {
        assert.ok(flowJs.includes(sym), 'missing node actions symbol: ' + sym);
    }
    assert.ok(flowJs.includes("wfShowNodeActions(ev.nodeId, 'confirm')"), 'confirm event shows node actions');
});

test('JS+host: failed-paused keeps actions bar, allows editing failed node cmd before resume', () => {
    // 面板：失败暂停时可修改未成功节点命令；Resume 携带修改后的节点数据
    assert.ok(flowJs.includes("WF.runPhase === 'failed-paused' ? t('wb.wf.failedPausedHint')"), 'hint explains edit-then-resume');
    assert.ok(flowJs.includes("WF.states[n.id] === 'success') { wbToast(t('wb.wf.cannotEditDoneNode'"), 'succeeded nodes stay read-only');
    assert.ok(flowJs.includes("command: 'workflowResume', runId: WF.runId, nodes: WF.nodes"), 'resume carries runId and edited nodes');
    assert.ok(flowJs.includes("WF.actionsNode) { wfPositionNodeActions(WF.actionsNode.id); }"), 'actions bar repositioned after redraw');
    // 宿主：Resume 用面板回传的节点更新快照；工作流 Fork 并行不受批量 Concurrency 限制
    assert.ok(mvpSrcCache.includes('handleWorkflowResume(message') && mvpSrcCache.includes('message.nodes.find'), 'host resume patches workflow nodes');
    assert.ok(mvpSrcCache.includes('maxParallel: 32'), 'workflow fork parallelism not capped by batch concurrency');
    for (const k of ['wb.wf.failedPausedHint', 'wb.wf.cannotEditDoneNode']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
});

test('JS+host: confirm node pause button, reopen restores actions; export log right-aligned', () => {
    // 人工确认操作条含暂停按钮：暂停仅隐藏操作条，流程留在 RUNNING 列表
    assert.ok(flowHtml.includes('id="wfPauseBtn"') && flowHtml.includes('wfPause()'), 'pause button in node actions bar');
    assert.ok(flowJs.includes('function wfPause') && flowJs.includes("t('wb.wf.pausedHint')"), 'pause hides bar with hint toast');
    // 重开运行详情恢复确认操作条（两条路径：已在监控 / 全新载入）
    assert.ok(flowJs.includes('function wfShowConfirmActions') && flowJs.includes('run.pendingConfirm'), 'reopen restores confirm actions from pendingConfirm');
    // 宿主记录/清除 pendingConfirm 并随详情下发
    assert.ok(mvpSrcCache.includes('inst.pendingConfirm = { nodeId: event.nodeId'), 'host records pending confirm');
    assert.ok(mvpSrcCache.includes('this._activeRun.pendingConfirm = null'), 'host clears pending confirm on respond');
    assert.ok(mvpSrcCache.includes('pendingConfirm: inst.pendingConfirm || null'), 'run detail carries pendingConfirm');
    // Export 右对齐并与 Clear 相邻：Export 带 margin-left:auto，Clear 不再带
    const expIdx = flowHtml.indexOf('onclick="wfExportLog()"');
    const clrIdx = flowHtml.indexOf('onclick="wfClearOutput()"');
    assert.ok(expIdx >= 0 && clrIdx > expIdx, 'export before clear in DOM');
    assert.ok(flowHtml.slice(expIdx - 120, expIdx).includes('margin-left:auto'), 'export right-aligned');
    assert.ok(!flowHtml.slice(clrIdx - 120, clrIdx).includes('margin-left:auto'), 'clear follows export without auto margin');
    for (const k of ['wb.wf.pause', 'wb.wf.pausedHint']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
});

test('HTML+JS: running group, history delete/clear-all, run detail readonly mode', () => {
    // 侧边栏：正在运行分组 + 历史 Clear All / 单项删除 / 双击查看
    assert.ok(html.includes('id="wfRunningList"'), 'running group list element');
    assert.ok(html.includes('data-i18n="wb.wf.running"'), 'running group title');
    assert.ok(html.includes('wfClearHistory()'), 'history clear-all button');
    for (const id of ['wfBackBtn', 'wfModeBadge', 'wfStopBtn', 'wfResumeBtn', 'wfCancelBtn', 'wfDelBtn']) {
        assert.ok(flowHtml.includes('id="' + id + '"'), 'missing flow editor element: ' + id);
    }
    assert.ok(flowHtml.includes('wfResume()') && flowHtml.includes('wfCancelRun()') && flowHtml.includes('wfBackToEdit()'), 'resume/cancel/back handlers wired');
    // 侧边栏 JS：运行状态渲染 + 历史删除/清空
    for (const sym of ['renderRunningList', 'wfOpenRun', 'wfDeleteHistory', 'wfClearHistory']) {
        assert.ok(js.includes(sym), 'missing sidebar JS symbol: ' + sym);
    }
    assert.ok(js.includes("m.command === 'runState'") && js.includes('renderRunningList()'), 'sidebar renders run state pushes');
    assert.ok(js.includes("command: 'historyDelete'") && js.includes("command: 'historyClearAll'"), 'history persistence messages');
    assert.ok(js.includes('ondblclick="wfShowHistory('), 'history entries open detail on double click');
    // 面板 JS：三模式管理 + 运行详情 + 只读
    for (const sym of ['wfSyncModeUI', 'wfSnapshotEdit', 'wfRestoreEdit', 'wfShowRunDetail', 'wfOnRunPhase', 'wfResume', 'wfCancelRun', 'wfSetPropsDisabled']) {
        assert.ok(flowJs.includes(sym), 'missing flow editor mode symbol: ' + sym);
    }
    assert.ok(flowJs.includes("command: 'workflowResume'") && flowJs.includes("command: 'workflowCancel'"), 'resume/cancel messages to host');
    assert.ok(flowJs.includes("action.type === 'openRun'"), 'openRun action handled');
    assert.ok(flowJs.includes("WF.mode = 'history'") && flowJs.includes("WF.mode = 'run'"), 'panel mode switching');
    // 宿主侧：运行实例跟踪（源码检查）
    const mvp = mvpSrcCache;
    for (const sym of ['_activeRun', 'handleWorkflowResume', 'handleWorkflowCancel', 'buildRunDetail', 'postRunState', 'failed-paused', 'deleteHistory', 'clearHistory']) {
        assert.ok(mvp.includes(sym), 'MainViewProvider missing: ' + sym);
    }
    assert.ok(mvp.includes("case 'historyDelete':") && mvp.includes("case 'historyClearAll':"), 'host routes history messages');
    // i18n 双语
    for (const k of ['wb.wf.running', 'wb.wf.noRunning', 'wb.wf.failedPaused', 'wb.wf.runMode', 'wb.wf.viewMode', 'wb.wf.resume', 'wb.wf.cancelRun', 'wb.wf.backToEdit', 'wb.wf.clearHistory', 'wb.wf.deleteHistoryConfirm', 'wb.wf.clearHistoryConfirm', 'wb.wf.readonlyLock']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
});

test('JS: switching flows during a run releases local lock but keeps background run (bgRunning)', () => {
    // 新增 wfLeaveRunView：释放本面板监控锁，宿主侧运行不受影响
    assert.ok(flowJs.includes('function wfLeaveRunView'), 'wfLeaveRunView helper exists');
    assert.ok(flowJs.includes('bgRunning: false'), 'WF.bgRunning state declared');
    // 切换 Flow/模板/新建 不再被 WF.running 阻断，而是调用 wfLeaveRunView 释放
    for (const fn of ['wfSelectFlow', 'wfLoadTemplate', 'wfNew', 'wfShowHistory', 'wfBackToEdit']) {
        const body = flowJs.split('function ' + fn + '(').slice(1)[0].split('function ')[0];
        assert.ok(!/if \(WF\.running\)[\s\S]{0,80}runningLock[\s\S]{0,40}return;/.test(body), fn + ' no longer blocks on WF.running');
        assert.ok(body.indexOf('wfLeaveRunView') >= 0, fn + ' calls wfLeaveRunView to release run view');
    }
    // wfRun 改为检查 bgRunning（阻止并发运行），而非 WF.running（本面板监控）
    const runBody = flowJs.split('function wfRun(').slice(1)[0].split('function wfOnRunStarted')[0];
    assert.ok(runBody.includes('if (WF.bgRunning)'), 'wfRun blocks concurrent runs via bgRunning');
    assert.ok(runBody.includes('WF.bgRunning = true'), 'wfRun marks bgRunning on start');
    // wfOnRunPhase 始终跟踪 bgRunning（即使已切到其他 Flow 编辑），UI 更新仅在 run 模式
    const phaseBody = flowJs.split('function wfOnRunPhase(').slice(1)[0].split('function wfResume')[0];
    assert.ok(phaseBody.includes("if (engineBusy !== undefined) { WF.bgRunning = !!engineBusy; }"), 'bgRunning tracks engineBusy (engine occupancy, not run phase)');
    assert.ok(phaseBody.includes("if (runId && WF.runId && runId !== WF.runId) { return; }"), 'phase updates filtered by runId');
    assert.ok(phaseBody.indexOf("if (WF.mode !== 'run') { return; }") >= 0, 'phase UI updates guarded to run mode');
    // wfOnEvent 切走后忽略后台事件，避免污染当前编辑画布；多运行并存时按 runId 过滤
    const evBody = flowJs.split('function wfOnEvent(').slice(1)[0].split('function wfStop')[0];
    assert.ok(evBody.indexOf("if (WF.mode !== 'run') { return; }") >= 0, 'wfOnEvent ignores events when not in run mode');
    assert.ok(evBody.indexOf('ev.runId && WF.runId && ev.runId !== WF.runId') >= 0, 'wfOnEvent filters events by runId');
    // 侧边栏 RUNNING 分组渲染多个运行实例（活动 + 失败暂停），点击按 runId 打开详情
    assert.ok(js.includes("m.command === 'runState') { WB.run = m.runs || []; renderRunningList(); }"), 'sidebar runState consumes runs array');
    assert.ok(js.includes('function wfOpenRun(runId) { wfRelay({ type: \'openRun\', runId: runId }); }'), 'openRun relays runId');
    // 面板重载后从 flowEditorInit.runPhase 恢复 bgRunning（仅 running 占用引擎）
    assert.ok(flowJs.includes("m.runPhase || ''"), 'flowEditorInit carries runPhase');
    assert.ok(flowJs.includes("WF.bgRunning = (ph === 'running')"), 'init restores bgRunning only for running');
    // i18n：后台运行提示 + runningLock 文案已更新（不再说"编辑已锁定"）
    for (const k of ['wb.wf.runBackground', 'wb.wf.runningLock']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
    assert.ok(!translations.en['wb.wf.runningLock'].includes('editing is locked'), 'runningLock message updated: editing no longer locked');
    assert.ok(!translations.zh['wb.wf.runningLock'].includes('编辑已锁定'), 'runningLock 文案已更新：不再锁定编辑');
    // 宿主：新运行时旧 failed-paused 实例保留在暂停列表（不归档、可续跑/取消），仅完成/取消才进历史
    assert.ok(mvpSrcCache.includes('private _pausedRuns: ActiveRun[] = [];'), 'paused runs list declared');
    assert.ok(mvpSrcCache.includes('this._pausedRuns.unshift(prev);'), 'old failed-paused instance kept in paused runs on new run');
    assert.ok(mvpSrcCache.includes('runPhase: this._activeRun ? this._activeRun.phase : \'\''), 'flowEditor init carries active run phase');
});

test('JS: flow tab icons are unified SVGs, no emoji in toolbar/history/launcher', () => {
    assert.ok(js.includes('WB_ICON_PATHS') && js.includes('function wbIcon'), 'shared SVG icon set');
    assert.ok(js.includes('function wfHistIcon'), 'history entries use SVG status icons');
    for (const emoji of ['✅', '⏹', '❌', '📂', '📦', '⚡', '⌨']) {
        assert.ok(js.indexOf(emoji) < 0, 'emoji removed from workbench JS: ' + emoji);
    }
    assert.ok(!/[▶⏹🔗💾🗑📊📜📋]/.test(html.split('id="tab-workflow"')[1].split('id="tab-batch"')[0]), 'flow tab HTML free of emoji buttons');
});

test('HTML: Set tab exposes "Tabs Visible" toggles for all tabs', () => {
    for (const id of ['wbTabToggle-git', 'wbTabToggle-custom', 'wbTabToggle-shortcut', 'wbTabToggle-txtcmd',
        'wbTabToggle-checklist', 'wbTabToggle-workflow', 'wbTabToggle-batch']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing toggle: ' + id);
    }
    assert.ok(html.includes('data-i18n="settings.tabsVisible"'), 'section renamed to Tabs Visible');
    assert.ok(!html.includes('settings.workbenchTabs'), 'old key removed');
    for (const id of ['tabBtn-git', 'tabBtn-custom', 'tabBtn-shortcut', 'tabBtn-txtcmd', 'tabBtn-settings']) {
        assert.ok(html.includes('id="' + id + '"'), 'main tab button needs id for hiding: ' + id);
    }
    assert.ok(js.includes("['git', 'custom', 'shortcut', 'txtcmd', 'checklist', 'workflow', 'batch']"), 'hide logic covers all tabs');
    assert.ok(js.includes("if (id === 'settings') { return; }"), 'settings tab cannot be hidden');
    assert.ok(translations.en['settings.tabsVisible'] === 'Tabs Visible' && translations.zh['settings.tabsVisible'], 'i18n in both languages');
});


// ---------- webview JS behavior ----------
test('JS: shared tree rendering + icons for both tabs', () => {
    for (const sym of [
        'TREE_ICONS', 'renderCommandTree', 'buildTreeNode', 'getTree', 'setTree',
        'showCommandEditor', 'showCategoryEditor', 'hideEditor', 'saveEditor',
        'deleteNode', 'toggleCategory', 'runCommand', 'genNodeId'
    ]) {
        assert.ok(js.includes(sym), 'missing JS symbol: ' + sym);
    }
    assert.ok(js.includes("renderCommandTree('cmd')"), 'renders cmd tab');
    assert.ok(js.includes("renderCommandTree('pyt')"), 'renders pyt tab');
    assert.ok(/folder/.test(js) && /chevron/.test(js) && /folderPlus/.test(js), 'unified SVG icon set');
});

test('JS: drag-and-drop across/within categories for both containers', () => {
    for (const sym of ['attachDndHandlers', 'getDropPosition', 'moveNode', 'findNodeLocation', 'clearDropIndicators', 'draggedNode']) {
        assert.ok(js.includes(sym), 'missing DnD symbol: ' + sym);
    }
    assert.ok(js.includes("'commandList'") && js.includes("'pythonTxtCmdList'"), 'both containers registered for root drop');
    for (const zone of ['drop-before', 'drop-after', 'drop-inside']) {
        assert.ok(js.includes(zone), 'drop zone: ' + zone);
    }
});

test('JS: message protocol updateCommandTree drives both tabs', () => {
    assert.ok(js.includes("case 'updateCommandTree'"), 'updateCommandTree case');
    assert.ok(!js.includes("case 'updatePythonTxtCommands'"), 'old pyt message removed');
    assert.ok(!js.includes('renderPythonTxtCmdList'), 'old pyt renderer removed');
});

test('JS: command rows keep run/edit/delete actions', () => {
    assert.ok(/runCommand\(tabId/.test(js) || js.includes("runCommand(tabId, nodeId)") || js.includes('runCommand('), 'run action');
    assert.ok(js.includes("t('cmd.run')") && js.includes("t('cmd.edit')") && js.includes("t('cmd.delete')"), 'row action titles');
});

// ---------- i18n completeness ----------
test('i18n: all tree keys exist in en and zh', () => {
    const keys = [
        'cmd.addCategory', 'cmd.newCommand', 'cmd.editCommand', 'cmd.categoryName',
        'cmd.newCategory', 'cmd.editCategory', 'cmd.fillCategoryName',
        'cmd.addCommandHere', 'cmd.addSubCategory', 'cmd.rename',
        'cmd.deleteCategoryTitle', 'cmd.deleteCategoryConfirm',
        'pytxt.content', 'project.expand', 'project.collapse'
    ];
    for (const lang of ['en', 'zh']) {
        for (const k of keys) {
            assert.ok(typeof translations[lang][k] === 'string' && translations[lang][k].length > 0,
                lang + ' missing key: ' + k);
        }
    }
});

test('i18n: every data-i18n key used in HTML exists in both languages', () => {
    const used = new Set();
    for (const source of [html, flowHtml]) {
        for (const m of source.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) {
            used.add(m[1]);
        }
    }
    assert.ok(used.size > 20, 'sanity: found data-i18n keys');
    for (const k of used) {
        assert.ok(translations.en[k] !== undefined, 'en missing: ' + k);
        assert.ok(translations.zh[k] !== undefined, 'zh missing: ' + k);
    }
});

// ---------- host message handling ----------
(async () => {
    await new Promise(r => setTimeout(r, 300)); // let constructor loadData settle

    await testAsync('host: saveCommandTree(pyt) persists to customPythonTxt.json', async () => {
        const tree = [{ id: 'g1', type: 'category', name: 'Pyt Cat', collapsed: false, children: [
            { id: 'pc1', type: 'command', name: 'Shout', content: 'import sys\nprint(sys.stdin.read().upper())' }
        ] }];
        await provider.handleSaveCommandTree('pyt', tree);
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', 'customPythonTxt.json'), 'utf8'));
        assert.deepStrictEqual(onDisk.pythonTxtCommandTree, tree);
        assert.deepStrictEqual(provider._pythonTxtCommandTree, tree);
    });

    await testAsync('host: saveCommandTree(cmd) persists to config.json', async () => {
        const tree = [{ id: 'cc1', type: 'category', name: 'Cmd Cat', collapsed: false, children: [
            { id: 'sc1', type: 'command', name: 'Echo', content: 'echo hello' }
        ] }];
        await provider.handleSaveCommandTree('cmd', tree);
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', 'config.json'), 'utf8'));
        assert.deepStrictEqual(onDisk.customCommandTree, tree);
        assert.deepStrictEqual(provider._customCommandTree, tree);
    });

    await testAsync('host: saveCommandTree rejects non-array payload', async () => {
        await provider.handleSaveCommandTree('cmd', null);
        assert.deepStrictEqual(provider._customCommandTree, []);
    });

    await testAsync('host: runCommand(cmd) without projects does not throw', async () => {
        await provider.handleSaveCommandTree('cmd', [{ id: 'rc1', type: 'command', name: 'Ls', content: 'ls' }]);
        await provider.handleRunCommand('cmd', 'rc1');
        await provider.handleRunCommand('cmd', 'missing-id');
    });

    await testAsync('host: runCommand(pyt) without editor logs error, does not throw', async () => {
        await provider.handleSaveCommandTree('pyt', [{ id: 'rp1', type: 'command', name: 'Up', content: 'print(1)' }]);
        await provider.handleRunCommand('pyt', 'rp1');
        await provider.handleRunCommand('pyt', 'missing-id');
        await provider.handleRunCommand('pyt', 'category-id-not-command');
    });

    await testAsync('host: saveCommandTree(shortcut) persists to shortcutCommands.json', async () => {
        const tree = [{ id: 'sk1', type: 'category', name: 'Quick Cat', collapsed: false, children: [
            { id: 'skc1', type: 'command', name: 'Pwd', content: 'pwd', shell: 'git-bash' }
        ] }];
        await provider.handleSaveCommandTree('shortcut', tree);
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', 'shortcutCommands.json'), 'utf8'));
        assert.deepStrictEqual(onDisk.shortcutCommandTree, tree);
        assert.deepStrictEqual(provider._shortcutCommandTree, tree);
    });

    await testAsync('host: runCommand(shortcut) with missing id does not throw', async () => {
        await provider.handleRunCommand('shortcut', 'missing-id');
        await provider.handleRunShortcutCmdContent(null);
        await provider.handleRunShortcutCmdContent({ alias: '', content: '   ' });
    });

    await testAsync('host: updateWebview posts updateCommandTree for both tabs', async () => {
        const posted = [];
        provider._view = { webview: { postMessage: (m) => posted.push(m), cspSource: 'vscode-resource:' } };
        await provider.handleSaveCommandTree('cmd', [{ id: 'a', type: 'command', name: 'A', content: 'x' }]);
        const treeMsgs = posted.filter(m => m.command === 'updateCommandTree');
        const tabs = new Set(treeMsgs.map(m => m.tabId));
        assert.ok(tabs.has('cmd'), 'posts cmd tree');
        assert.ok(tabs.has('pyt'), 'posts pyt tree');
        assert.ok(tabs.has('shortcut'), 'posts shortcut tree');
        provider._view = undefined;
    });

    await testAsync('host: pyt logs are kept host-side and restored via updateTxtCmdLogs', async () => {
        const posted = [];
        provider._view = { webview: { postMessage: (m) => posted.push(m), cspSource: 'vscode-resource:' } };
        provider._txtCmdLogs = [];
        provider.addTxtCmdLog('transform ok', 'success');
        provider.addTxtCmdLog('failed', 'error', 'traceback');
        assert.strictEqual(provider._txtCmdLogs.length, 2, 'host keeps a copy');
        assert.ok(posted.some(m => m.command === 'addTxtCmdLog' && m.entry.message === 'transform ok'), 'incremental post');

        posted.length = 0;
        provider.updateWebview();
        const restore = posted.find(m => m.command === 'updateTxtCmdLogs');
        assert.ok(restore, 'updateWebview posts full pyt log list');
        assert.strictEqual(restore.logs.length, 2);
        assert.strictEqual(restore.logs[1].details, 'traceback');

        // retention cap applies to the host copy
        provider._logRetention = 5;
        for (let i = 0; i < 10; i++) { provider.addTxtCmdLog('line ' + i, 'info'); }
        assert.ok(provider._txtCmdLogs.length <= 5, 'host copy capped by retention');
        provider._logRetention = 50;
        provider._txtCmdLogs = [];
        provider._view = undefined;
    });

    await testAsync('webview JS: pyt log restore/clear/empty-export wiring', async () => {
        assert.ok(js.includes("case 'updateTxtCmdLogs'"), 'webview restores pyt logs from host');
        assert.ok(/updateTxtCmdLogs.*txtCmdLogs = message\.logs/.test(js), 'restore replaces local list');
        assert.ok(/clearTxtCmdLogs[\s\S]{0,200}command: 'clearTxtCmdLogs'/.test(js), 'clear syncs to host');
        const expFn = js.split('function exportTxtCmdLogs').slice(1)[0].split('function clearTxtCmdLogs')[0];
        assert.ok(expFn.includes("command: 'notifyInfo'"), 'empty export notifies instead of silent return');
        assert.ok(translations.en['log.nothingToExport'] && translations.zh['log.nothingToExport'], 'i18n key in both languages');
    });

    await testAsync('webview JS: pyt resizer is exclusively owned; pointer-events never stuck', async () => {
        assert.ok(js.includes("if (resizer.id === 'txtCmdLogResizer') return;"), 'generic resizer skips the pyt resizer');
        assert.ok(!js.includes('_oldPE'), 'no save/restore of pointer-events in pyt resizer');
        assert.ok(!js.includes('_oldPointerEvents'), 'no save/restore of pointer-events in generic resizer');
        const pytBlock = js.split('function initTxtCmdLogResizer').slice(1).join('') || js.split('(function initTxtCmdLogResizer').slice(1).join('');
        assert.ok(pytBlock.includes("h.style.pointerEvents = '';"), 'pyt mouseup unconditionally restores pointer-events');
    });

    await testAsync('host: workbench checklist persists and workflow run records history', async () => {
        const { WorkbenchStore } = require('../out/utils/workbenchStore');
        const store = WorkbenchStore.getInstance();
        provider.handleWorkbenchChange(() => store.saveChecklist([
            { id: 't1', text: 'buy milk', priority: 'urgent', done: false, createdAt: 1 }
        ]));
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const onDisk = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        assert.strictEqual(onDisk.checklist.length, 1);
        assert.strictEqual(onDisk.checklist[0].text, 'buy milk');

        const wf = {
            id: 'wfx', name: 'HostFlow', updatedAt: 1,
            nodes: [{ id: 'a', label: 'echo', tag: 'cmd', x: 0, y: 0, cmd: 'echo host-run', timeout: 10, failPolicy: 'stop' }],
            edges: []
        };
        await provider.handleWorkflowRun(wf, 'git-bash', 'dev');
        const after = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        assert.strictEqual(after.history.length, 1, 'history recorded');
        assert.strictEqual(after.history[0].workflowName, 'HostFlow');
        assert.strictEqual(after.history[0].result, 'success');
        assert.strictEqual(after.history[0].nodes[0].state, 'success');
    });

    await testAsync('host: workflow ref node executes saved shortcut command like a button click', async () => {
        await provider.handleSaveCommandTree('shortcut', [
            { id: 'sc-root', type: 'category', name: 'Ops', collapsed: false, children: [
                { id: 'sc1', type: 'command', name: 'WriteMarker', content: 'touch ref-marker.txt', shell: 'git-bash' }
            ] }
        ]);
        const marker = path.join(dir, 'ref-marker.txt');
        try { fs.unlinkSync(marker); } catch (e) { }
        const wf = {
            id: 'wref', name: 'RefFlow', updatedAt: 1,
            nodes: [{ id: 'r1', label: 'run saved', tag: 'ref', x: 0, y: 0, cmd: '', timeout: 10, failPolicy: 'stop', refTab: 'shortcut', refCommandId: 'sc1' }],
            edges: []
        };
        await provider.handleWorkflowRun(wf, 'git-bash', 'dev');
        assert.ok(fs.existsSync(marker), 'referenced command actually ran at workspace root');
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const onDisk = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        const entry = onDisk.history.find(h => h.workflowName === 'RefFlow');
        assert.ok(entry, 'ref run recorded in history');
        assert.strictEqual(entry.result, 'success');
        assert.strictEqual(entry.nodes[0].state, 'success');
    });

    await testAsync('host: workflow ref node to missing command fails the run', async () => {
        const wf = {
            id: 'wref2', name: 'RefFlowMissing', updatedAt: 1,
            nodes: [{ id: 'r1', label: 'bad ref', tag: 'ref', x: 0, y: 0, cmd: '', timeout: 10, failPolicy: 'stop', refTab: 'shortcut', refCommandId: 'no-such-id' }],
            edges: []
        };
        await provider.handleWorkflowRun(wf, 'git-bash', 'dev');
        // 新行为：failed 先进入失败暂停态（不写历史），用户取消后归档
        provider.handleWorkflowCancel();
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const onDisk = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        const entry = onDisk.history.find(h => h.workflowName === 'RefFlowMissing');
        assert.ok(entry, 'run recorded');
        assert.strictEqual(entry.result, 'failed');
        assert.strictEqual(entry.nodes[0].state, 'failed');
        // 失败运行的实例已清除（移出"正在运行"分组）
        assert.strictEqual(provider._activeRun, undefined, 'active run cleared after cancel');
    });

    await testAsync('host: new run while previous is failed-paused keeps old instance resumable', async () => {
        // 1) 失败运行 → failed-paused（引擎空闲，实例保留在"正在运行"分组，不写历史）
        const failingWf = {
            id: 'wfail', name: 'FailFlow', updatedAt: 1,
            nodes: [{ id: 'r1', label: 'bad ref', tag: 'ref', x: 0, y: 0, cmd: '', timeout: 10, failPolicy: 'stop', refTab: 'shortcut', refCommandId: 'no-such-id' }],
            edges: []
        };
        await provider.handleWorkflowRun(failingWf, 'git-bash', 'dev');
        assert.ok(provider._activeRun, 'failed-paused instance retained in active runs');
        assert.strictEqual(provider._activeRun.phase, 'failed-paused', 'phase is failed-paused');

        // 2) 发起新运行：旧 failed-paused 实例换到暂停列表（可修复后续跑/取消），不写历史
        const okWf = {
            id: 'wok', name: 'OkFlow', updatedAt: 1,
            nodes: [{ id: 'a', label: 'echo', tag: 'cmd', x: 0, y: 0, cmd: 'echo ok-run', timeout: 10, failPolicy: 'stop' }],
            edges: []
        };
        await provider.handleWorkflowRun(okWf, 'git-bash', 'dev');

        // 3) 历史只有 OkFlow(success)；FailFlow 仍在暂停列表可续跑
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const onDisk = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        const failEntry = onDisk.history.find(h => h.workflowName === 'FailFlow');
        const okEntry = onDisk.history.find(h => h.workflowName === 'OkFlow');
        assert.ok(!failEntry, 'failed-paused run NOT archived to history when new run starts');
        assert.ok(okEntry, 'new run recorded in history');
        assert.strictEqual(okEntry.result, 'success');
        assert.strictEqual(provider._activeRun, undefined, 'active run cleared after new run completes');
        assert.strictEqual(provider._pausedRuns.length, 1, 'old failed-paused instance retained in paused runs');
        assert.strictEqual(provider._pausedRuns[0].name, 'FailFlow', 'paused instance is the failed run');

        // 4) 取消暂停实例 → 以 failed 终局写历史，从运行分组移除
        provider.handleWorkflowCancel({ runId: provider._pausedRuns[0].id });
        const onDisk2 = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        assert.ok(onDisk2.history.find(h => h.workflowName === 'FailFlow'), 'cancelled paused run recorded in history');
        assert.strictEqual(provider._pausedRuns.length, 0, 'paused runs cleared after cancel');
    });

    await testAsync('host: workflow ref node to git tab runs git operations like the Git tab buttons', async () => {
        const cp = require('child_process');
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-gitref-'));
        cp.execSync('git init -q && git config user.email t@t.local && git config user.name test && echo hi > a.txt && git add . && git commit -qm init', { cwd: repo });
        provider._projects = [{ id: 'gp1', name: 'repo', path: repo, isGitRepo: true, currentBranch: 'master' }];
        provider._selectedProjectIds = new Set(['gp1']);

        const wf = {
            id: 'wgit', name: 'GitRefFlow', updatedAt: 1,
            nodes: [{ id: 'g1', label: 'create branch', tag: 'ref', x: 0, y: 0, cmd: 'flow-branch', timeout: 30, failPolicy: 'stop', refTab: 'git', refCommandId: 'git:create-branch' }],
            edges: []
        };
        await provider.handleWorkflowRun(wf, 'git-bash', 'dev');
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const entry = JSON.parse(fs.readFileSync(wbFile, 'utf8')).history.find(h => h.workflowName === 'GitRefFlow');
        assert.ok(entry, 'git ref run recorded');
        assert.strictEqual(entry.result, 'success');
        assert.strictEqual(entry.nodes[0].state, 'success');
        const branchOut = cp.execSync('git branch --list flow-branch', { cwd: repo }).toString();
        assert.ok(branchOut.indexOf('flow-branch') >= 0, 'branch actually created via git ref');

        // branch operations require the node parameter
        provider._projects = [{ id: 'gp1', name: 'repo', path: repo, isGitRepo: true, currentBranch: 'master' }];
        provider._selectedProjectIds = new Set(['gp1']);
        const wf2 = {
            id: 'wgit2', name: 'GitRefNoParam', updatedAt: 1,
            nodes: [{ id: 'g1', label: 'switch', tag: 'ref', x: 0, y: 0, cmd: '', timeout: 30, failPolicy: 'stop', refTab: 'git', refCommandId: 'git:switch-branch' }],
            edges: []
        };
        await provider.handleWorkflowRun(wf2, 'git-bash', 'dev');
        // 新行为：failed 先进入失败暂停态（不写历史），用户取消后归档
        provider.handleWorkflowCancel();
        const entry2 = JSON.parse(fs.readFileSync(wbFile, 'utf8')).history.find(h => h.workflowName === 'GitRefNoParam');
        assert.ok(entry2, 'no-param run recorded');
        assert.strictEqual(entry2.result, 'failed', 'missing branch name fails the node');
        provider._projects = [];
        provider._selectedProjectIds = new Set();
    });

    await testAsync('host: legacy config migrates on provider load', async () => {
        const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-leg-'));
        setWorkspace(dir2);
        fs.mkdirSync(path.join(dir2, '.multi-project-tool'), { recursive: true });
        fs.writeFileSync(path.join(dir2, '.multi-project-tool', 'config.json'), JSON.stringify({
            customCommands: [{ id: 'o1', alias: 'OldCmd', content: 'echo old' }]
        }));
        fs.writeFileSync(path.join(dir2, '.multi-project-tool', 'customPythonTxt.json'), JSON.stringify([
            { id: 'p1', alias: 'OldPy', content: 'print(1)' }
        ]));

        for (const k of Object.keys(require.cache)) {
            if (k.includes(path.sep + 'out' + path.sep)) { delete require.cache[k]; }
        }
        const { MainViewProvider: Mvp2 } = require('../out/views/MainViewProvider');
        const p2 = new Mvp2(Uri.file(dir2));
        await new Promise(r => setTimeout(r, 400));

        assert.strictEqual(p2._customCommandTree[0].name, 'Default');
        assert.strictEqual(p2._customCommandTree[0].children[0].name, 'OldCmd');
        assert.strictEqual(p2._pythonTxtCommandTree[0].name, 'Default');
        assert.strictEqual(p2._pythonTxtCommandTree[0].children[0].name, 'OldPy');

        // 升级后首次保存不得丢失任何旧命令（tab 改名不影响数据）
        await p2.handleSaveCommandTree('cmd', p2._customCommandTree);
        const onDisk2 = JSON.parse(fs.readFileSync(path.join(dir2, '.multi-project-tool', 'config.json'), 'utf8'));
        assert.strictEqual(onDisk2.customCommandTree[0].children.length, 1, 'legacy command count preserved');
        assert.strictEqual(onDisk2.customCommandTree[0].children[0].name, 'OldCmd');
        assert.strictEqual(onDisk2.customCommandTree[0].children[0].content, 'echo old');
        assert.strictEqual(onDisk2.customCommandTree[0].children[0].shell, 'git-bash', 'legacy command typed as git-bash');
        assert.strictEqual(onDisk2.customCommands, undefined, 'legacy flat key replaced by tree');
    });

    await testAsync('upgrade: previous-version tree config keeps all commands and settings, no data loss', async () => {
        const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-upg-'));
        setWorkspace(dir3);
        fs.mkdirSync(path.join(dir3, '.multi-project-tool'), { recursive: true });
        // 上一版本的数据形态：树无 shell 字段，settings 无 shortcutShell
        fs.writeFileSync(path.join(dir3, '.multi-project-tool', 'config.json'), JSON.stringify({
            settings: {
                commonParameters: { env: 'prod' },
                defaultShell: 'powershell',
                autoRefresh: false,
                logRetention: 100,
                concurrency: 2,
                commandTimeout: 600,
                language: 'zh'
            },
            customCommandTree: [
                {
                    id: 'cat1', type: 'category', name: 'Ops', collapsed: false, children: [
                        { id: 'c1', type: 'command', name: 'Build', content: 'npm run build' },
                        { id: 'c2', type: 'command', name: 'Deploy', content: 'npm run deploy', shell: 'powershell' }
                    ]
                },
                { id: 'c3', type: 'command', name: 'Root', content: 'echo root' }
            ],
            envVariables: [{ key: 'TOKEN', value: 'abc' }]
        }));

        for (const k of Object.keys(require.cache)) {
            if (k.includes(path.sep + 'out' + path.sep)) { delete require.cache[k]; }
        }
        const { MainViewProvider: Mvp3 } = require('../out/views/MainViewProvider');
        const p3 = new Mvp3(Uri.file(dir3));
        await new Promise(r => setTimeout(r, 400));

        // 所有命令原样保留
        const flat = [];
        const walk = (nodes) => nodes.forEach(n => { if (n.type === 'command') { flat.push(n); } else { walk(n.children || []); } });
        walk(p3._customCommandTree);
        assert.strictEqual(flat.length, 3, 'all 3 commands survive upgrade');
        const byName = Object.fromEntries(flat.map(c => [c.name, c]));
        assert.strictEqual(byName.Build.content, 'npm run build');
        assert.strictEqual(byName.Build.shell, 'git-bash', 'untyped legacy command defaults to git-bash');
        assert.strictEqual(byName.Deploy.shell, 'powershell', 'existing shell type preserved');
        assert.strictEqual(byName.Root.shell, 'git-bash');

        // 设置与环境变量保留，新字段 shortcutShell 取默认值
        assert.strictEqual(p3._currentShell, 'powershell');
        assert.strictEqual(p3._shortcutShell, 'git-bash');
        assert.strictEqual(p3._logRetention, 100);
        assert.strictEqual(p3._concurrency, 2);
        assert.strictEqual(p3._commandTimeout, 600);
        assert.deepStrictEqual(p3._envVariables, [{ key: 'TOKEN', value: 'abc' }]);
        assert.deepStrictEqual(p3._settings.commonParameters, { env: 'prod' });

        // 模拟升级后首次保存，落盘数据不得丢失
        await p3.handleSaveCommandTree('cmd', p3._customCommandTree);
        const onDisk3 = JSON.parse(fs.readFileSync(path.join(dir3, '.multi-project-tool', 'config.json'), 'utf8'));
        const flat3 = [];
        (function w(nodes) { nodes.forEach(n => { if (n.type === 'command') { flat3.push(n); } else { w(n.children || []); } }); })(onDisk3.customCommandTree);
        assert.strictEqual(flat3.length, 3, 'all commands persisted after first save');
        assert.strictEqual(onDisk3.settings.defaultShell, 'powershell');
        assert.strictEqual(onDisk3.settings.shortcutShell, 'git-bash', 'new field added with default');
        assert.strictEqual(onDisk3.settings.logRetention, 100);
        assert.deepStrictEqual(onDisk3.envVariables, [{ key: 'TOKEN', value: 'abc' }]);
        assert.deepStrictEqual(onDisk3.settings.commonParameters, { env: 'prod' });
        assert.deepStrictEqual(p3._shortcutCommandTree, [], 'missing shortcut file yields empty tree');
    });

    summary('webview + host integration');
})();
