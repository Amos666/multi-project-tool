'use strict';
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary, freshRequire } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('pythonTxtCmdStore');

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-pyt-'));
}

function loadStore(workspaceDir) {
    setWorkspace(workspaceDir);
    return freshRequire('../out/utils/pythonTxtCmdStore').PythonTxtCmdStore;
}

const PYT_FILE = 'customPythonTxt.json';

test('load: no workspace returns built-in defaults inside Default category', () => {
    setWorkspace(null);
    const Store = freshRequire('../out/utils/pythonTxtCmdStore').PythonTxtCmdStore;
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'Default');
    assert.strictEqual(tree[0].type, 'category');
    const names = tree[0].children.map(c => c.name);
    assert.ok(names.includes('转为大写'));
    assert.ok(names.includes('转为小写'));
});

test('load: missing file returns built-in default tree', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree[0].name, 'Default');
    assert.strictEqual(tree[0].children.length, 2);
});

test('load: missing file persists default examples with defaultsSeeded flag', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    Store.getInstance().load();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.multi-project-tool', PYT_FILE), 'utf8'));
    assert.strictEqual(onDisk.defaultsSeeded, true);
    assert.strictEqual(onDisk.pythonTxtCommandTree[0].name, 'Default');
    assert.strictEqual(onDisk.pythonTxtCommandTree[0].children.length, 2);
});

test('load: tree with only categories gets default examples seeded exactly once', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), JSON.stringify({
        pythonTxtCommandTree: [
            { id: 'k1', type: 'category', name: 'My Group', collapsed: false, children: [
                { id: 'k2', type: 'category', name: 'Empty Sub', collapsed: false, children: [] }
            ] }
        ]
    }));

    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 2, 'examples category appended');
    assert.strictEqual(tree[0].name, 'My Group');
    assert.strictEqual(tree[1].name, 'Default');
    const seededNames = tree[1].children.map(c => c.name);
    assert.ok(seededNames.includes('转为大写'));
    assert.ok(seededNames.includes('转为小写'));

    // second load must not duplicate the examples
    const Store2 = loadStore(dir);
    const tree2 = Store2.getInstance().load();
    assert.strictEqual(tree2.length, 2);
    assert.strictEqual(tree2.filter(n => n.name === 'Default').length, 1);
});

test('load: tree already containing commands is not re-seeded, flag gets written', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), JSON.stringify({
        pythonTxtCommandTree: [
            { id: 'c1', type: 'command', name: 'Mine', content: 'print(1)' }
        ]
    }));
    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'Mine');
    const onDisk = JSON.parse(fs.readFileSync(path.join(cfgDir, PYT_FILE), 'utf8'));
    assert.strictEqual(onDisk.defaultsSeeded, true);
    assert.strictEqual(onDisk.pythonTxtCommandTree.length, 1);
});

test('load: legacy flat array migrates into Default and persists new format', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    const legacy = [
        { id: 'p1', alias: 'Reverse', content: 'import sys\nprint(sys.stdin.read()[::-1])' },
        { id: 'p2', alias: 'Trim', content: 'import sys\nprint(sys.stdin.read().strip())' }
    ];
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), JSON.stringify(legacy, null, 2));

    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].id, 'default-category');
    assert.strictEqual(tree[0].name, 'Default');
    assert.strictEqual(tree[0].children.length, 2);
    assert.strictEqual(tree[0].children[0].name, 'Reverse');
    assert.strictEqual(tree[0].children[1].name, 'Trim');

    // persisted as { pythonTxtCommandTree: [...] }
    const onDisk = JSON.parse(fs.readFileSync(path.join(cfgDir, PYT_FILE), 'utf8'));
    assert.ok(Array.isArray(onDisk.pythonTxtCommandTree));
    assert.strictEqual(onDisk.pythonTxtCommandTree[0].name, 'Default');
});

test('load: legacy empty array falls back to built-in defaults', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), '[]');
    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree[0].name, 'Default');
    assert.strictEqual(tree[0].children.length, 2);
});

test('save/load: new-format tree round-trips', () => {
    const dir = makeWorkspace();
    const Store = loadStore(dir);
    const store = Store.getInstance();
    const tree = [
        {
            id: 'grp', type: 'category', name: 'Text Ops', collapsed: false, children: [
                { id: 'up', type: 'command', name: 'Upper', content: 'import sys\nprint(sys.stdin.read().upper())', shell: 'git-bash' },
                {
                    id: 'sub', type: 'category', name: 'Case', collapsed: false, children: [
                        { id: 'low', type: 'command', name: 'Lower', content: 'import sys\nprint(sys.stdin.read().lower())', shell: 'git-bash' }
                    ]
                }
            ]
        }
    ];
    assert.strictEqual(store.save(tree), true);

    const Store2 = loadStore(dir);
    const reloaded = Store2.getInstance().load();
    assert.deepStrictEqual(reloaded, tree);
});

test('load: corrupted JSON falls back to built-in defaults', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), '%%%');
    const Store = loadStore(dir);
    const origErr = console.error;
    console.error = () => {};
    try {
        const tree = Store.getInstance().load();
        assert.strictEqual(tree[0].name, 'Default');
    } finally {
        console.error = origErr;
    }
});

test('load: new-format with invalid nodes gets sanitized', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, PYT_FILE), JSON.stringify({
        pythonTxtCommandTree: [
            { type: 'junk' },
            { id: 'ok', type: 'command', name: 'Keep', content: 'print(1)' }
        ]
    }));
    const Store = loadStore(dir);
    const tree = Store.getInstance().load();
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'Keep');
});

summary('pythonTxtCmdStore');
