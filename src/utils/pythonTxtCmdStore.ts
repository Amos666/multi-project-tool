import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    CommandTreeNode,
    legacyCommandsToTree,
    sanitizeTree
} from './configMigration';

// 旧版本扁平结构（仅用于内置默认命令与迁移参照）
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

// 内置默认命令包裹进 Default 分类，保持与迁移后一致的结构
function defaultTree(): CommandTreeNode[] {
    return legacyCommandsToTree(DEFAULT_COMMANDS);
}

function hasCommandNode(nodes: CommandTreeNode[]): boolean {
    for (const node of nodes) {
        if (node.type === 'command') {
            return true;
        }
        if (node.children && hasCommandNode(node.children)) {
            return true;
        }
    }
    return false;
}

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

    public load(): CommandTreeNode[] {
        const configPath = this.getConfigPath();
        if (!configPath) {
            return defaultTree();
        }

        const configFile = path.join(configPath, 'customPythonTxt.json');
        try {
            if (!fs.existsSync(configFile)) {
                // 首次使用：内置大小写转换示例落盘，后续可见、可编辑
                const tree = defaultTree();
                this.save(tree);
                return tree;
            }
            const content = fs.readFileSync(configFile, 'utf8');
            const parsed = JSON.parse(content);

            // 旧版本：扁平数组 {id, alias, content}，整体迁移到 Default 分类并落盘
            if (Array.isArray(parsed)) {
                if (parsed.length === 0) {
                    const tree = defaultTree();
                    this.save(tree);
                    return tree;
                }
                const tree = legacyCommandsToTree(parsed);
                this.save(tree);
                return tree;
            }

            // 新版本：{ pythonTxtCommandTree: [...] }
            if (parsed && Array.isArray(parsed.pythonTxtCommandTree)) {
                const tree = sanitizeTree(parsed.pythonTxtCommandTree);
                // 老文件可能缺少内置示例：树里完全没有命令节点时补一次，
                // save 会写入 defaultsSeeded 标记，之后不再重复补充
                if (!parsed.defaultsSeeded) {
                    if (!hasCommandNode(tree)) {
                        tree.push(...defaultTree());
                    }
                    this.save(tree);
                }
                return tree;
            }

            const tree = defaultTree();
            this.save(tree);
            return tree;
        } catch (error) {
            console.error('Failed to load python txt commands:', error);
            return defaultTree();
        }
    }

    public save(tree: CommandTreeNode[]): boolean {
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
            const payload = { pythonTxtCommandTree: tree, defaultsSeeded: true };
            fs.writeFileSync(configFile, JSON.stringify(payload, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save python txt commands:', error);
            return false;
        }
    }
}
