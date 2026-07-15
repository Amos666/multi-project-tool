import * as vscode from 'vscode';
import { Project, GitOperationResult } from '../models/project';
import { MultiProjectToolSettings } from '../models/settings';
import { GitUtils } from '../utils/gitUtils';
import { ProjectScanner } from '../utils/projectScanner';
import { ConfigStore } from '../utils/configStore';

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
    private _projectScanner: ProjectScanner;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._projectScanner = ProjectScanner.getInstance();
        this.loadData();
    }

    private async loadData(): Promise<void> {
        await this.loadSettings();
        await this.loadCommands();
        await this.loadEnvVariables();
        await this.loadProjects();
        this.updateWebview();
    }

    private async loadProjects(): Promise<void> {
        try {
            const scanDepth = this._settings.projectScanDepth;
            this._projects = await this._projectScanner.scanWorkspace(scanDepth);
            for (let i = 0; i < this._projects.length; i++) {
                this._projects[i] = await this._projectScanner.getProjectInfo(this._projects[i]);
            }
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
    }

    private async loadCommands(): Promise<void> {
        const config = ConfigStore.getInstance().load();
        this._customCommands = config.customCommands;
    }

    private async loadEnvVariables(): Promise<void> {
        const config = ConfigStore.getInstance().load();
        this._envVariables = config.envVariables;
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
                }
            }
        );
    }

    private getWebviewContent(): string {
        const css = this.getCss();
        const htmlBody = this.getHtmlBody();
        const js = this.getJavaScript();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Multi Project Tools</title>
    <style>${css}</style>
</head>
<body>${htmlBody}<script>${js}</script></body>
</html>`;
    }

    private getCss(): string {
        return `
:root {
    --brand-background: #1a1b26;
    --brand-surface: #24283b;
    --brand-surface-raised: #2f3347;
    --brand-surface-hover: #363b54;
    --brand-border: #3b4261;
    --brand-border-subtle: #2f3347;
    --brand-text: #c0caf5;
    --brand-text-secondary: #a9b1d6;
    --brand-text-muted: #565f89;
    --brand-text-inverse: #1a1b26;
    --brand-primary: #7dcfff;
    --brand-primary-hover: #89dceb;
    --brand-primary-subtle: rgba(125, 207, 255, 0.1);
    --state-success: #9ece6a;
    --state-warning: #e0af68;
    --state-error: #f7768e;
    --state-info: #7aa2f7;
    --radius-sm: 3px;
    --radius-md: 6px;
    --radius-lg: 8px;
}

body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    margin: 0;
    padding: 0;
    background-color: var(--brand-background);
    color: var(--brand-text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.tab-bar {
    display: flex;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border);
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
    gap: 4px;
    font-size: 11px;
    color: var(--brand-text-muted);
    transition: all 0.2s ease;
}

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
    gap: 2px;
    padding: 6px 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border);
    flex-wrap: wrap;
}

.git-btn {
    flex: 1;
    min-width: 50px;
    padding: 6px 2px;
    background-color: var(--brand-surface-raised);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}

.git-btn::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
}

