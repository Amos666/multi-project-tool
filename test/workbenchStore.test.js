'use strict';
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary, freshRequire } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('workbenchStore');

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-wb-'));
}

function loadStore(workspaceDir) {
    setWorkspace(workspaceDir);
    return freshRequire('../out/utils/workbenchStore').WorkbenchStore;
}

const WB_FILE = 'workbench.json';

test('load: no workspace returns defaults with preset batch groups', () => {
    setWorkspace(null);
    const Store = freshRequire('../out/utils/workbenchStore').WorkbenchStore;
    const d = Store.getInstance().load();
    assert.deepStrictEqual(d.checklist, []);
    assert.deepStrictEqual(d.workflows, []);
    assert.deepStrictEqual(d.history, []);
    assert.deepStrictEqual(d.hiddenTabs, []);
    assert.strictEqual(d.batchGroups.length, 2);
    assert.strictEqual(d.batchGroups[0].name, 'wb.batch.javaBuild');
});

test('load: missing file returns defaults; allTemplates exposes 3 builtins', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const d = store.load();
    assert.strictEqual(d.batchGroups.length, 2);
    const tpls = store.allTemplates();
    assert.strictEqual(tpls.length, 3);
    assert.ok(tpls.every(t => t.builtin === true && Array.isArray(t.nodes) && t.nodes.length > 0));
    assert.deepStrictEqual(tpls.map(t => t.name), ['wb.template.maven', 'wb.template.multi', 'wb.template.cicd']);
});

test('checklist save/load round-trip', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const tasks = [
        { id: 't1', text: 'urgent thing', priority: 'urgent', done: false, createdAt: 1 },
        { id: 't2', text: 'done thing', priority: 'low', done: true, createdAt: 2 }
    ];
    store.saveChecklist(tasks);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', WB_FILE), 'utf8'));
    assert.deepStrictEqual(onDisk.checklist, tasks);

    const Store2 = loadStore(dir);
    assert.deepStrictEqual(Store2.getInstance().load().checklist, tasks);
});

test('workflow upsert/update/delete round-trip', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const wf = { id: 'wf1', name: 'Flow A', nodes: [{ id: 'n1', label: 'A', tag: 'cmd', x: 10, y: 10, cmd: 'echo a', timeout: 300, failPolicy: 'stop' }], edges: [], updatedAt: 1 };
    store.upsertWorkflow(wf);
    assert.strictEqual(store.load().workflows.length, 1);

    const updated = Object.assign({}, wf, { name: 'Flow A2' });
    store.upsertWorkflow(updated);
    assert.strictEqual(store.load().workflows.length, 1, 'upsert by id, no duplicate');
    assert.strictEqual(store.load().workflows[0].name, 'Flow A2');

    store.deleteWorkflow('wf1');
    assert.deepStrictEqual(store.load().workflows, []);

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', WB_FILE), 'utf8'));
    assert.deepStrictEqual(onDisk.workflows, []);
});

test('custom templates save/delete; builtins not removable', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const tpl = store.saveCustomTemplate('My Tpl', [{ id: 'x', label: 'X', tag: 'cmd', x: 0, y: 0, cmd: 'echo x', timeout: 60, failPolicy: 'skip' }], []);
    assert.ok(tpl.id.indexOf('tpl-') === 0);
    assert.strictEqual(store.allTemplates().length, 4, '3 builtins + 1 custom');

    store.deleteCustomTemplate('builtin-maven');
    assert.strictEqual(store.allTemplates().length, 4, 'builtin cannot be deleted via custom delete');
    store.deleteCustomTemplate(tpl.id);
    assert.strictEqual(store.allTemplates().length, 3);
});

test('history: newest first and capped at 30', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    for (let i = 0; i < 35; i++) {
        store.addHistory({ id: 'run-' + i, workflowName: 'w' + i, result: 'success', duration: i, time: i, nodes: [] });
    }
    const hist = store.load().history;
    assert.strictEqual(hist.length, 30);
    assert.strictEqual(hist[0].workflowName, 'w34', 'newest kept first');
    assert.strictEqual(hist[29].workflowName, 'w5', 'oldest trimmed');
});

test('batch groups + hiddenTabs persist', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    store.saveBatchGroups([{ id: 'g1', name: 'Mine', mode: 'parallel', commands: ['echo 1'] }]);
    store.saveHiddenTabs(['workflow', 'batch']);

    const Store2 = loadStore(dir);
    const d = Store2.getInstance().load();
    assert.strictEqual(d.batchGroups.length, 1);
    assert.strictEqual(d.batchGroups[0].mode, 'parallel');
    assert.deepStrictEqual(d.hiddenTabs, ['workflow', 'batch']);
});

test('load: corrupted JSON falls back to defaults', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, WB_FILE), '{ broken !!!');
    const Store = loadStore(dir);
    const origErr = console.error;
    console.error = () => {};
    try {
        const d = Store.getInstance().load();
        assert.deepStrictEqual(d.checklist, []);
        assert.strictEqual(d.batchGroups.length, 2);
    } finally {
        console.error = origErr;
    }
});

test('load: partial file keeps defaults for missing domains', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, WB_FILE), JSON.stringify({ checklist: [{ id: 'a', text: 'x', priority: 'normal', done: false, createdAt: 1 }] }));
    const Store = loadStore(dir);
    const d = Store.getInstance().load();
    assert.strictEqual(d.checklist.length, 1);
    assert.strictEqual(d.batchGroups.length, 2, 'missing batchGroups falls back to presets');
    assert.deepStrictEqual(d.hiddenTabs, []);
});

summary('workbenchStore');
