import * as vscode from 'vscode';

export class GitTabView {
    constructor(
        private readonly webview: vscode.Webview,
        private readonly extensionUri: vscode.Uri
    ) {
        this.initializeWebview();
    }

    private initializeWebview(): void {
        // 初始化webview样式和交互
        this.setupMessageHandlers();
    }

    private setupMessageHandlers(): void {
        // 监听来自webview的消息
        this.webview.onDidReceiveMessage((message) => {
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
        });
    }

    private async handleRefreshProjects(): Promise<void> {
        try {
            // 发送刷新消息到主provider
            vscode.commands.executeCommand('multi-project-tool.refreshProjects');
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error refreshing projects: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleToggleProjectSelection(projectId: string, selected: boolean): Promise<void> {
        try {
            // 这里应该调用provider的方法来切换项目选择状态
            // 暂时发送模拟响应
            this.webview.postMessage({
                command: 'projectSelectionToggled',
                projectId: projectId,
                selected: selected
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error toggling project selection: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleGitPull(projectIds: string[]): Promise<void> {
        try {
            // 这里应该调用实际的Git操作
            const result = await vscode.commands.executeCommand('multi-project-tool.gitPull', projectIds);
            
            this.webview.postMessage({
                command: 'showStatus',
                message: 'Git Pull completed successfully!',
                type: 'success'
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error during Git Pull: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleGitSwitchBranch(projectIds: string[], branch: string): Promise<void> {
        try {
            // 这里应该调用实际的Git操作
            const result = await vscode.commands.executeCommand('multi-project-tool.gitSwitchBranch', {
                projectIds: projectIds,
                branch: branch
            });
            
            this.webview.postMessage({
                command: 'showStatus',
                message: `Successfully switched to branch ${branch}!`,
                type: 'success'
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error switching branch: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleGitStatus(projectIds: string[]): Promise<void> {
        try {
            // 这里应该调用实际的Git操作
            const result = await vscode.commands.executeCommand('multi-project-tool.gitStatus', projectIds);
            
            this.webview.postMessage({
                command: 'showStatus',
                message: 'Git status check completed!',
                type: 'success'
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error checking Git status: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleGitCommit(projectIds: string[], commitMessage: string): Promise<void> {
        try {
            // 这里应该调用实际的Git操作
            const result = await vscode.commands.executeCommand('multi-project-tool.gitCommit', {
                projectIds: projectIds,
                commitMessage: commitMessage
            });
            
            this.webview.postMessage({
                command: 'showStatus',
                message: 'Commit completed successfully!',
                type: 'success'
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error committing changes: ${error}`,
                type: 'error'
            });
        }
    }

    public updateProjects(projects: any[], selectedProjectIds: string[]): void {
        this.webview.postMessage({
            command: 'updateProjects',
            projects: projects,
            selectedProjectIds: selectedProjectIds
        });
    }
}