.git-btn.pull::before { background-color: #7aa2f7; }
.git-btn.commit::before { background-color: #9ece6a; }
.git-btn.change::before { background-color: #e0af68; }
.git-btn.branch::before { background-color: var(--brand-primary); }
.git-btn.push::before { background-color: #89dceb; }

.git-btn:hover:not(:disabled) { filter: brightness(1.1); }
.git-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.git-btn.executing { background-color: var(--brand-primary); color: var(--brand-text-inverse); }

.git-btn .badge {
    background-color: var(--brand-primary);
    color: var(--brand-text-inverse);
    font-size: 9px;
    padding: 1px 3px;
    border-radius: 8px;
    margin-left: 2px;
}

.custom-command-header {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border);
}

.shell-selector {
    flex: 1;
    padding: 4px 6px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
}

.add-cmd-btn {
    padding: 4px 10px;
    background-color: var(--brand-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--brand-text-inverse);
    font-size: 11px;
    cursor: pointer;
}

.command-editor {
    padding: 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border);
    display: none;
}

.command-editor.show { display: block; }

.form-group { margin-bottom: 8px; }
.form-group label {
    display: block;
    font-size: 10px;
    color: var(--brand-text-muted);
    margin-bottom: 3px;
}

.form-group input, .form-group textarea {
    width: 100%;
    padding: 4px 6px;
    background-color: var(--brand-background);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
    box-sizing: border-box;
}

.form-group textarea { height: 60px; resize: vertical; }

.btn-group { display: flex; gap: 6px; justify-content: flex-end; }

.btn {
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
}

.btn-primary { background-color: var(--brand-primary); color: var(--brand-text-inverse); }
.btn-secondary { background-color: transparent; border: 1px solid var(--brand-border); color: var(--brand-text-muted); }

.command-list {
    flex: 0 0 120px;
    overflow-y: auto;
    padding: 6px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border);
}

.command-item {
    display: flex;
    align-items: center;
    padding: 8px;
    background-color: var(--brand-surface-raised);
    border-radius: var(--radius-md);
    margin-bottom: 4px;
    gap: 8px;
}

.command-item:hover { background-color: var(--brand-surface-hover); }

.command-item .cmd-main {
    flex: 1;
    min-width: 0;
    cursor: pointer;
}

.command-item .alias {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px;
    color: var(--brand-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
}

.command-item .cmd-content-preview {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px;
    color: var(--brand-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
}

.command-item .actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
}

.cmd-action-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--brand-border);
    background-color: var(--brand-surface);
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
}

.cmd-action-btn:hover { background-color: var(--brand-surface-hover); }
.cmd-action-btn.run:hover { color: var(--state-success); border-color: var(--state-success); }
.cmd-action-btn.edit:hover { color: var(--brand-primary); border-color: var(--brand-primary); }
.cmd-action-btn.delete:hover { color: var(--state-error); border-color: var(--state-error); }

.settings-panel { flex: 1; overflow-y: auto; padding: 12px; }

.settings-section {
    background-color: var(--brand-surface);
    border-radius: var(--radius-lg);
    padding: 12px;
    margin-bottom: 16px;
}

.settings-section h3 {
    margin: 0 0 10px 0;
    font-size: 12px;
    color: var(--brand-primary);
    display: flex;
    align-items: center;
    gap: 4px;
}

.settings-section .subtitle {
    font-size: 10px;
    color: var(--brand-text-muted);
    margin-bottom: 10px;
}

.json-editor {
    width: 100%;
    height: 120px;
    padding: 8px;
    background-color: var(--brand-background);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-md);
    color: var(--brand-text);
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    resize: vertical;
    box-sizing: border-box;
}

.env-variable-list { margin-bottom: 10px; }

.env-variable-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    background-color: var(--brand-surface-raised);
    border-radius: var(--radius-sm);
    margin-bottom: 3px;
}

.env-variable-item input {
    flex: 1;
    padding: 3px 4px;
    background-color: var(--brand-background);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 10px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
}

.env-variable-item input.key { color: var(--brand-primary); }
.env-variable-item .separator { color: var(--brand-text-muted); font-size: 11px; }

.env-variable-item .delete-btn {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 11px;
}

.env-variable-item .delete-btn:hover { color: var(--state-error); }

.settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}

.settings-row label { font-size: 11px; color: var(--brand-text-secondary); }

.settings-row input[type="number"] {
    width: 50px;
    padding: 3px 4px;
    background-color: var(--brand-surface-raised);
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-sm);
    color: var(--brand-text);
    font-size: 11px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
}

.settings-row .unit { font-size: 10px; color: var(--brand-text-muted); margin-left: 3px; }

.toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background-color: var(--brand-text-muted);
    border-radius: 10px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.toggle-switch.active { background-color: var(--brand-primary); }

.toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s;
}

.toggle-switch.active::after { transform: translateX(16px); }

.project-list-container { flex: 1; overflow-y: auto; padding: 6px; }

.project-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background-color: var(--brand-surface);
    border-bottom: 1px solid var(--brand-border-subtle);
    font-size: 11px;
    color: var(--brand-text-secondary);
}

.project-list-header .refresh-btn {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--brand-text-muted);
    cursor: pointer;
    font-size: 12px;
}

.project-list-header .refresh-btn:hover { color: var(--brand-primary); }

.project-item {
    display: flex;
    align-items: center;
    padding: 8px 8px;
    margin-bottom: 1px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    border-left: 2px solid transparent;
}

