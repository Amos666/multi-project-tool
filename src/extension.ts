import * as vscode from 'vscode';
import { MainViewProvider } from './views/MainViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Multi-Project Tool extension is now active!');

    // globalState：插件级全局存储（Project Row Commands 等跨工作区共享配置）
    // globalStorageUri：插件级全局存储目录（Environment Variables 文件式存储，跨 VS Code 实例实时同步）
    const mainViewProvider = new MainViewProvider(context.extensionUri, context.globalState, context.globalStorageUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MainViewProvider.viewType,
            mainViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('multi-project-tool.refreshProjects', () => {
            const view = vscode.window.visibleTextEditors.length > 0 ? 
                vscode.window.activeTextEditor : null;
        })
    );

    console.log('Multi-Project Tool registered successfully');
}

export function deactivate() {
    console.log('Multi-Project Tool extension is now deactivated');
}
