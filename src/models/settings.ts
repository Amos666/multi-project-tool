export interface MultiProjectToolSettings {
    showJsonTab: boolean;
    showGitTab: boolean;
    gitDefaultBranch: string;
    projectScanDepth: number;
    commonParameters: Record<string, any>;
    hiddenTabs: string[];
}

export const DEFAULT_SETTINGS: MultiProjectToolSettings = {
    showJsonTab: true,
    showGitTab: true,
    gitDefaultBranch: 'main',
    projectScanDepth: 3,
    commonParameters: {},
    hiddenTabs: []
};