.project-item:hover { background-color: var(--brand-surface-hover); filter: brightness(1.1); }
.project-item.selected { background-color: var(--brand-primary-subtle); border-left-color: var(--brand-primary); }

.project-checkbox {
    width: 12px;
    height: 12px;
    margin-right: 8px;
    accent-color: var(--brand-primary);
    cursor: pointer;
}

.project-info { flex: 1; min-width: 0; }

.project-name {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--brand-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.project-branch {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    color: var(--brand-text-muted);
    display: flex;
    align-items: center;
    gap: 3px;
}

.change-count {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 8px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
}

.change-count.success { color: var(--state-success); background-color: rgba(158, 206, 106, 0.1); }
.change-count.warning { color: var(--state-warning); background-color: var(--brand-primary-subtle); }
.change-count.error { color: var(--state-error); background-color: rgba(247, 118, 142, 0.12); }

.log-container {
    flex-shrink: 0;
    background-color: var(--brand-surface);
    border-top: 1px solid var(--brand-border);
    height: 60px;
    min-height: 40px;
    max-height: 80%;
    display: flex;
    flex-direction: column;
    transition: none;
}

.log-container.resizing { transition: none; }

.log-resizer {
    height: 4px;
    background-color: var(--brand-border-subtle);
    cursor: ns-resize;
    flex-shrink: 0;
    transition: background-color 0.15s;
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
    width: 24px;
    height: 2px;
    background-color: var(--brand-text-muted);
    border-radius: 1px;
}

.log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--brand-border-subtle);
    font-size: 11px;
    color: var(--brand-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
}

.log-header:hover { background-color: var(--brand-surface-hover); }

.log-header .clear-btn {
    font-size: 10px;
    padding: 2px 6px;
    background-color: transparent;
    border: 1px solid var(--brand-border);
    border-radius: var(--radius-sm);
    color: var(--brand-text-muted);
    cursor: pointer;
}

.log-header .clear-btn:hover { color: var(--state-error); border-color: var(--state-error); }

.log-content {
    height: calc(100% - 32px);
    overflow-y: auto;
    padding: 6px 8px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px;
}

.log-entry { margin-bottom: 3px; line-height: 1.4; }
.log-entry .timestamp { color: var(--brand-text-muted); margin-right: 4px; }
.log-entry .status-icon { margin-right: 3px; }

.log-entry.success .status-icon, .log-entry.success .message { color: var(--state-success); }
.log-entry.error .status-icon, .log-entry.error .message { color: var(--state-error); }
.log-entry.info .status-icon, .log-entry.info .message { color: var(--brand-primary); }

.log-entry .project-name { color: var(--brand-primary); font-size: 10px; }
.log-entry .shell-type { color: var(--brand-text-muted); font-style: italic; margin-right: 3px; }
.log-entry .tree-line { color: var(--brand-text-muted); padding-left: 12px; }
.log-entry .command-line { color: var(--brand-text-secondary); }

.empty-state { text-align: center; padding: 16px; color: var(--brand-text-muted); font-size: 11px; }

.status-message {
    font-size: 10px;
    margin-top: 6px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
}

.status-message.success { color: var(--state-success); background-color: rgba(158, 206, 106, 0.1); }
.status-message.error { color: var(--state-error); background-color: rgba(247, 118, 142, 0.12); }

.no-projects-message { text-align: center; padding: 16px; color: var(--brand-text-muted); font-size: 11px; }

.selection-warning {
    padding: 6px 8px;
    background-color: rgba(224, 175, 104, 0.1);
    border-bottom: 1px solid var(--brand-border);
    color: var(--state-warning);
    font-size: 10px;
    text-align: center;
    display: none;
}

