import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface PythonTxtCommand {
    id: string;
    alias: string;
    content: string;
    description?: string;
}

const DEFAULT_COMMANDS: PythonTxtCommand[] = [
    {
        id: 'upper-case',
        alias: '转为大写',
        description: '将选中的文本转换为大写',
        content: `import sys

text = sys.stdin.read()
print(text.upper())`
    },
    {
        id: 'lower-case',
        alias: '转为小写',
        description: '将选中的文本转换为小写',
        content: `import sys

text = sys.stdin.read()
print(text.lower())`
    }
];

export class PythonTxtCmdStore {
    private static instance: PythonTxtCmdStore;
    private _configDir: string | undefined;

    private constructor() {}

    public static getInstance(): PythonTxtCmdStore {
        if (!PythonTxtCmdStore.instance) {
            PythonTxtCmdStore.instance = new PythonTxtCmdStore();
        }
        return PythonTxtCmdStore.instance;
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

    public load(): PythonTxtCommand[] {
        const configPath = this.getConfigPath();
        if (!configPath) {
            return DEFAULT_COMMANDS;
        }

        const configFile = path.join(configPath, 'customPythonTxt.json');
        try {
            if (!fs.existsSync(configFile)) {
                return DEFAULT_COMMANDS;
            }
            const content = fs.readFileSync(configFile, 'utf8');
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
            return DEFAULT_COMMANDS;
        } catch (error) {
            console.error('Failed to load python txt commands:', error);
            return DEFAULT_COMMANDS;
        }
    }

    public save(commands: PythonTxtCommand[]): boolean {
        const configPath = this.getConfigPath();
        if (!configPath) {
            console.warn('No workspace folder, cannot save python txt commands');
            return false;
        }

        try {
            if (!fs.existsSync(configPath)) {
                fs.mkdirSync(configPath, { recursive: true });
            }
            const configFile = path.join(configPath, 'customPythonTxt.json');
            fs.writeFileSync(configFile, JSON.stringify(commands, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save python txt commands:', error);
            return false;
        }
    }
}
