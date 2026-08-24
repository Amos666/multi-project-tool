'use strict';
require('./vscodeMock');
const { assert, testAsync, summary } = require('./harness');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkflowEngine } = require('../out/utils/workflowEngine');

console.log('workflowEngine');

function opts(extra) {
    return Object.assign({
        cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-wfe-')),
        shell: 'git-bash',
        env: 'dev',
        commonParameters: {},
        envVariables: {},
        maxParallel: 4
    }, extra || {});
}

function node(id, cmd, tag, extra) {
    return Object.assign({ id, label: id, tag: tag || 'cmd', x: 0, y: 0, cmd, timeout: 30, failPolicy: 'stop' }, extra || {});
}

async function runOnce(workflow, options) {
    const engine = new WorkflowEngine();
    const events = [];
    await engine.run(workflow, options || opts(), e => events.push(e));
    const done = events.find(e => e.type === 'done');
    const states = {};
    events.filter(e => e.type === 'nodeState').forEach(e => { states[e.nodeId] = e.state; });
    return { events, done, states };
}

(async () => {
    await testAsync('engine: simple command succeeds and streams output', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', 'echo hello-engine')], edges: [] };
        const { done, states, events } = await runOnce(wf);
        assert.strictEqual(done.result, 'success');
        assert.strictEqual(states.a, 'success');
        assert.ok(events.some(e => e.type === 'log' && e.text.indexOf('hello-engine') >= 0), 'stdout captured');
        assert.ok(events.some(e => e.type === 'log' && e.level === 'hdr' && e.text.indexOf('a') >= 0), 'per-node header logged');
        assert.strictEqual(done.nodes.length, 1);
    });

    await testAsync('engine: serial dependency runs upstream first', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('a', 'echo first > order.txt'), node('b', 'echo second >> order.txt')],
            edges: [{ from: 'a', to: 'b' }]
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(done.result, 'success');
        assert.strictEqual(states.a, 'success');
        assert.strictEqual(states.b, 'success');
        const content = fs.readFileSync(path.join(o.cwd, 'order.txt'), 'utf8').trim().split(/\r?\n/);
        assert.deepStrictEqual(content, ['first', 'second']);
    });

    await testAsync('engine: failPolicy=stop aborts downstream (skipped)', async () => {
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('a', 'exit 1'), node('b', 'echo should-not-run')],
            edges: [{ from: 'a', to: 'b' }]
        };
        const { done, states } = await runOnce(wf);
        assert.strictEqual(done.result, 'failed');
        assert.strictEqual(states.a, 'failed');
        assert.strictEqual(states.b, 'skipped');
    });

    await testAsync('engine: failPolicy=skip lets downstream continue', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('a', 'exit 1', 'cmd', { failPolicy: 'skip' }), node('b', 'echo continues > out.txt')],
            edges: [{ from: 'a', to: 'b' }]
        };
        const { states } = await runOnce(wf, o);
        assert.strictEqual(states.a, 'failed');
        assert.strictEqual(states.b, 'success');
        assert.ok(fs.existsSync(path.join(o.cwd, 'out.txt')));
    });

    await testAsync('engine: failPolicy=retry1 retries once and succeeds', async () => {
        const o = opts();
        const cmd = 'if [ -f marker ]; then exit 0; else touch marker; exit 1; fi';
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', cmd, 'cmd', { failPolicy: 'retry1' })], edges: [] };
        const { done, states, events } = await runOnce(wf, o);
        assert.strictEqual(states.a, 'success');
        assert.strictEqual(done.result, 'success');
        assert.ok(events.some(e => e.type === 'log' && /retry/.test(e.text)), 'retry logged');
    });

    await testAsync('engine: timeout kills long-running node', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', 'sleep 5', 'cmd', { timeout: 1 })], edges: [] };
        const { done, states, events } = await runOnce(wf);
        assert.strictEqual(states.a, 'failed');
        assert.strictEqual(done.result, 'failed');
        assert.ok(events.some(e => e.type === 'log' && /Timeout/.test(e.text)), 'timeout logged');
        assert.ok(done.duration < 4000, 'killed before sleep finished');
    });

    await testAsync('engine: ${var} substituted, single-brace literal untouched', async () => {
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('a', "echo v=${VER} raw='{VER}'")],
            edges: []
        };
        const { events } = await runOnce(wf, opts({ commonParameters: { VER: '1.2' } }));
        const line = events.find(e => e.type === 'log' && e.text.indexOf('v=1.2') >= 0);
        assert.ok(line, 'variable substituted');
        assert.ok(line.text.indexOf("raw='{VER}'") >= 0, 'single-brace literal preserved');
    });

    await testAsync('engine: condition true routes pass branch only', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [
                node('c', 'exit 0', 'condition'),
                node('t', 'echo took-true > branch.txt'),
                node('f', 'echo took-false > branch.txt')
            ],
            edges: [{ from: 'c', to: 't', condition: 'true' }, { from: 'c', to: 'f', condition: 'false' }]
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(states.c, 'success');
        assert.strictEqual(states.t, 'success');
        assert.strictEqual(states.f, 'skipped');
        assert.strictEqual(done.result, 'success');
        assert.strictEqual(fs.readFileSync(path.join(o.cwd, 'branch.txt'), 'utf8').trim(), 'took-true');
    });

    await testAsync('engine: condition false routes fail branch, workflow still succeeds', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [
                node('c', 'exit 1', 'condition'),
                node('t', 'echo took-true > branch.txt'),
                node('f', 'echo took-false > branch.txt')
            ],
            edges: [{ from: 'c', to: 't', condition: 'true' }, { from: 'c', to: 'f', condition: 'false' }]
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(states.c, 'failed', 'condition judged false');
        assert.strictEqual(states.t, 'skipped');
        assert.strictEqual(states.f, 'success');
        assert.strictEqual(done.result, 'success', 'condition=false is not a workflow failure');
        assert.strictEqual(fs.readFileSync(path.join(o.cwd, 'branch.txt'), 'utf8').trim(), 'took-false');
    });

    await testAsync('engine: empty condition expression judged false (not silent success)', async () => {
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('c', '', 'condition'), node('f', 'echo fallback')],
            edges: [{ from: 'c', to: 'f', condition: 'false' }]
        };
        const { states } = await runOnce(wf);
        assert.strictEqual(states.c, 'failed');
        assert.strictEqual(states.f, 'success');
    });

    await testAsync('engine: fork/join runs parallel branches', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [
                node('fk', '', 'fork'),
                node('p1', 'echo p1 > p1.txt'),
                node('p2', 'echo p2 > p2.txt'),
                node('jn', '', 'join')
            ],
            edges: [
                { from: 'fk', to: 'p1' }, { from: 'fk', to: 'p2' },
                { from: 'p1', to: 'jn' }, { from: 'p2', to: 'jn' }
            ]
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(done.result, 'success');
        for (const id of ['fk', 'p1', 'p2', 'jn']) { assert.strictEqual(states[id], 'success', id); }
        assert.ok(fs.existsSync(path.join(o.cwd, 'p1.txt')) && fs.existsSync(path.join(o.cwd, 'p2.txt')));
    });

    await testAsync('engine: WB_ENV injected from env option', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', 'echo env=$WB_ENV')], edges: [] };
        const { events } = await runOnce(wf, opts({ env: 'test' }));
        assert.ok(events.some(e => e.type === 'log' && e.text.indexOf('env=test') >= 0));
    });

    await testAsync('engine: envVariables injected into shell env', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', 'echo tok=$MY_TOKEN')], edges: [] };
        const { events } = await runOnce(wf, opts({ envVariables: { MY_TOKEN: 'abc123' } }));
        assert.ok(events.some(e => e.type === 'log' && e.text.indexOf('tok=abc123') >= 0));
    });

    await testAsync('engine: stop() kills running node, unstarted nodes skipped, result stopped', async () => {
        const engine = new WorkflowEngine();
        const events = [];
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('a', 'sleep 5', 'cmd', { timeout: 30 }), node('b', 'echo never')],
            edges: [{ from: 'a', to: 'b' }]
        };
        const p = engine.run(wf, opts(), e => events.push(e));
        await new Promise(r => setTimeout(r, 400));
        assert.ok(engine.isRunning);
        engine.stop();
        await p;
        const done = events.find(e => e.type === 'done');
        const states = {};
        events.filter(e => e.type === 'nodeState').forEach(e => { states[e.nodeId] = e.state; });
        assert.strictEqual(done.result, 'stopped');
        assert.strictEqual(states.b, 'skipped');
        assert.ok(done.duration < 4000);
    });

    await testAsync('engine: second run refused while running', async () => {
        const engine = new WorkflowEngine();
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('a', 'sleep 1')], edges: [] };
        const p1 = engine.run(wf, opts(), () => {});
        await new Promise(r => setTimeout(r, 200));
        let secondDone = false;
        await engine.run({ id: 'w2', name: 'w2', updatedAt: 1, nodes: [node('x', 'echo x')], edges: [] }, opts(), e => {
            if (e.type === 'done') { secondDone = true; }
        });
        assert.strictEqual(secondDone, false, 'concurrent run ignored');
        await p1;
    });

    await testAsync('engine: notify text popup succeeds and logs message', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('n', 'deploy finished', 'notify')], edges: [] };
        const { done, states, events } = await runOnce(wf);
        assert.strictEqual(states.n, 'success');
        assert.strictEqual(done.result, 'success');
        assert.ok(events.some(e => e.type === 'log' && e.text.indexOf('deploy finished') >= 0), 'notify text logged');
    });

    await testAsync('engine: notify cmd executes command', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('n', 'echo notified > notify.txt', 'notify', { notifyType: 'cmd' })],
            edges: []
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(states.n, 'success');
        assert.strictEqual(done.result, 'success');
        assert.strictEqual(fs.readFileSync(path.join(o.cwd, 'notify.txt'), 'utf8').trim(), 'notified');
    });

    await testAsync('engine: notify cmd failure marks node failed', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('n', 'exit 3', 'notify', { notifyType: 'cmd' })], edges: [] };
        const { done, states } = await runOnce(wf);
        assert.strictEqual(states.n, 'failed');
        assert.strictEqual(done.result, 'failed');
    });

    await testAsync('engine: notify http GET succeeds against local server', async () => {
        const http = require('http');
        let hit = false;
        const server = http.createServer((req, res) => { hit = true; res.writeHead(200); res.end('ok'); });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const port = server.address().port;
        try {
            const wf = {
                id: 'w', name: 'w', updatedAt: 1,
                nodes: [node('n', 'http://127.0.0.1:' + port + '/hook?msg=done', 'notify', { notifyType: 'http' })],
                edges: []
            };
            const { done, states, events } = await runOnce(wf);
            assert.strictEqual(states.n, 'success');
            assert.strictEqual(done.result, 'success');
            assert.ok(hit, 'server received the request');
            assert.ok(events.some(e => e.type === 'log' && /HTTP 200/.test(e.text)), 'status logged');
        } finally {
            server.close();
        }
    });

    await testAsync('engine: notify http unreachable port fails', async () => {
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('n', 'http://127.0.0.1:1/hook', 'notify', { notifyType: 'http', timeout: 3 })],
            edges: []
        };
        const { done, states, events } = await runOnce(wf);
        assert.strictEqual(states.n, 'failed');
        assert.strictEqual(done.result, 'failed');
        assert.ok(events.some(e => e.type === 'log' && e.level === 'err' && /HTTP/.test(e.text)), 'error logged');
    });

    await testAsync('engine: notify http invalid URL fails', async () => {
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('n', 'not a url', 'notify', { notifyType: 'http' })], edges: [] };
        const { states } = await runOnce(wf);
        assert.strictEqual(states.n, 'failed');
    });

    await testAsync('engine: ref node runs via host runRef callback', async () => {
        const calls = [];
        const o = opts({
            runRef: (tab, id, log) => {
                calls.push(tab + ':' + id);
                log('info', 'ref output line');
                return Promise.resolve(true);
            }
        });
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('r', '', 'ref', { refTab: 'shortcut', refCommandId: 'c1' })],
            edges: []
        };
        const { done, states, events } = await runOnce(wf, o);
        assert.strictEqual(states.r, 'success');
        assert.strictEqual(done.result, 'success');
        assert.deepStrictEqual(calls, ['shortcut:c1']);
        assert.ok(events.some(e => e.type === 'log' && e.text === 'ref output line'), 'host log forwarded');
    });

    await testAsync('engine: ref failure with stop aborts downstream', async () => {
        const o = opts({ runRef: () => Promise.resolve(false) });
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('r', '', 'ref', { refTab: 'cmd', refCommandId: 'c1' }), node('b', 'echo never')],
            edges: [{ from: 'r', to: 'b' }]
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(states.r, 'failed');
        assert.strictEqual(states.b, 'skipped');
        assert.strictEqual(done.result, 'failed');
    });

    await testAsync('engine: ref retry1 retries host callback once', async () => {
        let n = 0;
        const o = opts({ runRef: () => { n++; return Promise.resolve(n > 1); } });
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('r', '', 'ref', { refTab: 'cmd', refCommandId: 'c1', failPolicy: 'retry1' })],
            edges: []
        };
        const { done, states } = await runOnce(wf, o);
        assert.strictEqual(n, 2, 'called twice');
        assert.strictEqual(states.r, 'success');
        assert.strictEqual(done.result, 'success');
    });

    await testAsync('engine: ref without callback or without command id fails', async () => {
        const wf1 = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('r', '', 'ref', { refTab: 'cmd', refCommandId: 'c1' })],
            edges: []
        };
        const r1 = await runOnce(wf1);
        assert.strictEqual(r1.states.r, 'failed', 'no runRef executor → failed');

        const wf2 = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('r', '', 'ref', { refTab: 'cmd', refCommandId: '' })],
            edges: []
        };
        const r2 = await runOnce(wf2, opts({ runRef: () => Promise.resolve(true) }));
        assert.strictEqual(r2.states.r, 'failed', 'unconfigured ref → failed');
    });

    await testAsync('engine: start node countdown delays downstream start', async () => {
        const o = opts();
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [
                node('s', '', 'start', { scheduleMode: 'countdown', scheduleValue: '2' }),
                node('b', 'echo after > out.txt')
            ],
            edges: [{ from: 's', to: 'b' }]
        };
        const { done, states, events } = await runOnce(wf, o);
        assert.strictEqual(states.s, 'success');
        assert.strictEqual(states.b, 'success');
        assert.strictEqual(done.result, 'success');
        assert.ok(done.duration >= 1900, 'waited the countdown: ' + done.duration);
        assert.ok(events.some(e => e.type === 'log' && /T-2s/.test(e.text)), 'countdown logged');
        assert.ok(fs.existsSync(path.join(o.cwd, 'out.txt')), 'downstream ran after countdown');
    });

    await testAsync('engine: start node fixed time waits until clock', async () => {
        const target = new Date(Date.now() + 3000);
        const p = v => String(v).padStart(2, '0');
        const hhmmss = p(target.getHours()) + ':' + p(target.getMinutes()) + ':' + p(target.getSeconds());
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('s', '', 'start', { scheduleMode: 'clock', scheduleValue: hhmmss })],
            edges: []
        };
        const { done, states, events } = await runOnce(wf);
        assert.strictEqual(states.s, 'success');
        assert.strictEqual(done.result, 'success');
        assert.ok(done.duration >= 1500, 'waited for clock: ' + done.duration);
        assert.ok(events.some(e => e.type === 'log' && /scheduled at/.test(e.text)), 'scheduled time logged');
    });

    await testAsync('engine: start node invalid clock value fails and aborts', async () => {
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('s', '', 'start', { scheduleMode: 'clock', scheduleValue: '25:99' }), node('b', 'echo never')],
            edges: [{ from: 's', to: 'b' }]
        };
        const { done, states } = await runOnce(wf);
        assert.strictEqual(states.s, 'failed');
        assert.strictEqual(states.b, 'skipped');
        assert.strictEqual(done.result, 'failed');
    });

    await testAsync('engine: confirm node approved continues workflow', async () => {
        const o = opts();
        const engine = new WorkflowEngine();
        const events = [];
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [
                node('c', 'deploy to prod?', 'confirm'),
                node('b', 'echo approved > out.txt')
            ],
            edges: [{ from: 'c', to: 'b' }]
        };
        const p = engine.run(wf, o, e => {
            events.push(e);
            if (e.type === 'confirm') { setTimeout(() => engine.respondConfirm(true), 100); }
        });
        await p;
        const done = events.find(e => e.type === 'done');
        const states = {};
        events.filter(e => e.type === 'nodeState').forEach(e => { states[e.nodeId] = e.state; });
        const confirmEv = events.find(e => e.type === 'confirm');
        assert.ok(confirmEv && confirmEv.text === 'deploy to prod?', 'confirm event carries message');
        assert.strictEqual(states.c, 'success');
        assert.strictEqual(states.b, 'success');
        assert.strictEqual(done.result, 'success');
        assert.ok(fs.existsSync(path.join(o.cwd, 'out.txt')));
    });

    await testAsync('engine: confirm node cancelled stops workflow', async () => {
        const engine = new WorkflowEngine();
        const events = [];
        const wf = {
            id: 'w', name: 'w', updatedAt: 1,
            nodes: [node('c', 'sure?', 'confirm'), node('b', 'echo never')],
            edges: [{ from: 'c', to: 'b' }]
        };
        const p = engine.run(wf, opts(), e => {
            events.push(e);
            if (e.type === 'confirm') { setTimeout(() => engine.respondConfirm(false), 100); }
        });
        await p;
        const done = events.find(e => e.type === 'done');
        const states = {};
        events.filter(e => e.type === 'nodeState').forEach(e => { states[e.nodeId] = e.state; });
        assert.strictEqual(states.c, 'failed');
        assert.strictEqual(states.b, 'skipped');
        assert.strictEqual(done.result, 'stopped', 'cancel stops the flow');
    });

    await testAsync('engine: stop() while waiting for confirm resolves as stopped', async () => {
        const engine = new WorkflowEngine();
        const events = [];
        const wf = { id: 'w', name: 'w', updatedAt: 1, nodes: [node('c', 'wait', 'confirm')], edges: [] };
        const p = engine.run(wf, opts(), e => {
            events.push(e);
            if (e.type === 'confirm') { setTimeout(() => engine.stop(), 100); }
        });
        await p;
        const done = events.find(e => e.type === 'done');
        assert.strictEqual(done.result, 'stopped');
    });

    summary('workflowEngine');
})();