.selection-warning.show { display: block; }`;
    }

    private getHtmlBody(): string {
        return `
    <div class="tab-bar">
        <div class="tab active" onclick="switchTab('git')">
            <span>🌿</span><span>Git</span>
        </div>
        <div class="tab" onclick="switchTab('custom')">
            <span>💻</span><span>Cmd</span>
        </div>
        <div class="tab" onclick="switchTab('settings')">
            <span>⚙️</span><span>Set</span>
        </div>
    </div>

    <div class="tab-content">
        <div id="tab-git" class="tab-panel active">
            <div class="git-actions">
                <button class="git-btn pull" onclick="executeGitAction('pull')"><span>📥</span><span>Pull</span></button>
                <button class="git-btn commit" onclick="executeGitAction('commit')"><span>✓</span><span>Commit</span></button>
                <button class="git-btn change" onclick="executeGitAction('change')"><span>📊</span><span>Change</span></button>
                <button class="git-btn branch" onclick="executeGitAction('branch')"><span>🌿</span><span>Branch</span></button>
                <button class="git-btn push" onclick="executeGitAction('push')"><span>📤</span><span>Push</span><span class="badge" id="pushBadge">0</span></button>
            </div>

            <div class="project-list-header">
                <span>项目 (<span id="projectCount">0</span>)</span>
                <button class="refresh-btn" onclick="refreshProjects()" title="刷新">🔄</button>
            </div>

            <div class="project-list-container" id="projectList">
                <div class="no-projects-message">Loading...</div>
            </div>

            <div class="log-container" id="logContainer">
                <div class="log-resizer" id="logResizer"></div>
                <div class="log-header" onclick="toggleLog()">
                    <span>日志</span>
                    <span class="clear-btn" onclick="clearLogs(event)">清除</span>
                </div>
                <div class="log-content" id="logContent">
                    <div class="log-entry info">
                        <span class="timestamp">[--:--:--]</span>
                        <span class="status-icon">▶</span>
                        <span class="message">Multi Project Tools ready</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-custom" class="tab-panel">
            <div class="custom-command-header">
                <label style="font-size: 10px; color: var(--brand-text-muted); display: flex; align-items: center;">
                    Shell:
                    <select class="shell-selector" id="shellSelector" onchange="setShell(this.value)">
                        <option value="git-bash">Git Bash</option>
                        <option value="cmd">CMD</option>
                        <option value="powershell">PowerShell</option>
                        <option value="wsl">WSL</option>
                    </select>
                </label>
                <button class="add-cmd-btn" onclick="showCommandEditor()">+ 添加</button>
            </div>

            <div class="command-editor" id="commandEditor">
                <div class="form-group">
                    <label for="commandAlias">命令别名</label>
                    <input type="text" id="commandAlias" placeholder="deploy-all">
                </div>
                <div class="form-group">
                    <label for="commandContent">命令内容</label>
                    <textarea id="commandContent" placeholder="npm run build&#10;npm run deploy"></textarea>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="saveCommand()">保存</button>
                    <button class="btn btn-secondary" onclick="hideCommandEditor()">取消</button>
                </div>
            </div>

            <div class="command-list" id="commandList">
                <div class="empty-state">暂无命令</div>
            </div>

            <div class="selection-warning" id="selectionWarning">请先选择项目</div>

            <div class="project-list-header">
                <span>项目 (<span id="customProjectCount">0</span>)</span>
                <button class="refresh-btn" onclick="refreshProjects()" title="刷新">🔄</button>
            </div>

            <div class="project-list-container" id="customProjectList">
                <div class="no-projects-message">Loading...</div>
            </div>

            <div class="log-container" id="customLogContainer">
                <div class="log-resizer" id="customLogResizer"></div>
                <div class="log-header" onclick="toggleLog()">
                    <span>日志</span>
                    <span class="clear-btn" onclick="clearLogs(event)">清除</span>
                </div>
                <div class="log-content" id="customLogContent">
                    <div class="log-entry info">
                        <span class="timestamp">[--:--:--]</span>
                        <span class="status-icon">▶</span>
                        <span class="message">Multi Project Tools ready</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-settings" class="tab-panel">
            <div class="settings-panel">
                <div class="settings-section">
                    <h3>📋 全局参数</h3>
                    <div class="subtitle">定义全局参数，通过 ${'{paramName}'} 引用</div>
                    <textarea class="json-editor" id="commonParams" placeholder='{"deployBucket": "my-bucket"}'></textarea>
                    <div class="btn-group" style="margin-top: 10px;">
                        <button class="btn btn-secondary" onclick="resetCommonParams()">恢复默认</button>
                        <button class="btn btn-primary" onclick="saveCommonParams()">保存</button>
                    </div>
                    <div id="jsonStatus" class="status-message"></div>
                </div>

                <div class="settings-section">
                    <h3>🔧 环境变量</h3>
                    <div class="subtitle">执行命令时注入到 Shell 环境中</div>
                    <div class="env-variable-list" id="envVariableList"></div>
                    <button class="btn btn-secondary" onclick="addEnvVariable()">+ 添加变量</button>
                </div>

                <div class="settings-section">
                    <h3>⚙️ 其他设置</h3>
                    <div class="settings-row">
                        <label>自动刷新</label>
                        <div class="toggle-switch" id="autoRefreshToggle" onclick="toggleAutoRefresh()"></div>
                    </div>
                    <div class="settings-row">
                        <label>日志保留条数</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="logRetentionInput" min="1" max="1000" value="50">
                            <span class="unit">条</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <label>并发执行数</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="concurrencyInput" min="1" max="10" value="1">
                            <span class="unit">个</span>
                        </div>
                    </div>
                    <div class="settings-row">
                        <label>默认 Shell</label>
                        <select class="shell-selector" id="defaultShellSelector" style="width: auto; flex: none;">
                            <option value="git-bash">Git Bash</option>
                            <option value="cmd">CMD</option>
                            <option value="powershell">PowerShell</option>
                            <option value="wsl">WSL</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label>命令超时</label>
                        <div style="display: flex; align-items: center;">
                            <input type="number" id="commandTimeoutInput" min="10" max="3600" value="300">
                            <span class="unit">秒</span>
                        </div>
                    </div>
                    <div class="btn-group" style="margin-top: 12px;">
                        <button class="btn btn-primary" onclick="saveSettings()">保存设置</button>
                    </div>
                </div>
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

