'use strict';
// Environment Variables（Set Tab）插件级全局文件存储集成测试：
// 1) 增删改 → globalStorageUri/env-variables.json 持久化，工作区 config.json 不含该字段
// 2) 跨 VS Code 实例共享：实例 A 修改 → 实例 B（同一 globalStorage 目录）加载即见
// 3) 一次性迁移：工作区级旧 envVariables → 全局文件，并清除工作区旧字段
// 4) watcher 实时同步：文件变化 → 防抖后内存与 webview 同步；自身写入内容未变不回环
require('./vscodeMock');
const { vscodeMock, setWorkspace } = require('./vscodeMock');
const { assert, test, summary } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uri } = require('vscode');

console.log('env variables global-store cross-instance sync');

// ---- 捕获 env-variables.json 的 FileSystemWatcher 回调（模拟 VS Code 文件监听触发）----
let watcherRecords = [];
const origCreateWatcher = vscodeMock.workspace.createFileSystemWatcher;
vscodeMock.workspace.createFileSystemWatcher = (pattern) => {
    const isEnv = pattern && typeof pattern === 'object' && String(pattern.pattern).includes('env-variables.json');
    const rec = { changeCbs: [], createCbs: [], isEnv };
    watcherRecords.push(rec);
    return {
        onDidChange: (cb) => { rec.changeCbs.push(cb); return { dispose() {} }; },
        onDidCreate: (cb) => { rec.createCbs.push(cb); return { dispose() {} }; },
        onDidDelete: () => ({ dispose() {} }),
        dispose() {}
    };
};
function triggerEnvWatchers() {
    for (const w of watcherRecords) {
        if (w.isEnv) {
            w.changeCbs.forEach(cb => cb());
            w.createCbs.forEach(cb => cb());
        }
    }
}

function mockMemento() {
    const store = new Map();
    return {
        get: (k) => store.get(k),
        update: (k, v) => { store.set(k, v); return Promise.resolve(); }
    };
}

// 共享插件级全局存储目录：模拟同一用户的所有 VS Code 实例
const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-env-global-'));
const envFile = path.join(globalDir, 'env-variables.json');

const wsA = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-env-a-'));
const wsB = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-env-b-'));

function readEnvFile() {
    if (!fs.existsSync(envFile)) { return undefined; }
    return JSON.parse(fs.readFileSync(envFile, 'utf8'));
}

function readWsConfig(wsDir) {
    const cfgPath = path.join(wsDir, '.multi-project-tool', 'config.json');
    if (!fs.existsSync(cfgPath)) { return null; }
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

const outDir = path.resolve(__dirname, '..', 'out');
function clearModuleCache() {
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(outDir + path.sep)) { delete require.cache[key]; }
    }
}

