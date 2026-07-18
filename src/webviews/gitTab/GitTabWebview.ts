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
                    case 'loadBranches':
                        this.handleLoadBranches(message.projectIds);
                        break;
                    case 'gitPush':
                        this.handleGitPush(message.projectIds);
                        break;
                    case 'gitFetch':
                        this.handleGitFetch(message.projectIds);
                        break;
                    case 'gitCustomCommand':
                        this.handleGitCustomCommand(message.projectIds, message.customCommand);
                        break;
                    case 'selectAllProjects':
                        this.handleSelectAllProjects();
                        break;
                    case 'clearSelection':
                        this.handleClearSelection();
                        break;
                }
            },
            undefined,
            this._disposables
        );

        this._panel.onDidDispose(() => {
            this.dispose();
        }, null, this._disposables);

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
                        padding: 0;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    .split-container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                    }
                    .top-pane {
                        flex: 0 0 50%;
                        display: flex;
                        flex-direction: column;
                        border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    .bottom-pane {
                        flex: 0 0 50%;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .tab-container {
                        display: flex;
                        border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                        background-color: var(--vscode-editorWidget-background);
                    }
                    .tab {
                        padding: 10px 20px;
                        cursor: pointer;
                        background-color: transparent;
                        border: none;
                        border-bottom: 2px solid transparent;
                        color: var(--vscode-descriptionForeground);
                        font-size: 14px;
                        transition: all 0.2s ease;
                    }
                    .tab.active {
                        color: var(--vscode-textLink-foreground);
                        border-bottom-color: var(--vscode-textLink-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    .tab-content {
                        flex: 1;
                        padding: 15px;
                        overflow-y: auto;
                    }
                    .git-commands-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                        gap: 12px;
                    }
                    .command-card {
                        padding: 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 8px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        text-align: center;
                    }
                    .command-card:hover:not(.disabled) {
                        background-color: var(--vscode-list-hoverBackground);
                        transform: translateY(-2px);
                    }
                    .command-card.disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    .command-icon {
                        font-size: 28px;
                        margin-bottom: 8px;
                    }
                    .command-name {
                        font-size: 14px;
                        font-weight: 500;
                        margin-bottom: 4px;
                    }
                    .command-desc {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .command-input-group {
                        margin-top: 15px;
                        padding: 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 8px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    .command-input-group label {
                        display: block;
                        font-size: 13px;
                        margin-bottom: 8px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .command-input-group input,
                    .command-input-group select {
                        width: 100%;
                        padding: 8px 12px;
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        font-size: 14px;
                        box-sizing: border-box;
                    }
                    .command-input-group input:focus,
                    .command-input-group select:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }
                    .command-input-group button {
                        margin-top: 10px;
                        padding: 8px 20px;
                        border: none;
                        border-radius: 4px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .command-input-group button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .bottom-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    .bottom-header h2 {
                        margin: 0;
                        font-size: 14px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .bottom-controls {
                        display: flex;
                        gap: 10px;
                    }
                    .bottom-controls button {
                        padding: 6px 12px;
                        border: none;
                        border-radius: 4px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 13px;
                    }
                    .bottom-controls button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .project-list-container {
                        flex: 1;
                        overflow-y: auto;
                        padding: 10px;
                    }
                    .project-item {
                        display: flex;
                        align-items: center;
                        padding: 10px 12px;
                        margin-bottom: 6px;
                        background-color: var(--vscode-editorWidget-background);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        transition: all 0.2s ease;
                        cursor: pointer;
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
                        width: 16px;
                        height: 16px;
                        cursor: pointer;
                    }
                    .project-info {
                        flex: 1;
                        min-width: 0;
                    }
                    .project-name {
                        font-weight: 500;
                        font-size: 13px;
                        margin-bottom: 3px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .project-path {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 2px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .project-status {
                        font-size: 11px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .status-bar {
                        padding: 10px 15px;
                        background-color: var(--vscode-editorWidget-background);
                        border-top: 1px solid var(--vscode-editor-lineHighlightBorder);
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .status-bar span {
                        margin-right: 15px;
                    }
                    .status-bar .selected-count {
                        color: var(--vscode-textLink-foreground);
                        font-weight: 500;
                    }
                    .loading {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .no-projects {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }
                </style>
            </head>
            <body>
                <div class="split-container">
                    <div class="top-pane">
                        <div class="tab-container">
                            <button class="tab active" onclick="switchTab('git-commands')">Git Commands</button>
                            <button class="tab" onclick="switchTab('settings')">Settings</button>
                        </div>
                        <div class="tab-content" id="tab-git-commands">
                            <div class="git-commands-grid">
                                <div class="command-card" id="cmd-pull" onclick="executeGitCommand('pull')">
                                    <div class="command-icon">📥</div>
                                    <div class="command-name">Git Pull</div>
                                    <div class="command-desc">Pull latest changes</div>
                                </div>
                                <div class="command-card" id="cmd-push" onclick="executeGitCommand('push')">
                                    <div class="command-icon">📤</div>
                                    <div class="command-name">Git Push</div>
                                    <div class="command-desc">Push local changes</div>
                                </div>
                                <div class="command-card" id="cmd-fetch" onclick="executeGitCommand('fetch')">
                                    <div class="command-icon">🔄</div>
                                    <div class="command-name">Git Fetch</div>
                                    <div class="command-desc">Fetch from remote</div>
                                </div>
                                <div class="command-card" id="cmd-status" onclick="executeGitCommand('status')">
                                    <div class="command-icon">📋</div>
                                    <div class="command-name">Status</div>
                                    <div class="command-desc">Check git status</div>
                                </div>
                                <div class="command-card" id="cmd-checkout" onclick="showCheckoutDialog()">
                                    <div class="command-icon">🌿</div>
                                    <div class="command-name">Checkout</div>
                                    <div class="command-desc">Switch branch</div>
                                </div>
                                <div class="command-card" id="cmd-commit" onclick="showCommitDialog()">
                                    <div class="command-icon">💾</div>
                                    <div class="command-name">Commit</div>
                                    <div class="command-desc">Commit changes</div>
                                </div>
                                <div class="command-card" id="cmd-branch" onclick="showBranchDialog()">
                                    <div class="command-icon">🌳</div>
                                    <div class="command-name">Branch</div>
                                    <div class="command-desc">Manage branches</div>
                                </div>
                                <div class="command-card" id="cmd-custom" onclick="showCustomCommandDialog()">
                                    <div class="command-icon">⚙️</div>
                                    <div class="command-name">Custom</div>
                                    <div class="command-desc">Custom command</div>
                                </div>
                            </div>

                            <div id="commandInputArea"></div>
                        </div>
                        <div class="tab-content" id="tab-settings" style="display: none;">
                            <div class="command-input-group">
                                <label>Default Branch</label>
                                <input type="text" id="defaultBranch" value="main" placeholder="main">
                            </div>
                            <div class="command-input-group">
                                <label>Default Commit Message</label>
                                <input type="text" id="defaultCommitMessage" value="Auto commit" placeholder="Commit message">
                            </div>
                            <div class="command-input-group">
                                <label>Auto Approve Operations</label>
                                <input type="checkbox" id="autoApprove">
                                <button onclick="saveSettings()">Save Settings</button>
                            </div>
                        </div>
                    </div>

                    <div class="bottom-pane">
                        <div class="bottom-header">
                            <h2>Git Projects</h2>
                            <div class="bottom-controls">
                                <button onclick="refreshProjects()">🔄 Refresh</button>
                                <button onclick="selectAllProjects()">Select All</button>
                                <button onclick="clearSelection()">Clear</button>
                            </div>
                        </div>
                        <div class="project-list-container" id="projectList"></div>
                        <div class="status-bar">
                            <span>Total: <span id="totalCount">0</span></span>
                            <span>Selected: <span class="selected-count" id="selectedCount">0</span></span>
                        </div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let projects = [];
                    let selectedProjects = new Set();
                    let currentBranches = [];

                    window.addEventListener('load', () => {
                        refreshProjects();
                    });

                    function switchTab(tabName) {
                        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
                        
                        event.target.classList.add('active');
                        document.getElementById('tab-' + tabName).style.display = 'block';
                    }

                    function refreshProjects() {
                        document.getElementById('projectList').innerHTML = '<div class="loading">Loading projects...</div>';
                        vscode.postMessage({ command: 'refreshProjects' });
                    }

                    function updateProjects(projectsData, selectedIds) {
                        projects = projectsData;
                        selectedProjects = new Set(selectedIds);
                        renderProjects();
                        updateCommandCards();
                        updateStatusBar();
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
                            projectItem.innerHTML = '\n                                <input type="checkbox" \n                                       class="project-checkbox" \n                                       ' + (selectedProjects.has(project.id) ? 'checked' : '') + ' \n                                       onchange="toggleProjectSelection(\'' + project.id + '\', this.checked)">\n                                <div class="project-info">\n                                    <div class="project-name">' + project.name + '</div>\n                                    <div class="project-path">' + project.relativePath + '</div>\n                                    ' + (project.isGitRepo ? \n                                        '<div class="project-status">Git: ' + (project.currentBranch || 'No branch') + ' | ' + (project.hasRemote ? 'Has remote' : 'No remote') + '</div>' : \n                                        '<div class="project-status">Not a Git repository</div>') + \n                                '</div>\n                            ';
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

                    function selectAllProjects() {
                        vscode.postMessage({ command: 'selectAllProjects' });
                    }

                    function clearSelection() {
                        vscode.postMessage({ command: 'clearSelection' });
                    }

                    function updateCommandCards() {
                        const hasSelection = selectedProjects.size > 0;
                        const hasGitProjects = projects.some(p => p.isGitRepo && selectedProjects.has(p.id));
                        
                        const commands = ['cmd-pull', 'cmd-push', 'cmd-fetch', 'cmd-status', 'cmd-checkout', 'cmd-commit', 'cmd-branch', 'cmd-custom'];
                        commands.forEach(cmdId => {
                            const card = document.getElementById(cmdId);
                            if (card) {
                                if (hasGitProjects) {
                                    card.classList.remove('disabled');
                                } else {
                                    card.classList.add('disabled');
                                }
                            }
                        });
                    }

                    function updateStatusBar() {
                        document.getElementById('totalCount').textContent = projects.length;
                        document.getElementById('selectedCount').textContent = selectedProjects.size;
                    }

                    function executeGitCommand(command) {
                        if (selectedProjects.size === 0) {
                            alert('Please select at least one project first');
                            return;
                        }
                        
                        const projectIds = Array.from(selectedProjects);
                        
                        switch(command) {
                            case 'pull':
                                vscode.postMessage({ command: 'gitPull', projectIds: projectIds });
                                break;
                            case 'push':
                                vscode.postMessage({ command: 'gitPush', projectIds: projectIds });
                                break;
                            case 'fetch':
                                vscode.postMessage({ command: 'gitFetch', projectIds: projectIds });
                                break;
                            case 'status':
                                vscode.postMessage({ command: 'gitStatus', projectIds: projectIds });
                                break;
                        }
                    }

                    function showCheckoutDialog() {
                        if (selectedProjects.size === 0) {
                            alert('Please select at least one project first');
                            return;
                        }
                        
                        const projectIds = Array.from(selectedProjects);
                        const defaultBranch = document.getElementById('defaultBranch')?.value || 'main';
                        
                        const branch = prompt('Enter branch name to checkout:', defaultBranch);
                        if (branch) {
                            vscode.postMessage({ 
                                command: 'gitSwitchBranch', 
                                projectIds: projectIds,
                                branch: branch
                            });
                        }
                    }

                    function showCommitDialog() {
                        if (selectedProjects.size === 0) {
                            alert('Please select at least one project first');
                            return;
                        }
                        
                        const projectIds = Array.from(selectedProjects);
                        const defaultMessage = document.getElementById('defaultCommitMessage')?.value || 'Auto commit';
                        
                        const message = prompt('Enter commit message:', defaultMessage);
                        if (message) {
                            vscode.postMessage({ 
                                command: 'gitCommit', 
                                projectIds: projectIds,
                                commitMessage: message
                            });
                        }
                    }

                    function showBranchDialog() {
                        if (selectedProjects.size === 0) {
                            alert('Please select at least one project first');
                            return;
                        }
                        
                        const action = prompt('Branch action:\n1. List branches (list)\n2. Create branch (create)\n3. Delete branch (delete)\n\nEnter action:');
                        if (!action) return;
                        
                        const projectIds = Array.from(selectedProjects);
                        
                        if (action === 'list' || action === '1') {
                            vscode.postMessage({ 
                                command: 'gitCustomCommand', 
                                projectIds: projectIds,
                                customCommand: 'branch -a'
                            });
                        } else if (action === 'create' || action === '2') {
                            const branchName = prompt('Enter new branch name:');
                            if (branchName) {
                                vscode.postMessage({ 
                                    command: 'gitCustomCommand', 
                                    projectIds: projectIds,
                                    customCommand: 'checkout -b ' + branchName
                                });
                            }
                        } else if (action === 'delete' || action === '3') {
                            const branchName = prompt('Enter branch name to delete:');
                            if (branchName) {
                                vscode.postMessage({ 
                                    command: 'gitCustomCommand', 
                                    projectIds: projectIds,
                                    customCommand: 'branch -d ' + branchName
                                });
                            }
                        }
                    }

                    function showCustomCommandDialog() {
                        if (selectedProjects.size === 0) {
                            alert('Please select at least one project first');
                            return;
                        }
                        
                        const projectIds = Array.from(selectedProjects);
                        const command = prompt('Enter custom git command (e.g., log --oneline, stash):');
                        if (command) {
                            vscode.postMessage({ 
                                command: 'gitCustomCommand', 
                                projectIds: projectIds,
                                customCommand: command
                            });
                        }
                    }

                    function saveSettings() {
                        alert('Settings saved! (Note: Settings are currently stored locally)');
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateProjects':
                                updateProjects(message.projects, message.selectedProjectIds);
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private handleRefreshProjects(): void {
        if (this._refreshCallback) {
            this._refreshCallback();
        }
    }

    private handleToggleProjectSelection(projectId: string, selected: boolean): void {
        const project = this._projects.find(p => p.id === projectId);
        if (!project) return;

        if (selected) {
            this._selectedProjectIds.push(projectId);
        } else {
            this._selectedProjectIds = this._selectedProjectIds.filter(id => id !== projectId);
        }

        this.updateWebviewProjects();
    }

    private handleSelectAllProjects(): void {
        this._selectedProjectIds = this._projects
            .filter(p => p.isGitRepo)
            .map(p => p.id);
        this.updateWebviewProjects();
    }

    private handleClearSelection(): void {
        this._selectedProjectIds = [];
        this.updateWebviewProjects();
    }

    private async handleGitPull(projectIds: string[]): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'pull');
        this.showResults(results);
    }

    private async handleGitPush(projectIds: string[]): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, 'push');
        this.showResults(results);
    }

    private async handleGitFetch(projectIds: string[]): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, 'fetch');
        this.showResults(results);
    }

    private async handleGitStatus(projectIds: string[]): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'status');
        this.showResults(results);
    }

    private async handleGitSwitchBranch(projectIds: string[], branch: string): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0 || !branch) return;

        const results = await GitUtils.executeGitOperations(projects, 'switch-branch', branch);
        this.showResults(results);
        this.refreshCallback();
    }

    private async handleGitCommit(projectIds: string[], commitMessage: string): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0 || !commitMessage) return;

        const results = await GitUtils.executeGitOperations(projects, 'commit', undefined, commitMessage);
        this.showResults(results);
    }

    private async handleGitCustomCommand(projectIds: string[], customCommand: string): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0 || !customCommand) return;

        const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, customCommand);
        this.showResults(results);
    }

    private async handleLoadBranches(projectIds: string[]): Promise<void> {
        const projects = this.getProjectsFromIds(projectIds);
        if (projects.length === 0) return;

        const firstProject = projects[0];
        const result = await GitUtils.gitBranches(firstProject);
        
        if (result.success && result.output) {
            const branches = this.parseBranchOutput(result.output);
            this._panel?.webview.postMessage({
                command: 'updateBranchSelector',
                branches: branches
            });
        }
    }

    private parseBranchOutput(output: string): string[] {
        const lines = output.split('\n');
        const branches: string[] = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                const branchName = trimmed.replace(/^\*\s*/, '').replace(/^\s+/, '');
                if (branchName && !branchName.includes('->')) {
                    branches.push(branchName);
                }
            }
        }
        
        return branches;
    }

    private getProjectsFromIds(projectIds: string[]): Project[] {
        return projectIds
            .map(id => this._projects.find(p => p.id === id))
            .filter(project => project !== undefined) as Project[];
    }

    private showResults(results: GitOperationResult[]): void {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            vscode.window.showInformationMessage(
                `Successfully completed operations on ${successful.length} project(s).`
            );
        }

        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.project?.name}: ${r.error || r.message}`).join('\n');
            vscode.window.showErrorMessage(
                `Failed operations on ${failed.length} project(s):\n${errorMessages}`
            );
        }
    }

    private updateWebviewProjects(): void {
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'updateProjects',
                projects: this._projects,
                selectedProjectIds: this._selectedProjectIds
            });
        }
    }

    private refreshCallback(): void {
        if (this._refreshCallback) {
            this._refreshCallback();
        }
    }

    public updateProjects(projects: Project[], selectedProjectIds: string[]): void {
        this._projects = projects;
        this._selectedProjectIds = selectedProjectIds;
        this.updateWebviewProjects();
    }

    public updateBranchSelector(branches: string[]): void {
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'updateBranchSelector',
                branches: branches
            });
        }
    }

    public show(): void {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
        }
    }

    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._panel?.dispose();
    }
}