window.addEventListener('load', () => { vscode.postMessage({ command: 'init' }); });

function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[onclick="switchTab(\\'' + tabId + '\\')"]').classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
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
    if (selectedProjectIds.size === 0) { alert('Please select at least one project'); return; }
    const btn = document.querySelector('.git-btn.' + action);
    if (btn) btn.classList.add('executing');

    switch(action) {
        case 'pull': vscode.postMessage({ command: 'gitPull' }); break;
        case 'commit':
            const message = prompt('Enter commit message:', 'Auto commit');
            if (message) vscode.postMessage({ command: 'gitCommit', message: message });
            else if (btn) btn.classList.remove('executing');
            break;
        case 'change': vscode.postMessage({ command: 'gitChange' }); break;
        case 'branch':
            const branch = prompt('Enter branch name:', 'main');
            if (branch) vscode.postMessage({ command: 'gitBranch', branch: branch });
            else if (btn) btn.classList.remove('executing');
            break;
        case 'push': vscode.postMessage({ command: 'gitPush' }); break;
    }
}

function refreshProjects() { vscode.postMessage({ command: 'refreshProjects' }); }
function setShell(shell) { vscode.postMessage({ command: 'setShell', shell: shell }); }

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
    if (!alias || !content) { alert('请填写命令别名和内容'); return; }

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
    alert('Settings saved!');
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

function updateProjectList() {
    const list1 = document.getElementById('projectList');
    const list2 = document.getElementById('customProjectList');
    
    if (projects.length === 0) {
        list1.innerHTML = '<div class="no-projects-message">No projects found</div>';
        list2.innerHTML = list1.innerHTML;
        return;
    }

    const html = projects.map(p => {
        const isSelected = selectedProjectIds.has(p.id);
        const changeClass = (p.changeCount === 0) ? 'success' : (p.changeCount <= 2 ? 'warning' : 'error');
        return '<div class="project-item ' + (isSelected ? 'selected' : '') + '" onclick="toggleProjectSelection(\\'' + p.id + '\\')">' +
            '<input type="checkbox" class="project-checkbox" data-project-id="' + p.id + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleProjectSelection(\\'' + p.id + '\\')">' +
            '<div class="project-info">' +
            '<div class="project-name">' + p.name + '</div>' +
            '<div class="project-branch"><span>🌿</span>' + (p.currentBranch || 'No branch') + '</div>' +
            '</div>' +
            '<span class="change-count ' + changeClass + '">' + (p.changeCount || 0) + '</span>' +
            '</div>';
    }).join('');

    list1.innerHTML = html;
    list2.innerHTML = html;
    document.getElementById('projectCount').textContent = projects.length;
    document.getElementById('customProjectCount').textContent = projects.length;
}

