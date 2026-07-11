import * as vscode from 'vscode';
import { JsonTabProvider } from './providers/jsonTabProvider';
import { GitTabProvider } from './providers/gitTabProvider';
import { LogManager } from './utils/logManager';
import { LogOutputChannel } from './utils/logOutputChannel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Multi-Project Tool extension is now active!');
    
    const logManager = LogManager.getInstance();
    const logOutputChannel = LogOutputChannel.getInstance();
    
    logManager.info('Multi-Project Tool extension activated');

    // 注册JSON Tab提供者
    const jsonTabProvider = new JsonTabProvider(context);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('multi-project-tool.json-tab', jsonTabProvider),
        vscode.commands.registerCommand('multi-project-tool.openJsonTab', () => {
            jsonTabProvider.openWebview();
        })
    );

    // 注册Git Tab提供者
    const gitTabProvider = new GitTabProvider(context);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('multi-project-tool.git-tab', gitTabProvider),
        vscode.commands.registerCommand('multi-project-tool.openGitTab', () => {
            gitTabProvider.openWebview();
        }),
        vscode.commands.registerCommand('multi-project-tool.refreshProjects', () => {
            gitTabProvider.refresh();
        }),
        vscode.commands.registerCommand('multi-project-tool.gitPull', (selectedProjects?: any[]) => {
            gitTabProvider.gitPull(selectedProjects || []);
        }),
        vscode.commands.registerCommand('multi-project-tool.gitSwitchBranch', (selectedProjects?: any[]) => {
            gitTabProvider.gitSwitchBranch(selectedProjects || []);
        }),
        vscode.commands.registerCommand('multi-project-tool.gitCustomCommand', (selectedProjects?: any[]) => {
            gitTabProvider.gitCustomCommand(selectedProjects || []);
        }),
        vscode.commands.registerCommand('multi-project-tool.selectAllProjects', () => {
            gitTabProvider.selectAllProjects();
        }),
        vscode.commands.registerCommand('multi-project-tool.deselectAllProjects', () => {
            gitTabProvider.deselectAllProjects();
        }),
        vscode.commands.registerCommand('multi-project-tool.showLog', () => {
            logOutputChannel.show();
        }),
        vscode.commands.registerCommand('multi-project-tool.clearLog', () => {
            logOutputChannel.clear();
        })
    );

    // 激活时立即扫描项目
    gitTabProvider.refresh();

    // 监听工作区变化，自动刷新项目列表
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            gitTabProvider.refresh();
        })
    );

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('multi-project-tool.showJsonTab') || 
                e.affectsConfiguration('multi-project-tool.showGitTab') ||
                e.affectsConfiguration('multi-project-tool.projectScanDepth')) {
                jsonTabProvider.refresh();
                gitTabProvider.refresh();
            }
        })
    );

    console.log('Multi-Project Tool providers registered successfully');
}

export function deactivate() {
    console.log('Multi-Project Tool extension is now deactivated');
}