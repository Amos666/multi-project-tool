'use strict';
const { assert, test, summary } = require('./harness');
const {
    sanitizeTree,
    legacyCommandsToTree,
    migrateConfig,
    findNodeById,
    DEFAULT_CATEGORY_NAME,
    DEFAULT_CATEGORY_ID
} = require('../out/utils/configMigration');

console.log('configMigration');

test('sanitizeTree: non-array input returns empty array', () => {
    assert.deepStrictEqual(sanitizeTree(null), []);
    assert.deepStrictEqual(sanitizeTree(undefined), []);
    assert.deepStrictEqual(sanitizeTree('x'), []);
    assert.deepStrictEqual(sanitizeTree({}), []);
});

test('sanitizeTree: drops invalid nodes, keeps valid ones', () => {
    const input = [
        null,
        42,
        { type: 'bogus', name: 'x' },
        { type: 'command' },
        { type: 'category', name: '' },
        { type: 'command', name: 'ok', content: 'echo hi' },
        { type: 'category', name: 'cat', children: [{ type: 'command', name: 'inner', content: 'ls' }] }
    ];
    const out = sanitizeTree(input);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].type, 'command');
    assert.strictEqual(out[0].name, 'ok');
    assert.strictEqual(out[1].type, 'category');
    assert.strictEqual(out[1].children.length, 1);
    assert.strictEqual(out[1].children[0].name, 'inner');
});

test('sanitizeTree: fills defaults (id, content, collapsed)', () => {
    const out = sanitizeTree([
        { type: 'command', name: 'c1' },
        { type: 'category', name: 'k1' },
        { type: 'category', name: 'k2', collapsed: true, id: 'keep-me' }
    ]);
    assert.ok(typeof out[0].id === 'string' && out[0].id.length > 0);
    assert.strictEqual(out[0].content, '');
    assert.strictEqual(out[1].collapsed, false);
    assert.deepStrictEqual(out[1].children, []);
    assert.strictEqual(out[2].id, 'keep-me');
    assert.strictEqual(out[2].collapsed, true);
});

test('sanitizeTree: command with non-string content becomes empty string', () => {
    const out = sanitizeTree([{ type: 'command', name: 'c', content: 123 }]);
    assert.strictEqual(out[0].content, '');
});

test('sanitizeTree: missing shell defaults to git-bash (legacy data)', () => {
    const out = sanitizeTree([{ type: 'command', name: 'c', content: 'echo 1' }]);
    assert.strictEqual(out[0].shell, 'git-bash');
});

test('sanitizeTree: valid shell is preserved', () => {
    const out = sanitizeTree([
        { type: 'command', name: 'c1', content: 'x', shell: 'cmd' },
        { type: 'command', name: 'c2', content: 'x', shell: 'powershell' },
        { type: 'command', name: 'c3', content: 'x', shell: 'wsl' }
    ]);
    assert.strictEqual(out[0].shell, 'cmd');
    assert.strictEqual(out[1].shell, 'powershell');
    assert.strictEqual(out[2].shell, 'wsl');
});

test('sanitizeTree: invalid shell falls back to git-bash, nested nodes covered', () => {
    const out = sanitizeTree([
        { type: 'command', name: 'bad', content: 'x', shell: 'fish' },
        { type: 'category', name: 'k', children: [{ type: 'command', name: 'inner', content: 'y' }] }
    ]);
    assert.strictEqual(out[0].shell, 'git-bash');
    assert.strictEqual(out[1].children[0].shell, 'git-bash');
});

test('legacyCommandsToTree: legacy commands with shell keep their type', () => {
    const tree = legacyCommandsToTree([{ id: '1', alias: 'A', content: 'dir', shell: 'cmd' }]);
    assert.strictEqual(tree[0].children[0].shell, 'cmd');
});

test('legacyCommandsToTree: empty/invalid input returns empty tree', () => {
    assert.deepStrictEqual(legacyCommandsToTree([]), []);
    assert.deepStrictEqual(legacyCommandsToTree(null), []);
    assert.deepStrictEqual(legacyCommandsToTree([{ id: 'x' }]), []);
});

test('legacyCommandsToTree: wraps flat commands into Default category', () => {
    const legacy = [
        { id: 'a1', alias: 'Build', content: 'npm run build' },
        { id: 'a2', alias: 'Test', content: 'npm test' },
        { id: 'bad' }
    ];
    const tree = legacyCommandsToTree(legacy);
    assert.strictEqual(tree.length, 1);
    const cat = tree[0];
    assert.strictEqual(cat.id, DEFAULT_CATEGORY_ID);
    assert.strictEqual(cat.type, 'category');
    assert.strictEqual(cat.name, DEFAULT_CATEGORY_NAME);
    assert.strictEqual(cat.collapsed, false);
    assert.strictEqual(cat.children.length, 2);
    assert.deepStrictEqual(cat.children[0], { id: 'a1', type: 'command', name: 'Build', content: 'npm run build', shell: 'git-bash' });
    assert.deepStrictEqual(cat.children[1], { id: 'a2', type: 'command', name: 'Test', content: 'npm test', shell: 'git-bash' });
});

test('migrateConfig: new-format tree wins, migrated=false', () => {
    const cfg = {
        customCommandTree: [{ type: 'category', name: 'Mine', id: 'c1', children: [] }],
        customCommands: [{ id: 'old', alias: 'Old', content: 'x' }]
    };
    const res = migrateConfig(cfg);
    assert.strictEqual(res.migrated, false);
    assert.strictEqual(res.customCommandTree.length, 1);
    assert.strictEqual(res.customCommandTree[0].name, 'Mine');
});

test('migrateConfig: legacy flat array migrates, migrated=true', () => {
    const res = migrateConfig({ customCommands: [{ id: '1', alias: 'A', content: 'echo a' }] });
    assert.strictEqual(res.migrated, true);
    assert.strictEqual(res.customCommandTree[0].name, DEFAULT_CATEGORY_NAME);
    assert.strictEqual(res.customCommandTree[0].children[0].name, 'A');
});

test('migrateConfig: no data at all -> empty tree, migrated=false', () => {
    const res = migrateConfig({});
    assert.strictEqual(res.migrated, false);
    assert.deepStrictEqual(res.customCommandTree, []);
    const res2 = migrateConfig(null);
    assert.strictEqual(res2.migrated, false);
    assert.deepStrictEqual(res2.customCommandTree, []);
});

test('migrateConfig: empty legacy array is not flagged as migrated', () => {
    const res = migrateConfig({ customCommands: [] });
    assert.strictEqual(res.migrated, false);
    assert.deepStrictEqual(res.customCommandTree, []);
});

test('findNodeById: finds top-level, nested, returns undefined when missing', () => {
    const tree = [
        { id: 'r1', type: 'command', name: 'root cmd', content: '' },
        {
            id: 'c1', type: 'category', name: 'cat', collapsed: false, children: [
                { id: 'n1', type: 'command', name: 'nested', content: 'x' },
                {
                    id: 'c2', type: 'category', name: 'sub', collapsed: false, children: [
                        { id: 'deep', type: 'command', name: 'deep cmd', content: 'y' }
                    ]
                }
            ]
        }
    ];
    assert.strictEqual(findNodeById(tree, 'r1').name, 'root cmd');
    assert.strictEqual(findNodeById(tree, 'n1').name, 'nested');
    assert.strictEqual(findNodeById(tree, 'deep').name, 'deep cmd');
    assert.strictEqual(findNodeById(tree, 'nope'), undefined);
});

summary('configMigration');
