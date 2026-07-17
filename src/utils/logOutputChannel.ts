import * as vscode from 'vscode';
import { LogManager, LogEntry } from './logManager';

export class LogOutputChannel {
    private static instance: LogOutputChannel;
    private outputChannel: vscode.OutputChannel;
    private logManager: LogManager;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Multi-Project Tool');
        this.logManager = LogManager.getInstance();
        this.setupListener();
    }

    public static getInstance(): LogOutputChannel {
        if (!LogOutputChannel.instance) {
            LogOutputChannel.instance = new LogOutputChannel();
        }
        return LogOutputChannel.instance;
    }

    private setupListener(): void {
        this.logManager.onLogAdded((entry: LogEntry) => {
            this.appendLog(entry);
        });
    }

    private appendLog(entry: LogEntry): void {
        const formatted = this.logManager.formatLogEntry(entry);
        this.outputChannel.appendLine(formatted);
        this.outputChannel.appendLine('');
    }

    public show(): void {
        this.outputChannel.show(true);
    }

    public hide(): void {
        this.outputChannel.hide();
    }

    public clear(): void {
        this.outputChannel.clear();
        this.logManager.info('Log output cleared');
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }
}