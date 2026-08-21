'use strict';
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary, freshRequire } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('configStore');

function makeWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-cfg-'));
}

function loadStore(workspaceDir) {
    setWorkspace(workspaceDir);
    return freshRequire('../out/utils/configStore').ConfigStore;
}

test('load: no workspace returns default config with empty tree', () => {
    setWorkspace(null);
    const ConfigStore = freshRequire('../out/utils/configStore').ConfigStore;
    const cfg = ConfigStore.getInstance().load();
    assert.deepStrictEqual(cfg.customCommandTree, []);
    assert.strictEqual(cfg.settings.defaultShell, 'git-bash');
    assert.strictEqual(cfg.settings.language, 'en');
});

test('load: no config file returns defaults', () => {
    const dir = makeWorkspace();
    const ConfigStore = loadStore(dir);
    const cfg = ConfigStore.getInstance().load();
    assert.deepStrictEqual(cfg.customCommandTree, []);
    assert.deepStrictEqual(cfg.envVariables, []);
});

test('load: legacy flat customCommands migrates into Default and persists new format', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    const legacy = {
        settings: { defaultShell: 'powershell', logRetention: 20 },
        customCommands: [
            { id: 'c1', alias: 'Build All', content: 'npm run build' },
            { id: 'c2', alias: 'Deploy', content: 'npm run deploy' }
        ],
        envVariables: [{ key: 'NODE_ENV', value: 'prod' }]
    };
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(legacy, null, 2));

    const ConfigStore = loadStore(dir);
    const cfg = ConfigStore.getInstance().load();

    assert.strictEqual(cfg.customCommandTree.length, 1);
    const cat = cfg.customCommandTree[0];
    assert.strictEqual(cat.id, 'default-category');
    assert.strictEqual(cat.name, 'Default');
    assert.strictEqual(cat.children.length, 2);
    assert.strictEqual(cat.children[0].name, 'Build All');
    assert.strictEqual(cat.children[1].content, 'npm run deploy');
    // other settings survive migration
    assert.strictEqual(cfg.settings.defaultShell, 'powershell');
    assert.strictEqual(cfg.settings.logRetention, 20);
    assert.deepStrictEqual(cfg.envVariables, [{ key: 'NODE_ENV', value: 'prod' }]);

    // migration persisted to disk in the new format
    const onDisk = JSON.parse(fs.readFileSync(path.join(cfgDir, 'config.json'), 'utf8'));
    assert.ok(Array.isArray(onDisk.customCommandTree));
    assert.strictEqual(onDisk.customCommandTree[0].name, 'Default');
    assert.strictEqual(onDisk.customCommands, undefined);
});

test('load: new-format tree round-trips through save/load', () => {
    const dir = makeWorkspace();
    const ConfigStore = loadStore(dir);
    const store = ConfigStore.getInstance();
    const tree = [
        {
            id: 'cat-a', type: 'category', name: 'Frontend', collapsed: false, children: [
                { id: 'cmd-1', type: 'command', name: 'Build', content: 'npm run build', shell: 'git-bash' },
                {
                    id: 'cat-b', type: 'category', name: 'Nested', collapsed: true, children: [
                        { id: 'cmd-2', type: 'command', name: 'Lint', content: 'npm run lint', shell: 'git-bash' }
                    ]
                }
            ]
        },
        { id: 'cmd-3', type: 'command', name: 'Root Cmd', content: 'echo root', shell: 'git-bash' }
    ];
    const base = store.load();
    base.customCommandTree = tree;
    assert.strictEqual(store.save(base), true);

    const ConfigStore2 = loadStore(dir);
    const reloaded = ConfigStore2.getInstance().load();
    assert.deepStrictEqual(reloaded.customCommandTree, tree);
});

test('load: corrupted JSON falls back to defaults', () => {
    const dir = makeWorkspace();
    const cfgDir = path.join(dir, '.multi-project-tool');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), '{ not json !!');
    const ConfigStore = loadStore(dir);
    const origErr = console.error;
    console.error = () => {};
    try {
        const cfg = ConfigStore.getInstance().load();
        assert.deepStrictEqual(cfg.customCommandTree, []);
    } finally {
        console.error = origErr;
    }
});

test('save: creates config dir when missing', () => {
    const dir = makeWorkspace();
    const ConfigStore = loadStore(dir);
    const store = ConfigStore.getInstance();
    const cfg = store.load();
    cfg.customCommandTree = [{ id: 'x', type: 'command', name: 'X', content: 'echo x' }];
    assert.strictEqual(store.save(cfg), true);
    assert.ok(fs.existsSync(path.join(dir, '.multi-project-tool', 'config.json')));
});

summary('configStore');
