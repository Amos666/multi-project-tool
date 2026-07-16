import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceConfig {
    settings: {
        commonParameters: Record<string, any>;
        defaultShell: string;
        autoRefresh: boolean;
        logRetention: number;
        concurrency: number;
        commandTimeout: number;
        language: string;
    };
    customCommands: Array<{
        id: string;
        alias: string;
        content: string;
    }>;
    envVariables: Array<{
        key: string;
        value: string;
    }>;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
    settings: {
        commonParameters: {},
        defaultShell: 'git-bash',
        autoRefresh: true,
        logRetention: 50,
        concurrency: 1,
        commandTimeout: 300,
        language: 'en'
    },
    customCommands: [],
    envVariables: []
};

export class ConfigStore {
    private static instance: ConfigStore;
    private _configDir: string | undefined;

    private constructor() {}

    public static getInstance(): ConfigStore {
        if (!ConfigStore.instance) {
            ConfigStore.instance = new ConfigStore();
        }
        return ConfigStore.instance;
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

    public load(): WorkspaceConfig {
        const configPath = this.getConfigPath();
        if (!configPath) {
            return DEFAULT_CONFIG;
        }

        const configFile = path.join(configPath, 'config.json');
        try {
            if (!fs.existsSync(configFile)) {
                return DEFAULT_CONFIG;
            }
            const content = fs.readFileSync(configFile, 'utf8');
            const parsed = JSON.parse(content);
            return this.mergeWithDefaults(parsed);
        } catch (error) {
            console.error('Failed to load config file:', error);
            return DEFAULT_CONFIG;
        }
    }

    public save(config: WorkspaceConfig): boolean {
        const configPath = this.getConfigPath();
        if (!configPath) {
            console.warn('No workspace folder, cannot save config');
            return false;
        }

        try {
            if (!fs.existsSync(configPath)) {
                fs.mkdirSync(configPath, { recursive: true });
            }
            const configFile = path.join(configPath, 'config.json');
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save config file:', error);
            return false;
        }
    }

    private mergeWithDefaults(config: any): WorkspaceConfig {
        return {
            settings: {
                commonParameters: config?.settings?.commonParameters || {},
                defaultShell: config?.settings?.defaultShell || 'git-bash',
                autoRefresh: config?.settings?.autoRefresh !== undefined ? config.settings.autoRefresh : true,
                logRetention: config?.settings?.logRetention || 50,
                concurrency: config?.settings?.concurrency || 1,
                commandTimeout: config?.settings?.commandTimeout || 300,
                language: config?.settings?.language || 'en'
            },
            customCommands: config?.customCommands || [],
            envVariables: config?.envVariables || []
        };
    }

    public getConfigDir(): string | undefined {
        return this.getConfigPath();
    }
}
