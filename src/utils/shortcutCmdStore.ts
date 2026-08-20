import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandTreeNode, sanitizeTree } from './configMigration';

// ShortCutCmd 页签命令存储：固定在工作区根目录执行的快捷命令树
export class ShortcutCmdStore {
    private static instance: ShortcutCmdStore;
    private _configDir: string | undefined;

    private constructor() {}

    public static getInstance(): ShortcutCmdStore {
        if (!ShortcutCmdStore.instance) {
            ShortcutCmdStore.instance = new ShortcutCmdStore();
        }
        return ShortcutCmdStore.instance;
    }

    private getConfigPath(): string | undefined {
        if (this._configDir) {
            return this._configDir;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this._configDir = path.join(workspaceRoot, '.multi-project-tool');
        return this._configDir;
    }

    public load(): CommandTreeNode[] {
        const configPath = this.getConfigPath();
        if (!configPath) {
            return [];
        }

        const configFile = path.join(configPath, 'shortcutCommands.json');
        try {
            if (!fs.existsSync(configFile)) {
                return [];
            }
            const content = fs.readFileSync(configFile, 'utf8');
            const parsed = JSON.parse(content);
            if (parsed && Array.isArray(parsed.shortcutCommandTree)) {
                return sanitizeTree(parsed.shortcutCommandTree);
            }
            return [];
        } catch (error) {
            console.error('Failed to load shortcut commands:', error);
            return [];
        }
    }

    public save(tree: CommandTreeNode[]): boolean {
        const configPath = this.getConfigPath();
        if (!configPath) {
            console.warn('No workspace folder, cannot save shortcut commands');
            return false;
        }

        try {
            if (!fs.existsSync(configPath)) {
                fs.mkdirSync(configPath, { recursive: true });
            }
            const configFile = path.join(configPath, 'shortcutCommands.json');
            const payload = { shortcutCommandTree: tree };
            fs.writeFileSync(configFile, JSON.stringify(payload, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save shortcut commands:', error);
            return false;
        }
    }
}
