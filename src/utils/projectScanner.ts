import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { Project } from '../models/project';
import { resolveGitPath } from './gitLocator';

export class ProjectScanner {
    private static instance: ProjectScanner;
    private cache: Map<string, Project[]> = new Map();
    private cacheTimestamp: Map<string, number> = new Map();

    private constructor() {}

    public static getInstance(): ProjectScanner {
        if (!ProjectScanner.instance) {
            ProjectScanner.instance = new ProjectScanner();
        }
        return ProjectScanner.instance;
    }

    public async scanWorkspace(scanDepth: number = 3): Promise<Project[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const projects: Project[] = [];
        const now = Date.now();

        // 检查缓存
        const cacheKey = `depth_${scanDepth}`;
        const cached = this.cache.get(cacheKey);
        const cachedTime = this.cacheTimestamp.get(cacheKey);
        if (cached && cachedTime && (now - cachedTime) < 60000) { // 1分钟缓存
            return cached;
        }

        for (const folder of workspaceFolders) {
            const folderProjects = await this.scanFolder(folder.uri.fsPath, scanDepth);
            projects.push(...folderProjects);
        }

        // 更新缓存
        this.cache.set(cacheKey, projects);
        this.cacheTimestamp.set(cacheKey, now);

        return projects;
    }

    private async scanFolder(folderPath: string, maxDepth: number, currentDepth: number = 0): Promise<Project[]> {
        if (currentDepth >= maxDepth) {
            return [];
        }

        const projects: Project[] = [];
        let entries: fs.Dirent[] = [];

        try {
            entries = fs.readdirSync(folderPath, { withFileTypes: true });
        } catch (error) {
            console.warn(`Cannot read directory ${folderPath}:`, error);
            return [];
        }

        for (const entry of entries) {
            const fullPath = path.join(folderPath, entry.name);

            if (entry.isDirectory()) {
                const gitPath = path.join(fullPath, '.git');
                if (fs.existsSync(gitPath)) {
                    const project: Project = {
                        id: this.generateProjectId(fullPath),
                        name: entry.name,
                        path: fullPath,
                        relativePath: this.getRelativePath(fullPath),
                        isGitRepo: true,
                        lastUpdated: new Date()
                    };
                    projects.push(project);
                } else {
                    const subProjects = await this.scanFolder(fullPath, maxDepth, currentDepth + 1);
                    projects.push(...subProjects);
                }
            }
        }

        return projects;
    }

    private generateProjectId(projectPath: string): string {
        return Buffer.from(projectPath).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    }

    private getRelativePath(fullPath: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return fullPath;
        }

        // 找到最匹配的工作区
        let bestMatch = '';
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (fullPath.startsWith(folderPath) && folderPath.length > bestMatch.length) {
                bestMatch = folderPath;
            }
        }

        if (bestMatch) {
            return path.relative(bestMatch, fullPath);
        }

        return fullPath;
    }

    public clearCache(): void {
        this.cache.clear();
        this.cacheTimestamp.clear();
    }

    public async getProjectInfo(project: Project): Promise<Project> {
        try {
            if (project.isGitRepo) {
                const gitInfo = await this.getGitInfo(project.path);
                return { ...project, ...gitInfo };
            }
        } catch (error) {
            console.warn(`Failed to get project info for ${project.path}:`, error);
        }
        return project;
    }

    private async getGitInfo(repoPath: string): Promise<Partial<Project>> {
        const gitInfo: Partial<Project> = {};

        try {
            // Run all git commands in parallel for speed
            const [branchResult, remoteResult, statusResult] = await Promise.all([
                this.executeGitCommand(repoPath, 'branch --show-current'),
                this.executeGitCommand(repoPath, 'remote -v'),
                this.executeGitCommand(repoPath, 'status --porcelain')
            ]);

            if (branchResult.success && branchResult.output.trim()) {
                gitInfo.currentBranch = branchResult.output.trim();
            } else {
                // Fallback: try rev-parse --abbrev-ref HEAD
                const fallbackResult = await this.executeGitCommand(repoPath, 'rev-parse --abbrev-ref HEAD');
                if (fallbackResult.success && fallbackResult.output.trim()) {
                    gitInfo.currentBranch = fallbackResult.output.trim();
                }
            }

            gitInfo.hasRemote = remoteResult.success && remoteResult.output.trim().length > 0;

            if (statusResult.success) {
                const lines = statusResult.output.split('\n').filter(line => line.trim().length > 0);
                gitInfo.changeCount = lines.length;
            }
        } catch (error) {
            console.warn(`Failed to get Git info for ${repoPath}:`, error);
        }

        return gitInfo;
    }

    /**
     * 直接 spawn 已解析的 git 可执行文件（不经 cmd.exe 中转）：
     * - 扩展宿主 PATH 缺 git 时仍可用（复用 VS Code 内置 git 扩展的解析结果）
     * - 避免 shell 包装层的启动开销与引号转义问题，Windows 下显著提速
     * - 超时后强杀并兜底 resolve，保证调用方（分支刷新）不会悬挂
     */
    private async executeGitCommand(cwd: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
        const gitPath = await resolveGitPath();
        // 本方法所有子命令均为简单空格分隔参数，不含引号语义
        const args = ['--no-pager', ...command.split(' ').filter(a => a.length > 0)];
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let settled = false;
            const finish = (success: boolean, error?: string) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                const combined = stdout.trim();
                resolve(success
                    ? { success: true, output: combined }
                    : { success: false, output: combined, error: (stderr.trim() || error || 'git failed') });
            };
            let timer: NodeJS.Timeout;
            let proc: cp.ChildProcess;
            try {
                proc = cp.spawn(gitPath, args, { cwd, windowsHide: true });
            } catch (error: any) {
                resolve({ success: false, output: '', error: error.message || String(error) });
                return;
            }
            timer = setTimeout(() => {
                try { proc.kill(); } catch { /* already exited */ }
                finish(false, `git ${command} timed out`);
            }, 5000);
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
}