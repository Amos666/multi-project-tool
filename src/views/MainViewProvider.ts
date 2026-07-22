import * as vscode from 'vscode';
import { Project, GitOperationResult } from '../models/project';
import { MultiProjectToolSettings } from '../models/settings';
import { GitUtils } from '../utils/gitUtils';
import { ProjectScanner } from '../utils/projectScanner';
import { ConfigStore } from '../utils/configStore';
import { PythonTxtCmdStore, PythonTxtCommand } from '../utils/pythonTxtCmdStore';
import { translations, Language, t } from '../utils/i18n';

interface CustomCommand {
    id: string;
    alias: string;
    content: string;
}

interface LogEntry {
    timestamp: string;
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
    projectName?: string;
    shellType?: string;
}

interface EnvVariable {
    key: string;
    value: string;
}

export class MainViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'multi-project-tool.main-view';

    private _view: vscode.WebviewView | undefined;
    private _projects: Project[] = [];
    private _selectedProjectIds: Set<string> = new Set();
    private _logs: LogEntry[] = [];
    private _customCommands: CustomCommand[] = [];
    private _settings: MultiProjectToolSettings = {
        showJsonTab: true,
        showGitTab: true,
        gitDefaultBranch: 'main',
        projectScanDepth: 3,
        commonParameters: {},
        hiddenTabs: []
    };
    private _currentShell: string = 'git-bash';
    private _envVariables: EnvVariable[] = [];
    private _autoRefresh: boolean = true;
    private _logRetention: number = 50;
    private _concurrency: number = 1;
    private _commandTimeout: number = 300;
    private _logContainerHeight: number = 60;
    private _pythonTxtCommands: PythonTxtCommand[] = [];
    private _projectScanner: ProjectScanner;
    private _language: Language = 'en';

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._projectScanner = ProjectScanner.getInstance();
        // 不在构造函数中等待加载完成，让UI先显示
        this.loadData();
    }

    private async loadData(): Promise<void> {
        try {
            await this.loadSettings();
            await this.loadCommands();
            await this.loadEnvVariables();
            await this.loadPythonTxtCommands();
            // 项目加载可能较慢，先显示其他数据
            this.updateWebview();
            await this.loadProjects();
        } catch (error) {
            console.error('Failed to load data:', error);
        }
        // 项目加载完成后再更新一次
        this.updateWebview();
    }

    private async loadProjects(): Promise<void> {
        try {
            const scanDepth = this._settings.projectScanDepth;
            this._projects = await this._projectScanner.scanWorkspace(scanDepth);
            // 并行获取项目信息，但每个项目有独立超时
            const infoPromises = this._projects.map(async (project) => {
                try {
                    return await Promise.race([
                        this._projectScanner.getProjectInfo(project),
                        new Promise<Project>((resolve) => setTimeout(() => resolve(project), 15000))
                    ]);
                } catch {
                    return project;
                }
            });
            this._projects = await Promise.all(infoPromises);
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }

    private async loadSettings(): Promise<void> {
        const config = ConfigStore.getInstance().load();
        this._settings = {
            showJsonTab: true,
            showGitTab: true,
            gitDefaultBranch: 'main',
            projectScanDepth: 3,
            commonParameters: config.settings.commonParameters,
            hiddenTabs: []
        };
        this._currentShell = config.settings.defaultShell;
        this._autoRefresh = config.settings.autoRefresh;
        this._logRetention = config.settings.logRetention;
        this._concurrency = config.settings.concurrency;
        this._commandTimeout = config.settings.commandTimeout;
        this._language = (config.settings.language as Language) || 'en';
    }

    private async loadCommands(): Promise<void> {
        const config = ConfigStore.getInstance().load();
        this._customCommands = config.customCommands;
    }

    private async loadEnvVariables(): Promise<void> {
        const config = ConfigStore.getInstance().load();
        this._envVariables = config.envVariables;
    }

    private async loadPythonTxtCommands(): Promise<void> {
        this._pythonTxtCommands = PythonTxtCmdStore.getInstance().load();
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getWebviewContent();

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'init': this.handleInit(); break;
                    case 'switchTab': this.handleSwitchTab(message.tabId); break;
                    case 'toggleProjectSelection': this.handleToggleProjectSelection(message.projectId); break;
                    case 'selectAllProjects': this.handleSelectAllProjects(); break;
                    case 'deselectAllProjects': this.handleDeselectAllProjects(); break;
                    case 'gitPull': await this.handleGitPull(); break;
                    case 'gitCommit': await this.handleGitCommit(message.message); break;
                    case 'gitChange': await this.handleGitChange(); break;
                    case 'gitBranch': await this.handleGitBranch(message.branch); break;
                    case 'createBranch': await this.handleCreateBranch(message.branch); break;
                    case 'getBranchList': await this.handleGetBranchList(message.projectId); break;
                    case 'gitPush': await this.handleGitPush(); break;
                    case 'refreshProjects': await this.handleRefreshProjects(); break;
                    case 'setShell': await this.handleSetShell(message.shell); break;
                    case 'addCommand': await this.handleAddCommand(message.cmd); break;
                    case 'updateCommand': await this.handleUpdateCommand(message.cmd); break;
                    case 'deleteCommand': await this.handleDeleteCommand(message.commandId); break;
                    case 'runCommand': await this.handleRunCommand(message.commandId); break;
                    case 'saveSettings': await this.handleSaveSettings(message.settings); break;
                    case 'saveCommonParameters': await this.handleSaveCommonParameters(message.parameters); break;
                    case 'addEnvVariable': await this.handleAddEnvVariable(message.variable); break;
                    case 'updateEnvVariable': await this.handleUpdateEnvVariable(message.index, message.variable); break;
                    case 'deleteEnvVariable': await this.handleDeleteEnvVariable(message.index); break;
                    case 'clearLogs': this.handleClearLogs(); break;
                    case 'toggleLogExpanded': this.handleToggleLogExpanded(message.expanded); break;
                    case 'logHeightChange': this.handleLogHeightChange(message.height); break;
                    case 'savePythonTxtCommands': await this.handleSavePythonTxtCommands(message.commands); break;
                    case 'runPythonTxtCmd': await this.handleRunPythonTxtCmd(message.cmd); break;
                    case 'setLanguage': this.handleSetLanguage(message.language); break;
                }
            }
        );
    }

    private getWebviewContent(): string {
        const css = this.getCss();
        const htmlBody = this.getHtmlBody();
        const js = this.getJavaScript();
        const i18nScript = `<script>const i18nTranslations = ${JSON.stringify(translations)}; let currentLang = '${this._language}'; function t(key) { return i18nTranslations[currentLang]?.[key] || i18nTranslations.en?.[key] || key; } function applyTranslations() { document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); }); document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); }); }</script>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multi Project Tools</title>
    <style>${css}</style>
</head>
<body>${htmlBody}${i18nScript}<script>${js}</script></body>
</html>`;
    }

    private getCss(): string {
        return `
:root {
    /* 与 VS Code 主题色板协调的深色基调（Tokyo Night 调优版） */
    --brand-background: #16161e;
    --brand-surface: #1a1b26;
    --brand-surface-raised: #24283b;
    --brand-surface-hover: #2f3347;
    --brand-border: #2f3347;
    --brand-border-subtle: #1f2233;
    --brand-text: #c0caf5;
    --brand-text-secondary: #a9b1d6;
    --brand-text-muted: #565f89;
    --brand-text-inverse: #16161e;
    --brand-primary: #7dcfff;
    --brand-primary-hover: #89dceb;
    --brand-primary-subtle: rgba(125, 207, 255, 0.08);
    --state-success: #9ece6a;
    --state-warning: #e0af68;
    --state-error: #f7768e;
    --state-info: #7aa2f7;
    /* 圆角系统：遵循 VS Code 的克制风格 */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    /* 间距系统：统一 4px 基准 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    /* 阴影：轻量、低对比，符合 VS Code 风格 */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
    /* 字体栈：优先 VS Code 内置字体，回退到系统字体 */
    --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Segoe WPC', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
    --font-mono: 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}

body {
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    background-color: var(--brand-background);
    color: var(--brand-text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

/* 滚动条：模拟 VS Code 原生细窄滚动条 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--brand-surface-hover); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--brand-border); }

.tab-bar {
    display: flex;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    flex-shrink: 0;
}

.tab {
    flex: 1;
    padding: 10px 4px;
    text-align: center;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 500;
    color: var(--brand-text-muted);
    transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
    user-select: none;
}

.tab-icon, .git-icon, .refresh-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.git-icon { width: 13px; height: 13px; }

.tab:hover { color: var(--brand-text-secondary); background-color: rgba(255, 255, 255, 0.02); }

.tab.active {
    color: var(--brand-primary);
    border-bottom-color: var(--brand-primary);
    background-color: var(--brand-background);
}

.tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.tab-panel {
    display: none;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
}

.tab-panel.active { display: flex; }

.git-actions {
    display: flex;
    gap: 4px;
    padding: 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    flex-wrap: wrap;
}

.git-btn {
    flex: 1;
    min-width: 50px;
    padding: 7px 4px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
    position: relative;
    overflow: hidden;
    font-family: var(--font-ui);
}

.git-btn::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    opacity: 0.85;
}

.git-btn.pull::before { background-color: var(--state-info); }
.git-btn.commit::before { background-color: var(--state-success); }
.git-btn.change::before { background-color: var(--state-warning); }
.git-btn.branch::before { background-color: var(--brand-primary); }
.git-btn.push::before { background-color: var(--brand-primary-hover); }

.git-btn:hover:not(:disabled) { background-color: var(--brand-surface-hover); border-color: var(--brand-border); }
.git-btn:active:not(:disabled) { transform: scale(0.97); }
.git-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.git-btn.executing { background-color: var(--brand-primary); color: var(--brand-text-inverse); border-color: var(--brand-primary); }

.git-btn .badge {
    background-color: var(--brand-primary);
    color: var(--brand-text-inverse);
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 8px;
    margin-left: 2px;
    line-height: 1.4;
}

.git-branch-selector {
    flex: 1;
    min-width: 100px;
    display: flex;
    align-items: center;
    position: relative;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s ease;
}

.git-branch-selector:focus-within { border-color: var(--brand-primary); }

.branch-input {
    flex: 1;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--brand-text);
    font-size: 11px;
    outline: none;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-mono);
}

.branch-input::placeholder { color: var(--brand-text-muted); }

.branch-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: var(--brand-surface);
    border: 1px solid var(--brand-border);
    border-top: none;
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    z-index: 100;
    max-height: 150px;
    overflow-y: auto;
    box-shadow: var(--shadow-md);
}

.branch-dropdown.show { display: block; }

.dropdown-loading {
    padding: 10px;
    font-size: 11px;
    color: var(--brand-text-muted);
    text-align: center;
}

.dropdown-content { display: flex; flex-direction: column; }

.dropdown-content div {
    padding: 6px 10px;
    font-size: 11px;
    color: var(--brand-text);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.1s ease;
}

.dropdown-content div:hover { background-color: var(--brand-surface-hover); }

.dropdown-content div.current {
    background-color: var(--brand-primary-subtle);
    color: var(--brand-primary);
    font-weight: 600;
}

.dropdown-content div.current::before { content: '✓ '; }

.custom-command-header {
    display: flex;
    gap: 8px;
    padding: 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
}

.shell-selector {
    flex: 1;
    padding: 5px 8px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: var(--font-ui);
    cursor: pointer;
    transition: border-color 0.15s ease;
}

.shell-selector:hover { border-color: var(--brand-border); }
.shell-selector:focus { border-color: var(--brand-primary); outline: none; }

.add-cmd-btn {
    padding: 5px 12px;
    background-color: var(--brand-primary);
    border: 1px solid var(--brand-primary);
    border-radius: var(--radius-sm);
    color: var(--brand-text-inverse);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.1s ease;
}

.add-cmd-btn:hover { background-color: var(--brand-primary-hover); border-color: var(--brand-primary-hover); }
.add-cmd-btn:active { transform: scale(0.96); }

.command-editor {
    padding: 10px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    display: none;
    animation: slideDown 0.15s ease;
}

@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

.command-editor.show { display: block; }

.form-group { margin-bottom: 10px; }
.form-group label {
    display: block;
    font-size: 11px;
    color: var(--brand-text-secondary);
    margin-bottom: 4px;
    font-weight: 500;
}

.form-group input, .form-group textarea {
    width: 100%;
    padding: 6px 8px;
    background-color: var(--brand-background);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 12px;
    font-family: var(--font-mono);
    box-sizing: border-box;
    transition: border-color 0.15s ease;
}

.form-group input:focus, .form-group textarea:focus {
    border-color: var(--brand-primary);
    outline: none;
}

.form-group textarea { height: 72px; resize: vertical; }

.btn-group { display: flex; gap: 8px; justify-content: flex-end; }

.btn {
    padding: 6px 14px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-ui);
    transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.btn:active { transform: scale(0.97); }
.btn-primary { background-color: var(--brand-primary); color: var(--brand-text-inverse); border-color: var(--brand-primary); }
.btn-primary:hover { background-color: var(--brand-primary-hover); border-color: var(--brand-primary-hover); }
.btn-secondary { background-color: transparent; border-color: var(--brand-border); color: var(--brand-text-secondary); }
.btn-secondary:hover { background-color: var(--brand-surface-hover); border-color: var(--brand-text-muted); }

.command-list {
    flex: 0 0 120px;
    overflow-y: auto;
    padding: 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    min-height: 40px;
}

/* Cmd Tab 项目列表：自动填充剩余空间，由下方 log-resizer 调节边界 */
#customProjectList {
    flex: 1;
    min-height: 40px;
}

/* 通用面板分隔条：拖拽调节上方面板高度 */
.panel-resizer {
    height: 5px;
    background-color: var(--brand-border-subtle);
    cursor: ns-resize;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
    position: relative;
    border-top: 1px solid transparent;
    border-bottom: 1px solid transparent;
}

.panel-resizer:hover,
.panel-resizer.active {
    background-color: var(--brand-primary);
}

.panel-resizer::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 2px;
    background-color: var(--brand-text-muted);
    border-radius: 1px;
    opacity: 0.6;
}

.panel-resizer:hover::after,
.panel-resizer.active::after { opacity: 1; background-color: var(--brand-text-inverse); }

.command-item {
    display: flex;
    align-items: center;
    padding: 10px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: 6px;
    gap: 8px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
}

.command-item:hover { background-color: var(--brand-surface-hover); border-color: var(--brand-border); }

.command-item .cmd-main {
    flex: 1;
    min-width: 0;
    cursor: pointer;
}

.command-item .alias {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
}

.command-item .cmd-content-preview {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--brand-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 3px;
}

.command-item .actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.cmd-action-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--brand-border-subtle);
    background-color: var(--brand-surface);
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.cmd-action-btn:hover { background-color: var(--brand-surface-hover); }
.cmd-action-btn.run:hover { color: var(--state-success); border-color: var(--state-success); }
.cmd-action-btn.edit:hover { color: var(--brand-primary); border-color: var(--brand-primary); }
.cmd-action-btn.delete:hover { color: var(--state-error); border-color: var(--state-error); }

.settings-panel { flex: 1; overflow-y: auto; padding: 12px; }

.settings-section {
    background-color: var(--brand-surface);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-lg);
    padding: 14px;
    margin-bottom: 12px;
}

.settings-section h3 {
    margin: 0 0 10px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary);
    display: flex;
    align-items: center;
    gap: 6px;
}

.settings-section .subtitle {
    font-size: 11px;
    color: var(--brand-text-muted);
    margin-bottom: 12px;
    line-height: 1.5;
}

.json-editor {
    width: 100%;
    height: 140px;
    padding: 10px;
    background-color: var(--brand-background);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-md);
    color: var(--brand-text);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    resize: vertical;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
}

.json-editor:focus { border-color: var(--brand-primary); outline: none; }

.env-variable-list { margin-bottom: 10px; }

.env-variable-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    margin-bottom: 4px;
}

.env-variable-item input {
    flex: 1;
    padding: 4px 6px;
    background-color: var(--brand-background);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: var(--font-mono);
    transition: border-color 0.15s ease;
}

.env-variable-item input:focus { border-color: var(--brand-primary); outline: none; }
.env-variable-item input.key { color: var(--brand-primary); }
.env-variable-item .separator { color: var(--brand-text-muted); font-size: 11px; }

.env-variable-item .delete-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 12px;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s ease, color 0.15s ease;
}

.env-variable-item .delete-btn:hover { color: var(--state-error); background-color: rgba(247, 118, 142, 0.1); }

.settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.settings-row label { font-size: 11px; color: var(--brand-text-secondary); }

.settings-row input[type="number"] {
    width: 60px;
    padding: 4px 6px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: var(--font-mono);
    text-align: right;
}

.settings-row input[type="number"]:focus { border-color: var(--brand-primary); outline: none; }

.settings-row .unit { font-size: 10px; color: var(--brand-text-muted); margin-left: 4px; }

.toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background-color: var(--brand-surface-hover);
    border: 1px solid var(--brand-border);
    border-radius: 10px;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease;
}

.toggle-switch.active { background-color: var(--brand-primary); border-color: var(--brand-primary); }

.toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background-color: var(--brand-text);
    border-radius: 50%;
    transition: transform 0.2s ease, background-color 0.2s ease;
}

.toggle-switch.active::after { transform: translateX(16px); background-color: var(--brand-text-inverse); }

.project-list-container { flex: 1; overflow-y: auto; padding: 6px; transition: max-height 0.25s ease, padding 0.25s ease, overflow 0.25s ease; }
.project-list-container.collapsed { max-height: 0; padding-top: 0; padding-bottom: 0; overflow: hidden; }

.project-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    font-size: 11px;
    font-weight: 600;
    color: var(--brand-text-secondary);
    letter-spacing: 0.02em;
}

.project-list-header .selected-count {
    font-size: 11px;
    color: var(--brand-primary);
    font-weight: 600;
    white-space: nowrap;
    padding: 2px 8px;
    background-color: var(--brand-primary-subtle);
    border-radius: 10px;
}

.project-list-header .collapse-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    line-height: 1;
    border-radius: var(--radius-sm);
    transition: transform 0.2s ease, color 0.15s ease, background-color 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.project-list-header .collapse-btn:hover { color: var(--brand-primary); background-color: var(--brand-surface-hover); }
.project-list-header .collapse-btn.collapsed { transform: rotate(-90deg); }

.project-list-header .refresh-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 12px;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background-color 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.project-list-header .refresh-btn:hover { color: var(--brand-primary); background-color: var(--brand-surface-hover); }

.project-item {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    margin-bottom: 2px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    position: relative;
    border-left: 2px solid transparent;
}

.project-item:hover { background-color: var(--brand-surface-hover); }
.project-item.selected { background-color: var(--brand-primary-subtle); border-left-color: var(--brand-primary); }

.project-checkbox {
    width: 13px;
    height: 13px;
    margin-right: 10px;
    accent-color: var(--brand-primary);
    cursor: pointer;
    flex-shrink: 0;
}

.project-info { flex: 1; min-width: 0; }

.project-name {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--brand-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.5;
}

.project-branch {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--brand-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
}

.branch-icon {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
    opacity: 0.85;
}

.change-count {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 8px;
    font-family: var(--font-mono);
    min-width: 20px;
    text-align: center;
}

.change-count.success { color: var(--state-success); background-color: rgba(158, 206, 106, 0.1); }
.change-count.warning { color: var(--state-warning); background-color: rgba(224, 175, 104, 0.1); }
.change-count.error { color: var(--state-error); background-color: rgba(247, 118, 142, 0.12); }

.log-container {
    flex-shrink: 0;
    background-color: var(--brand-surface);
    border-top: 1px solid var(--brand-border-subtle);
    height: 60px;
    min-height: 40px;
    max-height: 80%;
    display: flex;
    flex-direction: column;
    transition: none;
}

.log-container.resizing { transition: none; }

.log-resizer {
    height: 5px;
    background-color: var(--brand-border-subtle);
    cursor: ns-resize;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
    position: relative;
}

.log-resizer:hover,
.log-resizer.active {
    background-color: var(--brand-primary);
}

.log-resizer::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 2px;
    background-color: var(--brand-text-muted);
    border-radius: 1px;
    opacity: 0.6;
}

.log-resizer:hover::after,
.log-resizer.active::after { opacity: 1; background-color: var(--brand-text-inverse); }

.log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--brand-border-subtle);
    font-size: 11px;
    font-weight: 600;
    color: var(--brand-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    letter-spacing: 0.02em;
    transition: background-color 0.15s ease;
}

.log-header:hover { background-color: var(--brand-surface-hover); }

.log-header .clear-btn {
    font-size: 10px;
    padding: 3px 8px;
    background-color: transparent;
    border: 1px solid var(--brand-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--brand-text-muted);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
    font-family: var(--font-ui);
}

.log-header .clear-btn:hover { color: var(--state-error); border-color: var(--state-error); background-color: rgba(247, 118, 142, 0.08); }

.log-content {
    height: calc(100% - 34px);
    overflow-y: auto;
    padding: 8px 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.6;
}

.log-entry { margin-bottom: 4px; line-height: 1.5; }
.log-entry .timestamp { color: var(--brand-text-muted); margin-right: 6px; }
.log-entry .status-icon { margin-right: 4px; }

.log-entry.success .status-icon, .log-entry.success .message { color: var(--state-success); }
.log-entry.error .status-icon, .log-entry.error .message { color: var(--state-error); }
.log-entry.info .status-icon, .log-entry.info .message { color: var(--brand-primary); }

.log-entry .project-name { color: var(--brand-primary); font-size: 10px; font-weight: 600; }
.log-entry .shell-type { color: var(--brand-text-muted); font-style: italic; margin-right: 4px; }
.log-entry .tree-line { color: var(--brand-text-muted); padding-left: 12px; }
.log-entry .command-line { color: var(--brand-text-secondary); }

.empty-state { text-align: center; padding: 20px; color: var(--brand-text-muted); font-size: 11px; }

.status-message {
    font-size: 11px;
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
}

.status-message.success { color: var(--state-success); background-color: rgba(158, 206, 106, 0.08); }
.status-message.error { color: var(--state-error); background-color: rgba(247, 118, 142, 0.1); }

.no-projects-message { text-align: center; padding: 24px; color: var(--brand-text-muted); font-size: 11px; }

.selection-warning {
    padding: 8px 10px;
    background-color: rgba(224, 175, 104, 0.08);
    border-bottom: 1px solid var(--brand-border-subtle);
    color: var(--state-warning);
    font-size: 11px;
    text-align: center;
    display: none;
}

.selection-warning.show { display: block; }

.modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(2px);
    animation: fadeIn 0.15s ease;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-dialog {
    background: var(--brand-surface);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-lg);
    min-width: 380px; max-width: 90%;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: scaleIn 0.15s ease;
}

@keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }

.modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--brand-border-subtle);
}
.modal-title { font-size: 13px; font-weight: 600; color: var(--brand-text); }
.modal-close {
    background: none; border: none; cursor: pointer;
    color: var(--brand-text-muted); font-size: 18px; padding: 0 4px;
    border-radius: var(--radius-sm);
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s ease, background-color 0.15s ease;
}
.modal-close:hover { color: var(--brand-text); background-color: var(--brand-surface-hover); }
.modal-body { padding: 16px; }
.modal-input {
    width: 100%; box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--brand-border-subtle); border-radius: var(--radius-sm);
    background: var(--brand-background); color: var(--brand-text);
    font-size: 12px; outline: none;
    font-family: var(--font-mono);
    transition: border-color 0.15s ease;
}
.modal-input:focus { border-color: var(--brand-primary); }
.modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--brand-border-subtle);
}`;
    }

    private getHtmlBody(): string {
        return `
    <div class="tab-bar">
        <div class="tab active" onclick="switchTab('git')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 4.5v7"/><path d="M4 6c0 0 0-1.5 4-1.5h2.5"/></svg><span data-i18n="tab.git">Git</span>
        </div>
        <div class="tab" onclick="switchTab('custom')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6h12"/><path d="M5 9l1.5 1.5L5 12"/><path d="M8 12h3"/></svg><span data-i18n="tab.custom">Cmd</span>
        </div>
        <div class="tab" onclick="switchTab('settings')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M3 8H1M15 8h-2M3.5 3.5L5 5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"/></svg><span data-i18n="tab.settings">Set</span>
        </div>
        <div class="tab" onclick="switchTab('txtcmd')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v11a1 1 0 0 0 1 1h7"/><path d="M4 2c2 0 3 1 3 3v7"/></svg><span data-i18n="tab.txtcmd">Pyt</span>
        </div>
    </div>

    <div class="tab-content">
        <div id="tab-git" class="tab-panel active">
            <div class="git-actions">
                <button class="git-btn pull" onclick="executeGitAction('pull')"><svg class="git-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8"/><path d="M5 7l3 3 3-3"/><path d="M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg><span data-i18n="git.pull">Pull</span></button>
                <button class="git-btn commit" onclick="executeGitAction('commit')"><svg class="git-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M2 8h3.5M10.5 8H14"/></svg><span data-i18n="git.commit">Commit</span></button>
                <button class="git-btn change" onclick="executeGitAction('change')"><svg class="git-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h7"/><path d="M6 2v6"/><path d="M3 11h7"/></svg><span data-i18n="git.change">Change</span></button>
                <div class="git-branch-selector">
                    <button class="git-btn branch" onclick="executeGitAction('branch')"><svg class="git-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 4.5v7"/><path d="M4 6c0 0 0-1.5 4-1.5h2.5"/></svg><span data-i18n="git.branch">Branch</span></button>
                    <div style="position: relative; flex: 1;">
                        <input type="text" id="branchInput" class="branch-input" data-i18n-placeholder="branch.selectPlaceholder" placeholder="Select branch..." onclick="onBranchInputClick(event)" autocomplete="off" oninput="filterBranchList(this.value)">
                        <div class="branch-dropdown" id="branchDropdown">
                            <div class="dropdown-loading" id="branchLoading" data-i18n="branch.loading">Loading...</div>
                            <div class="dropdown-content" id="branchList"></div>
                        </div>
                    </div>
                </div>
                <button class="git-btn push" onclick="executeGitAction('push')"><svg class="git-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V4"/><path d="M5 7l3-3 3 3"/><path d="M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg><span data-i18n="git.push">Push</span></button>
            </div>

            <div class="project-list-header">
                <span><span data-i18n="project.title">Projects</span> (<span id="projectCount">0</span>)</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="selected-count" id="gitSelectedCount"><span data-i18n="project.selected">Selected</span> 0</span>
                    <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px;">
                        <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this.checked)" style="cursor: pointer;">
                        <span data-i18n="project.selectAll">Select All</span>
                    </label>
                    <button class="collapse-btn" id="gitCollapseBtn" onclick="toggleProjectList('projectList', 'gitCollapseBtn')" data-i18n-title="project.collapse" title="Collapse project list">▼</button>
                    <button class="refresh-btn" onclick="refreshProjects()" data-i18n-title="project.refresh" title="Refresh"><svg class="refresh-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2v3h-3"/></svg></button>
                </div>
            </div>

            <div class="project-list-container" id="projectList">
                <div class="no-projects-message" data-i18n="project.loading">Loading...</div>
            </div>

            <div class="log-container" id="logContainer">
                <div class="log-resizer" id="logResizer"></div>
                <div class="log-header" onclick="toggleLog()">
                    <span data-i18n="log.title">Logs</span>
                    <span class="clear-btn" onclick="clearLogs(event)" data-i18n="log.clear">Clear</span>
                </div>
                <div class="log-content" id="logContent">
                    <div class="log-entry info">
                        <span class="timestamp">[--:--:--]</span>
                        <span class="status-icon">▶</span>
                        <span class="message" data-i18n="log.ready">Multi Project Tools ready</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-custom" class="tab-panel">
            <div class="custom-command-header">
                <label style="font-size: 10px; color: var(--brand-text-muted); display: flex; align-items: center;">
                    <span data-i18n="cmd.shell">Shell:</span>
                    <select class="shell-selector" id="shellSelector" onchange="setShell(this.value)">
                        <option value="git-bash">Git Bash</option>
                        <option value="cmd">CMD</option>
                        <option value="powershell">PowerShell</option>
                        <option value="wsl">WSL</option>
                    </select>
                </label>
                <button class="add-cmd-btn" onclick="showCommandEditor()" data-i18n="cmd.add">+ Add</button>
            </div>

            <div class="command-editor" id="commandEditor">
                <div class="form-group">
                    <label for="commandAlias" data-i18n="cmd.alias">Command Alias</label>
                    <input type="text" id="commandAlias" placeholder="deploy-all">
                </div>
                <div class="form-group">
                    <label for="commandContent" data-i18n="cmd.content">Command Content</label>
                    <textarea id="commandContent" placeholder="npm run build&#10;npm run deploy"></textarea>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="saveCommand()" data-i18n="cmd.save">Save</button>
                    <button class="btn btn-secondary" onclick="hideCommandEditor()" data-i18n="cmd.cancel">Cancel</button>
                </div>
            </div>

            <div class="command-list" id="commandList">
                <div class="empty-state" data-i18n="cmd.empty">No commands</div>
            </div>

            <div class="panel-resizer" data-target="commandList"></div>

            <div class="selection-warning" id="selectionWarning" data-i18n="cmd.selectProject">Please select projects first</div>

            <div class="project-list-header">
                <span><span data-i18n="project.title">Projects</span> (<span id="customProjectCount">0</span>)</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="selected-count" id="customSelectedCount"><span data-i18n="project.selected">Selected</span> 0</span>
                    <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px;">
                        <input type="checkbox" id="customSelectAllCheckbox" onchange="toggleCustomSelectAll(this.checked)" style="cursor: pointer;">
                        <span data-i18n="project.selectAll">Select All</span>
                    </label>
                    <button class="collapse-btn" id="customCollapseBtn" onclick="toggleProjectList('customProjectList', 'customCollapseBtn')" data-i18n-title="project.collapse" title="Collapse project list">▼</button>
                    <button class="refresh-btn" onclick="refreshProjects()" data-i18n-title="project.refresh" title="Refresh"><svg class="refresh-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2v3h-3"/></svg></button>
                </div>
            </div>

            <div class="project-list-container" id="customProjectList">
                <div class="no-projects-message" data-i18n="project.loading">Loading...</div>
            </div>

            <div class="log-container" id="customLogContainer">
                <div class="log-resizer" id="customLogResizer"></div>
                <div class="log-header" onclick="toggleLog()">
                    <span data-i18n="log.title">Logs</span>
                    <span class="clear-btn" onclick="clearLogs(event)" data-i18n="log.clear">Clear</span>
                </div>
                <div class="log-content" id="customLogContent">
                    <div class="log-entry info">
                        <span class="timestamp">[--:--:--]</span>
                        <span class="status-icon">▶</span>
                        <span class="message" data-i18n="log.ready">Multi Project Tools ready</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-settings" class="tab-panel">
            <div class="settings-panel">
                <div class="settings-section">
                    <h3>🌐 <span data-i18n="settings.language">Language</span></h3>
                    <div class="settings-row">
                        <select class="shell-selector" id="languageSelector" style="width: auto; flex: none;" onchange="changeLanguage(this.value)">
                            <option value="en">English</option>
                            <option value="zh">中文</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>📋 <span data-i18n="settings.globalParams">Global Parameters</span></h3>
                    <div class="subtitle" data-i18n="settings.globalParamsDesc">Define global parameters, referenced via ${'${paramName}'}</div>
                    <textarea class="json-editor" id="commonParams" placeholder='{"deployBucket": "my-bucket"}'></textarea>
                    <div class="btn-group" style="margin-top: 10px;">
                        <button class="btn btn-secondary" onclick="resetCommonParams()" data-i18n="settings.resetDefault">Reset Default</button>
                        <button class="btn btn-primary" onclick="saveCommonParams()" data-i18n="cmd.save">Save</button>
                    </div>
                    <div id="jsonStatus" class="status-message"></div>
                </div>

                <div class="settings-section">
                    <h3>🔧 <span data-i18n="settings.envVars">Environment Variables</span></h3>
                    <div class="subtitle" data-i18n="settings.envVarsDesc">Injected into Shell environment during command execution</div>
                    <div class="env-variable-list" id="envVariableList"></div>
                    <button class="btn btn-secondary" onclick="addEnvVariable()" data-i18n="settings.addVar">+ Add Variable</button>
                </div>

                <div class="settings-section">
                    <h3>⚙️ <span data-i18n="settings.other">Other Settings</span></h3>
                    <div class="settings-row">
                        <label data-i18n="settings.autoRefresh">Auto Refresh</label>
                        <div class="toggle-switch" id="autoRefreshToggle" onclick="toggleAutoRefresh()"></div>
                    </div>
                    <div class="settings-row">
                        <label data-i18n="settings.logRetention">Log Retention</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="logRetentionInput" min="1" max="1000" value="50">
                            <span class="unit" data-i18n="unit.entries">entries</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <label data-i18n="settings.concurrency">Concurrency</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="concurrencyInput" min="1" max="10" value="1">
                            <span class="unit" data-i18n="unit.count"></span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <label data-i18n="settings.defaultShell">Default Shell</label>
                        <select class="shell-selector" id="defaultShellSelector" style="width: auto; flex: none;">
                            <option value="git-bash">Git Bash</option>
                            <option value="cmd">CMD</option>
                            <option value="powershell">PowerShell</option>
                            <option value="wsl">WSL</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label data-i18n="settings.commandTimeout">Command Timeout</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="commandTimeoutInput" min="10" max="3600" value="300">
                            <span class="unit" data-i18n="unit.seconds">sec</span>
                        </div>
                    </div>
                    <div class="btn-group" style="margin-top: 12px;">
                        <button class="btn btn-primary" onclick="saveSettings()" data-i18n="settings.saveSettings">Save Settings</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-txtcmd" class="tab-panel">
            <div class="txtcmd-panel" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                <div class="txtcmd-commands" style="flex: 1; overflow-y: auto; padding: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; font-size: 12px;" data-i18n="pytxt.title">Python Text Transform Commands</span>
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="addPythonTxtCmd()" data-i18n="pytxt.new">+ New</button>
                    </div>
                    <div class="subtitle" style="margin-bottom: 8px; font-size: 11px;" data-i18n="pytxt.desc">Use selected text as input, execute Python command, output replaces selection</div>
                    <div id="pythonTxtCmdList" style="display: flex; flex-direction: column; gap: 6px;"></div>
                </div>

                <div id="pythonTxtCmdEditor" style="display: none; padding: 8px; border-bottom: 1px solid var(--brand-border); gap: 8px; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; font-size: 12px;" id="pythonTxtCmdEditorTitle" data-i18n="pytxt.editTitle">Edit Command</span>
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;" onclick="closePythonTxtCmdEditor()" data-i18n="pytxt.close">× Close</button>
                    </div>
                    <input type="text" id="pythonTxtCmdAlias" data-i18n-placeholder="pytxt.aliasPlaceholder" placeholder="Command alias" style="padding: 6px 8px; border: 1px solid var(--brand-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 12px;">
                    <textarea id="pythonTxtCmdContent" data-i18n-placeholder="pytxt.contentPlaceholder" placeholder="Python code, use sys.stdin.read() for input, print for output" rows="6" style="padding: 6px 8px; border: 1px solid var(--brand-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: monospace; font-size: 11px; resize: vertical;"></textarea>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-primary" style="font-size: 11px; padding: 4px 12px;" onclick="savePythonTxtCmd()" data-i18n="pytxt.save">Save</button>
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 12px;" onclick="runPythonTxtCmdFromEditor()" data-i18n="pytxt.run">Run</button>
                    </div>
                </div>

                <div class="log-container" id="txtCmdLogContainer">
                    <div class="log-resizer" id="txtCmdLogResizer"></div>
                    <div class="log-header" onclick="toggleTxtCmdLog()">
                        <span class="log-title">📝 <span data-i18n="pytxt.logTitle">Execution Log</span></span>
                        <span class="log-toggle-icon" id="txtCmdLogToggle">▼</span>
                    </div>
                    <div class="log-content" id="txtCmdLogContent">
                        <div class="log-entry info">
                            <span class="message" data-i18n="pytxt.logReady">Select text and run Python command to transform</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="commitModal" class="modal-overlay" style="display: none;">
        <div class="modal-dialog">
            <div class="modal-header">
                <span class="modal-title" data-i18n="commit.title">Commit Confirmation</span>
                <button class="modal-close" onclick="closeCommitModal()">×</button>
            </div>
            <div class="modal-body">
                <label style="font-size: 12px; display: block; margin-bottom: 6px;" data-i18n="commit.message">Commit message (leave empty for default):</label>
                <input type="text" id="commitMessageInput" class="modal-input" placeholder="Auto commit" autocomplete="off">
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeCommitModal()" data-i18n="commit.cancel">Cancel</button>
                <button class="btn btn-primary" onclick="confirmCommit()" data-i18n="commit.confirm">Confirm Commit</button>
            </div>
        </div>
    </div>

    <div id="createBranchModal" class="modal-overlay" style="display: none;">
        <div class="modal-dialog">
            <div class="modal-header">
                <span class="modal-title" data-i18n="branch.createConfirm">Create Branch Confirmation</span>
                <button class="modal-close" onclick="closeCreateBranchModal()">×</button>
            </div>
            <div class="modal-body">
                <p style="font-size: 12px; margin-bottom: 6px;" id="createBranchMessage"></p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeCreateBranchModal()" data-i18n="commit.cancel">Cancel</button>
                <button class="btn btn-primary" onclick="confirmCreateBranch()" data-i18n="branch.create">Create Branch</button>
            </div>
        </div>
    </div>`;
    }

    private getJavaScript(): string {
        return `
const vscode = acquireVsCodeApi();
let currentTab = 'git';
let projects = [];
let selectedProjectIds = new Set();
let logs = [];
let customCommands = [];
let envVariables = [];
let editingCommandId = null;
let logExpanded = false;
let savedLogHeight = 180;
let logUserResized = false;
let logInitHeight = '60px';
let branchList = [];
let currentBranch = '';

window.addEventListener('load', () => { vscode.postMessage({ command: 'init' }); applyTranslations(); });

function switchTab(tabId) {
    currentTab = tabId;
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');
    const tabNames = ['git', 'custom', 'settings', 'txtcmd'];
    tabs.forEach((t, i) => {
        if (tabNames[i] === tabId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    panels.forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
    vscode.postMessage({ command: 'switchTab', tabId: tabId });
}

function toggleProjectSelection(projectId) {
    // Directly toggle the selection state in the Set
    if (selectedProjectIds.has(projectId)) {
        selectedProjectIds.delete(projectId);
    } else {
        selectedProjectIds.add(projectId);
    }
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'toggleProjectSelection', projectId: projectId });
}

function toggleSelectAll(checked) {
    if (checked) {
        selectAllProjects();
    } else {
        deselectAllProjects();
    }
}

function toggleCustomSelectAll(checked) {
    if (checked) {
        selectAllProjects();
    } else {
        deselectAllProjects();
    }
}

function selectAllProjects() {
    projects.forEach(p => { if (p.isGitRepo) selectedProjectIds.add(p.id); });
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'selectAllProjects' });
}

function deselectAllProjects() {
    selectedProjectIds.clear();
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'deselectAllProjects' });
}

function executeGitAction(action) {
    if (selectedProjectIds.size === 0) { alert(t('project.selectAtLeastOne')); return; }
    const btn = document.querySelector('.git-btn.' + action);
    if (btn) btn.classList.add('executing');

    switch(action) {
        case 'pull': vscode.postMessage({ command: 'gitPull' }); break;
        case 'commit':
            showCommitModal();
            break;
        case 'change': vscode.postMessage({ command: 'gitChange' }); break;
        case 'branch':
            const branchInput = document.getElementById('branchInput');
            const branchName = branchInput.value.trim();
            if (branchName) {
                vscode.postMessage({ command: 'gitBranch', branch: branchName });
            } else {
                alert(t('branch.selectOrInput'));
                if (btn) btn.classList.remove('executing');
            }
            break;
        case 'push': vscode.postMessage({ command: 'gitPush' }); break;
    }
}

function showCommitModal() {
    const modal = document.getElementById('commitModal');
    const input = document.getElementById('commitMessageInput');
    if (modal && input) {
        input.value = '';
        modal.style.display = 'flex';
        input.focus();
    }
}

function closeCommitModal() {
    const modal = document.getElementById('commitModal');
    if (modal) modal.style.display = 'none';
    const btn = document.querySelector('.git-btn.commit');
    if (btn) btn.classList.remove('executing');
}

function confirmCommit() {
    const input = document.getElementById('commitMessageInput');
    const message = input ? input.value.trim() : '';
    closeCommitModal();
    vscode.postMessage({ command: 'gitCommit', message: message });
}

let pendingBranchName = '';

function showCreateBranchConfirm(branch, projectCount) {
    pendingBranchName = branch;
    const modal = document.getElementById('createBranchModal');
    const msg = document.getElementById('createBranchMessage');
    if (modal && msg) {
        msg.textContent = t('branch.createMessage').replace('%branch%', branch).replace('%count%', projectCount);
        modal.style.display = 'flex';
    }
}

function closeCreateBranchModal() {
    const modal = document.getElementById('createBranchModal');
    if (modal) modal.style.display = 'none';
    pendingBranchName = '';
    const btn = document.querySelector('.git-btn.branch');
    if (btn) btn.classList.remove('executing');
}

function confirmCreateBranch() {
    if (pendingBranchName) {
        const branch = pendingBranchName;
        closeCreateBranchModal();
        vscode.postMessage({ command: 'createBranch', branch: branch });
    }
}

function refreshProjects() { vscode.postMessage({ command: 'refreshProjects' }); }
function setShell(shell) { vscode.postMessage({ command: 'setShell', shell: shell }); }

function changeLanguage(lang) {
    currentLang = lang;
    applyTranslations();
    vscode.postMessage({ command: 'setLanguage', language: lang });
    // Re-render dynamic content
    updateProjectList();
    updateCommandList();
    renderLogs();
    renderTxtCmdLogs();
    renderPythonTxtCmdList();
}

function onBranchInputClick(e) {
    e.stopPropagation();
    const selected = projects.find(p => selectedProjectIds.has(p.id));
    if (!selected) {
        return;
    }
    if (branchList.length === 0) {
        document.getElementById('branchLoading').style.display = 'block';
        document.getElementById('branchList').innerHTML = '';
        document.getElementById('branchDropdown').classList.add('show');
        vscode.postMessage({ command: 'getBranchList', projectId: selected.id });
    } else {
        document.getElementById('branchDropdown').classList.toggle('show');
    }
}

function toggleBranchDropdown() {
    const dropdown = document.getElementById('branchDropdown');
    dropdown.classList.toggle('show');
}

function filterBranchList(filter) {
    const list = document.getElementById('branchList');
    const filtered = branchList.filter(b => b.includes(filter.toLowerCase()));
    renderBranchList(filtered);
}

function selectBranch(branchName) {
    document.getElementById('branchInput').value = branchName;
    currentBranch = branchName;
    document.getElementById('branchDropdown').classList.remove('show');
}

function renderBranchList(list) {
    const container = document.getElementById('branchList');
    container.innerHTML = '';
    list.forEach(b => {
        const isCurrent = b === currentBranch;
        const div = document.createElement('div');
        if (isCurrent) div.className = 'current';
        div.textContent = b;
        div.onclick = function() { selectBranch(b); };
        container.appendChild(div);
    });
}

function updateBranchList(branches, current) {
    branchList = branches;
    currentBranch = current;
    document.getElementById('branchLoading').style.display = 'none';
    renderBranchList(branches);
    const branchInput = document.getElementById('branchInput');
    if (branchInput && current && !branchInput.value) {
        branchInput.value = current;
    }
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('branchDropdown');
    const selector = document.querySelector('.git-branch-selector');
    if (dropdown && dropdown.classList.contains('show') && !selector.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

function showCommandEditor(commandId) {
    editingCommandId = commandId;
    document.getElementById('commandEditor').classList.add('show');
    if (commandId) {
        const cmd = customCommands.find(c => c.id === commandId);
        if (cmd) {
            document.getElementById('commandAlias').value = cmd.alias;
            document.getElementById('commandContent').value = cmd.content;
        }
    } else {
        document.getElementById('commandAlias').value = '';
        document.getElementById('commandContent').value = '';
    }
}

function hideCommandEditor() {
    editingCommandId = null;
    document.getElementById('commandEditor').classList.remove('show');
    document.getElementById('commandAlias').value = '';
    document.getElementById('commandContent').value = '';
}

function saveCommand() {
    const alias = document.getElementById('commandAlias').value.trim();
    const content = document.getElementById('commandContent').value.trim();
    if (!alias || !content) { alert(t('cmd.fillAliasAndContent')); return; }

    const command = {
        id: editingCommandId || Date.now().toString(),
        alias: alias,
        content: content
    };

    if (editingCommandId) {
        vscode.postMessage({ command: 'updateCommand', cmd: command });
    } else {
        vscode.postMessage({ command: 'addCommand', cmd: command });
    }
    hideCommandEditor();
}

function deleteCommand(commandId) { vscode.postMessage({ command: 'deleteCommand', commandId: commandId }); }

function runCommand(commandId) {
    if (selectedProjectIds.size === 0) {
        document.getElementById('selectionWarning').classList.add('show');
        return;
    }
    vscode.postMessage({ command: 'runCommand', commandId: commandId });
}

function saveCommonParams() {
    const params = document.getElementById('commonParams').value;
    vscode.postMessage({ command: 'saveCommonParameters', parameters: params });
}

function resetCommonParams() {
    document.getElementById('commonParams').value = JSON.stringify({
        "deployBucket": "my-bucket",
        "registry": "registry.example.com",
        "nodeVersion": "18",
        "buildCommand": "npm run build",
        "stagingUrl": "https://staging.example.com"
    }, null, 2);
}

function addEnvVariable() { vscode.postMessage({ command: 'addEnvVariable', variable: { key: '', value: '' } }); }

function updateEnvVariable(index, key, value) {
    vscode.postMessage({ command: 'updateEnvVariable', index: index, variable: { key: key, value: value } });
}

function deleteEnvVariable(index) { vscode.postMessage({ command: 'deleteEnvVariable', index: index }); }

function saveSettings() {
    const settings = {
        autoRefresh: document.getElementById('autoRefreshToggle').classList.contains('active'),
        logRetention: parseInt(document.getElementById('logRetentionInput').value) || 50,
        concurrency: parseInt(document.getElementById('concurrencyInput').value) || 1,
        defaultShell: document.getElementById('defaultShellSelector').value,
        commandTimeout: parseInt(document.getElementById('commandTimeoutInput').value) || 300
    };
    vscode.postMessage({ command: 'saveSettings', settings: settings });
    alert(t('settings.settingsSaved'));
}

function toggleAutoRefresh() {
    document.getElementById('autoRefreshToggle').classList.toggle('active');
}

function clearLogs(e) { e.stopPropagation(); vscode.postMessage({ command: 'clearLogs' }); }

function toggleLog() {
    const containers = document.querySelectorAll('.log-container');
    const currentHeight = containers[0] ? containers[0].getBoundingClientRect().height : 60;

    if (currentHeight <= 80) {
        // Expand to saved height
        logExpanded = true;
        logUserResized = true;
        const targetH = savedLogHeight + 'px';
        logInitHeight = targetH;
        containers.forEach(c => { c.style.height = targetH; });
    } else {
        // Collapse to minimum
        logExpanded = false;
        logUserResized = false;
        logInitHeight = '60px';
        containers.forEach(c => { c.style.height = '60px'; });
    }
    vscode.postMessage({ command: 'toggleLogExpanded', expanded: logExpanded });
}

// --- Log resizer drag-to-resize ---
(function initLogResizer() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    let activeResizer = null;
    let activeContainer = null;
    let draggedHeight = '';

    function onMouseDown(e) {
        const resizer = e.target.closest('.log-resizer');
        if (!resizer) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        activeResizer = resizer;
        activeContainer = resizer.parentElement;
        startY = e.clientY;
        startHeight = activeContainer.getBoundingClientRect().height;
        draggedHeight = '';
        resizer.classList.add('active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        // Disable pointer events on log-header to prevent click after drag
        document.querySelectorAll('.log-header').forEach(h => {
            h.dataset._oldPointerEvents = h.style.pointerEvents;
            h.style.pointerEvents = 'none';
        });
    }

    function onMouseMove(e) {
        if (!isResizing || !activeContainer) return;
        e.preventDefault();
        const delta = startY - e.clientY;
        const newHeight = Math.min(Math.max(startHeight + delta, 40), window.innerHeight * 0.8);
        activeContainer.style.height = newHeight + 'px';
        draggedHeight = newHeight + 'px';
        logExpanded = newHeight > 60;
        if (newHeight > 80) {
            savedLogHeight = newHeight;
            logUserResized = true;
            logInitHeight = newHeight + 'px';
        }
        vscode.postMessage({ command: 'logHeightChange', height: newHeight });
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        const finalHeight = draggedHeight;
        if (activeResizer) activeResizer.classList.remove('active');
        activeResizer = null;
        activeContainer = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Restore pointer events on log-header
        document.querySelectorAll('.log-header').forEach(h => {
            h.style.pointerEvents = h.dataset._oldPointerEvents || '';
            delete h.dataset._oldPointerEvents;
        });
        // Sync all log containers to the same final height
        if (finalHeight) {
            document.querySelectorAll('.log-container').forEach(c => {
                c.style.height = finalHeight;
            });
        }
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
})();

// --- Panel resizer: 拖拽调节 Cmd Tab 中命令列表/项目列表的高度 ---
(function initPanelResizer() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    let activeResizer = null;
    let activeTarget = null;

    function onMouseDown(e) {
        const resizer = e.target.closest('.panel-resizer');
        if (!resizer) return;
        const targetId = resizer.dataset.target;
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        activeResizer = resizer;
        activeTarget = target;
        startY = e.clientY;
        startHeight = target.getBoundingClientRect().height;
        resizer.classList.add('active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
        if (!isResizing || !activeTarget) return;
        e.preventDefault();
        const delta = e.clientY - startY;
        const newHeight = Math.min(Math.max(40, startHeight + delta), window.innerHeight * 0.7);
        activeTarget.style.flex = '0 0 ' + newHeight + 'px';
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        if (activeResizer) activeResizer.classList.remove('active');
        activeResizer = null;
        activeTarget = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
})();

function updateProjectList() {
    const list1 = document.getElementById('projectList');
    const list2 = document.getElementById('customProjectList');

    if (projects.length === 0) {
        list1.innerHTML = '<div class="no-projects-message">' + t('project.noProjects') + '</div>';
        list2.innerHTML = list1.innerHTML;
        return;
    }

    list1.innerHTML = '';
    list2.innerHTML = '';

    projects.forEach(p => {
        const isSelected = selectedProjectIds.has(p.id);
        const changeClass = (p.changeCount === 0) ? 'success' : (p.changeCount <= 2 ? 'warning' : 'error');

        function createItem() {
            const item = document.createElement('div');
            item.className = 'project-item' + (isSelected ? ' selected' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'project-checkbox';
            checkbox.dataset.projectId = p.id;
            checkbox.checked = isSelected;
            checkbox.onchange = function(e) { e.stopPropagation(); toggleProjectSelection(p.id); };
            item.appendChild(checkbox);

            const info = document.createElement('div');
            info.className = 'project-info';

            const name = document.createElement('div');
            name.className = 'project-name';
            name.textContent = p.name;
            info.appendChild(name);

            const branch = document.createElement('div');
            branch.className = 'project-branch';
            branch.innerHTML = '<svg class="branch-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 4.5v7"/><path d="M4 6c0 0 0-1.5 4-1.5h2.5"/></svg><span>' + (p.currentBranch || t('project.noBranch')) + '</span>';
            info.appendChild(branch);

            item.appendChild(info);

            const count = document.createElement('span');
            count.className = 'change-count ' + changeClass;
            count.textContent = p.changeCount || 0;
            item.appendChild(count);

            item.onclick = function() { toggleProjectSelection(p.id); };

            return item;
        }

        list1.appendChild(createItem());
        list2.appendChild(createItem());
    });

    document.getElementById('projectCount').textContent = projects.length;
    document.getElementById('customProjectCount').textContent = projects.length;

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        const gitProjects = projects.filter(p => p.isGitRepo);
        const allSelected = gitProjects.length > 0 && gitProjects.every(p => selectedProjectIds.has(p.id));
        selectAllCheckbox.checked = allSelected;
    }

    const customSelectAllCheckbox = document.getElementById('customSelectAllCheckbox');
    if (customSelectAllCheckbox) {
        const gitProjects = projects.filter(p => p.isGitRepo);
        const allSelected = gitProjects.length > 0 && gitProjects.every(p => selectedProjectIds.has(p.id));
        customSelectAllCheckbox.checked = allSelected;
    }

    updatePushBadge();
}

function updatePushBadge() {
    // 同步已选择项目数显示（Git Tab 与 Cmd Tab）
    const count = selectedProjectIds.size;
    const gitEl = document.getElementById('gitSelectedCount');
    const customEl = document.getElementById('customSelectedCount');
    if (gitEl) { gitEl.innerHTML = '<span>' + t('project.selected') + '</span> ' + count; }
    if (customEl) { customEl.innerHTML = '<span>' + t('project.selected') + '</span> ' + count; }
}

// 展开/收起项目列表
function toggleProjectList(listId, btnId) {
    const list = document.getElementById(listId);
    const btn = document.getElementById(btnId);
    if (!list || !btn) return;
    const collapsed = list.classList.toggle('collapsed');
    btn.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? '▶' : '▼';
    btn.title = collapsed ? t('project.expand') : t('project.collapse');
}

function updateSelectionWarning() {
    const warning = document.getElementById('selectionWarning');
    warning.classList.toggle('show', selectedProjectIds.size === 0);
}

function updateCommandList() {
    const list = document.getElementById('commandList');
    if (customCommands.length === 0) {
        list.innerHTML = '<div class="empty-state">' + t('cmd.empty') + '</div>';
        return;
    }

    list.innerHTML = '';
    customCommands.forEach(cmd => {
        const preview = cmd.content.split('\\n')[0];

        const item = document.createElement('div');
        item.className = 'command-item';

        const main = document.createElement('div');
        main.className = 'cmd-main';
        main.onclick = function() { showCommandEditor(cmd.id); };

        const alias = document.createElement('span');
        alias.className = 'alias';
        alias.textContent = cmd.alias;
        main.appendChild(alias);

        const previewSpan = document.createElement('span');
        previewSpan.className = 'cmd-content-preview';
        previewSpan.textContent = preview;
        main.appendChild(previewSpan);

        item.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'actions';

        const runBtn = document.createElement('button');
        runBtn.className = 'cmd-action-btn run';
        runBtn.title = t('cmd.run');
        runBtn.textContent = '▶';
        runBtn.onclick = function() { runCommand(cmd.id); };
        actions.appendChild(runBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'cmd-action-btn edit';
        editBtn.title = t('cmd.edit');
        editBtn.textContent = '✎';
        editBtn.onclick = function() { showCommandEditor(cmd.id); };
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'cmd-action-btn delete';
        delBtn.title = t('cmd.delete');
        delBtn.textContent = '🗑';
        delBtn.onclick = function() { deleteCommand(cmd.id); };
        actions.appendChild(delBtn);

        item.appendChild(actions);
        list.appendChild(item);
    });
}

function updateEnvVariables() {
    const list = document.getElementById('envVariableList');
    list.innerHTML = '';
    envVariables.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'env-variable-item';

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'key';
        keyInput.value = v.key;
        keyInput.placeholder = 'Key';
        keyInput.onchange = function() { updateEnvVariable(i, this.value, v.value); };
        item.appendChild(keyInput);

        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.textContent = '=';
        item.appendChild(separator);

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.value = v.value;
        valInput.placeholder = 'Value';
        valInput.onchange = function() { updateEnvVariable(i, v.key, this.value); };
        item.appendChild(valInput);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.onclick = function() { deleteEnvVariable(i); };
        item.appendChild(delBtn);

        list.appendChild(item);
    });
}

function addLogEntry(entry) {
    logs.push(entry);
    if (logs.length > 50) logs.shift();
    renderLogs();
}

function renderLogs() {
    const content1 = document.getElementById('logContent');
    const content2 = document.getElementById('customLogContent');

    if (logs.length === 0) {
        content1.innerHTML = '<div class="log-entry info"><span class="timestamp">[--:--:--]</span><span class="status-icon">▶</span><span class="message">' + t('log.ready') + '</span></div>';
        content2.innerHTML = content1.innerHTML;
        return;
    }

    content1.innerHTML = logs.map(entry => renderLogEntry(entry)).join('');
    content2.innerHTML = content1.innerHTML;
    content1.scrollTop = content1.scrollHeight;
    content2.scrollTop = content2.scrollHeight;
}

function renderLogEntry(entry) {
    const statusIcon = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✗' : '▶';
    let html = '<div class="log-entry ' + entry.type + '">';
    html += '<span class="timestamp">[' + entry.timestamp + ']</span>';
    html += '<span class="status-icon">' + statusIcon + '</span>';
    if (entry.shellType) html += '<span class="shell-type">[' + entry.shellType + ']</span>';
    if (entry.projectName) html += '<span class="project-name">' + entry.projectName + '</span>';
    html += '<span class="message">' + entry.message + '</span>';
    if (entry.details) html += '<div class="tree-line">' + entry.details + '</div>';
    html += '</div>';
    return html;
}

let pythonTxtCommands = [];
let pythonTxtEditingId = null;
let txtCmdLogExpanded = false;
let txtCmdSavedLogHeight = 180;
let txtCmdLogs = [];

function addPythonTxtCmd() {
    pythonTxtEditingId = null;
    document.getElementById('pythonTxtCmdEditorTitle').textContent = t('pytxt.newTitle');
    document.getElementById('pythonTxtCmdAlias').value = '';
    document.getElementById('pythonTxtCmdContent').value = 'import sys\\n\\ntext = sys.stdin.read()\\nresult = text\\nprint(result)';
    document.getElementById('pythonTxtCmdEditor').style.display = 'flex';
}

function editPythonTxtCmd(id) {
    const cmd = pythonTxtCommands.find(c => c.id === id);
    if (!cmd) return;
    pythonTxtEditingId = id;
    document.getElementById('pythonTxtCmdEditorTitle').textContent = t('pytxt.editTitle');
    document.getElementById('pythonTxtCmdAlias').value = cmd.alias;
    document.getElementById('pythonTxtCmdContent').value = cmd.content;
    document.getElementById('pythonTxtCmdEditor').style.display = 'flex';
}

function closePythonTxtCmdEditor() {
    pythonTxtEditingId = null;
    document.getElementById('pythonTxtCmdEditor').style.display = 'none';
}

function savePythonTxtCmd() {
    const alias = document.getElementById('pythonTxtCmdAlias').value.trim();
    const content = document.getElementById('pythonTxtCmdContent').value;
    if (!alias) { alert(t('pytxt.inputAlias')); return; }

    if (pythonTxtEditingId) {
        const idx = pythonTxtCommands.findIndex(c => c.id === pythonTxtEditingId);
        if (idx >= 0) {
            pythonTxtCommands[idx].alias = alias;
            pythonTxtCommands[idx].content = content;
        }
    } else {
        const newCmd = { id: 'cmd_' + Date.now(), alias, content };
        pythonTxtCommands.push(newCmd);
        pythonTxtEditingId = newCmd.id;
    }
    vscode.postMessage({ command: 'savePythonTxtCommands', commands: pythonTxtCommands });
    renderPythonTxtCmdList();
    closePythonTxtCmdEditor();
}

function deletePythonTxtCmd(id) {
    if (!confirm(t('pytxt.confirmDelete'))) return;
    pythonTxtCommands = pythonTxtCommands.filter(c => c.id !== id);
    vscode.postMessage({ command: 'savePythonTxtCommands', commands: pythonTxtCommands });
    if (pythonTxtEditingId === id) closePythonTxtCmdEditor();
    renderPythonTxtCmdList();
}

function runPythonTxtCmd(id) {
    const cmd = pythonTxtCommands.find(c => c.id === id);
    if (!cmd) return;
    vscode.postMessage({ command: 'runPythonTxtCmd', cmd: cmd });
}

function runPythonTxtCmdFromEditor() {
    const alias = document.getElementById('pythonTxtCmdAlias').value.trim() || t('pytxt.tempCmd');
    const content = document.getElementById('pythonTxtCmdContent').value;
    vscode.postMessage({ command: 'runPythonTxtCmd', cmd: { id: 'temp', alias, content } });
}

function renderPythonTxtCmdList() {
    const list = document.getElementById('pythonTxtCmdList');
    if (!list) return;
    if (pythonTxtCommands.length === 0) {
        list.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-size: 11px; padding: 10px; text-align: center;">' + t('pytxt.empty') + '</div>';
        return;
    }
    list.innerHTML = '';
    pythonTxtCommands.forEach(cmd => {
        const firstLine = cmd.content.split('\\n')[0].substring(0, 50);
        const item = document.createElement('div');
        item.className = 'cmd-item';
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--brand-surface); border: 1px solid var(--brand-border); border-radius: 4px; cursor: pointer;';
        item.onmouseover = function() { this.style.borderColor = 'var(--vscode-focusBorder)'; };
        item.onmouseout = function() { this.style.borderColor = 'var(--brand-border)'; };

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'flex: 1; overflow: hidden;';
        infoDiv.innerHTML = '<div style="font-weight: 600; font-size: 12px; color: var(--vscode-foreground);">' + cmd.alias + '</div>' +
            '<div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + firstLine + '</div>';
        item.appendChild(infoDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; gap: 4px; margin-left: 8px;';

        const runBtn = document.createElement('button');
        runBtn.className = 'btn btn-secondary';
        runBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        runBtn.textContent = t('pytxt.runBtn');
        runBtn.title = t('pytxt.run');
        runBtn.onclick = function(e) { e.stopPropagation(); runPythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(runBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary';
        editBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        editBtn.textContent = '✎';
        editBtn.title = t('cmd.edit');
        editBtn.onclick = function(e) { e.stopPropagation(); editPythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-secondary';
        deleteBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        deleteBtn.textContent = '🗑';
        deleteBtn.title = t('cmd.delete');
        deleteBtn.onclick = function(e) { e.stopPropagation(); deletePythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(actionsDiv);
        list.appendChild(item);
    });
}

function toggleTxtCmdLog() {
    const container = document.getElementById('txtCmdLogContainer');
    if (!container) return;
    const currentHeight = container.getBoundingClientRect().height;
    if (currentHeight <= 80) {
        txtCmdLogExpanded = true;
        container.style.height = txtCmdSavedLogHeight + 'px';
    } else {
        txtCmdLogExpanded = false;
        container.style.height = '60px';
    }
    const icon = document.getElementById('txtCmdLogToggle');
    if (icon) icon.textContent = txtCmdLogExpanded ? '▼' : '▶';
}

function addTxtCmdLogEntry(entry) {
    txtCmdLogs.push(entry);
    if (txtCmdLogs.length > 50) txtCmdLogs.shift();
    renderTxtCmdLogs();
}

function renderTxtCmdLogs() {
    const content = document.getElementById('txtCmdLogContent');
    if (!content) return;
    if (txtCmdLogs.length === 0) {
        content.innerHTML = '<div class="log-entry info"><span class="timestamp">[--:--:--]</span><span class="status-icon">▶</span><span class="message">' + t('pytxt.logReady') + '</span></div>';
        return;
    }
    content.innerHTML = txtCmdLogs.map(entry => {
        const statusIcon = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✗' : '▶';
        let html = '<div class="log-entry ' + entry.type + '">';
        html += '<span class="timestamp">[' + entry.timestamp + ']</span>';
        html += '<span class="status-icon">' + statusIcon + '</span>';
        if (entry.shellType) html += '<span class="shell-type">[' + entry.shellType + ']</span>';
        html += '<span class="message">' + entry.message + '</span>';
        if (entry.details) html += '<div class="tree-line">' + entry.details + '</div>';
        html += '</div>';
        return html;
    }).join('');
    content.scrollTop = content.scrollHeight;
}

(function initTxtCmdLogResizer() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    function onMouseDown(e) {
        const resizer = e.target.closest('#txtCmdLogResizer');
        if (!resizer) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startY = e.clientY;
        const container = document.getElementById('txtCmdLogContainer');
        startHeight = container.getBoundingClientRect().height;
        resizer.classList.add('active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        const headers = document.querySelectorAll('#txtCmdLogContainer .log-header');
        headers.forEach(h => { h.dataset._oldPE = h.style.pointerEvents; h.style.pointerEvents = 'none'; });
    }

    function onMouseMove(e) {
        if (!isResizing) return;
        e.preventDefault();
        const delta = startY - e.clientY;
        const newHeight = Math.min(Math.max(startHeight + delta, 40), window.innerHeight * 0.8);
        const container = document.getElementById('txtCmdLogContainer');
        container.style.height = newHeight + 'px';
        txtCmdLogExpanded = newHeight > 60;
        if (newHeight > 80) txtCmdSavedLogHeight = newHeight;
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const resizer = document.getElementById('txtCmdLogResizer');
        if (resizer) resizer.classList.remove('active');
        const headers = document.querySelectorAll('#txtCmdLogContainer .log-header');
        headers.forEach(h => { h.style.pointerEvents = h.dataset._oldPE || ''; delete h.dataset._oldPE; });
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
})();

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateProjects': projects = message.projects; updateProjectList(); break;
        case 'updateLogs': logs = message.logs; renderLogs(); break;
        case 'addLog': addLogEntry(message.entry); break;
        case 'updateCommands': customCommands = message.commands; updateCommandList(); break;
        case 'updateEnvVariables': envVariables = message.variables; updateEnvVariables(); break;
        case 'updateBranchList': updateBranchList(message.branches, message.current); break;
        case 'updateSettings':
            document.getElementById('commonParams').value = JSON.stringify(message.settings.commonParameters, null, 2);
            document.getElementById('autoRefreshToggle').classList.toggle('active', message.settings.autoRefresh);
            document.getElementById('logRetentionInput').value = message.settings.logRetention;
            document.getElementById('concurrencyInput').value = message.settings.concurrency;
            document.getElementById('defaultShellSelector').value = message.settings.defaultShell;
            document.getElementById('commandTimeoutInput').value = message.settings.commandTimeout;
            document.getElementById('shellSelector').value = message.settings.defaultShell;
            if (message.settings.language) {
                document.getElementById('languageSelector').value = message.settings.language;
            }
            break;
        case 'setLanguage':
            currentLang = message.language;
            applyTranslations();
            document.getElementById('languageSelector').value = message.language;
            updateProjectList();
            updateCommandList();
            renderLogs();
            renderTxtCmdLogs();
            renderPythonTxtCmdList();
            break;
        case 'jsonError':
            const jsonStatus = document.getElementById('jsonStatus');
            jsonStatus.textContent = message.error;
            jsonStatus.className = 'status-message error';
            setTimeout(() => { jsonStatus.textContent = ''; jsonStatus.className = 'status-message'; }, 3000);
            break;
        case 'jsonSuccess':
            const jsonStatus2 = document.getElementById('jsonStatus');
            jsonStatus2.textContent = t('settings.saved');
            jsonStatus2.className = 'status-message success';
            setTimeout(() => { jsonStatus2.textContent = ''; jsonStatus2.className = 'status-message'; }, 2000);
            break;
        case 'restoreLogHeight':
            const restoredH = message.height;
            if (restoredH && restoredH > 60) {
                const containers = document.querySelectorAll('.log-container');
                containers.forEach(c => { c.style.height = restoredH + 'px'; });
                logExpanded = true;
                savedLogHeight = restoredH;
                logUserResized = true;
            }
            break;
        case 'updatePythonTxtCommands':
            pythonTxtCommands = message.commands;
            renderPythonTxtCmdList();
            break;
        case 'addTxtCmdLog':
            addTxtCmdLogEntry(message.entry);
            break;
        case 'showCreateBranchConfirm':
            showCreateBranchConfirm(message.branch, message.projectCount);
            break;
    }
});`;
    }

    private handleInit(): void {
        // Send current log height to webview so it can restore user's resize
        this._view?.webview.postMessage({
            command: 'restoreLogHeight',
            height: this._logContainerHeight
        });
        this.updateWebview();
    }

    private async handleSetLanguage(language: string): Promise<void> {
        this._language = language as Language;
        this.saveAllConfig();
        this._view?.webview.postMessage({ command: 'languageChanged', language: this._language });
    }

    private handleToggleLogExpanded(expanded: boolean): void {
        // Save the toggle state
    }

    private handleLogHeightChange(height: number): void {
        this._logContainerHeight = height;
    }

    private async handleSavePythonTxtCommands(commands: PythonTxtCommand[]): Promise<void> {
        this._pythonTxtCommands = commands;
        PythonTxtCmdStore.getInstance().save(commands);
        this._view?.webview.postMessage({ command: 'updatePythonTxtCommands', commands: this._pythonTxtCommands });
    }

    private async handleRunPythonTxtCmd(cmd: PythonTxtCommand): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.addTxtCmdLog(t('backend.noEditor', this._language), 'error');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText || selectedText.trim().length === 0) {
            this.addTxtCmdLog(t('backend.selectText', this._language), 'error');
            return;
        }

        this.addTxtCmdLog(`${t('backend.execCmd', this._language)}: ${cmd.alias}`, 'info');

        try {
            const result = await this.executePythonTransform(selectedText, cmd.content);
            if (result.success) {
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, result.output);
                });
                this.addTxtCmdLog(`${t('backend.transformSuccess', this._language)} ${result.output.length} ${t('backend.chars', this._language)}`, 'success');
            } else {
                this.addTxtCmdLog(`${t('backend.execFailed', this._language)}: ${result.error}`, 'error', result.error);
            }
        } catch (error: any) {
            this.addTxtCmdLog(`${t('backend.execError', this._language)}: ${error.message}`, 'error');
        }
    }

    private executePythonTransform(input: string, script: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            const cp = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const tmpDir = os.tmpdir();
            const scriptPath = path.join(tmpDir, `mpt_py_${Date.now()}.py`);

            try {
                fs.writeFileSync(scriptPath, script, 'utf8');

                const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
                const child = cp.exec(pythonCmd + ' "' + scriptPath + '"', {
                    encoding: 'utf8',
                    maxBuffer: 1024 * 1024 * 10,
                    timeout: 30000,
                    env: { ...process.env, ...this.getEnvVariables() }
                }, (error: Error | null, stdout: string, stderr: string) => {
                    try { fs.unlinkSync(scriptPath); } catch (e) { }
                    if (error) {
                        const errMsg = error.message;
                        if (errMsg.includes('ENOENT') || errMsg.includes('not recognized')) {
                            resolve({ success: false, output: '', error: t('backend.pythonNotFound', this._language) });
                        } else {
                            resolve({ success: false, output: stdout, error: stderr.trim() || errMsg });
                        }
                    } else {
                        resolve({ success: true, output: stdout });
                    }
                });

                if (child.stdin) {
                    child.stdin.write(input);
                    child.stdin.end();
                }
            } catch (error: any) {
                resolve({ success: false, output: '', error: error.message });
            }
        });
    }

    private addTxtCmdLog(message: string, type: 'success' | 'error' | 'info' = 'info', details?: string): void {
        const now = new Date();
        const timestamp = now.toLocaleTimeString(this._language === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
        this._view?.webview.postMessage({
            command: 'addTxtCmdLog',
            entry: { timestamp, type, message, details }
        });
    }

    private handleSwitchTab(tabId: string): void {
        if (tabId === 'settings') {
            this.loadSettings();
            this.loadEnvVariables();
            this.updateWebview();
        }
    }

    private handleToggleProjectSelection(projectId: string): void {
        if (this._selectedProjectIds.has(projectId)) {
            this._selectedProjectIds.delete(projectId);
        } else {
            this._selectedProjectIds.add(projectId);
        }
        this.updateWebview();
    }

    private handleSelectAllProjects(): void {
        this._selectedProjectIds.clear();
        this._projects.forEach(p => { if (p.isGitRepo) this._selectedProjectIds.add(p.id); });
        this.updateWebview();
    }

    private handleDeselectAllProjects(): void {
        this._selectedProjectIds.clear();
        this.updateWebview();
    }

    private async handleGitPull(): Promise<void> { await this.executeGitOperation('pull'); }
    private async handleGitCommit(message: string): Promise<void> { await this.executeGitOperation('commit', undefined, message); }
    private async handleGitChange(): Promise<void> { await this.executeGitOperation('status'); }
    private async handleGitBranch(branch: string): Promise<void> {
        const selectedProjects = this._projects.filter(p => this._selectedProjectIds.has(p.id) && p.isGitRepo);
        if (selectedProjects.length === 0) {
            vscode.window.showInformationMessage(t('backend.noGitProjects', this._language));
            return;
        }

        const firstProject = selectedProjects[0];
        const branchExists = await GitUtils.gitBranchExists(firstProject, branch);

        if (!branchExists) {
            this._view?.webview.postMessage({
                command: 'showCreateBranchConfirm',
                branch: branch,
                projectCount: selectedProjects.length
            });
        } else {
            await this.executeGitOperation('switch-branch', branch);
        }
    }

    private async handleCreateBranch(branch: string): Promise<void> {
        await this.executeGitOperation('create-branch', branch);
    }

    private async handleGetBranchList(projectId: string): Promise<void> {
        const project = this._projects.find(p => p.id === projectId);
        if (!project || !project.path) return;

        try {
            const result = await GitUtils.gitBranches(project);
            if (result.success && result.output) {
                const lines = result.output.split('\n').filter(line => line.trim().length > 0);
                const branches: string[] = [];
                let currentBranch = '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('* ')) {
                        currentBranch = trimmed.substring(2).replace(/^remotes\/origin\//, '');
                        branches.push(currentBranch);
                    } else {
                        const branchName = trimmed.replace(/^remotes\/origin\//, '');
                        if (!branches.includes(branchName)) {
                            branches.push(branchName);
                        }
                    }
                }

                this._view?.webview.postMessage({
                    command: 'updateBranchList',
                    branches: branches,
                    current: currentBranch
                });
            }
        } catch (error) {
            console.error('Failed to get branch list:', error);
        }
    }
    private async handleGitPush(): Promise<void> { await this.executeGitOperation('custom', undefined, undefined, 'push'); }

    private async executeGitOperation(operation: string, branch?: string, commitMessage?: string, customCommand?: string): Promise<void> {
        const selectedProjects = this._projects.filter(p => this._selectedProjectIds.has(p.id) && p.isGitRepo);
        if (selectedProjects.length === 0) {
            vscode.window.showInformationMessage(t('backend.noGitProjects', this._language));
            return;
        }

        this.addLog('▶ git ' + operation + ' — ' + selectedProjects.length + ' projects');

        let successCount = 0;
        for (const project of selectedProjects) {
            this.addLog('├── ' + project.name + ' (' + (project.currentBranch || 'no branch') + ')', undefined, project.name);

            try {
                let result: GitOperationResult;
                switch (operation) {
                    case 'pull': result = await GitUtils.gitPull(project); break;
                    case 'commit': result = await GitUtils.gitCommit(project, commitMessage || ''); break;
                    case 'status': result = await GitUtils.gitStatus(project); break;
                    case 'switch-branch': result = await GitUtils.gitSwitchBranch(project, branch || ''); break;
                    case 'create-branch': 
                        if (!branch) {
                            result = { success: false, message: 'Branch name is required', project };
                        } else {
                            const exists = await GitUtils.gitBranchExists(project, branch);
                            if (exists) {
                                result = await GitUtils.gitSwitchBranch(project, branch);
                            } else {
                                result = await GitUtils.gitCreateBranch(project, branch);
                            }
                        }
                        break;
                    case 'custom': result = await GitUtils.gitCustomCommand(project, customCommand || ''); break;
                    default: result = { success: false, message: 'Unknown operation', project };
                }

                if (result.success) {
                    successCount++;
                    this.addLog(result.output || 'Success', 'success', project.name);
                } else {
                    this.addLog(result.error || result.message, 'error', project.name);
                }
            } catch (error) {
                this.addLog('Error: ' + error, 'error', project.name);
            }
        }

        this.addLog('✓ ' + t('backend.completed', this._language) + ' — ' + successCount + '/' + selectedProjects.length + ' ' + t('backend.success', this._language), successCount === selectedProjects.length ? 'success' : 'error');
        await this.loadProjects();
        this.updateWebview();
    }

    private async handleRefreshProjects(): Promise<void> {
        this._projectScanner.clearCache();
        await this.loadProjects();
        this.updateWebview();
    }

    private async handleSetShell(shell: string): Promise<void> {
        this._currentShell = shell;
        this.saveAllConfig();
    }

    private async handleAddCommand(command: CustomCommand): Promise<void> {
        this._customCommands.push(command);
        await this.saveCommands();
        this.updateWebview();
    }

    private async handleUpdateCommand(command: CustomCommand): Promise<void> {
        const index = this._customCommands.findIndex(c => c.id === command.id);
        if (index !== -1) {
            this._customCommands[index] = command;
            await this.saveCommands();
            this.updateWebview();
        }
    }

    private async handleDeleteCommand(commandId: string): Promise<void> {
        this._customCommands = this._customCommands.filter(c => c.id !== commandId);
        await this.saveCommands();
        this.updateWebview();
    }

    private async handleRunCommand(commandId: string): Promise<void> {
        const command = this._customCommands.find(c => c.id === commandId);
        if (!command) return;

        const selectedProjects = this._projects.filter(p => this._selectedProjectIds.has(p.id));
        if (selectedProjects.length === 0) {
            vscode.window.showInformationMessage(t('backend.noProjects', this._language));
            return;
        }

        const shellLabel = this.getShellLabel(this._currentShell);
        this.addLog('▶ [' + shellLabel + '] ' + command.alias + ' — ' + selectedProjects.length + ' projects');

        const commandLines = command.content.split('\n').filter(c => c.trim());

        let successCount = 0;
        for (const project of selectedProjects) {
            this.addLog('├── ' + project.name, undefined, project.name);

            try {
                const resolvedLines = commandLines.map(c => this.resolveCommandVariables(c));
                // 为每条命令注入追踪：输出 "$ command => executed result: output"
                const tracedCommand = this.injectCommandTracing(resolvedLines);
                const result = await this.executeShellCommand(project.path, tracedCommand, (line: string) => {
                    if (line.trim()) {
                        this.addLog('│   ' + line, 'info', project.name);
                    }
                });
                if (result.success) {
                    successCount++;
                    this.addLog('│   ✓ Completed', 'success', project.name);
                } else {
                    this.addLog('│   ✗ ' + (result.error || result.output), 'error', project.name);
                }
            } catch (error) {
                this.addLog('│   ✗ Error: ' + error, 'error', project.name);
            }
        }

        this.addLog('✓ ' + t('backend.completed', this._language) + ' — ' + successCount + '/' + selectedProjects.length + ' ' + t('backend.success', this._language), successCount === selectedProjects.length ? 'success' : 'error');
    }

    private injectCommandTracing(lines: string[]): string {
        // 为每条命令生成 "$ command => executed result: output" 格式的追踪输出
        // 使用临时文件捕获每条命令的输出，确保变量在同一 shell 上下文中共享
        const shell = this._currentShell;
        const tracedLines: string[] = [];
        const os = require('os');
        const path = require('path');
        const resultFile = path.join(os.tmpdir(), `mpt_result_${Date.now()}.txt`);
        const resultFileCmd = `%TEMP%\\mpt_result_${Date.now()}.txt`;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('#')) {
                tracedLines.push(line);
                continue;
            }

            if (shell === 'git-bash' || shell === 'wsl') {
                // bash: printf 不换行输出命令前缀，命令输出重定向到临时文件，再 cat 出来
                tracedLines.push(`printf '$ ${line} => executed result: '`);
                tracedLines.push(`${line} > "${resultFile}" 2>&1`);
                tracedLines.push(`cat "${resultFile}"`);
                tracedLines.push(`echo`);
                tracedLines.push(`rm -f "${resultFile}"`);
            } else if (shell === 'powershell') {
                tracedLines.push(`Write-Host -NoNewline '$ ${line} => executed result: '`);
                tracedLines.push(`${line} > '${resultFile}' 2>&1`);
                tracedLines.push(`Get-Content '${resultFile}'`);
                tracedLines.push(`Write-Host`);
                tracedLines.push(`Remove-Item '${resultFile}' -ErrorAction SilentlyContinue`);
            } else if (shell === 'cmd') {
                // cmd: <nul set /p= 输出不换行的前缀
                tracedLines.push(`<nul set /p=$ ${line} => executed result: `);
                tracedLines.push(`${line} > "${resultFileCmd}" 2>&1`);
                tracedLines.push(`type "${resultFileCmd}"`);
                tracedLines.push(`echo.`);
                tracedLines.push(`del "${resultFileCmd}" 2>nul`);
            } else {
                tracedLines.push(line);
            }
        }
        return tracedLines.join('\n');
    }

    private mergeCommands(commands: string[]): string {
        if (commands.length === 0) return '';
        if (commands.length === 1) return commands[0];

        // 将命令按换行符连接，作为完整脚本执行
        // 这样注释行和变量都可以正常工作
        return commands.join('\n');
    }

    private resolveCommandVariables(command: string): string {
        let result = command;
        for (const [key, value] of Object.entries(this._settings.commonParameters)) {
            result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), String(value));
        }
        return result;
    }

    private async executeShellCommand(cwd: string, command: string, onOutput?: (line: string) => void): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            const timeout = this._commandTimeout * 1000;
            let shell = this._currentShell;
            let shellArgs: string[] = [];
            let useShell = false;

            // 将多行命令写到临时文件，然后让 shell 读取执行
            // 这样可以避免复杂的引号转义问题，且完全支持多行脚本
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tmpFile = path.join(os.tmpdir(), `mpt_cmd_${Date.now()}_${Math.random().toString(36).slice(2)}.sh`);
            const tmpCmdFile = process.platform === 'win32'
                ? path.join(os.tmpdir(), `mpt_cmd_${Date.now()}_${Math.random().toString(36).slice(2)}.cmd`)
                : tmpFile;

            try {
                if (shell === 'git-bash' || shell === 'wsl') {
                    fs.writeFileSync(tmpFile, command, 'utf8');
                } else if (shell === 'cmd') {
                    // cmd 不支持多行，将换行转为 & 连接
                    const cmdContent = command.split('\n').filter(l => l.trim()).join(' & ');
                    fs.writeFileSync(tmpCmdFile, `@echo off\r\n${cmdContent}\r\n`, 'utf8');
                } else if (shell === 'powershell') {
                    fs.writeFileSync(tmpFile, command, 'utf8');
                }
            } catch (e) {
                // 写文件失败，回退到旧方式
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                if (fs.existsSync(tmpCmdFile)) fs.unlinkSync(tmpCmdFile);
                return this.executeShellCommandLegacy(cwd, command, onOutput, shell).then(resolve);
            }

            switch (shell) {
                case 'git-bash':
                    shellArgs = [tmpFile];
                    useShell = false;
                    break;
                case 'cmd':
                    shellArgs = ['/c', tmpCmdFile];
                    useShell = false;
                    break;
                case 'powershell':
                    shellArgs = ['-ExecutionPolicy', 'Bypass', '-File', tmpFile];
                    useShell = false;
                    break;
                case 'wsl':
                    shellArgs = ['-e', 'bash', tmpFile];
                    useShell = false;
                    break;
            }

            const cp = require('child_process');

            let stdoutBuf = '';
            let stderrBuf = '';
            const collectedStdout: string[] = [];
            const collectedStderr: string[] = [];

            // 将 shell 标识映射为实际可执行文件名
            let commandName: string;
            switch (shell) {
                case 'git-bash':
                    commandName = 'bash';  // PATH 中是 bash 或 bash.exe
                    break;
                case 'cmd':
                    commandName = process.env.ComSpec || 'cmd.exe';
                    break;
                case 'powershell':
                    commandName = 'powershell.exe';
                    break;
                case 'wsl':
                    commandName = 'wsl.exe';
                    break;
                default:
                    commandName = shell;
            }
            let commandArgs = shellArgs;

            const child = cp.spawn(commandName, commandArgs, {
                cwd,
                env: { ...process.env, ...this.getEnvVariables() },
                encoding: 'utf8',
                shell: useShell
            });

            // 设置超时
            const timer = setTimeout(() => {
                try { child.kill(); } catch (e) { /* ignore */ }
            }, timeout);

            if (child.stdout) {
                child.stdout.setEncoding('utf8');
                child.stdout.on('data', (data: string) => {
                    stdoutBuf += data;
                    collectedStdout.push(data);
                    const lines = stdoutBuf.split(/\r?\n/);
                    stdoutBuf = lines.pop() || '';
                    for (const line of lines) {
                        if (onOutput) onOutput(line);
                    }
                });
            }

            if (child.stderr) {
                child.stderr.setEncoding('utf8');
                child.stderr.on('data', (data: string) => {
                    stderrBuf += data;
                    collectedStderr.push(data);
                    const lines = stderrBuf.split(/\r?\n/);
                    stderrBuf = lines.pop() || '';
                    for (const line of lines) {
                        if (onOutput) onOutput(line);
                    }
                });
            }

            child.on('close', (code: number | null) => {
                clearTimeout(timer);
                // 处理剩余的缓冲
                if (stdoutBuf.trim() && onOutput) onOutput(stdoutBuf.trim());
                if (stderrBuf.trim() && onOutput) onOutput(stderrBuf.trim());

                // 清理临时文件
                try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
                try { if (fs.existsSync(tmpCmdFile) && tmpCmdFile !== tmpFile) fs.unlinkSync(tmpCmdFile); } catch (e) { /* ignore */ }

                const allStdout = collectedStdout.join('').trim();
                const allStderr = collectedStderr.join('').trim();

                if (code !== 0 && code !== null) {
                    resolve({
                        success: false,
                        output: allStdout,
                        error: allStderr || `Exit code: ${code}`
                    });
                } else {
                    resolve({
                        success: true,
                        output: allStdout
                    });
                }
            });

            child.on('error', (error: Error) => {
                clearTimeout(timer);
                try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
                try { if (fs.existsSync(tmpCmdFile) && tmpCmdFile !== tmpFile) fs.unlinkSync(tmpCmdFile); } catch (e) { /* ignore */ }

                const errMsg = error.message;
                if (errMsg.includes('ENOENT') || errMsg.includes('not recognized')) {
                    const shellName = shell === 'git-bash' ? 'bash.exe' : shell;
                    resolve({
                        success: false,
                        output: collectedStdout.join('').trim(),
                        error: `[${shellName}] ${t('backend.shellNotFound', this._language)} "${shellName}" ${t('backend.toPath', this._language)}`
                    });
                } else {
                    resolve({
                        success: false,
                        output: collectedStdout.join('').trim(),
                        error: collectedStderr.join('').trim() || errMsg
                    });
                }
            });
        });
    }

    private async executeShellCommandLegacy(cwd: string, command: string, onOutput: ((line: string) => void) | undefined, shell: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            const timeout = this._commandTimeout * 1000;
            let shellCmd = '';

            switch (shell) {
                case 'git-bash':
                    shellCmd = 'bash -c \'' + command.replace(/'/g, "'\"'\"'") + '\'';
                    break;
                case 'cmd':
                    shellCmd = 'cmd /c "' + command.replace(/\n/g, ' & ').replace(/"/g, '""') + '"';
                    break;
                case 'powershell':
                    shellCmd = 'powershell -Command "' + command.replace(/"/g, '""') + '"';
                    break;
                case 'wsl':
                    shellCmd = 'wsl -e bash -c \'' + command.replace(/'/g, "'\"'\"'") + '\'';
                    break;
            }

            const cp = require('child_process');
            let stdoutBuf = '';
            let stderrBuf = '';
            const collectedStdout: string[] = [];
            const collectedStderr: string[] = [];

            const child = cp.spawn(shellCmd, [], {
                cwd,
                env: { ...process.env, ...this.getEnvVariables() },
                encoding: 'utf8',
                shell: true
            });

            const timer = setTimeout(() => {
                try { child.kill(); } catch (e) { /* ignore */ }
            }, timeout);

            if (child.stdout) {
                child.stdout.setEncoding('utf8');
                child.stdout.on('data', (data: string) => {
                    stdoutBuf += data;
                    collectedStdout.push(data);
                    const lines = stdoutBuf.split(/\r?\n/);
                    stdoutBuf = lines.pop() || '';
                    for (const line of lines) {
                        if (onOutput) onOutput(line);
                    }
                });
            }

            if (child.stderr) {
                child.stderr.setEncoding('utf8');
                child.stderr.on('data', (data: string) => {
                    stderrBuf += data;
                    collectedStderr.push(data);
                    const lines = stderrBuf.split(/\r?\n/);
                    stderrBuf = lines.pop() || '';
                    for (const line of lines) {
                        if (onOutput) onOutput(line);
                    }
                });
            }

            child.on('close', (code: number | null) => {
                clearTimeout(timer);
                if (stdoutBuf.trim() && onOutput) onOutput(stdoutBuf.trim());
                if (stderrBuf.trim() && onOutput) onOutput(stderrBuf.trim());

                const allStdout = collectedStdout.join('').trim();
                const allStderr = collectedStderr.join('').trim();

                if (code !== 0 && code !== null) {
                    resolve({ success: false, output: allStdout, error: allStderr || `Exit code: ${code}` });
                } else {
                    resolve({ success: true, output: allStdout });
                }
            });

            child.on('error', (error: Error) => {
                clearTimeout(timer);
                resolve({ success: false, output: collectedStdout.join('').trim(), error: error.message });
            });
        });
    }

    private getEnvVariables(): Record<string, string> {
        const env: Record<string, string> = {};
        this._envVariables.forEach(v => { if (v.key && v.value) env[v.key] = v.value; });
        return env;
    }

    private getShellLabel(shell: string): string {
        const labels: Record<string, string> = {
            'git-bash': 'Git Bash',
            'cmd': 'CMD',
            'powershell': 'PowerShell',
            'wsl': 'WSL'
        };
        return labels[shell] || shell;
    }

    private async handleSaveSettings(settings: any): Promise<void> {
        this._autoRefresh = settings.autoRefresh;
        this._logRetention = settings.logRetention;
        this._concurrency = settings.concurrency;
        this._currentShell = settings.defaultShell;
        this._commandTimeout = settings.commandTimeout;
        this.saveAllConfig();
    }

    private async handleSaveCommonParameters(parameters: string): Promise<void> {
        try {
            const parsed = JSON.parse(parameters);
            this._settings.commonParameters = parsed;
            this.saveAllConfig();
            this._view?.webview.postMessage({ command: 'jsonSuccess' });
        } catch (error) {
            this._view?.webview.postMessage({ command: 'jsonError', error: t('backend.jsonError', this._language) + error });
        }
    }

    private async handleAddEnvVariable(variable: EnvVariable): Promise<void> {
        this._envVariables.push(variable);
        await this.saveEnvVariables();
        this.updateWebview();
    }

    private async handleUpdateEnvVariable(index: number, variable: EnvVariable): Promise<void> {
        if (index >= 0 && index < this._envVariables.length) {
            this._envVariables[index] = variable;
            await this.saveEnvVariables();
            this.updateWebview();
        }
    }

    private async handleDeleteEnvVariable(index: number): Promise<void> {
        this._envVariables.splice(index, 1);
        await this.saveEnvVariables();
        this.updateWebview();
    }

    private async saveCommands(): Promise<void> {
        this.saveAllConfig();
    }

    private async saveEnvVariables(): Promise<void> {
        this.saveAllConfig();
    }

    private saveAllConfig(): void {
        const config = {
            settings: {
                commonParameters: this._settings.commonParameters,
                defaultShell: this._currentShell,
                autoRefresh: this._autoRefresh,
                logRetention: this._logRetention,
                concurrency: this._concurrency,
                commandTimeout: this._commandTimeout,
                language: this._language
            },
            customCommands: this._customCommands,
            envVariables: this._envVariables
        };
        ConfigStore.getInstance().save(config);
    }

    private handleClearLogs(): void {
        this._logs = [];
        this.updateWebview();
    }

    private addLog(message: string, type: 'success' | 'error' | 'info' = 'info', projectName?: string, shellType?: string): void {
        const now = new Date();
        const timestamp = now.toLocaleTimeString(this._language === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });

        this._logs.push({ timestamp, type, message, projectName, shellType });

        if (this._logs.length > this._logRetention) {
            this._logs.shift();
        }

        this._view?.webview.postMessage({
            command: 'addLog',
            entry: { timestamp, type, message, projectName, shellType }
        });
    }

    private updateWebview(): void {
        this._view?.webview.postMessage({ command: 'updateProjects', projects: this._projects });
        this._view?.webview.postMessage({ command: 'updateLogs', logs: this._logs });
        this._view?.webview.postMessage({ command: 'updateCommands', commands: this._customCommands });
        this._view?.webview.postMessage({ command: 'updateEnvVariables', variables: this._envVariables });
        this._view?.webview.postMessage({ command: 'updatePythonTxtCommands', commands: this._pythonTxtCommands });
        this._view?.webview.postMessage({ command: 'setLanguage', language: this._language });
        this._view?.webview.postMessage({
            command: 'updateSettings',
            settings: {
                commonParameters: this._settings.commonParameters,
                autoRefresh: this._autoRefresh,
                logRetention: this._logRetention,
                concurrency: this._concurrency,
                defaultShell: this._currentShell,
                commandTimeout: this._commandTimeout,
                language: this._language
            }
        });
    }
}