// freshProvider：新 provider 指向指定工作区 + 共享全局存储目录（模拟一个 VS Code 实例）
// 注意：不重置 watcherRecords——旧实例的 watcher 回调保留（模拟多实例并存），
// 各实例回调各自读自己的全局文件并比对内存，互不干扰
function freshProvider(wsDir) {
    clearModuleCache();
    setWorkspace(wsDir);
    const { MainViewProvider } = require('../out/views/MainViewProvider');
    const provider = new MainViewProvider(Uri.file(wsDir), mockMemento(), Uri.file(globalDir));
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
    // ---- 场景 1：全新安装 → 全局文件初始化为空列表 ----
    const ctxA = freshProvider(wsA);
    await sleep(150);
    test('fresh install: global env file initialized to empty list', () => {
        const stored = readEnvFile();
        assert.ok(Array.isArray(stored) && stored.length === 0, 'env-variables.json = []: ' + JSON.stringify(stored));
    });

    // ---- 场景 2：实例 A 添加环境变量 → 只写全局文件，工作区 config 无 env 字段 ----
    const { provider: providerA, outbound: outboundA } = ctxA;
    await providerA.handleWebviewMessage({ command: 'addEnvVariable', variable: { key: 'NODE_ENV', value: 'development' } }, 'panel');
    await providerA.handleWebviewMessage({ command: 'addEnvVariable', variable: { key: 'FOO', value: 'bar' } }, 'panel');
    await providerA.handleWebviewMessage({ command: 'saveSettings', settings: { autoRefresh: true, logRetention: 50, concurrency: 1, defaultShell: 'git-bash', commandTimeout: 300 } }, 'panel');
    test('add: env vars persisted to global file, not workspace config', () => {
        const stored = readEnvFile();
        assert.ok(stored.some(v => v.key === 'NODE_ENV' && v.value === 'development'), 'NODE_ENV in global file: ' + JSON.stringify(stored));
        assert.ok(stored.some(v => v.key === 'FOO'), 'FOO in global file');
        const cfg = readWsConfig(wsA);
        assert.ok(!cfg || !('envVariables' in cfg), 'workspace config has no env field: ' + JSON.stringify(cfg && Object.keys(cfg)));
        assert.ok(outboundA.some(m => m.command === 'updateEnvVariables' && m.variables.some(v => v.key === 'NODE_ENV')), 'webview got updateEnvVariables');
    });

    // ---- 场景 3：跨实例共享 —— 实例 B（同一全局存储目录）加载即见 A 的修改 ----
    const ctxB = freshProvider(wsB);
    await sleep(150);
    test('cross-instance: instance B loads env vars written by instance A', () => {
        assert.ok(ctxB.provider._envVariables.some(v => v.key === 'NODE_ENV'), 'B memory has NODE_ENV: ' + JSON.stringify(ctxB.provider._envVariables));
        assert.ok(ctxB.outbound.some(m => m.command === 'updateEnvVariables' && m.variables.some(v => v.key === 'NODE_ENV')), 'B webview got A vars');
    });

    // ---- 场景 4：一次性迁移 —— 工作区旧 envVariables → 全局文件 + 清除工作区字段 ----
    const wsC = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-env-c-'));
    fs.mkdirSync(path.join(wsC, '.multi-project-tool'), { recursive: true });
    fs.writeFileSync(path.join(wsC, '.multi-project-tool', 'config.json'), JSON.stringify({
        settings: {
            commonParameters: {}, defaultShell: 'git-bash', shortcutShell: 'git-bash',
            autoRefresh: true, logRetention: 50, concurrency: 1, commandTimeout: 300, language: 'en'
        },
        customCommandTree: [],
        envVariables: [{ key: 'LegacyVar', value: 'legacy-val' }]
    }, null, 2));
    // 独立全局目录：模拟"另一台机器/全新全局存储"，避免上方场景污染
    const globalC = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-env-globalc-'));
    clearModuleCache();
    setWorkspace(wsC);
    const { MainViewProvider: MVP2 } = require('../out/views/MainViewProvider');
    const pC = new MVP2(Uri.file(wsC), mockMemento(), Uri.file(globalC));
    const outC = [];
    pC._view = { webview: { postMessage: (m) => { outC.push(m); return Promise.resolve(); }, asWebviewUri: (u) => u, cspSource: '' } };
    await sleep(200);
    test('migration: legacy workspace env vars moved into global file', () => {
        const stored = JSON.parse(fs.readFileSync(path.join(globalC, 'env-variables.json'), 'utf8'));
        assert.ok(stored.some(v => v.key === 'LegacyVar'), 'LegacyVar migrated: ' + JSON.stringify(stored));
    });
    test('migration: legacy field removed from workspace config.json', () => {
        const cfg = readWsConfig(wsC);
        assert.ok(cfg, 'workspace config rewritten');
        assert.ok(!('envVariables' in cfg), 'legacy env field cleaned: ' + JSON.stringify(Object.keys(cfg)));
    });
    test('migration: migrated vars delivered to webview', () => {
        assert.ok(outC.some(m => m.command === 'updateEnvVariables' && m.variables.some(v => v.key === 'LegacyVar')), 'webview got migrated vars');
    });

    // ---- 场景 5：watcher 实时同步 —— 其他实例写文件 → 存活实例 B 防抖后同步 ----
    // 5a) 回环防护：内容未变时触发 watcher，不重复推送
    ctxB.outbound.length = 0;
    triggerEnvWatchers();
    await sleep(450);
    test('watcher: no redundant push when file content unchanged (self-write loop guard)', () => {
        assert.ok(!ctxB.outbound.some(m => m.command === 'updateEnvVariables'), 'no updateEnvVariables on unchanged content');
    });

    // 5b) 其他实例（C'）直接写全局文件 → B 的内存与 webview 同步更新
    fs.writeFileSync(envFile, JSON.stringify([{ key: 'FROM_OTHER', value: 'synced' }], null, 2));
    triggerEnvWatchers();
    await sleep(450);
    test('watcher: external write synced to live instance memory + webview', () => {
        assert.ok(ctxB.provider._envVariables.some(v => v.key === 'FROM_OTHER'), 'B memory synced: ' + JSON.stringify(ctxB.provider._envVariables));
        const msgs = ctxB.outbound.filter(m => m.command === 'updateEnvVariables');
        assert.ok(msgs.length >= 1 && msgs[msgs.length - 1].variables.some(v => v.key === 'FROM_OTHER'), 'B webview pushed latest vars');
    });

    // ---- 场景 6：实例 B update/delete → 全局文件即时更新（实例 A 重启后可见） ----
    const idx = ctxB.provider._envVariables.findIndex(v => v.key === 'FROM_OTHER');
    await ctxB.provider.handleWebviewMessage({ command: 'updateEnvVariable', index: idx, variable: { key: 'FROM_OTHER', value: 'updated' } }, 'panel');
    await ctxB.provider.handleWebviewMessage({ command: 'addEnvVariable', variable: { key: 'TMP', value: 'x' } }, 'panel');
    await ctxB.provider.handleWebviewMessage({ command: 'deleteEnvVariable', index: ctxB.provider._envVariables.findIndex(v => v.key === 'TMP') }, 'panel');
    test('update/delete: global file reflects edits immediately', () => {
        const stored = readEnvFile();
        assert.ok(stored.some(v => v.key === 'FROM_OTHER' && v.value === 'updated'), 'update persisted: ' + JSON.stringify(stored));
        assert.ok(!stored.some(v => v.key === 'TMP'), 'deleted var removed from file');
    });

    const ctxA2 = freshProvider(wsA);
    await sleep(150);
    test('cross-instance: edits from B visible to A after reload', () => {
        assert.ok(ctxA2.provider._envVariables.some(v => v.key === 'FROM_OTHER' && v.value === 'updated'), 'A sees B edits: ' + JSON.stringify(ctxA2.provider._envVariables));
    });

    vscodeMock.workspace.createFileSystemWatcher = origCreateWatcher;
    summary('env global-store suite');
})().catch(e => { console.error(e); process.exitCode = 1; });