function updatePushBadge() { document.getElementById('pushBadge').textContent = selectedProjectIds.size; }

function updateSelectionWarning() {
    const warning = document.getElementById('selectionWarning');
    warning.classList.toggle('show', selectedProjectIds.size === 0);
}

function updateCommandList() {
    const list = document.getElementById('commandList');
    if (customCommands.length === 0) {
        list.innerHTML = '<div class="empty-state">暂无命令</div>';
        return;
    }

    list.innerHTML = customCommands.map(cmd => {
        const preview = cmd.content.split('\\n')[0];
        return '<div class="command-item">' +
            '<div class="cmd-main" onclick="showCommandEditor(\\'' + cmd.id + '\\')">' +
            '<span class="alias">' + cmd.alias + '</span>' +
            '<span class="cmd-content-preview">' + preview + '</span>' +
            '</div>' +
            '<div class="actions">' +
            '<button class="cmd-action-btn run" onclick="runCommand(\\'' + cmd.id + '\\')" title="运行">▶</button>' +
            '<button class="cmd-action-btn edit" onclick="showCommandEditor(\\'' + cmd.id + '\\')" title="编辑">✎</button>' +
            '<button class="cmd-action-btn delete" onclick="deleteCommand(\\'' + cmd.id + '\\')" title="删除">🗑</button>' +
            '</div></div>';
    }).join('');
}

