import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Project, GitOperationResult } from '../models/project';
import { LogManager } from './logManager';
import { resolveGitPath } from './gitLocator';

const logManager = LogManager.getInstance();

export class GitUtils {
    public static async gitPull(project: Project): Promise<GitOperationResult> {
        logManager.info(`Starting git pull for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, 'pull');
            if (result.success) {
                logManager.success(`Successfully pulled ${project.name}`, result.output);
            } else {
                logManager.error(`Failed to pull ${project.name}`, result.error || result.output);
            }
            return {
                success: result.success,
                message: result.success ? `Successfully pulled ${project.name}` : `Failed to pull ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error pulling ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error pulling ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitFetch(project: Project): Promise<GitOperationResult> {
        logManager.info(`Starting git fetch for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, 'fetch');
            if (result.success) {
                logManager.success(`Successfully fetched ${project.name}`, result.output);
            } else {
                logManager.error(`Failed to fetch ${project.name}`, result.error || result.output);
            }
            return {
                success: result.success,
                message: result.success ? `Successfully fetched ${project.name}` : `Failed to fetch ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error fetching ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error fetching ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitSwitchBranch(project: Project, branch: string): Promise<GitOperationResult> {
        logManager.info(`Switching to branch "${branch}" for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, `checkout ${branch}`);
            if (result.success) {
                logManager.success(`Successfully switched to branch "${branch}" in ${project.name}`, result.output);
            } else {
                logManager.error(`Failed to switch branch in ${project.name}`, result.error || result.output);
            }
            return {
                success: result.success,
                message: result.success ? `Successfully switched to ${branch} in ${project.name}` : `Failed to switch branch in ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error switching branch in ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error switching branch in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitStatus(project: Project): Promise<GitOperationResult> {
        logManager.info(`Checking git status for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, 'status --porcelain');
            logManager.info(`Status check completed for ${project.name}`, result.output || 'No changes');
            return {
                success: result.success,
                message: `Status check completed for ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error checking status for ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error checking status for ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitBranches(project: Project): Promise<GitOperationResult> {
        logManager.info(`Getting branch list for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, 'branch -a');
            logManager.info(`Branch list retrieved for ${project.name}`, result.output);
            return {
                success: result.success,
                message: `Branch list retrieved for ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error getting branches for ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error getting branches for ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitBranchExists(project: Project, branchName: string): Promise<boolean> {
        try {
            const result = await this.executeGitCommand(project.path, 'branch -a');
            if (!result.success) return false;
            const branches = result.output.split('\n').map(b => b.trim());
            const cleanBranch = branchName.replace(/^remotes\/origin\//, '');
            return branches.some(b => b.replace('* ', '').replace(/^remotes\/origin\//, '') === cleanBranch);
        } catch {
            return false;
        }
    }

    public static async gitCreateBranch(project: Project, branchName: string): Promise<GitOperationResult> {
        logManager.info(`Creating and switching to branch "${branchName}" for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, `checkout -b ${branchName}`);
            if (result.success) {
                logManager.success(`Successfully created and switched to branch "${branchName}" in ${project.name}`, result.output);
            } else {
                logManager.error(`Failed to create branch in ${project.name}`, result.error || result.output);
            }
            return {
                success: result.success,
                message: result.success ? `Successfully created and switched to ${branchName} in ${project.name}` : `Failed to create branch in ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error creating branch in ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error creating branch in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitCommit(project: Project, message: string): Promise<GitOperationResult> {
        logManager.info(`Committing tracked changes for project: ${project.name}`);
        try {
            // commit -a：自动暂存并提交已跟踪文件的修改，不纳入未跟踪的新文件（等价于不做 add .）
            const commitMsg = message || 'Auto commit';
            logManager.info(`Committing with message: "${commitMsg}" in ${project.name}`);
            const commitResult = await this.executeGitCommand(project.path, `commit -a -m "${commitMsg}"`);
            if (commitResult.success) {
                logManager.success(`Successfully committed changes in ${project.name}`, commitResult.output);
            } else {
                logManager.error(`Failed to commit in ${project.name}`, commitResult.error || commitResult.output);
            }
            return {
                success: commitResult.success,
                message: commitResult.success ? `Successfully committed changes in ${project.name}` : `Failed to commit in ${project.name}`,
                project: project,
                output: commitResult.output,
                error: commitResult.error
            };
        } catch (error) {
            logManager.error(`Error committing in ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error committing in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    /**
     * git 命令执行：直接 spawn 已解析的 git 可执行文件（复用 VS Code 内置 git 扩展
     * 的解析结果，宿主 PATH 缺 git 时依然可用），跳过 cmd.exe 中转以提升 Windows
     * 下的执行速度并规避引号转义问题；命令含 shell 元字符（| && > 等）时回退
     * shell 执行以保留原有语义。
     */
    private static async executeGitCommand(cwd: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
        const gitPath = await resolveGitPath();
        const hasMeta = /[|&<>]/.test(command);
        if (hasMeta) {
            // 含管道/重定向等元字符的自定义命令：沿用 shell 执行语义
            return new Promise((resolve) => {
                cp.exec(`"${gitPath}" --no-pager ${command}`, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
                    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
                    if (error) {
                        resolve({ success: false, output: combined, error: stderr.trim() || error.message });
                    } else {
                        resolve({ success: true, output: combined });
                    }
                });
            });
        }
        const args = ['--no-pager', ...tokenizeCommand(command)];
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let settled = false;
            let timer: NodeJS.Timeout;
            const finish = (success: boolean, error?: string) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
                // git 常把进度/远端信息写到 stderr,成功时也需并入输出以便日志展示完整详情
                resolve(success
                    ? { success: true, output: combined }
                    : { success: false, output: combined, error: stderr.trim() || error || `Exit code` });
            };
            let proc: cp.ChildProcess;
            try {
                proc = cp.spawn(gitPath, args, { cwd, windowsHide: true });
            } catch (error: any) {
                resolve({ success: false, output: '', error: error.message || String(error) });
                return;
            }
            timer = setTimeout(() => {
                try { proc.kill(); } catch { /* already exited */ }
                finish(false, `git command timed out`);
            }, 30000);
            proc.on('error', (err) => finish(false, err.message));
            if (proc.stdout) {
                proc.stdout.setEncoding('utf8');
                proc.stdout.on('data', (d: string) => { stdout += d; });
            }
            if (proc.stderr) {
                proc.stderr.setEncoding('utf8');
                proc.stderr.on('data', (d: string) => { stderr += d; });
            }
            proc.on('close', (code: number | null) => finish(code === 0));
        });
    }

    public static async gitCustomCommand(project: Project, command: string): Promise<GitOperationResult> {
        logManager.info(`Executing custom git command "${command}" for project: ${project.name}`);
        try {
            const result = await this.executeGitCommand(project.path, command);
            if (result.success) {
                logManager.success(`Successfully executed command in ${project.name}`, result.output);
            } else {
                logManager.error(`Failed to execute command in ${project.name}`, result.error || result.output);
            }
            return {
                success: result.success,
                message: result.success ? `Successfully executed command in ${project.name}` : `Failed to execute command in ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            logManager.error(`Error executing command in ${project.name}: ${error}`);
            return {
                success: false,
                message: `Error executing command in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async executeGitOperations(projects: Project[], operation: 'pull' | 'switch-branch' | 'status' | 'commit' | 'custom', branch?: string, commitMessage?: string, customCommand?: string): Promise<GitOperationResult[]> {
        const operationNames: Record<string, string> = {
            'pull': 'Git Pull',
            'switch-branch': 'Switch Branch',
            'status': 'Git Status',
            'commit': 'Git Commit',
            'custom': 'Custom Command'
        };
        
        const operationName = operationNames[operation] || operation;
        const targetBranch = branch ? ` (branch: ${branch})` : '';
        const targetCommand = customCommand ? ` (command: ${customCommand})` : '';
        
        logManager.info(`Starting batch ${operationName} operation${targetBranch}${targetCommand} for ${projects.length} project(s)`);
        
        const results: GitOperationResult[] = [];

        for (const project of projects) {
            if (!project.isGitRepo) {
                logManager.warning(`${project.name} is not a Git repository, skipping`);
                results.push({
                    success: false,
                    message: `${project.name} is not a Git repository`,
                    project: project,
                    error: 'Not a Git repository'
                });
                continue;
            }

            let result: GitOperationResult;
            switch (operation) {
                case 'pull':
                    result = await this.gitPull(project);
                    break;
                case 'switch-branch':
                    if (!branch) {
                        logManager.error(`No branch specified for ${project.name}`);
                        result = {
                            success: false,
                            message: `No branch specified for ${project.name}`,
                            project: project,
                            error: 'No branch specified'
                        };
                    } else {
                        result = await this.gitSwitchBranch(project, branch);
                    }
                    break;
                case 'status':
                    result = await this.gitStatus(project);
                    break;
                case 'commit':
                    if (!commitMessage) {
                        logManager.error(`No commit message specified for ${project.name}`);
                        result = {
                            success: false,
                            message: `No commit message specified for ${project.name}`,
                            project: project,
                            error: 'No commit message specified'
                        };
                    } else {
                        result = await this.gitCommit(project, commitMessage);
                    }
                    break;
                case 'custom':
                    if (!customCommand) {
                        logManager.error(`No command specified for ${project.name}`);
                        result = {
                            success: false,
                            message: `No command specified for ${project.name}`,
                            project: project,
                            error: 'No command specified'
                        };
                    } else {
                        result = await this.gitCustomCommand(project, customCommand);
                    }
                    break;
                default:
                    logManager.error(`Unknown operation: ${operation}`);
                    result = {
                        success: false,
                        message: `Unknown operation: ${operation}`,
                        project: project,
                        error: 'Unknown operation'
                    };
            }
            results.push(result);
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        if (failed === 0) {
            logManager.success(`Batch ${operationName} completed successfully: ${successful} success, ${failed} failed`);
        } else {
            logManager.warning(`Batch ${operationName} completed: ${successful} success, ${failed} failed`);
        }

        return results;
    }
}

/**
 * 简单命令行分词：按空白切分，双引号内的空白保留（如 commit -m "fix: a b"）。
 * 仅供无 shell 元字符的命令使用。
 */
function tokenizeCommand(command: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (const ch of command) {
        if (ch === '"') {
            inQuote = !inQuote;
            continue;
        }
        if (!inQuote && /\s/.test(ch)) {
            if (cur) {
                out.push(cur);
                cur = '';
            }
            continue;
        }
        cur += ch;
    }
    if (cur) {
        out.push(cur);
    }
    return out;
}