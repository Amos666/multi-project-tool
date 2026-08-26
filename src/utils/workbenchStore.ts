import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    WorkbenchData, WfTemplate, RunHistoryEntry,
    BatchGroup, ChecklistTask, Workflow
} from '../webviews/workbench/workbenchTypes';

// 内置模板（nodes/edges 结构与画布一致）
function builtinTemplates(): WfTemplate[] {
    return [
        {
            id: 'builtin-maven', name: 'wb.template.maven', builtin: true,
            nodes: [
                { id: 'n1', label: 'mvn clean', tag: 'cmd', x: 20, y: 180, cmd: 'mvn clean', timeout: 300, failPolicy: 'stop' },
                { id: 'n2', label: 'mvn compile', tag: 'cmd', x: 170, y: 180, cmd: 'mvn compile', timeout: 300, failPolicy: 'stop' },
                { id: 'n3', label: 'Fork', tag: 'fork', x: 320, y: 180, cmd: '', timeout: 300, failPolicy: 'stop' },
                { id: 'n4', label: 'mvn test', tag: 'cmd', x: 470, y: 90, cmd: 'mvn test', timeout: 600, failPolicy: 'stop' },
                { id: 'n5', label: 'sonar scan', tag: 'cmd', x: 470, y: 270, cmd: 'sonar-scanner', timeout: 600, failPolicy: 'skip' },
                { id: 'n6', label: 'Join', tag: 'join', x: 630, y: 180, cmd: '', timeout: 300, failPolicy: 'stop' },
                { id: 'n7', label: 'docker build', tag: 'cmd', x: 780, y: 180, cmd: 'docker build -t app .', timeout: 900, failPolicy: 'stop' }
            ],
            edges: [
                { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
                { from: 'n3', to: 'n4' }, { from: 'n3', to: 'n5' },
                { from: 'n4', to: 'n6' }, { from: 'n5', to: 'n6' }, { from: 'n6', to: 'n7' }
            ]
        },
        {
            id: 'builtin-multi', name: 'wb.template.multi', builtin: true,
            nodes: [
                { id: 'n1', label: 'Fork', tag: 'fork', x: 40, y: 180, cmd: '', timeout: 300, failPolicy: 'stop' },
                { id: 'n2', label: 'module: user', tag: 'cmd', x: 220, y: 60, cmd: 'mvn -pl user compile', timeout: 300, failPolicy: 'stop' },
                { id: 'n3', label: 'module: order', tag: 'cmd', x: 220, y: 180, cmd: 'mvn -pl order compile', timeout: 300, failPolicy: 'stop' },
                { id: 'n4', label: 'module: pay', tag: 'cmd', x: 220, y: 300, cmd: 'mvn -pl pay compile', timeout: 300, failPolicy: 'stop' },
                { id: 'n5', label: 'Join', tag: 'join', x: 430, y: 180, cmd: '', timeout: 300, failPolicy: 'stop' },
                { id: 'n6', label: 'mvn package', tag: 'cmd', x: 590, y: 180, cmd: 'mvn package', timeout: 600, failPolicy: 'stop' },
                { id: 'n7', label: 'notify', tag: 'notify', x: 770, y: 180, cmd: 'Build finished', timeout: 300, failPolicy: 'skip' }
            ],
            edges: [
                { from: 'n1', to: 'n2' }, { from: 'n1', to: 'n3' }, { from: 'n1', to: 'n4' },
                { from: 'n2', to: 'n5' }, { from: 'n3', to: 'n5' }, { from: 'n4', to: 'n5' },
                { from: 'n5', to: 'n6' }, { from: 'n6', to: 'n7' }
            ]
        },
        {
            id: 'builtin-cicd', name: 'wb.template.cicd', builtin: true,
            nodes: [
                { id: 'n1', label: 'mvn test', tag: 'cmd', x: 40, y: 180, cmd: 'mvn test', timeout: 600, failPolicy: 'stop' },
                { id: 'n2', label: 'tests passed?', tag: 'condition', x: 230, y: 180, cmd: 'echo "check test reports here"; exit 0', timeout: 60, failPolicy: 'stop' },
                { id: 'n3', label: 'deploy', tag: 'cmd', x: 450, y: 90, cmd: 'echo deploy app', timeout: 900, failPolicy: 'stop' },
                { id: 'n4', label: 'notify success', tag: 'notify', x: 660, y: 90, cmd: 'Deploy success', timeout: 300, failPolicy: 'skip' },
                { id: 'n5', label: 'notify failure', tag: 'notify', x: 450, y: 280, cmd: 'Tests failed', timeout: 300, failPolicy: 'skip' }
            ],
            edges: [
                { from: 'n1', to: 'n2' },
                { from: 'n2', to: 'n3', condition: 'true' },
                { from: 'n3', to: 'n4' },
                { from: 'n2', to: 'n5', condition: 'false' }
            ]
        }
    ];
}

function defaultBatchGroups(): BatchGroup[] {
    return [
        { id: 'batch-java', name: 'wb.batch.javaBuild', mode: 'serial', commands: ['mvn clean', 'mvn compile', 'mvn test', 'mvn package'] },
        { id: 'batch-quick', name: 'wb.batch.quickCheck', mode: 'serial', commands: ['echo quick check step 1', 'echo quick check step 2'] }
    ];
}

function defaults(): WorkbenchData {
    return {
        checklist: [],
        workflows: [],
        templates: [],
        history: [],
        batchGroups: defaultBatchGroups(),
        hiddenTabs: [],
        hiddenTemplates: []
    };
}

const HISTORY_LIMIT = 30;

export class WorkbenchStore {
    private static instance: WorkbenchStore;
    private _cache: WorkbenchData | undefined;
    private _dir: string | undefined;

    private constructor() {}

    public static getInstance(): WorkbenchStore {
        if (!WorkbenchStore.instance) {
            WorkbenchStore.instance = new WorkbenchStore();
        }
        return WorkbenchStore.instance;
    }

    private getDir(): string | undefined {
        if (this._dir) { return this._dir; }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) { return undefined; }
        this._dir = path.join(folders[0].uri.fsPath, '.multi-project-tool');
        return this._dir;
    }

    private getFilePath(): string | undefined {
        const dir = this.getDir();
        return dir ? path.join(dir, 'workbench.json') : undefined;
    }

    public load(): WorkbenchData {
        if (this._cache) { return this._cache; }
        const file = this.getFilePath();
        if (!file) { this._cache = defaults(); return this._cache; }
        try {
            if (!fs.existsSync(file)) {
                this._cache = defaults();
                return this._cache;
            }
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            const d = defaults();
            this._cache = {
                checklist: Array.isArray(parsed.checklist) ? parsed.checklist : d.checklist,
                workflows: Array.isArray(parsed.workflows) ? parsed.workflows : d.workflows,
                templates: Array.isArray(parsed.templates) ? parsed.templates : d.templates,
                history: Array.isArray(parsed.history) ? parsed.history : d.history,
                batchGroups: Array.isArray(parsed.batchGroups) && parsed.batchGroups.length ? parsed.batchGroups : d.batchGroups,
                hiddenTabs: Array.isArray(parsed.hiddenTabs) ? parsed.hiddenTabs : [],
                hiddenTemplates: Array.isArray(parsed.hiddenTemplates) ? parsed.hiddenTemplates : []
            };
            return this._cache;
        } catch (error) {
            console.error('Failed to load workbench.json:', error);
            this._cache = defaults();
            return this._cache;
        }
    }

    public save(data: WorkbenchData): boolean {
        this._cache = data;
        const file = this.getFilePath();
        if (!file) { return false; }
        try {
            const dir = this.getDir();
            if (dir && !fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save workbench.json:', error);
            return false;
        }
    }

    /** 内置模板 + 自定义模板（自定义覆盖同 id 内置；被删除的内置模板隐藏） */
    public allTemplates(): WfTemplate[] {
        const data = this.load();
        const customIds = new Set(data.templates.map(t => t.id));
        const hidden = new Set(data.hiddenTemplates || []);
        const builtins = builtinTemplates().filter(t => !customIds.has(t.id) && !hidden.has(t.id));
        return [...builtins, ...data.templates];
    }

    public addHistory(entry: RunHistoryEntry): void {
        const data = this.load();
        data.history.unshift(entry);
        if (data.history.length > HISTORY_LIMIT) {
            data.history = data.history.slice(0, HISTORY_LIMIT);
        }
        this.save(data);
    }

    public deleteHistory(id: string): void {
        const data = this.load();
        data.history = data.history.filter(h => h.id !== id);
        this.save(data);
    }

    public clearHistory(): void {
        const data = this.load();
        data.history = [];
        this.save(data);
    }

    public saveChecklist(tasks: ChecklistTask[]): void {
        const data = this.load();
        data.checklist = tasks;
        this.save(data);
    }

    public upsertWorkflow(wf: Workflow): void {
        const data = this.load();
        const idx = data.workflows.findIndex(w => w.id === wf.id);
        if (idx >= 0) { data.workflows[idx] = wf; } else { data.workflows.push(wf); }
        this.save(data);
    }

    public deleteWorkflow(id: string): void {
        const data = this.load();
        data.workflows = data.workflows.filter(w => w.id !== id);
        this.save(data);
    }

    /** 保存/更新模板：传入 id 且已存在则原地更新；内置模板 id 会存为自定义覆盖项 */
    public saveCustomTemplate(name: string, nodes: any[], edges: any[], id?: string): WfTemplate {
        const data = this.load();
        const existing = id ? data.templates.find(t => t.id === id) : undefined;
        if (existing) {
            existing.name = name;
            existing.nodes = JSON.parse(JSON.stringify(nodes));
            existing.edges = JSON.parse(JSON.stringify(edges));
            this.save(data);
            return existing;
        }
        const tpl: WfTemplate = {
            id: id || 'tpl-' + Date.now().toString(36),
            name,
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges))
        };
        data.templates.push(tpl);
        this.save(data);
        return tpl;
    }

    /** 删除模板：自定义直接删除；内置模板加入隐藏列表 */
    public deleteTemplate(id: string): void {
        const data = this.load();
        const isCustom = data.templates.some(t => t.id === id);
        if (isCustom) {
            data.templates = data.templates.filter(t => t.id !== id);
        } else if (builtinTemplates().some(t => t.id === id)) {
            data.hiddenTemplates = data.hiddenTemplates || [];
            if (!data.hiddenTemplates.includes(id)) { data.hiddenTemplates.push(id); }
        }
        this.save(data);
    }

    public saveBatchGroups(groups: BatchGroup[]): void {
        const data = this.load();
        data.batchGroups = groups;
        this.save(data);
    }

    public saveHiddenTabs(hidden: string[]): void {
        const data = this.load();
        data.hiddenTabs = hidden;
        this.save(data);
    }
}
