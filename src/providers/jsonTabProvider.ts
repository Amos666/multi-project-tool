import * as vscode from 'vscode';
import { JsonTabWebview } from '../webviews/jsonTab/JsonTabWebview';
import { MultiProjectToolSettings, DEFAULT_SETTINGS } from '../models/settings';

export class JsonTabProvider implements vscode.TreeDataProvider<JsonTabItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JsonTabItem | undefined | null | void> = new vscode.EventEmitter<JsonTabItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<JsonTabItem | undefined | null> = this._onDidChangeTreeData.event;

    private webview: JsonTabWebview | undefined;
    private settings: MultiProjectToolSettings;

    constructor(private context: vscode.ExtensionContext) {
        this.settings = this.loadSettings();
        this.setupSettingsListener();
    }

    refresh(): void {
        this.settings = this.loadSettings();
        this._onDidChangeTreeData.fire();
        if (this.webview) {
            this.webview.updateSettings(this.settings);
        }
    }

    getTreeItem(element: JsonTabItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: JsonTabItem): Thenable<JsonTabItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }
        return Promise.resolve([]);
    }

    private getRootItems(): JsonTabItem[] {
        const items: JsonTabItem[] = [];

        // JSON配置项
        const jsonConfigItem = new JsonTabItem(
            'JSON Configuration',
            vscode.TreeItemCollapsibleState.Expanded,
            'json-config'
        );
        jsonConfigItem.contextValue = 'json-config';
        items.push(jsonConfigItem);

        // Tab控制
        const tabControlItem = new JsonTabItem(
            'Tab Control',
            vscode.TreeItemCollapsibleState.Expanded,
            'tab-control'
        );
        tabControlItem.contextValue = 'tab-control';
        items.push(tabControlItem);

        return items;
    }

    openWebview(): void {
        if (!this.webview) {
            this.webview = new JsonTabWebview(
                vscode.Uri.parse(`${this.context.extensionUri}/webviews/jsonTab`),
                this.context.extensionUri
            );
        }
        this.webview.show();
    }

    private loadSettings(): MultiProjectToolSettings {
        const config = vscode.workspace.getConfiguration('multi-project-tool');
        return {
            ...DEFAULT_SETTINGS,
            showJsonTab: config.get('showJsonTab', DEFAULT_SETTINGS.showJsonTab),
            showGitTab: config.get('showGitTab', DEFAULT_SETTINGS.showGitTab),
            gitDefaultBranch: config.get('gitDefaultBranch', DEFAULT_SETTINGS.gitDefaultBranch),
            projectScanDepth: config.get('projectScanDepth', DEFAULT_SETTINGS.projectScanDepth),
            commonParameters: config.get('commonParameters', DEFAULT_SETTINGS.commonParameters),
            hiddenTabs: config.get('hiddenTabs', DEFAULT_SETTINGS.hiddenTabs)
        };
    }

    private setupSettingsListener(): void {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('multi-project-tool')) {
                this.refresh();
            }
        });
    }

    public updateSettings(newSettings: Partial<MultiProjectToolSettings>): void {
        const config = vscode.workspace.getConfiguration('multi-project-tool');
        
        // 更新配置
        Object.keys(newSettings).forEach(key => {
            if (key in DEFAULT_SETTINGS) {
                config.update(key, (newSettings as any)[key], true);
            }
        });

        this.refresh();
    }

    public getSettings(): MultiProjectToolSettings {
        return this.settings;
    }
}

export class JsonTabItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly id: string
    ) {
        super(label, collapsibleState);
    }
}