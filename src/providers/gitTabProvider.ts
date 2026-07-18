import * as vscode from 'vscode';
import { Project, GitOperationResult } from '../models/project';
import { ProjectScanner } from '../utils/projectScanner';
import { GitUtils } from '../utils/gitUtils';

export class GitTabProvider implements vscode.TreeDataProvider<ProjectItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | null | void> = new vscode.EventEmitter<ProjectItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private projects: Project[] = [];
    private selectedProjects: Set<string> = new Set();
    private projectScanner: ProjectScanner;

    constructor(private context: vscode.ExtensionContext) {
        this.projectScanner = ProjectScanner.getInstance();
        this.setupCommands();
    }

    refresh(): void {
        this.loadProjects();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectItem): Thenable<ProjectItem[]> {
        if (!element) {
            return Promise.resolve(this.getProjectRootItems());
        }
        return Promise.resolve([]);
    }

    private getProjectRootItems(): ProjectItem[] {
        const items: ProjectItem[] = [];

        const allProjectsItem = new ProjectItem(
            'All Projects',
            vscode.TreeItemCollapsibleState.Expanded,
            'all-projects'
        );
        allProjectsItem.contextValue = 'all-projects';
        items.push(allProjectsItem);

        if (this.selectedProjects.size > 0) {
            const selectedProjectsItem = new ProjectItem(
                `Selected (${this.selectedProjects.size})`,
                vscode.TreeItemCollapsibleState.Expanded,
                'selected-projects'
            );
            selectedProjectsItem.contextValue = 'selected-projects';
            items.push(selectedProjectsItem);
        }

        this.projects.forEach(project => {
            const projectItem = new ProjectItem(
                project.name,
                vscode.TreeItemCollapsibleState.None,
                project.id
            );
            projectItem.contextValue = project.isGitRepo ? 'git-project' : 'project';
            projectItem.description = project.relativePath;
            
            if (project.isGitRepo) {
                projectItem.iconPath = new vscode.ThemeIcon('git-branch');
                if (project.currentBranch) {
                    projectItem.description += ` (${project.currentBranch})`;
                }
            } else {
                projectItem.iconPath = new vscode.ThemeIcon('folder');
            }

            if (this.selectedProjects.has(project.id)) {
                projectItem.checkboxState = vscode.TreeItemCheckboxState.Checked;
            } else {
                projectItem.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
            }

            items.push(projectItem);
        });

        return items;
    }

    private async loadProjects(): Promise<void> {
        try {
            const scanDepth = vscode.workspace.getConfiguration('multi-project-tool').get('projectScanDepth', 3);
            this.projects = await this.projectScanner.scanWorkspace(scanDepth);
            
            for (let i = 0; i < this.projects.length; i++) {
                this.projects[i] = await this.projectScanner.getProjectInfo(this.projects[i]);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            vscode.window.showErrorMessage('Failed to load projects: ' + error);
        }
    }

    private setupCommands(): void {
        const disposable = vscode.commands.registerCommand('multi-project-tool.toggleProjectSelection', (projectItem: ProjectItem) => {
            this.toggleProjectSelection(projectItem);
        });

        const disposable2 = vscode.commands.registerCommand('multi-project-tool.selectAllProjects', () => {
            this.selectAllProjects();
        });

        const disposable3 = vscode.commands.registerCommand('multi-project-tool.deselectAllProjects', () => {
            this.deselectAllProjects();
        });

        const disposable4 = vscode.commands.registerCommand('multi-project-tool.gitStatus', (projectItem: ProjectItem) => {
            this.handleGitStatus([projectItem]);
        });

        const disposable5 = vscode.commands.registerCommand('multi-project-tool.gitPull', (projectItem: ProjectItem) => {
            this.handleGitPull([projectItem]);
        });

        const disposable6 = vscode.commands.registerCommand('multi-project-tool.gitSwitchBranch', (projectItem: ProjectItem) => {
            this.handleGitSwitchBranch([projectItem]);
        });

        const disposable7 = vscode.commands.registerCommand('multi-project-tool.gitPush', (projectItem: ProjectItem) => {
            this.handleGitPush([projectItem]);
        });

        const disposable8 = vscode.commands.registerCommand('multi-project-tool.gitFetch', (projectItem: ProjectItem) => {
            this.handleGitFetch([projectItem]);
        });

        const disposable9 = vscode.commands.registerCommand('multi-project-tool.gitCustomCommand', (projectItem: ProjectItem) => {
            this.handleGitCustomCommand([projectItem]);
        });

        this.context.subscriptions.push(disposable, disposable2, disposable3, disposable4, disposable5, disposable6, disposable7, disposable8, disposable9);
    }

    private toggleProjectSelection(projectItem: ProjectItem): void {
        const project = this.projects.find(p => p.id === projectItem.id);
        if (!project) return;

        if (this.selectedProjects.has(project.id)) {
            this.selectedProjects.delete(project.id);
        } else {
            this.selectedProjects.add(project.id);
        }

        this.refresh();
    }

    private async handleGitPull(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to pull changes for ${projects.length} project(s)?`,
            { modal: true },
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            const results = await GitUtils.executeGitOperations(projects, 'pull');
            this.showGitOperationResults(results);
        }
    }

    private async handleGitSwitchBranch(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const branch = await vscode.window.showInputBox({
            prompt: 'Enter branch name to switch to:',
            placeHolder: 'main'
        });

        if (branch) {
            const results = await GitUtils.executeGitOperations(projects, 'switch-branch', branch);
            this.showGitOperationResults(results);
        }
    }

    private async handleGitStatus(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'status');
        this.showGitOperationResults(results);
    }

    private async handleGitCommit(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const commitMessage = await vscode.window.showInputBox({
            prompt: 'Enter commit message:',
            placeHolder: 'Commit message'
        });

        if (commitMessage) {
            const results = await GitUtils.executeGitOperations(projects, 'commit', undefined, commitMessage);
            this.showGitOperationResults(results);
        }
    }

    private async handleGitPush(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to push changes for ${projects.length} project(s)?`,
            { modal: true },
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, 'push');
            this.showGitOperationResults(results);
        }
    }

    private async handleGitFetch(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, 'fetch');
        this.showGitOperationResults(results);
    }

    private async handleGitCustomCommand(projectItems: ProjectItem[]): Promise<void> {
        const projects = this.getProjectsFromItems(projectItems);
        if (projects.length === 0) return;

        const customCommand = await vscode.window.showInputBox({
            prompt: 'Enter custom git command (e.g., fetch, push, log --oneline):',
            placeHolder: 'fetch'
        });

        if (customCommand) {
            const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, customCommand);
            this.showGitOperationResults(results);
        }
    }

    private async handleLoadBranches(projectIds: string[]): Promise<void> {
        const projects = projectIds
            .map(id => this.projects.find(p => p.id === id))
            .filter(project => project !== undefined) as Project[];
        
        if (projects.length === 0) return;

        // 使用第一个项目获取分支列表
        const firstProject = projects[0];
        const result = await GitUtils.gitBranches(firstProject);
        
        if (result.success && result.output) {
            // 解析分支输出
            this.parseBranchOutput(result.output);
        } else {
            vscode.window.showErrorMessage(`Failed to load branches: ${result.error || 'Unknown error'}`);
        }
    }

    private parseBranchOutput(output: string): string[] {
        const lines = output.split('\n');
        const branches = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                // 移除星号（当前分支）和空格
                const branchName = trimmed.replace(/^\*\s*/, '').replace(/^\s+/, '');
                if (branchName && !branchName.includes('->')) { // 排除跟踪分支的引用
                    branches.push(branchName);
                }
            }
        }
        
        return branches;
    }

    private getProjectsFromItems(projectItems: ProjectItem[]): Project[] {
        return projectItems
            .map(item => this.projects.find(p => p.id === item.id))
            .filter(project => project !== undefined) as Project[];
    }

    private showGitOperationResults(results: GitOperationResult[]): void {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            vscode.window.showInformationMessage(
                `Successfully completed operations on ${successful.length} project(s).`
            );
        }

        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.project?.name}: ${r.error || r.message}`).join('\n');
            vscode.window.showErrorMessage(
                `Failed operations on ${failed.length} project(s):\n${errorMessages}`
            );
        }
    }

    public getSelectedProjects(): Project[] {
        return this.projects.filter(p => this.selectedProjects.has(p.id));
    }

    public async gitPull(selectedProjects: any[]): Promise<void> {
        const projects = this.resolveProjects(selectedProjects);
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects selected');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to pull changes for ${projects.length} project(s)?`,
            { modal: true },
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            const results = await GitUtils.executeGitOperations(projects, 'pull');
            this.showGitOperationResults(results);
        }
    }

    public async gitSwitchBranch(selectedProjects: any[]): Promise<void> {
        const projects = this.resolveProjects(selectedProjects);
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects selected');
            return;
        }

        const branch = await vscode.window.showInputBox({
            prompt: 'Enter branch name to switch to:',
            placeHolder: 'main'
        });

        if (branch) {
            const results = await GitUtils.executeGitOperations(projects, 'switch-branch', branch);
            this.showGitOperationResults(results);
            this.refresh();
        }
    }

    public async gitCustomCommand(selectedProjects: any[]): Promise<void> {
        const projects = this.resolveProjects(selectedProjects);
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects selected');
            return;
        }

        const customCommand = await vscode.window.showInputBox({
            prompt: 'Enter custom git command (e.g., fetch, push, log --oneline):',
            placeHolder: 'fetch'
        });

        if (customCommand) {
            const results = await GitUtils.executeGitOperations(projects, 'custom', undefined, undefined, customCommand);
            this.showGitOperationResults(results);
            this.refresh();
        }
    }

    public selectAllProjects(): void {
        this.projects.forEach(project => {
            if (project.isGitRepo) {
                this.selectedProjects.add(project.id);
            }
        });
        this.refresh();
    }

    public deselectAllProjects(): void {
        this.selectedProjects.clear();
        this.refresh();
    }

    private resolveProjects(items: any[]): Project[] {
        if (!items || items.length === 0) {
            return this.getSelectedProjects();
        }

        const projects: Project[] = [];
        for (const item of items) {
            if (item && item.id) {
                const project = this.projects.find(p => p.id === item.id);
                if (project) {
                    projects.push(project);
                }
            }
        }
        return projects.length > 0 ? projects : this.getSelectedProjects();
    }
}

export class ProjectItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly id: string,
        public checkboxState?: vscode.TreeItemCheckboxState
    ) {
        super(label, collapsibleState);
    }
}