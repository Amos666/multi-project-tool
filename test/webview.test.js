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
const { Uri } = require('vscode');

const provider = new MainViewProvider(Uri.file(dir));
const css = provider.getCss();
const html = provider.getHtmlBody();
const js = provider.getJavaScript();

// ---------- webview JS syntax ----------
test('webview JavaScript parses without syntax errors', () => {
    new vm.Script(js, { filename: 'webview.js' });
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
    for (const id of ['wfSvg', 'wfPalette', 'wfFlowList', 'wfTemplateList', 'wfHistoryList',
        'wfName', 'wfEnv', 'wfShell', 'wfPropsForm', 'wfPName', 'wfPCmd', 'wfPNotifyType', 'wfPTimeout', 'wfPFail',
        'wfRunTbody', 'wfOutput', 'wfLogFilter', 'wfState', 'wfDur', 'wfFailed', 'wfSkipped']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing workflow element: ' + id);
    }
    assert.ok(html.includes('onclick="wfRun()"'), 'run button');
    assert.ok(html.includes('onclick="wfStop()"'), 'stop button');
    assert.ok(html.includes("wfEditProp('notifyType',this.value)"), 'notify type selector wired');
    assert.ok(html.includes('wb.wf.notifyTypeHttp'), 'http notify option i18n key');
});

test('JS: notify node property label switches by notifyType', () => {
    assert.ok(js.includes('wfCmdLabelKey'), 'label key helper exists');
    assert.ok(js.includes("wbEl('wfPNotifyType').value = n.notifyType || 'text'"), 'selector synced on select');
    assert.ok(js.includes("notifyType: tag === 'notify' ? 'text' : undefined"), 'new notify nodes default to text');
});

test('HTML+JS: ref node (reference saved commands from other tabs)', () => {
    for (const id of ['wfPRefTabLabel', 'wfPRefTab', 'wfPRefCmdLabel', 'wfPRefCmd']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing ref property element: ' + id);
    }
    assert.ok(html.includes('wfRefTabChange(this.value)'), 'tab selector wired');
    assert.ok(html.includes("wfEditProp('refCommandId',this.value)"), 'command selector wired');
    assert.ok(js.includes("['start', 'cmd', 'condition', 'fork', 'join', 'confirm', 'notify', 'ref']"), 'palette includes ref');
    assert.ok(js.includes('ref: '), 'tag color defined');
    assert.ok(js.includes("refTab: tag === 'ref' ? 'cmd' : undefined"), 'new ref node defaults');
    assert.ok(js.includes('function wfRefCommands'), 'command flattener with category paths');
    assert.ok(js.includes('shortcutCommandTree'), 'reads shortcut tree');
    assert.ok(js.includes('pythonTxtCommandTree'), 'reads pyt tree');
    assert.ok(js.includes('customCommandTree'), 'reads cmd tree');
    assert.ok(translations.en['wb.node.ref'] && translations.zh['wb.node.ref'], 'node label i18n');
    assert.ok(translations.en['wb.wf.refTab'] && translations.zh['wb.wf.refCmd'], 'property i18n');
});

test('HTML+JS: start node (scheduled start) and confirm node (manual approval)', () => {
    assert.ok(js.includes("['start', 'cmd', 'condition', 'fork', 'join', 'confirm', 'notify', 'ref']"), 'palette includes start & confirm');
    for (const id of ['wfPSchedModeLabel', 'wfPSchedMode', 'wfPSchedValueLabel', 'wfPSchedValue']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing schedule element: ' + id);
    }
    assert.ok(html.includes('value="countdown"') && html.includes('value="clock"') && html.includes('value="none"'), 'schedule modes offered');
    assert.ok(html.includes('id="wfConfirmBar"') && html.includes('id="wfConfirmText"'), 'confirm bar in monitor');
    assert.ok(html.includes('onclick="wfConfirm(true)"') && html.includes('onclick="wfConfirm(false)"'), 'approve/cancel buttons');
    assert.ok(js.includes("command: 'workflowConfirm'"), 'confirm answer sent to host');
    assert.ok(js.includes("ev.type === 'confirm'"), 'webview handles confirm event');
    assert.ok(js.includes("scheduleMode: tag === 'start' ? 'none' : undefined"), 'start node defaults');
    assert.ok(js.includes('function wfStartDesc'), 'schedule shown on canvas node');
    assert.ok(js.includes('function wfSchedModeChange'), 'value input adapts to mode');
    for (const k of ['wb.node.start', 'wb.node.confirm', 'wb.wf.schedMode', 'wb.wf.schedCountdown', 'wb.wf.schedClock', 'wb.wf.confirmApprove', 'wb.wf.confirmCancel']) {
        assert.ok(translations.en[k] && translations.zh[k], 'i18n missing: ' + k);
    }
});

test('HTML: batch panel has own shell/env selectors and live log area', () => {
    for (const id of ['batchGroupSel', 'batchMode', 'batchShell', 'batchEnv', 'batchList', 'batchStatus', 'batchOutput']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing batch element: ' + id);
    }
    assert.ok(html.includes('onclick="batchRun()"'), 'batch run');
    assert.ok(html.includes('onclick="batchToFlow()"'), 'batch to flowchart');
    assert.ok(html.includes('onclick="batchClearLog()"'), 'batch log clear');
});

test('JS: workbench behaviors wired (run/stop, prod confirm, launcher run, counters)', () => {
    for (const sym of ['wbAddTask', 'wbToggleTask', 'wfRun', 'wfStop', 'wfSave', 'wfDraw',
        'wfWouldCycle', 'wfLauncherRun', 'wfSetCounters', 'wfHistoryView', 'launcherOpen',
        'launcherKey', 'applyHiddenTabs', 'wbToggleTab', 'batchRun', 'batchToFlow',
        'wfWriteLine', 'batchClearLog', 'wfAppendOutput']) {
        assert.ok(js.includes(sym), 'missing workbench JS symbol: ' + sym);
    }
    assert.ok(js.includes("window.confirm(t('wb.wf.prodConfirm'))"), 'prod environment requires confirmation');
    assert.ok(js.includes('wfFailed') && js.includes('wfSkipped'), 'monitor counters updated');
    assert.ok(js.includes("command: 'workflowRun'") && js.includes("command: 'workflowStop'"), 'run/stop messages');
    assert.ok(js.includes("command: 'checklistSave'") && js.includes("command: 'workbenchTabsSave'"), 'persistence messages');
    assert.ok(js.includes('wbNow()'), 'log lines carry timestamps');
    assert.ok(/WB\.batchRunning[\s\S]{0,120}batchOutput/.test(js), 'batch run mirrors logs into batch tab');
});

test('HTML: Set tab exposes workbench tab toggles', () => {
    for (const id of ['wbTabToggle-checklist', 'wbTabToggle-workflow', 'wbTabToggle-batch']) {
        assert.ok(html.includes('id="' + id + '"'), 'missing toggle: ' + id);
    }
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
    for (const m of html.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)) {
        used.add(m[1]);
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
        const wbFile = path.join(dir, '.multi-project-tool', 'workbench.json');
        const onDisk = JSON.parse(fs.readFileSync(wbFile, 'utf8'));
        const entry = onDisk.history.find(h => h.workflowName === 'RefFlowMissing');
        assert.ok(entry, 'run recorded');
        assert.strictEqual(entry.result, 'failed');
        assert.strictEqual(entry.nodes[0].state, 'failed');
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
