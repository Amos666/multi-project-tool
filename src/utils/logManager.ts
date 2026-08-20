import * as vscode from 'vscode';

export interface LogEntry {
    timestamp: Date;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    details?: string;
}

export class LogManager {
    private static instance: LogManager;
    private _onLogAdded: vscode.EventEmitter<LogEntry> = new vscode.EventEmitter<LogEntry>();
    public readonly onLogAdded: vscode.Event<LogEntry> = this._onLogAdded.event;
    private logEntries: LogEntry[] = [];
    private maxEntries: number = 1000;

    private constructor() {}

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    public log(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info', details?: string): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            details
        };

        this.logEntries.push(entry);
        
        if (this.logEntries.length > this.maxEntries) {
            this.logEntries.shift();
        }

        this._onLogAdded.fire(entry);
    }

    public info(message: string, details?: string): void {
        this.log(message, 'info', details);
    }

    public success(message: string, details?: string): void {
        this.log(message, 'success', details);
    }

    public warning(message: string, details?: string): void {
        this.log(message, 'warning', details);
    }

    public error(message: string, details?: string): void {
        this.log(message, 'error', details);
    }

    public getLogEntries(): LogEntry[] {
        return [...this.logEntries];
    }

    public clear(): void {
        this.logEntries = [];
        this._onLogAdded.fire({
            timestamp: new Date(),
            level: 'info',
            message: 'Log cleared'
        });
    }

    public formatLogEntry(entry: LogEntry): string {
        const timestamp = entry.timestamp.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const levelPrefix = {
            info: '[INFO]',
            success: '[SUCCESS]',
            warning: '[WARNING]',
            error: '[ERROR]'
        }[entry.level];

        let result = `${timestamp} ${levelPrefix} ${entry.message}`;
        if (entry.details) {
            result += `\n${entry.details}`;
        }
        return result;
    }
}