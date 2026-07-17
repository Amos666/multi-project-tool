import * as vscode from 'vscode';

export class JsonTabView {
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
                case 'saveSettings':
                    this.handleSaveSettings(message.settings);
                    break;
                case 'resetSettings':
                    this.handleResetSettings();
                    break;
                case 'toggleTab':
                    this.handleToggleTab(message.tabId, message.show);
                    break;
            }
        });
    }

    private async handleSaveSettings(settings: any): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('multi-project-tool');
            
            // 更新JSON配置
            if (settings.commonParameters) {
                await config.update('commonParameters', typeof settings.commonParameters === 'string' 
                    ? JSON.parse(settings.commonParameters) 
                    : settings.commonParameters, true);
            }

            // 更新Tab显示设置
            if (settings.showJsonTab !== undefined) {
                await config.update('showJsonTab', settings.showJsonTab, true);
            }
            if (settings.showGitTab !== undefined) {
                await config.update('showGitTab', settings.showGitTab, true);
            }

            // 发送成功消息
            this.webview.postMessage({
                command: 'showStatus',
                message: 'Settings saved successfully!',
                type: 'success'
            });

        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error saving settings: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleResetSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('multi-project-tool');
            
            // 重置为默认值
            await config.update('showJsonTab', true, true);
            await config.update('showGitTab', true, true);
            await config.update('commonParameters', {}, true);

            // 发送成功消息
            this.webview.postMessage({
                command: 'showStatus',
                message: 'Settings reset to default!',
                type: 'success'
            });

        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error resetting settings: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleToggleTab(tabId: string, show: boolean): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('multi-project-tool');
            await config.update(tabId, show, true);
            
            this.webview.postMessage({
                command: 'showStatus',
                message: `${tabId} ${show ? 'shown' : 'hidden'} successfully!`,
                type: 'success'
            });
        } catch (error) {
            this.webview.postMessage({
                command: 'showStatus',
                message: `Error toggling tab: ${error}`,
                type: 'error'
            });
        }
    }

    public updateSettings(settings: any): void {
        this.webview.postMessage({
            command: 'updateSettings',
            settings: settings
        });
    }
}