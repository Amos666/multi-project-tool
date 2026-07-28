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

test('HTML: delete-category confirmation modal exists', () => {
    assert.ok(html.includes('id="deleteCategoryModal"'), 'deleteCategoryModal');
    assert.ok(html.includes('confirmDeleteCategory()'), 'confirm handler');
    assert.ok(html.includes('closeDeleteCategoryModal()'), 'close handler');
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

    await testAsync('host: updateWebview posts updateCommandTree for both tabs', async () => {
        const posted = [];
        provider._view = { webview: { postMessage: (m) => posted.push(m), cspSource: 'vscode-resource:' } };
        await provider.handleSaveCommandTree('cmd', [{ id: 'a', type: 'command', name: 'A', content: 'x' }]);
        const treeMsgs = posted.filter(m => m.command === 'updateCommandTree');
        const tabs = new Set(treeMsgs.map(m => m.tabId));
        assert.ok(tabs.has('cmd'), 'posts cmd tree');
        assert.ok(tabs.has('pyt'), 'posts pyt tree');
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
    });

    summary('webview + host integration');
})();