function updateEnvVariables() {
    const list = document.getElementById('envVariableList');
    list.innerHTML = envVariables.map((v, i) => {
        return '<div class="env-variable-item">' +
            '<input type="text" class="key" value="' + v.key + '" placeholder="Key" onchange="updateEnvVariable(' + i + ', this.value, \\'' + v.value + '\\')">' +
            '<span class="separator">=</span>' +
            '<input type="text" value="' + v.value + '" placeholder="Value" onchange="updateEnvVariable(' + i + ', \\'' + v.key + '\\', this.value)">' +
            '<button class="delete-btn" onclick="deleteEnvVariable(' + i + ')">×</button>' +
            '</div>';
    }).join('');
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
        content1.innerHTML = '<div class="log-entry info"><span class="timestamp">[--:--:--]</span><span class="status-icon">▶</span><span class="message">Multi Project Tools ready</span></div>';
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

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateProjects': projects = message.projects; updateProjectList(); break;
        case 'updateLogs': logs = message.logs; renderLogs(); break;
        case 'addLog': addLogEntry(message.entry); break;
        case 'updateCommands': customCommands = message.commands; updateCommandList(); break;
        case 'updateEnvVariables': envVariables = message.variables; updateEnvVariables(); break;
        case 'updateSettings':
            document.getElementById('commonParams').value = JSON.stringify(message.settings.commonParameters, null, 2);
            document.getElementById('autoRefreshToggle').classList.toggle('active', message.settings.autoRefresh);
            document.getElementById('logRetentionInput').value = message.settings.logRetention;
            document.getElementById('concurrencyInput').value = message.settings.concurrency;
            document.getElementById('defaultShellSelector').value = message.settings.defaultShell;
            document.getElementById('commandTimeoutInput').value = message.settings.commandTimeout;
            document.getElementById('shellSelector').value = message.settings.defaultShell;
            break;
        case 'jsonError':
            const jsonStatus = document.getElementById('jsonStatus');
            jsonStatus.textContent = message.error;
            jsonStatus.className = 'status-message error';
            setTimeout(() => { jsonStatus.textContent = ''; jsonStatus.className = 'status-message'; }, 3000);
            break;
        case 'jsonSuccess':
            const jsonStatus2 = document.getElementById('jsonStatus');
            jsonStatus2.textContent = '已保存';
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

    private handleToggleLogExpanded(expanded: boolean): void {
        // Save the toggle state
    }

    private handleLogHeightChange(height: number): void {
        this._logContainerHeight = height;
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
    private async handleGitBranch(branch: string): Promise<void> { await this.executeGitOperation('switch-branch', branch); }
    private async handleGitPush(): Promise<void> { await this.executeGitOperation('custom', undefined, undefined, 'push'); }

    private async executeGitOperation(operation: string, branch?: string, commitMessage?: string, customCommand?: string): Promise<void> {
        const selectedProjects = this._projects.filter(p => this._selectedProjectIds.has(p.id) && p.isGitRepo);
        if (selectedProjects.length === 0) {
            vscode.window.showInformationMessage('No Git projects selected');
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

        this.addLog('✓ 完成 — ' + successCount + '/' + selectedProjects.length + ' 成功', successCount === selectedProjects.length ? 'success' : 'error');
        await this.loadProjects();
        this.updateWebview();
    }

    private async handleRefreshProjects(): Promise<void> {
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
            vscode.window.showInformationMessage('No projects selected');
            return;
        }

        const shellLabel = this.getShellLabel(this._currentShell);
        this.addLog('▶ [' + shellLabel + '] ' + command.alias + ' — ' + selectedProjects.length + ' projects');

        let successCount = 0;
        for (const project of selectedProjects) {
            this.addLog('├── ' + project.name, undefined, project.name);
            
            const commands = command.content.split('\n').filter(c => c.trim());
            for (const cmd of commands) {
                const resolvedCmd = this.resolveCommandVariables(cmd);
                this.addLog('│   $ ' + resolvedCmd, 'info', project.name);
                
                try {
                    const result = await this.executeShellCommand(project.path, resolvedCmd);
                    if (result.success) {
                        successCount++;
                        this.addLog('│   ✓ ' + (result.output || 'Completed'), 'success', project.name);
                    } else {
                        this.addLog('│   ✗ ' + (result.error || result.output), 'error', project.name);
                        break;
                    }
                } catch (error) {
                    this.addLog('│   ✗ Error: ' + error, 'error', project.name);
                    break;
                }
            }
        }

        this.addLog('✓ 完成 — ' + successCount + '/' + selectedProjects.length + ' 成功', successCount === selectedProjects.length ? 'success' : 'error');
    }

    private resolveCommandVariables(command: string): string {
        let result = command;
        for (const [key, value] of Object.entries(this._settings.commonParameters)) {
            result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), String(value));
        }
        return result;
    }

    private async executeShellCommand(cwd: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            const timeout = this._commandTimeout * 1000;
            let shell = this._currentShell;
            let shellCmd = '';

            switch (shell) {
                case 'git-bash':
                    shellCmd = 'bash -c "' + command.replace(/"/g, '\\"') + '"';
                    break;
                case 'cmd':
                    shellCmd = 'cmd /c "' + command.replace(/"/g, '\\"') + '"';
                    break;
                case 'powershell':
                    shellCmd = 'powershell -Command "' + command.replace(/"/g, '\\"') + '"';
                    break;
                case 'wsl':
                    shellCmd = 'wsl -e bash -c "' + command.replace(/"/g, '\\"') + '"';
                    break;
            }

            const cp = require('child_process');

            cp.exec(shellCmd, {
                cwd,
                timeout,
                env: { ...process.env, ...this.getEnvVariables() },
                encoding: 'utf8',
                maxBuffer: 1024 * 1024 * 10
            }, (error: Error | null, stdout: string, stderr: string) => {
                if (error) {
                    const errMsg = error.message;
                    if (errMsg.includes('ENOENT') || errMsg.includes('not recognized')) {
                        const shellName = shell === 'git-bash' ? 'bash.exe' : shell;
                        resolve({
                            success: false,
                            output: stdout.trim(),
                            error: `[${shellName}] 命令未找到。请将 "${shellName}" 加入系统 PATH 环境变量后重试。`
                        });
                    } else {
                        resolve({ success: false, output: stdout.trim(), error: stderr.trim() || errMsg });
                    }
                } else {
                    resolve({ success: true, output: stdout.trim() });
                }
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
            this._view?.webview.postMessage({ command: 'jsonError', error: 'JSON 格式错误: ' + error });
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
                commandTimeout: this._commandTimeout
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
        const timestamp = now.toLocaleTimeString('zh-CN', { hour12: false });
        
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
        this._view?.webview.postMessage({
            command: 'updateSettings',
            settings: {
                commonParameters: this._settings.commonParameters,
                autoRefresh: this._autoRefresh,
                logRetention: this._logRetention,
                concurrency: this._concurrency,
                defaultShell: this._currentShell,
                commandTimeout: this._commandTimeout
            }
        });
    }
}
