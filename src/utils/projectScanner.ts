import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { Project } from '../models/project';

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
            const branchResult = await this.executeGitCommand(repoPath, 'branch --show-current');
            if (branchResult.success) {
                gitInfo.currentBranch = branchResult.output.trim();
            }

            const remoteResult = await this.executeGitCommand(repoPath, 'remote -v');
            gitInfo.hasRemote = remoteResult.success && remoteResult.output.trim().length > 0;

            const statusResult = await this.executeGitCommand(repoPath, 'status --porcelain');
            if (statusResult.success) {
                const lines = statusResult.output.split('\n').filter(line => line.trim().length > 0);
                gitInfo.changeCount = lines.length;
            }
        } catch (error) {
            console.warn(`Failed to get Git info for ${repoPath}:`, error);
        }

        return gitInfo;
    }

    private async executeGitCommand(cwd: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            cp.exec(`git ${command}`, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, output: stdout.trim(), error: stderr.trim() || error.message });
                } else {
                    resolve({ success: true, output: stdout.trim() });
                }
            });
        });
    }
}