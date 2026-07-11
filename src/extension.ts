import * as vscode from 'vscode';
import { JsonTabProvider } from './providers/jsonTabProvider';
import { GitTabProvider } from './providers/gitTabProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Multi-Project Tool extension is now active!');

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
        vscode.commands.registerCommand('multi-project-tool.gitPull', (selectedProjects: any[]) => {
            gitTabProvider.gitPull(selectedProjects);
        }),
        vscode.commands.registerCommand('multi-project-tool.gitSwitchBranch', (selectedProjects: any[]) => {
            gitTabProvider.gitSwitchBranch(selectedProjects);
        })
    );

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('multi-project-tool.showJsonTab') || 
                e.affectsConfiguration('multi-project-tool.showGitTab')) {
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