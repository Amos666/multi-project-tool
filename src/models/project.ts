export interface Project {
    id: string;
    name: string;
    path: string;
    relativePath: string;
    isGitRepo: boolean;
    currentBranch?: string;
    hasRemote?: boolean;
    isSelected?: boolean;
    lastUpdated?: Date;
    size?: number;
}

export interface ProjectSelection {
    projects: Project[];
    allSelected: boolean;
}

export interface GitOperationResult {
    success: boolean;
    message: string;
    project?: Project;
    output?: string;
    error?: string;
}