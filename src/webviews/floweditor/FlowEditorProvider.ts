import * as vscode from 'vscode';
import { translations, Language } from '../../utils/i18n';
import { BASE_THEME_CSS } from '../shared/baseTheme';
import { WORKBENCH_CSS } from '../workbench/workbenchCss';
import { FLOW_EDITOR_BODY } from './flowEditorHtml';
import { FLOW_EDITOR_JS } from './flowEditorJs';

/** 面板初始化上下文：工作台数据 + 命令树 + 语言 */
export interface FlowEditorContext {
    data: any;
    trees: { cmd: any[]; pyt: any[]; shortcut: any[] };
    language: Language;
}

/**
 * Flow 编辑器面板：在主编辑区（WebviewPanel）承载流程图画布、
 * 节点面板、属性与执行监控。侧边栏 Flow Tab 仅保留列表与入口按钮，
 * 通过 flowEditorAction 消息驱动本面板。
 */
export class FlowEditorProvider {
    private static _panel: vscode.WebviewPanel | undefined;
    private _pendingAction: any;
    private _ready: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getContext: () => FlowEditorContext,
        private readonly _onMessage: (message: any) => void
    ) {}

    /** 打开（或显示）面板，并可选地应用一个动作 */
    public show(action?: any): void {
        if (!FlowEditorProvider._panel) {
            this.createPanel();
        } else {
            FlowEditorProvider._panel.reveal();
        }
        if (action) { this.applyAction(action); }
    }

    public postMessage(message: any): void {
        FlowEditorProvider._panel?.webview.postMessage(message);
    }

    /** 面板 webview 是否已就绪（完成初始加载并上报 ready） */
    public get isReady(): boolean { return this._ready; }

    private applyAction(action: any): void {
        if (!action) { return; }
        if (this._ready) {
            this.postMessage({ command: 'flowEditorAction', action });
        } else {
            // webview 未就绪时暂存，待 flowEditorReady 后补发
            this._pendingAction = action;
        }
    }

    private createPanel(): void {
        const panel = vscode.window.createWebviewPanel(
            'multi-project-tool.flowEditor',
            'Flow Editor',
            vscode.ViewColumn.Beside,
            {
                retainContextWhenHidden: true,
                enableScripts: true,
                localResourceRoots: [this._extensionUri]
            }
        );
        FlowEditorProvider._panel = panel;
        this._ready = false;

        panel.webview.html = this.getHtml();

        panel.webview.onDidReceiveMessage((message) => {
            if (message && message.command === 'flowEditorReady') {
                this._ready = true;
                const ctx = this._getContext();
                this.postMessage({
                    command: 'flowEditorInit',
                    data: ctx.data,
                    trees: ctx.trees,
                    language: ctx.language
                });
                if (this._pendingAction) {
                    this.postMessage({ command: 'flowEditorAction', action: this._pendingAction });
                    this._pendingAction = null;
                }
                return;
            }
            this._onMessage(message);
        });

        panel.onDidDispose(() => {
            FlowEditorProvider._panel = undefined;
            this._ready = false;
            this._pendingAction = null;
        });
    }

    private getHtml(): string {
        const i18nScript = `<script>const i18nTranslations = ${JSON.stringify(translations)}; let currentLang = '${this._getContext().language}'; function t(key) { return i18nTranslations[currentLang]?.[key] || i18nTranslations.en?.[key] || key; } function applyTranslations() { document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); }); document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); }); }</script>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flow Editor</title>
    <style>
${BASE_THEME_CSS}
html, body {
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    background-color: var(--brand-background);
    color: var(--brand-text);
    height: 100%;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
}
body { display: flex; flex-direction: column; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background-color: var(--brand-border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background-color: var(--brand-text-muted); }
${WORKBENCH_CSS}
/* 主编辑区版式微调：比侧边栏更宽敞，且整体贴底铺满 */
.wf-tab { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.wf-left { width: 168px; }
.wf-props { width: 232px; }
.wf-monitor { height: var(--wf-monitor-h, 250px); min-height: 90px; max-height: 75vh; }
/* 画布与执行监控之间的可拖拽分隔条 */
.wf-splitter {
    flex: none; height: 7px; cursor: row-resize; position: relative;
    background-color: var(--brand-surface);
    border-top: 1px solid var(--brand-border-subtle);
}
.wf-splitter::before {
    content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px;
}
.wf-splitter::after {
    content: ''; position: absolute; left: 50%; top: 2px; transform: translateX(-50%);
    width: 40px; height: 2px; border-radius: 2px; background-color: var(--brand-border);
}
.wf-splitter:hover::after, .wf-splitter.dragging::after { background-color: var(--brand-primary); }
.wf-splitter.dragging { cursor: row-resize; }
body.wf-resizing { cursor: row-resize; user-select: none; }
body.wf-resizing .wf-svg-wrap { pointer-events: none; }
    </style>
</head>
<body>${FLOW_EDITOR_BODY}${i18nScript}<script>${FLOW_EDITOR_JS}</script></body>
</html>`;
    }
}
