'use strict';
// Project Row Commands（Set Tab 项目行按钮命令）插件级全局存储集成测试：
// 1) 增删改 → context.globalState 持久化，工作区 config.json 不含该字段
// 2) 跨工作区共享：不同工作区共用同一份全局配置
// 3) 一次性迁移：工作区级旧配置 → 全局存储，并清除工作区旧字段
// 4) 重启恢复 / saveSettings 兼容路径
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');

console.log('project row commands global-state persistence');

// 内存 Memento：模拟 context.globalState（插件级全局存储，跨工作区共享）
function mockMemento() {
    const store = new Map();
    return {
        store,
        get: (k) => store.get(k),
        update: (k, v) => { store.set(k, v); return Promise.resolve(); }
    };
}

// 共享 memento：模拟同一用户的所有工作区窗口
const sharedMemento = mockMemento();

const wsA = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-prc-a-'));
const wsB = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-prc-b-'));

function readWsConfig(wsDir) {
    const cfgPath = path.join(wsDir, '.multi-project-tool', 'config.json');
    if (!fs.existsSync(cfgPath)) { return null; }
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

// ConfigStore 单例缓存 configDir，freshProvider 重置模块缓存让新 provider 指向指定工作区
function freshProvider(wsDir) {
    for (const key of Object.keys(require.cache)) {
        if (key.endsWith('vscodeMock.js') || key.endsWith('harness.js')) { continue; }
        if (key.includes(path.join('test', 'vscodeMock')) || key.includes(path.join('test', 'harness'))) { continue; }
        if (key.includes('multi-project-tool') && !key.includes(path.join('test', 'prc.test.js'))) {
            delete require.cache[key];
        }
    }
    setWorkspace(wsDir);
    const { MainViewProvider } = require('../out/views/MainViewProvider');
    const provider = new MainViewProvider(Uri.file(wsDir), sharedMemento);
    const outbound = [];
    provider._view = {
        webview: {
            postMessage: (msg) => { outbound.push(msg); return Promise.resolve(); },
            asWebviewUri: (u) => u,
            cspSource: ''
        }
    };
    return { provider, outbound };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    // ---- 场景 1：全新安装 → 默认种子写入全局存储 ----
    let ctx = freshProvider(wsA);
    await sleep(150);
    test('fresh install: defaults seeded into global state, not workspace config', () => {
        const seeded = sharedMemento.get('projectRowCommands');
        assert.ok(Array.isArray(seeded) && seeded.length >= 2, 'defaults in globalState: ' + JSON.stringify(seeded));
        const cfg = readWsConfig(wsA);
        assert.ok(!cfg || !('projectRowCommands' in cfg.settings), 'workspace config has no prc field');
    });

    // ---- 场景 2：add + update → 只写全局存储 ----
    const { provider } = ctx;
    await provider.handleWebviewMessage({ command: 'addProjectRowCommand' }, 'panel');
    const seededCount = sharedMemento.get('projectRowCommands').length;
    await provider.handleWebviewMessage({
        command: 'updateProjectRowCommand', index: seededCount - 1,
        row: { alias: 'Build', command: 'npm run build', tip: '' }
    }, 'panel');
    test('add+update: rows persisted to global state', () => {
        const prc = sharedMemento.get('projectRowCommands');
        const row = prc.find(c => c.alias === 'Build');
        assert.ok(row && row.command === 'npm run build', 'Build row in globalState: ' + JSON.stringify(prc));
    });

    // ---- 场景 3：saveSettings（其他设置）→ 工作区 config.json 不含 prc ----
    await provider.handleWebviewMessage({
        command: 'saveSettings',
        settings: { autoRefresh: true, logRetention: 50, concurrency: 1, defaultShell: 'git-bash', commandTimeout: 300 }
    }, 'panel');
    test('saveSettings: workspace config.json written WITHOUT prc field', () => {
        const cfg = readWsConfig(wsA);
        assert.ok(cfg, 'workspace config exists');
        assert.ok(!('projectRowCommands' in cfg.settings), 'no prc field in workspace settings: ' + JSON.stringify(Object.keys(cfg.settings)));
        // 全局数据不受影响
        assert.ok(sharedMemento.get('projectRowCommands').some(c => c.alias === 'Build'), 'global prc untouched');
    });

    // ---- 场景 4：跨工作区共享 —— 另一工作区直接读到同一份配置 ----
    const ctxB = freshProvider(wsB);
    await sleep(150);
    test('cross-workspace: workspace B shares the same prc config', () => {
        const settingsMsg = ctxB.outbound.filter(m => m.command === 'updateSettings');
        assert.ok(settingsMsg.length >= 1, 'updateSettings posted to B');
        const prc = settingsMsg[settingsMsg.length - 1].settings.projectRowCommands;
        assert.ok(prc.some(c => c.alias === 'Build'), 'B sees Build row from global state: ' + JSON.stringify(prc));
    });

    // B 中修改 → A 重启后也能看到（全局生效）
    await ctxB.provider.handleWebviewMessage({
        command: 'updateProjectRowCommand', index: 0,
        row: { alias: 'SharedEdit', command: 'echo shared', tip: '' }
    }, 'panel');
    const ctxA2 = freshProvider(wsA);
    await sleep(150);
    test('cross-workspace: edit in B visible to A after reload', () => {
        const settingsMsg = ctxA2.outbound.filter(m => m.command === 'updateSettings');
        const prc = settingsMsg[settingsMsg.length - 1].settings.projectRowCommands;
        assert.ok(prc.some(c => c.alias === 'SharedEdit'), 'A sees edit made in B: ' + JSON.stringify(prc));
    });

    // ---- 场景 5：一次性迁移 —— 预置工作区旧配置 → 迁入全局并清除工作区字段 ----
    const wsC = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-prc-c-'));
    fs.mkdirSync(path.join(wsC, '.multi-project-tool'), { recursive: true });
    const legacy = [
        { id: 'l1', alias: 'LegacyOpen', command: 'explorer ${projectPath}', tip: '' },
        { id: 'l2', alias: 'LegacyGit', command: 'git status', tip: '' }
    ];
    fs.writeFileSync(path.join(wsC, '.multi-project-tool', 'config.json'), JSON.stringify({
        settings: {
            commonParameters: {}, defaultShell: 'git-bash', shortcutShell: 'git-bash',
            autoRefresh: true, logRetention: 50, concurrency: 1, commandTimeout: 300,
            language: 'en', projectRowCommands: legacy
        },
        customCommandTree: [], envVariables: []
    }, null, 2));

    // 独立 memento 模拟"另一台机器/全新全局存储"，避免上方场景污染
    const migrateMemento = mockMemento();
    for (const key of Object.keys(require.cache)) {
        if (key.includes('multi-project-tool') && !key.includes(path.join('test', 'prc.test.js'))) {
            if (key.endsWith('vscodeMock.js') || key.endsWith('harness.js')) { continue; }
            delete require.cache[key];
        }
    }
    setWorkspace(wsC);
    const { MainViewProvider: MVP2 } = require('../out/views/MainViewProvider');
    const pC = new MVP2(Uri.file(wsC), migrateMemento);
    const outC = [];
    pC._view = { webview: { postMessage: (m) => { outC.push(m); return Promise.resolve(); }, asWebviewUri: (u) => u, cspSource: '' } };
    await sleep(200);
    test('migration: legacy workspace prc moved into global state', () => {
        const prc = migrateMemento.get('projectRowCommands');
        assert.ok(Array.isArray(prc) && prc.some(c => c.alias === 'LegacyOpen'), 'legacy rows migrated: ' + JSON.stringify(prc));
    });
    test('migration: legacy field removed from workspace config.json', () => {
        const cfg = readWsConfig(wsC);
        assert.ok(cfg, 'workspace config rewritten');
        assert.ok(!('projectRowCommands' in cfg.settings), 'legacy prc field cleaned: ' + JSON.stringify(Object.keys(cfg.settings)));
    });
    test('migration: migrated rows delivered to webview', () => {
        const settingsMsg = outC.filter(m => m.command === 'updateSettings');
        const prc = settingsMsg[settingsMsg.length - 1].settings.projectRowCommands;
        assert.ok(prc.some(c => c.alias === 'LegacyGit'), 'webview got migrated rows');
    });

    // ---- 场景 6：saveSettings 携带 prc → 写入全局存储（兼容路径） ----
    await pC.handleWebviewMessage({
        command: 'saveSettings',
        settings: {
            autoRefresh: true, logRetention: 50, concurrency: 1, defaultShell: 'git-bash', commandTimeout: 300,
            projectRowCommands: [{ id: 's1', alias: 'FromSave', command: 'echo x', tip: '' }]
        }
    }, 'panel');
    test('saveSettings with prc payload: written to global state', () => {
        const prc = migrateMemento.get('projectRowCommands');
        assert.ok(prc.some(c => c.alias === 'FromSave'), 'saveSettings prc stored globally');
    });

    // ---- 场景 7：delete → 全局更新 + reload 恢复 ----
    await pC.handleWebviewMessage({ command: 'deleteProjectRowCommand', index: 0 }, 'panel');
    test('delete: row removed from global state', () => {
        assert.ok(!migrateMemento.get('projectRowCommands').some(c => c.alias === 'LegacyOpen' || c.alias === 'FromSave'), 'first row deleted');
    });

    summary('prc global-state suite');
})().catch(e => { console.error(e); process.exitCode = 1; });
