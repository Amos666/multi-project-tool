'use strict';
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary, freshRequire } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('shortcutCmdStore');

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-shortcut-'));
}

function loadStore(workspaceDir) {
    setWorkspace(workspaceDir);
    return freshRequire('../out/utils/shortcutCmdStore').ShortcutCmdStore;
}

const SHORTCUT_FILE = 'shortcutCommands.json';

test('load: no workspace returns empty tree', () => {
    setWorkspace(null);
    const Store = freshRequire('../out/utils/shortcutCmdStore').ShortcutCmdStore;
    assert.deepStrictEqual(Store.getInstance().load(), []);
});

test('load: missing file returns empty tree', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    assert.deepStrictEqual(Store.getInstance().load(), []);
});

test('save/load: tree round-trips through shortcutCommands.json', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const tree = [
        {
            id: 'grp', type: 'category', name: 'Toolbox', collapsed: false, children: [
                { id: 'c1', type: 'command', name: 'Clean', content: 'npm cache clean', shell: 'git-bash' },
                { id: 'c2', type: 'command', name: 'Dir', content: 'dir', shell: 'cmd' }
            ]
        }
    ];
    assert.strictEqual(store.save(tree), true);
    assert.ok(fs.existsSync(path.join(dir, '.multi-project-tool', SHORTCUT_FILE)));

    const Store2 = loadStore(dir);
    const reloaded = Store2.getInstance().load();
    assert.deepStrictEqual(reloaded, tree);
});

test('load: invalid nodes dropped, missing shell defaults to git-bash', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, SHORTCUT_FILE), JSON.stringify({
        shortcutCommandTree: [
            { type: 'bogus', name: 'x' },
            { id: 'c1', type: 'command', name: 'Legacy', content: 'echo hi' },
            { id: 'c2', type: 'command', name: 'Typed', content: 'dir', shell: 'powershell' }
        ]
    }));
    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 2);
    assert.strictEqual(tree[0].shell, 'git-bash');
    assert.strictEqual(tree[1].shell, 'powershell');
});

test('load: corrupted JSON falls back to empty tree', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, SHORTCUT_FILE), '%%%');
    const Store = loadStore(dir);
    const origErr = console.error;
    console.error = () => {};
    try {
        assert.deepStrictEqual(Store.getInstance().load(), []);
    } finally {
        console.error = origErr;
    }
});

test('save: no workspace returns false', () => {
    setWorkspace(null);
    const Store = freshRequire('../out/utils/shortcutCmdStore').ShortcutCmdStore;
    const origWarn = console.warn;
    console.warn = () => {};
    try {
        assert.strictEqual(Store.getInstance().save([]), false);
    } finally {
        console.warn = origWarn;
    }
});

summary('shortcutCmdStore');
