import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandTreeNode, migrateConfig } from './configMigration';

/** Projects view 项目行右侧动态按钮命令：别名 / 命令内容 / 悬停描述 tips */
export interface ProjectRowCommand {
    id: string;
    alias: string;
    command: string;
    tip: string;
}

export interface WorkspaceConfig {
    settings: {
        commonParameters: Record<string, any>;
        defaultShell: string;
        shortcutShell: string;
        autoRefresh: boolean;
        logRetention: number;
        concurrency: number;
        commandTimeout: number;
        language: string;
        /** @deprecated 项目行按钮命令已改为插件级全局存储（context.globalState），跨工作区共享。
         *  此字段仅供 loadSettings 读取旧工作区数据做一次性迁移，新代码不再写入 */
        projectRowCommands?: ProjectRowCommand[];
    };
    customCommandTree: CommandTreeNode[];
    envVariables: Array<{
        key: string;
        value: string;
    }>;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
    settings: {
        commonParameters: {},
        defaultShell: 'git-bash',
        shortcutShell: 'git-bash',
        autoRefresh: true,
        logRetention: 50,
        concurrency: 1,
        commandTimeout: 300,
        language: 'en'
        // projectRowCommands 缺省：首次加载时由宿主按语言播种默认命令并落盘
    },
    customCommandTree: [],
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
            const migration = migrateConfig(parsed);
            if (migration.migrated) {
                // 旧版本数据首次加载即迁移并落盘，后续保存均为新格式
                this.save(this.mergeWithDefaults(parsed));
            }
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
        const migration = migrateConfig(config);
        return {
            settings: {
                commonParameters: config?.settings?.commonParameters || {},
                defaultShell: config?.settings?.defaultShell || 'git-bash',
                shortcutShell: config?.settings?.shortcutShell || 'git-bash',
                autoRefresh: config?.settings?.autoRefresh !== undefined ? config.settings.autoRefresh : true,
                logRetention: config?.settings?.logRetention || 50,
                concurrency: config?.settings?.concurrency || 1,
                commandTimeout: config?.settings?.commandTimeout || 300,
                language: config?.settings?.language || 'en',
                // 保持 undefined（未初始化）以区分「用户删空」与「老配置无此字段」
                projectRowCommands: Array.isArray(config?.settings?.projectRowCommands) ? config.settings.projectRowCommands : undefined
            },
            customCommandTree: migration.customCommandTree,
            envVariables: config?.envVariables || []
        };
    }

    public getConfigDir(): string | undefined {
        return this.getConfigPath();
    }
}
