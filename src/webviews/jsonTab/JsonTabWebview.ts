import * as vscode from 'vscode';
import { JsonTabView } from './JsonTabView';
import { MultiProjectToolSettings } from '../../models/settings';

export class JsonTabWebview {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _view: JsonTabView | undefined;

    constructor(
        private readonly _uri: vscode.Uri,
        private readonly _extensionUri: vscode.Uri
    ) {
        this.createWebviewPanel();
    }

    private createWebviewPanel(): void {
        this._panel = vscode.window.createWebviewPanel(
            'multi-project-tool.json-tab',
            'JSON Settings',
            vscode.ViewColumn.One,
            this.getWebviewOptions()
        );

        this._panel.webview.html = this.getWebviewContent();

        // 监听webview消息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'getSettings':
                        this.handleGetSettings();
                        break;
                    case 'updateSettings':
                        this.handleUpdateSettings(message.settings);
                        break;
                    case 'toggleTab':
                        this.handleToggleTab(message.tabId, message.show);
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
        this._view = new JsonTabView(this._panel.webview, this._extensionUri);
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
                <title>JSON Settings</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    .section {
                        margin-bottom: 30px;
                        padding: 20px;
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        border-radius: 6px;
                        background-color: var(--vscode-editorWidget-background);
                    }
                    .section h2 {
                        margin-top: 0;
                        color: var(--vscode-textLink-foreground);
                    }
                    .form-group {
                        margin-bottom: 15px;
                    }
                    label {
                        display: block;
                        margin-bottom: 5px;
                        font-weight: 500;
                    }
                    input, select, textarea {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                    }
                    textarea {
                        height: 150px;
                        resize: vertical;
                    }
                    .checkbox-group {
                        display: flex;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    .checkbox-group input {
                        width: auto;
                        margin-right: 10px;
                    }
                    .button-group {
                        display: flex;
                        gap: 10px;
                        margin-top: 20px;
                    }
                    button {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .status {
                        margin-top: 10px;
                        padding: 10px;
                        border-radius: 4px;
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="section">
                        <h2>JSON Configuration</h2>
                        <div class="form-group">
                            <label for="commonParams">Common Parameters (JSON):</label>
                            <textarea id="commonParams" placeholder="Enter JSON configuration..."></textarea>
                        </div>
                    </div>

                    <div class="section">
                        <h2>Tab Control</h2>
                        <div class="checkbox-group">
                            <input type="checkbox" id="showJsonTab">
                            <label for="showJsonTab">Show JSON Tab</label>
                        </div>
                        <div class="checkbox-group">
                            <input type="checkbox" id="showGitTab">
                            <label for="showGitTab">Show Git Tab</label>
                        </div>
                    </div>

                    <div class="button-group">
                        <button onclick="saveSettings()">Save Settings</button>
                        <button onclick="resetSettings()">Reset to Default</button>
                    </div>

                    <div id="status" class="status"></div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    // 初始化
                    window.addEventListener('load', () => {
                        vscode.postMessage({ command: 'getSettings' });
                    });

                    function saveSettings() {
                        const settings = {
                            commonParameters: document.getElementById('commonParams').value,
                            showJsonTab: document.getElementById('showJsonTab').checked,
                            showGitTab: document.getElementById('showGitTab').checked
                        };

                        vscode.postMessage({
                            command: 'updateSettings',
                            settings: settings
                        });
                    }

                    function resetSettings() {
                        document.getElementById('showJsonTab').checked = true;
                        document.getElementById('showGitTab').checked = true;
                        document.getElementById('commonParams').value = '{}';
                        saveSettings();
                    }

                    // 监听来自VSCode的消息
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        if (message.command === 'updateSettings') {
                            document.getElementById('showJsonTab').checked = message.settings.showJsonTab;
                            document.getElementById('showGitTab').checked = message.settings.showGitTab;
                            document.getElementById('commonParams').value = JSON.stringify(message.settings.commonParameters, null, 2);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private handleGetSettings(): void {
        const settings = {
            showJsonTab: vscode.workspace.getConfiguration('multi-project-tool').get('showJsonTab', true),
            showGitTab: vscode.workspace.getConfiguration('multi-project-tool').get('showGitTab', true),
            commonParameters: vscode.workspace.getConfiguration('multi-project-tool').get('commonParameters', {})
        };

        this._panel?.webview.postMessage({
            command: 'updateSettings',
            settings: settings
        });
    }

    private async handleUpdateSettings(settings: any): Promise<void> {
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

            // 显示成功消息
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: 'Settings saved successfully!',
                type: 'success'
            });

        } catch (error) {
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: `Error saving settings: ${error}`,
                type: 'error'
            });
        }
    }

    private async handleToggleTab(tabId: string, show: boolean): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('multi-project-tool');
            await config.update(tabId, show, true);
            
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: `${tabId} ${show ? 'shown' : 'hidden'} successfully!`,
                type: 'success'
            });
        } catch (error) {
            this._panel?.webview.postMessage({
                command: 'showStatus',
                message: `Error toggling tab: ${error}`,
                type: 'error'
            });
        }
    }

    public show(): void {
        this._panel?.reveal();
    }

    public updateSettings(settings: MultiProjectToolSettings): void {
        this._panel?.webview.postMessage({
            command: 'updateSettings',
            settings: settings
        });
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