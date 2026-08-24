import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Workflow, WfNode, WfEdge, HistoryNodeResult, RunResult } from '../webviews/workbench/workbenchTypes';

export interface WorkflowEngineOptions {
    cwd: string;
    /** git-bash / cmd / powershell / wsl */
    shell: string;
    /** dev / test / prod，注入 WB_ENV */
    env: string;
    commonParameters: Record<string, any>;
    envVariables: Record<string, string>;
    /** 并行上限 */
    maxParallel: number;
    /** ref 节点执行器：由宿主提供，按 (tab, commandId) 执行各页签已保存命令，返回成败 */
    runRef?: (tab: string, commandId: string, log: (level: 'info' | 'ok' | 'err' | 'dim' | 'hdr', text: string) => void) => Promise<boolean>;
}

export type WorkflowEngineEvent =
    | { type: 'nodeState'; nodeId: string; state: 'running' | 'success' | 'failed' | 'skipped'; dur?: number }
    | { type: 'log'; nodeId: string; level: 'info' | 'ok' | 'err' | 'dim' | 'hdr'; text: string }
    | { type: 'confirm'; nodeId: string; text: string }
    | { type: 'done'; result: RunResult; duration: number; nodes: HistoryNodeResult[] };

type NodeState = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * 工作流执行引擎：DAG 拓扑调度、Fork/Join 真并行、失败策略、超时 kill。
 * 与批量执行共用（批量执行转换为线性/并行工作流后走同一引擎）。
 */
export class WorkflowEngine {
    private _running = false;
    private _stopFlag = false;
    private _abort = false;
    private _children: Set<cp.ChildProcess> = new Set();
    private _confirmResolver: ((approved: boolean) => void) | null = null;

    public get isRunning(): boolean { return this._running; }

    public stop(): void {
        if (!this._running) { return; }
        this._stopFlag = true;
        this._children.forEach(child => this.killTree(child));
        if (this._confirmResolver) {
            const resolve = this._confirmResolver;
            this._confirmResolver = null;
            resolve(false);
        }
    }

    /** 人工确认节点的应答：宿主收到用户"继续/取消"后调用 */
    public respondConfirm(approved: boolean): void {
        if (!this._confirmResolver) { return; }
        const resolve = this._confirmResolver;
        this._confirmResolver = null;
        resolve(approved);
    }

    /** 杀整个进程组（detached spawn），避免脚本的子孙进程存活 */
    private killTree(child: cp.ChildProcess): void {
        try {
            if (process.platform !== 'win32' && child.pid) {
                process.kill(-child.pid, 'SIGTERM');
            } else {
                child.kill();
            }
        } catch { /* ignore */ }
    }

