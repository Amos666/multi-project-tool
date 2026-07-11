import * as vscode from 'vscode';
import { GitTabView } from './GitTabView';
import { Project, GitOperationResult } from '../../models/project';
import { GitUtils } from '../../utils/gitUtils';

export class GitTabWebview {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _view: GitTabView | undefined;
    private _refreshCallback?: () => void;

    constructor(
        private readonly _uri: vscode.Uri,
        private readonly _extensionUri: vscode.Uri,
        private _projects: Project[],
        private _selectedProjectIds: string[],
        refreshCallback?: () => void
    ) {
        this._refreshCallback = refreshCallback;
        this.createWebviewPanel();
    }

    private createWebviewPanel(): void {
        this._panel = vscode.window.createWebviewPanel(
            'multi-project-tool.git-tab',
            'Git Projects',
            vscode.ViewColumn.One,
            this.getWebviewOptions()
        );

        this._panel.webview.html = this.getWebviewContent();

        // 监听webview消息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refreshProjects':
                        this.handleRefreshProjects();
                        break;
                    case 'toggleProjectSelection':
                        this.handleToggleProjectSelection(message.projectId, message.selected);
                        break;
                    case 'gitPull':
                        this.handleGitPull(message.projectIds);
                        break;
                    case 'gitSwitchBranch':
                        this.handleGitSwitchBranch(message.projectIds, message.branch);
                        break;
                    case 'gitStatus':
                        this.handleGitStatus(message.projectIds);
                        break;
                    case 'gitCommit':
                        this.handleGitCommit(message.projectIds, message.commitMessage);
                        break;
                }
            },
            undefined,
            this._disposables
        );

        // 监听面板关闭事件
        this._panel.onDidDispose(() => {
            this.dispose();
        }, null, this._disposables);

        // 创建视图
        this._view = new GitTabView(this._panel.webview, this._extensionUri);
    }

    private getWebviewOptions(): vscode.WebviewOptions {
        return {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                this._uri
            ]
        };
    }

    private getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Projects</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding: 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    .header h1 {
                        margin: 0;
                        color: var(--vscode-textLink-foreground);
                    }
                    .controls {
                        display: flex;
                        gap: 10px;
                    }
                    .controls button {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .controls button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .controls button:disabled {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        cursor: not-allowed;
                    }
                    .project-list {
                        margin-bottom: 20px;
                    }
                    .project-item {
                        display: flex;
                        align-items: center;
                        padding: 12px;
                        margin-bottom: 8px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        transition: all 0.2s ease;
                    }
                    .project-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .project-item.selected {
                        background-color: var(--vscode-list-selectionBackground);
                        border-color: var(--vscode-list-selectionBorder);
                    }
                    .project-checkbox {
                        margin-right: 12px;
                        width: 18px;
                        height: 18px;
                        cursor: pointer;
                    }
                    .project-info {
                        flex: 1;
                    }
                    .project-name {
                        font-weight: 500;
                        margin-bottom: 4px;
                    }
                    .project-path {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 4px;
                    }
                    .project-status {
                        font-size: 12px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .git-actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 20px;
                        padding: 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    .git-actions h3 {
                        margin: 0 0 15px 0;
                        color: var(--vscode-textLink-foreground);
                    }
                    .action-buttons {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .action-button {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 14px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .action-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .action-button:disabled {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        cursor: not-allowed;
                    }
                    .status {
                        margin-top: 15px;
                        padding: 12px;
                        border-radius: 6px;
                        display: none;
                    }
                    .status.success {
                        background-color: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-changesResourceForeground);
                        color: var(--vscode-changesResourceForeground);
                    }
                    .status.error {
                        background-color: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-errorForeground);
                        color: var(--vscode-errorForeground);
                    }
                    .status.info {
                        background-color: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-foreground);
                        color: var(--vscode-foreground);
                    }
                    .loading {
                        text-align: center;
                        padding: 20px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .no-projects {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .branch-selector {
                        margin-left: 10px;
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Git Projects</h1>
                        <div class="controls">
                            <button onclick="refreshProjects()">🔄 Refresh</button>
                            <button onclick="selectAll()">Select All</button>
                            <button onclick="clearSelection()">Clear Selection</button>
                        </div>
                    </div>

                    <div id="projectList" class="project-list"></div>

                    <div id="gitActions" class="git-actions">
                        <h3>Git Actions</h3>
                        <div class="action-buttons">
                            <button id="pullButton" onclick="gitPull()" disabled>
                                📥 Git Pull
                            </button>
                            <button id="switchButton" onclick="gitSwitchBranch()" disabled>
                                🌿 Switch Branch
                                <select id="branchSelector" class="branch-selector">
                                    <option value="main">main</option>
                                    <option value="master">master</option>
                                    <option value="develop">develop</option>
                                </select>
                            </button>
                            <button id="statusButton" onclick="gitStatus()" disabled>
                                📋 Status
                            </button>
                            <button id="commitButton" onclick="gitCommit()" disabled>
                                💾 Commit
                            </button>
                        </div>
                    </div>

                    <div id="status" class="status"></div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let projects = [];
                    let selectedProjects = new Set();

                    // 初始化
                    window.addEventListener('load', () => {
                        refreshProjects();
                    });

                    function refreshProjects() {
                        document.getElementById('projectList').innerHTML = '<div class="loading">Loading projects...</div>';
                        vscode.postMessage({ command: 'refreshProjects' });
                    }

                    function updateProjects(projectsData, selectedIds) {
                        projects = projectsData;
                        selectedProjects = new Set(selectedIds);
                        renderProjects();
                        updateActionButtons();
                    }

                    function renderProjects() {
                        const projectList = document.getElementById('projectList');
                        projectList.innerHTML = '';

                        if (projects.length === 0) {
                            projectList.innerHTML = '<div class="no-projects">No projects found in workspace</div>';
                            return;
                        }

                        projects.forEach(project => {
                            const projectItem = document.createElement('div');
                            projectItem.className = 'project-item' + (selectedProjects.has(project.id) ? ' selected' : '');
                            projectItem.innerHTML = \`
                                <input type="checkbox" 
                                       class="project-checkbox" 
                                       \${selectedProjects.has(project.id) ? 'checked' : ''} 
                                       onchange="toggleProjectSelection('\${project.id}', this.checked)">
                                <div class="project-info">
                                    <div class="project-name">\${project.name}</div>
                                    <div class="project-path">\${project.relativePath}</div>
                                    \${project.isGitRepo ? 
                                        \`<div class="project-status">Git: \${project.currentBranch || 'No branch'} | \${project.hasRemote ? 'Has remote' : 'No remote'}</div>\` : 
                                        \`<div class="project-status">Not a Git repository</div>\`
                                    }
                                </div>
                            \`;
                            projectList.appendChild(projectItem);
                        });
                    }

                    function toggleProjectSelection(projectId, selected) {
                        vscode.postMessage({
                            command: 'toggleProjectSelection',
                            projectId: projectId,
                            selected: selected
                        });
                    }

                    function selectAll() {
                        projects.forEach(project => {
                            selectedProjects.add(project.id);
                        });
                        renderProjects();
                        updateActionButtons();
                    }

                    function clearSelection() {
                        selectedProjects.clear();
                        renderProjects();
                        updateActionButtons();
                    }

                    function updateActionButtons() {
                        const hasSelection = selectedProjects.size > 0;
                        const hasGitProjects = projects.some(p => p.isGitRepo && selectedProjects.has(p.id));
                        
                        document.getElementById('pullButton').disabled = !hasGitProjects;
                        document.getElementById('switchButton').disabled = !hasGitProjects;
                        document.getElementById('statusButton').disabled = !hasGitProjects;
                        document.getElementById('commitButton').disabled = !hasGitProjects;
                    }

                    function gitPull() {
                        const projectIds = Array.from(selectedProjects);
                        vscode.postMessage({
                            command: 'gitPull',
                            projectIds: projectIds
                        });
                    }

                    function gitSwitchBranch() {
                        const branch = document.getElementById('branchSelector').value;
                        const projectIds = Array.from(selectedProjects);
                        vscode.postMessage({
                            command: 'gitSwitchBranch',
                            projectIds: projectIds,
                            branch: branch
                        });
                    }

                    function gitStatus() {
                        const projectIds = Array.from(selectedProjects);
                        vscode.postMessage({
                            command: 'gitStatus',
                            projectIds: projectIds
                        });
                    }

                    function gitCommit() {
                        const commitMessage = prompt('Enter commit message:');
                        if (commitMessage) {
                            const projectIds = Array.from(selectedProjects);
                            vscode.postMessage({
                                command: 'gitCommit',
                                projectIds: projectIds,
                                commitMessage: commitMessage
                            });
                        }
                    }

                    function showStatus(message, type) {
                        const status = document.getElementById('status');
                        status.textContent = message;
                        status.className = 'status ' + type;
                        status.style.display = 'block';
                        
                        setTimeout(() => {
                            status.style.display = 'none';
                        }, 5000);
                    }

                    // 监听来自VSCode的消息
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        if (message.command === 'updateProjects') {
                            updateProjects(message.projects, message.selectedProjectIds);
                        } else if (message.command === 'showStatus') {
                            showStatus(message.message, message.type);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private handleRefreshProjects(): void {
        this._panel?.webview.postMessage({
            command: 'showStatus',
            message: 'Refreshing projects...',
            type: 'info'
        });

        if (this._refreshCallback) {
            this._refreshCallback();
        } else {
            setTimeout(() => {
                this._panel?.webview.postMessage({
                    command: 'updateProjects',
                    projects: this._projects,
                    selectedProjectIds: this._selectedProjectIds
                });
            }, 500);
        }
    }

    private handleToggleProjectSelection(projectId: string, selected: boolean): void {
        if (selected) {
            this._selectedProjectIds.push(projectId);
        } else {
            const index = this._selectedProjectIds.indexOf(projectId);
            if (index > -1) {
                this._selectedProjectIds.splice(index, 1);
            }
        }

        this._panel?.webview.postMessage({
            command: 'updateProjects',
            projects: this._projects,
            selectedProjectIds: this._selectedProjectIds
        });
    }

    private async handleGitPull(projectIds: string[]): Promise<void> {
        this._panel?.webview.postMessage({
            command: 'showStatus',
            message: 'Starting Git Pull...',
            type: 'info'
        });

        const projects = this.getProjectsFromIds(projectIds);
        const results = await GitUtils.executeGitOperations(projects, 'pull');
        this.showGitOperationResults(results);
    }

    private async handleGitSwitchBranch(projectIds: string[], branch: string): Promise<void> {
        this._panel?.webview.postMessage({
            command: 'showStatus',
            message: `Switching to branch ${branch}...`,
            type: 'info'
        });

        const projects = this.getProjectsFromIds(projectIds);
        const results = await GitUtils.executeGitOperations(projects, 'switch-branch', branch);
        this.showGitOperationResults(results);
    }

    private async handleGitStatus(projectIds: string[]): Promise<void> {
        this._panel?.webview.postMessage({
            command: 'showStatus',
            message: 'Checking Git status...',
            type: 'info'
        });

        const projects = this.getProjectsFromIds(projectIds);
        const results = await GitUtils.executeGitOperations(projects, 'status');
        this.showGitOperationResults(results);
    }

    private async handleGitCommit(projectIds: string[], commitMessage: string): Promise<void> {
        this._panel?.webview.postMessage({
            command: 'showStatus',
            message: `Committing changes: "${commitMessage}"...`,
            type: 'info'
        });

        const projects = this.getProjectsFromIds(projectIds);
        const results = await GitUtils.executeGitOperations(projects, 'commit', undefined, commitMessage);
        this.showGitOperationResults(results);
    }

    private getProjectsFromIds(projectIds: string[]): Project[] {
        return projectIds
            .map(id => this._projects.find(p => p.id === id))
            .filter(project => project !== undefined) as Project[];
    }

    private showGitOperationResults(results: GitOperationResult[]): void {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: `Successfully completed operations on ${successful.length} project(s).`,
                type: 'success'
            });
        }

        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.project?.name}: ${r.error || r.message}`).join('\n');
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: `Failed operations on ${failed.length} project(s):\n${errorMessages}`,
                type: 'error'
            });
        }
    }

    public updateProjects(projects: Project[], selectedProjectIds: string[]): void {
        this._projects = projects;
        this._selectedProjectIds = selectedProjectIds;
        
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'updateProjects',
                projects: projects,
                selectedProjectIds: selectedProjectIds
            });
        }
    }

    public show(): void {
        this._panel?.reveal();
    }

    public dispose(): void {
        this._panel?.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}