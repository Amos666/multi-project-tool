import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Project, GitOperationResult } from '../models/project';

export class GitUtils {
    public static async gitPull(project: Project): Promise<GitOperationResult> {
        try {
            const result = await this.executeGitCommand(project.path, 'pull');
            return {
                success: result.success,
                message: result.success ? `Successfully pulled ${project.name}` : `Failed to pull ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            return {
                success: false,
                message: `Error pulling ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitSwitchBranch(project: Project, branch: string): Promise<GitOperationResult> {
        try {
            const result = await this.executeGitCommand(project.path, `checkout ${branch}`);
            return {
                success: result.success,
                message: result.success ? `Successfully switched to ${branch} in ${project.name}` : `Failed to switch branch in ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            return {
                success: false,
                message: `Error switching branch in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitStatus(project: Project): Promise<GitOperationResult> {
        try {
            const result = await this.executeGitCommand(project.path, 'status --porcelain');
            return {
                success: result.success,
                message: `Status check completed for ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            return {
                success: false,
                message: `Error checking status for ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitBranches(project: Project): Promise<GitOperationResult> {
        try {
            const result = await this.executeGitCommand(project.path, 'branch -a');
            return {
                success: result.success,
                message: `Branch list retrieved for ${project.name}`,
                project: project,
                output: result.output,
                error: result.error
            };
        } catch (error) {
            return {
                success: false,
                message: `Error getting branches for ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    public static async gitCommit(project: Project, message: string): Promise<GitOperationResult> {
        try {
            // 先添加所有文件
            const addResult = await this.executeGitCommand(project.path, 'add .');
            if (!addResult.success) {
                return {
                    success: false,
                    message: `Failed to add files in ${project.name}`,
                    project: project,
                    error: addResult.error
                };
            }

            // 提交
            const commitResult = await this.executeGitCommand(project.path, `commit -m "${message}"`);
            return {
                success: commitResult.success,
                message: commitResult.success ? `Successfully committed changes in ${project.name}` : `Failed to commit in ${project.name}`,
                project: project,
                output: commitResult.output,
                error: commitResult.error
            };
        } catch (error) {
            return {
                success: false,
                message: `Error committing in ${project.name}: ${error}`,
                project: project,
                error: error as string
            };
        }
    }

    private static async executeGitCommand(cwd: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            cp.exec(`git ${command}`, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, output: stdout.trim(), error: stderr.trim() || error.message });
                } else {
                    resolve({ success: true, output: stdout.trim() });
                }
            });
        });
    }

    public static async executeGitOperations(projects: Project[], operation: 'pull' | 'switch-branch' | 'status' | 'commit', branch?: string, commitMessage?: string): Promise<GitOperationResult[]> {
        const results: GitOperationResult[] = [];

        for (const project of projects) {
            if (!project.isGitRepo) {
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
                default:
                    result = {
                        success: false,
                        message: `Unknown operation: ${operation}`,
                        project: project,
                        error: 'Unknown operation'
                    };
            }
            results.push(result);
        }

        return results;
    }
}