    public async run(workflow: Workflow, options: WorkflowEngineOptions, emit: (e: WorkflowEngineEvent) => void): Promise<void> {
        if (this._running) { return; }
        this._running = true;
        this._stopFlag = false;
        this._abort = false;

        const nodes = workflow.nodes;
        const edges = workflow.edges.filter(e => nodes.some(n => n.id === e.from) && nodes.some(n => n.id === e.to));
        const states: Record<string, NodeState> = {};
        const durs: Record<string, number> = {};
        const edgeActivated: boolean[] = edges.map(() => false);
        nodes.forEach(n => { states[n.id] = 'pending'; });

        const inMap: Record<string, string[]> = {};
        const inEdges: Record<string, number[]> = {};
        nodes.forEach(n => { inMap[n.id] = []; inEdges[n.id] = []; });
        edges.forEach((e, i) => { inMap[e.to].push(e.from); inEdges[e.to].push(i); });

        // 简单并发信号量
        let slots = Math.max(1, options.maxParallel);
        const waiters: Array<() => void> = [];
        const acquire = (): Promise<void> => {
            if (slots > 0) { slots--; return Promise.resolve(); }
            return new Promise(res => waiters.push(res));
        };
        const release = (): void => {
            const next = waiters.shift();
            if (next) { next(); } else { slots++; }
        };

        const t0 = Date.now();
        const byId = (id: string) => nodes.find(n => n.id === id);

        const setNodeState = (id: string, state: NodeState, dur?: number) => {
            states[id] = state;
            if (dur !== undefined) { durs[id] = dur; }
            emit({ type: 'nodeState', nodeId: id, state: state as any, dur });
        };

        const log = (nodeId: string, level: 'info' | 'ok' | 'err' | 'dim' | 'hdr', text: string) => {
            emit({ type: 'log', nodeId, level, text });
        };

        /** 判断边是否激活（上游完成后调用） */
        const activateOutEdges = (node: WfNode, exprResult?: boolean) => {
            edges.forEach((e, i) => {
                if (e.from !== node.id) { return; }
                if (node.tag === 'condition' && e.condition) {
                    edgeActivated[i] = (e.condition === 'true') === !!exprResult;
                } else if (states[node.id] === 'success') {
                    edgeActivated[i] = true;
                } else if (states[node.id] === 'failed' && node.failPolicy === 'skip') {
                    edgeActivated[i] = true;
                } else {
                    edgeActivated[i] = false;
                }
            });
        };

        const executeNode = async (node: WfNode): Promise<void> => {
            const start = Date.now();
            setNodeState(node.id, 'running');
            log(node.id, 'hdr', `━━ ▶ ${node.label} [${node.tag}] ━━`);

            if (node.tag === 'fork') {
                log(node.id, 'dim', `[Fork] ${node.label} → start parallel branches`);
                await this.delay(120);
                setNodeState(node.id, 'success', Date.now() - start);
                return;
            }
            if (node.tag === 'start') {
                const mode = node.scheduleMode || 'none';
                if (mode === 'countdown') {
                    const secs = Math.max(0, Math.floor(Number(node.scheduleValue)) || 0);
                    log(node.id, 'info', `[Start] countdown ${secs}s → auto start`);
                    for (let s = secs; s > 0; s--) {
                        if (this._stopFlag || this._abort) { setNodeState(node.id, 'skipped', 0); return; }
                        if (s === secs || s <= 3 || s % 10 === 0) { log(node.id, 'dim', `[Start] T-${s}s`); }
                        await this.delay(1000);
                    }
                } else if (mode === 'clock') {
                    const target = this.nextClockTime(node.scheduleValue || '');
                    if (!target) {
                        log(node.id, 'err', `[Start] ${node.label}: invalid time "${node.scheduleValue}", expect HH:MM or HH:MM:SS`);
                        setNodeState(node.id, 'failed', Date.now() - start);
                        if (node.failPolicy === 'stop') { this._abort = true; }
                        return;
                    }
                    log(node.id, 'info', `[Start] scheduled at ${this.fmtClock(target)} → auto start`);
                    while (Date.now() < target.getTime()) {
                        if (this._stopFlag || this._abort) { setNodeState(node.id, 'skipped', 0); return; }
                        const remain = Math.ceil((target.getTime() - Date.now()) / 1000);
                        if (remain <= 5 || remain % 15 === 0) { log(node.id, 'dim', `[Start] T-${remain}s`); }
                        await this.delay(Math.min(1000, Math.max(50, target.getTime() - Date.now())));
                    }
                }
                log(node.id, 'ok', `[Start] ${node.label} → go`);
                setNodeState(node.id, 'success', Date.now() - start);
                return;
            }
            if (node.tag === 'confirm') {
                const text = this.resolveVariables(node.cmd || '', options.commonParameters).trim() || node.label;
                log(node.id, 'info', `[Confirm] waiting for user approval: ${text}`);
                emit({ type: 'confirm', nodeId: node.id, text });
                const approved = await new Promise<boolean>(resolve => { this._confirmResolver = resolve; });
                if (approved) {
                    log(node.id, 'ok', `[Confirm] approved → continue workflow`);
                    setNodeState(node.id, 'success', Date.now() - start);
                } else {
                    this._stopFlag = true;
                    this._children.forEach(child => this.killTree(child));
                    log(node.id, 'err', `[Confirm] cancelled by user → workflow stopped`);
                    setNodeState(node.id, 'failed', Date.now() - start);
                }
                return;
            }
            if (node.tag === 'join') {
                log(node.id, 'dim', `[Join] ${node.label} → all upstream branches done`);
                await this.delay(120);
                setNodeState(node.id, 'success', Date.now() - start);
                return;
            }
            if (node.tag === 'notify') {
                const content = this.resolveVariables(node.cmd || '', options.commonParameters).trim();
                const notifyType = node.notifyType || 'text';
                let ok = true;
                if (notifyType === 'http') {
                    if (!content) {
                        log(node.id, 'err', `[Notify] ${node.label}: empty URL`);
                        ok = false;
                    } else {
                        log(node.id, 'dim', `[Notify] HTTP GET ${content}`);
                        ok = await this.httpNotify(node, content, (level, text) => log(node.id, level, text));
                    }
                } else if (notifyType === 'cmd') {
                    if (!content) {
                        log(node.id, 'err', `[Notify] ${node.label}: empty command`);
                        ok = false;
                    } else {
                        log(node.id, 'dim', `[Notify] exec → ${content.split('\n')[0]}`);
                        await acquire();
                        try {
                            ok = await this.execShell(node, content, options, (level, text) => log(node.id, level, text));
                        } finally {
                            release();
                        }
                    }
                } else {
                    const text = content || node.label;
                    log(node.id, 'info', `[Notify] ${text}`);
                    vscode.window.showInformationMessage(`📢 ${text}`);
                    await this.delay(120);
                }
                setNodeState(node.id, ok ? 'success' : 'failed', Date.now() - start);
                return;
            }
            if (node.tag === 'ref') {
                await acquire();
                try {
                    if (this._stopFlag || this._abort) {
                        setNodeState(node.id, 'skipped', 0);
                        return;
                    }
                    const attempt = async (): Promise<boolean> => {
                        if (!options.runRef) {
                            log(node.id, 'err', '[Ref] executor not available in this host');
                            return false;
                        }
                        if (!node.refTab || !node.refCommandId) {
                            log(node.id, 'err', `[Ref] ${node.label}: no command referenced`);
                            return false;
                        }
                        return options.runRef(node.refTab, node.refCommandId, (level, text) => log(node.id, level, text));
                    };
                    let ok = await attempt();
                    if (!ok && node.failPolicy === 'retry1' && !this._stopFlag) {
                        log(node.id, 'dim', '[Engine] failPolicy=retry1 → retry once');
                        await this.delay(500);
                        ok = await attempt();
                        if (ok) { log(node.id, 'ok', '[Engine] retry succeeded'); }
                    }
                    if (ok) {
                        setNodeState(node.id, 'success', Date.now() - start);
                    } else {
                        setNodeState(node.id, 'failed', Date.now() - start);
                        if (node.failPolicy === 'stop') {
                            this._abort = true;
                            log(node.id, 'err', '[Engine] failPolicy=stop → abort workflow, pending nodes will be skipped');
                        } else if (node.failPolicy === 'skip') {
                            log(node.id, 'dim', '[Engine] failPolicy=skip → downstream continues');
                        }
                    }
                } finally {
                    release();
                }
                return;
            }

            // cmd / condition：真实执行 shell 命令
            await acquire();
            try {
                if (this._stopFlag || this._abort) {
                    setNodeState(node.id, 'skipped', 0);
                    return;
                }
                const command = this.resolveVariables(node.cmd || '', options.commonParameters);
                if (!command.trim()) {
                    if (node.tag === 'condition') {
                        log(node.id, 'err', `[Condition] ${node.label}: empty expression → treated as false`);
                        setNodeState(node.id, 'failed', Date.now() - start);
                        return;
                    }
                    log(node.id, 'dim', `[Skip] ${node.label}: empty command`);
                    setNodeState(node.id, 'success', Date.now() - start);
                    return;
                }
                log(node.id, 'dim', `$ ${command.split('\n')[0]}`);

                const attempt = async (): Promise<boolean> => {
                    const r = await this.execShell(node, command, options, (level, text) => log(node.id, level, text));
                    return r;
                };

                let ok = await attempt();
                if (!ok && node.failPolicy === 'retry1' && !this._stopFlag) {
                    log(node.id, 'dim', '[Engine] failPolicy=retry1 → retry once');
                    await this.delay(500);
                    ok = await attempt();
                    if (ok) { log(node.id, 'ok', '[Engine] retry succeeded'); }
                }

                if (ok) {
                    setNodeState(node.id, 'success', Date.now() - start);
                    if (node.tag === 'condition') { log(node.id, 'ok', `[Condition] ${node.label} = true → pass branch`); }
                } else {
                    setNodeState(node.id, 'failed', Date.now() - start);
                    if (node.tag === 'condition') {
                        // 条件判定为 false 属正常分支路由，不触发失败策略中止
                        log(node.id, 'err', `[Condition] ${node.label} = false → fail branch`);
                    } else if (node.failPolicy === 'stop') {
                        this._abort = true;
                        log(node.id, 'err', '[Engine] failPolicy=stop → abort workflow, pending nodes will be skipped');
                    } else if (node.failPolicy === 'skip') {
                        log(node.id, 'dim', '[Engine] failPolicy=skip → downstream continues');
                    }
                }
            } finally {
                release();
            }
        };

        // 每个节点一个 promise，等待全部上游完成（DAG 天然支持并行）
        const promises: Record<string, Promise<void>> = {};
        // 拓扑排序保证上游 promise 先创建
        const order = this.topoSort(nodes, edges);
        for (const id of order) {
            const node = byId(id);
            if (!node) { continue; }
            promises[id] = (async () => {
                await Promise.all(inMap[id].map(up => promises[up]));
                if (this._stopFlag || this._abort) {
                    setNodeState(id, 'skipped', 0);
                    return;
                }
                // 至少一条入边被激活才执行；无入边的起始节点直接执行
                const activated = inEdges[id].length === 0 || inEdges[id].some(i => edgeActivated[i]);
                if (!activated) {
                    setNodeState(id, 'skipped', 0);
                    log(id, 'dim', `[Skip] ${node.label}: branch not taken`);
                    return;
                }
                await executeNode(node);
                if (node.tag === 'condition') {
                    activateOutEdges(node, states[id] === 'success');
                } else {
                    activateOutEdges(node);
                }
            })();
        }

        await Promise.all(Object.values(promises));

        const duration = Date.now() - t0;
        let result: RunResult;
        // 条件节点的 failed 仅代表判定为 false（走失败分支），不算工作流失败
        const hasRealFailure = nodes.some(n => states[n.id] === 'failed' && n.tag !== 'condition');
        if (this._stopFlag) { result = 'stopped'; }
        else if (hasRealFailure) { result = 'failed'; }
        else { result = 'success'; }

        const nodeResults: HistoryNodeResult[] = nodes
            .filter(n => states[n.id] === 'success' || states[n.id] === 'failed' || states[n.id] === 'skipped')
            .map(n => ({ id: n.id, label: n.label, state: states[n.id] as any, dur: durs[n.id] || 0 }));

        this._running = false;
        emit({ type: 'done', result, duration, nodes: nodeResults });
    }

