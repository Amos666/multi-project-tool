import * as vscode from 'vscode';
import { Project, GitOperationResult } from '../../models/project';
import { GitUtils } from '../../utils/gitUtils';

export class GitTabView {
    constructor(
        private readonly webview: vscode.Webview,
        private readonly extensionUri: vscode.Uri
    ) {
        this.initializeWebview();
    }

    private initializeWebview(): void {
        this.setupMessageHandlers();
    }

    private setupMessageHandlers(): void {
        this.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'refreshProjects':
                    break;
                case 'toggleProjectSelection':
                    break;
                case 'gitPull':
                    break;
                case 'gitSwitchBranch':
                    break;
                case 'gitStatus':
                    break;
                case 'gitCommit':
                    break;
                case 'loadBranches':
                    break;
            }
        });
    }
}