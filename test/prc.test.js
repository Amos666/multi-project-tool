'use strict';
// Project Row Commands（Set Tab 项目行按钮命令）宿主端集成测试：
// 验证 新增/编辑/删除 → saveAllConfig 落盘 → 重新加载恢复 的完整数据流
require('./vscodeMock');
const { setWorkspace } = require('./vscodeMock');
const { assert, test, summary } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');

console.log('project row commands persistence');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-prc-'));
setWorkspace(dir);

function readConfig() {
    const cfgPath = path.join(dir, '.multi-project-tool', 'config.json');
    if (!fs.existsSync(cfgPath)) { return null; }
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

// ConfigStore 是单例且缓存 configDir，freshProvider 重置模块缓存保证每个 provider 指向 dir
function freshProvider() {
    for (const key of Object.keys(require.cache)) {
        if (key.includes('multi-project-tool') || key.includes(path.join('test', ''))) {
            if (key.endsWith('vscodeMock.js') || key.endsWith('harness.js')) { continue; }
            delete require.cache[key];
        }
    }
    setWorkspace(dir);
    const { MainViewProvider } = require('../out/views/MainViewProvider');
    const provider = new MainViewProvider(Uri.file(dir));
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

(async () => {
    // bootstrap：加载 + 种子落盘 + settings 同步
    await (async () => {
        const { provider, outbound } = freshProvider();
        await new Promise(r => setTimeout(r, 150));
        const settingsMsg = outbound.filter(m => m.command === 'updateSettings');
        test('bootstrap: settings sync reaches webview with prc array', () => {
            assert.ok(settingsMsg.length >= 1, 'updateSettings posted');
            assert.ok(Array.isArray(settingsMsg[settingsMsg.length - 1].settings.projectRowCommands), 'prc array delivered');
        });

        // add：新增空行 → 落盘 + 回发
        outbound.length = 0;
        await provider.handleWebviewMessage({ command: 'addProjectRowCommand' }, 'panel');
        await new Promise(r => setTimeout(r, 30));
        test('add: empty row persisted to config.json', () => {
            const cfg = readConfig();
            assert.ok(cfg, 'config.json exists');
            const emptyRows = cfg.settings.projectRowCommands.filter(c => c.alias === '' && c.command === '');
            assert.strictEqual(emptyRows.length, 1, 'exactly one empty row, got: ' + JSON.stringify(cfg.settings.projectRowCommands));
        });
        test('add: updateSettings re-synced to webview', () => {
            assert.ok(outbound.some(m => m.command === 'updateSettings'), 're-sync posted');
        });

        // update：填 alias → 填 command（真实用户顺序；消息用 row 键避免与外层 command 类型键冲突）
        await provider.handleWebviewMessage({
            command: 'updateProjectRowCommand', index: 2,
            row: { alias: 'Build', command: '', tip: '' }
        }, 'panel');
        test('update: alias persisted', () => {
            assert.strictEqual(readConfig().settings.projectRowCommands[2].alias, 'Build');
        });
        await provider.handleWebviewMessage({
            command: 'updateProjectRowCommand', index: 2,
            row: { alias: 'Build', command: 'npm run build', tip: '' }
        }, 'panel');
        test('update: command persisted with alias kept', () => {
            const row = readConfig().settings.projectRowCommands[2];
            assert.strictEqual(row.command, 'npm run build');
            assert.strictEqual(row.alias, 'Build');
        });

        // saveSettings（不含 prc 字段）不得清空已存数据
        await provider.handleWebviewMessage({
            command: 'saveSettings',
            settings: { autoRefresh: true, logRetention: 50, concurrency: 1, defaultShell: 'git-bash', commandTimeout: 300 }
        }, 'panel');
        test('saveSettings: rows survive settings save without prc payload', () => {
            const row = readConfig().settings.projectRowCommands.find(c => c.alias === 'Build');
            assert.ok(row, 'Build row survives');
        });

        // reload：重新加载恢复
        const { provider: p2, outbound: out2 } = freshProvider();
        await new Promise(r => setTimeout(r, 150));
        test('reload: rows restored from disk', () => {
            const settingsMsg = out2.filter(m => m.command === 'updateSettings');
            const prc = settingsMsg[settingsMsg.length - 1].settings.projectRowCommands;
            const row = prc.find(c => c.alias === 'Build');
            assert.ok(row && row.command === 'npm run build', 'Build row restored: ' + JSON.stringify(prc));
        });

        // delete：删除落盘
        await p2.handleWebviewMessage({ command: 'deleteProjectRowCommand', index: 2 }, 'panel');
        test('delete: row removed from disk', () => {
            assert.ok(!readConfig().settings.projectRowCommands.find(c => c.alias === 'Build'));
        });
    })();

    summary('prc suite');
})().catch(e => { console.error(e); process.exitCode = 1; });