    /** Kahn 拓扑排序；若有意外环路则退回按 x 坐标排序 */
    private topoSort(nodes: WfNode[], edges: WfEdge[]): string[] {
        const indeg: Record<string, number> = {};
        const out: Record<string, string[]> = {};
        nodes.forEach(n => { indeg[n.id] = 0; out[n.id] = []; });
        edges.forEach(e => { indeg[e.to] = (indeg[e.to] || 0) + 1; out[e.from].push(e.to); });
        const queue = nodes.filter(n => indeg[n.id] === 0).map(n => n.id);
        const result: string[] = [];
        while (queue.length) {
            const id = queue.shift()!;
            result.push(id);
            for (const next of out[id]) {
                indeg[next]--;
                if (indeg[next] === 0) { queue.push(next); }
            }
        }
        if (result.length !== nodes.length) {
            return [...nodes].sort((a, b) => a.x - b.x).map(n => n.id);
        }
        return result;
    }

    /** 与现有 JSON Tab 全局参数体系一致，仅替换 ${key}（避免误伤命令中的单括号字面量） */
    private resolveVariables(command: string, commonParameters: Record<string, any>): string {
        let result = command;
        for (const [key, value] of Object.entries(commonParameters || {})) {
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp('\\$\\{' + escaped + '\\}', 'g'), String(value));
        }
        return result;
    }

    private delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

    /** 解析 HH:MM 或 HH:MM:SS 为下一次到达的时刻（今天未到则今天，否则次日）；非法返回 null */
    private nextClockTime(value: string): Date | null {
        const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
        if (!m) { return null; }
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0);
        if (target.getTime() <= now.getTime()) { target.setDate(target.getDate() + 1); }
        return target;
    }

    private fmtClock(d: Date): string {
        const p = (v: number) => String(v).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    /** 按 Shell 类型写临时脚本文件并 spawn，支持超时 kill。返回是否成功（exit code 0） */
    private execShell(node: WfNode, command: string, options: WorkflowEngineOptions, log: (level: 'info' | 'ok' | 'err' | 'dim' | 'hdr', text: string) => void): Promise<boolean> {
        return new Promise(resolve => {
            const shell = options.shell;
            const stamp = Date.now() + '_' + Math.random().toString(36).slice(2);
            const tmpSh = path.join(os.tmpdir(), `mpt_wf_${stamp}.sh`);
            const tmpCmd = path.join(os.tmpdir(), `mpt_wf_${stamp}.cmd`);
            const tmpPs = path.join(os.tmpdir(), `mpt_wf_${stamp}.ps1`);

            let bin = '';
            let args: string[] = [];
            try {
                if (shell === 'git-bash' || shell === 'wsl') {
                    fs.writeFileSync(tmpSh, command, 'utf8');
                    bin = 'bash';
                    args = shell === 'wsl' ? [] : [tmpSh];
                } else if (shell === 'cmd') {
                    const cmdContent = command.split('\n').filter(l => l.trim()).join(' & ');
                    fs.writeFileSync(tmpCmd, `@echo off\r\n${cmdContent}\r\n`, 'utf8');
                    bin = process.env.ComSpec || 'cmd.exe';
                    args = ['/c', tmpCmd];
                } else if (shell === 'powershell') {
                    fs.writeFileSync(tmpPs, command, 'utf8');
                    bin = 'powershell.exe';
                    args = ['-ExecutionPolicy', 'Bypass', '-File', tmpPs];
                } else {
                    fs.writeFileSync(tmpSh, command, 'utf8');
                    bin = shell;
                    args = [tmpSh];
                }
            } catch (e: any) {
                log('err', `[Error] failed to prepare script: ${e.message}`);
                resolve(false);
                return;
            }

            // WSL 下用 wsl.exe 执行 bash 脚本
            if (shell === 'wsl') {
                bin = 'wsl.exe';
                args = ['-e', 'bash', tmpSh];
            }

            const env = { ...process.env, ...options.envVariables, WB_ENV: options.env || 'dev' };
            let child: cp.ChildProcess;
            try {
                // detached 使子进程成为进程组组长，便于超时/停止时杀掉整个进程树
                child = cp.spawn(bin, args, { cwd: options.cwd, env, windowsHide: true, detached: process.platform !== 'win32' });
            } catch (e: any) {
                log('err', `[Error] spawn failed: ${e.message}`);
                this.cleanupTmp([tmpSh, tmpCmd, tmpPs]);
                resolve(false);
                return;
            }
            this._children.add(child);

            let settled = false;
            let timedOut = false;
            const timeoutMs = Math.max(1, node.timeout || 300) * 1000;
            const timer = setTimeout(() => {
                timedOut = true;
                log('err', `[Timeout] ${node.label} exceeded ${node.timeout}s → kill`);
                this.killTree(child);
            }, timeoutMs);

            const pipeLines = (data: Buffer, isErr: boolean) => {
                const text = data.toString();
                text.split(/\r?\n/).forEach(line => {
                    if (line.trim()) { log(isErr ? 'err' : 'info', line); }
                });
            };
            child.stdout?.on('data', (d: Buffer) => pipeLines(d, false));
            child.stderr?.on('data', (d: Buffer) => pipeLines(d, true));

            child.on('error', (err: Error) => {
                if (settled) { return; }
                settled = true;
                clearTimeout(timer);
                this._children.delete(child);
                log('err', `[Error] ${err.message}`);
                this.cleanupTmp([tmpSh, tmpCmd, tmpPs]);
                resolve(false);
            });

            child.on('close', (code: number | null) => {
                if (settled) { return; }
                settled = true;
                clearTimeout(timer);
                this._children.delete(child);
                this.cleanupTmp([tmpSh, tmpCmd, tmpPs]);
                if (timedOut) { resolve(false); return; }
                if (code === 0) {
                    log('ok', `[OK] ${node.label} exit 0`);
                    resolve(true);
                } else {
                    log('err', `[FAIL] ${node.label} exit code ${code}`);
                    resolve(false);
                }
            });
        });
    }

    private cleanupTmp(files: string[]): void {
        files.forEach(f => {
            try { if (fs.existsSync(f)) { fs.unlinkSync(f); } } catch { /* ignore */ }
        });
    }

    /** 发送真实 HTTP GET 请求（webhook），按状态码判定成败，超时按节点超时 */
    private httpNotify(node: WfNode, url: string, log: (level: 'info' | 'ok' | 'err' | 'dim' | 'hdr', text: string) => void): Promise<boolean> {
        return new Promise(resolve => {
            let target: URL;
            try {
                target = new URL(url);
                if (target.protocol !== 'http:' && target.protocol !== 'https:') { throw new Error('unsupported protocol: ' + target.protocol); }
            } catch (e: any) {
                log('err', `[Notify] invalid URL: ${url} (${e.message})`);
                resolve(false);
                return;
            }
            const mod = target.protocol === 'https:' ? https : http;
            const req = mod.request(target, { method: 'GET', timeout: Math.max(1, node.timeout || 30) * 1000 }, res => {
                const code = res.statusCode || 0;
                res.resume();
                if (code >= 200 && code < 400) {
                    log('ok', `[Notify] HTTP ${code} ← ${target.host}`);
                    resolve(true);
                } else {
                    log('err', `[Notify] HTTP ${code} ← ${target.host}`);
                    resolve(false);
                }
            });
            req.on('timeout', () => {
                log('err', `[Notify] HTTP timeout after ${node.timeout || 30}s → abort`);
                req.destroy(new Error('timeout'));
            });
            req.on('error', (err: Error) => {
                log('err', `[Notify] HTTP error: ${err.message}`);
                resolve(false);
            });
            req.end();
        });
    }
}
