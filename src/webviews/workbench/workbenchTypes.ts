// 工作台（清单/工作流/批量执行）数据模型
// 独立存储域，不影响现有 WorkspaceConfig 结构

export interface ChecklistTask {
    id: string;
    text: string;
    priority: 'urgent' | 'normal' | 'low';
    done: boolean;
    createdAt: number;
}

export type WfNodeTag = 'start' | 'cmd' | 'condition' | 'fork' | 'join' | 'notify' | 'confirm' | 'ref';
export type WfFailPolicy = 'stop' | 'skip' | 'retry1';

export interface WfNode {
    id: string;
    label: string;
    tag: WfNodeTag;
    x: number;
    y: number;
    /** 命令内容 / 条件表达式 / 通知文本或命令或 URL */
    cmd: string;
    /** 超时（秒），真实生效 */
    timeout: number;
    failPolicy: WfFailPolicy;
    /** 仅 notify 节点：文本弹窗 / 命令行 / HTTP 请求 */
    notifyType?: 'text' | 'cmd' | 'http';
    /** 仅 ref 节点：引用其他页签（cmd/pyt/shortcut）已保存命令的 (tab, commandId) */
    refTab?: 'cmd' | 'pyt' | 'shortcut';
    refCommandId?: string;
    /** 仅 start 节点：定时启动方式。none=手动、countdown=倒计时、clock=固定时间 */
    scheduleMode?: 'none' | 'countdown' | 'clock';
    /** countdown: 秒数；clock: HH:MM 或 HH:MM:SS（今天未到则今天，否则次日） */
    scheduleValue?: string;
}

export interface WfEdge {
    from: string;
    to: string;
    /** 仅条件节点出边使用：'true' 通过分支 / 'false' 失败分支 */
    condition?: 'true' | 'false';
}

export interface Workflow {
    id: string;
    name: string;
    nodes: WfNode[];
    edges: WfEdge[];
    updatedAt: number;
}

export interface WfTemplate {
    id: string;
    /** 内置模板为 i18n key，自定义模板为真实名称 */
    name: string;
    builtin?: boolean;
    nodes: WfNode[];
    edges: WfEdge[];
}

export type RunResult = 'success' | 'failed' | 'stopped';

export interface HistoryNodeResult {
    id: string;
    label: string;
    state: 'success' | 'failed' | 'skipped';
    /** 毫秒 */
    dur: number;
}

export interface RunHistoryEntry {
    id: string;
    workflowName: string;
    result: RunResult;
    /** 毫秒 */
    duration: number;
    time: number;
    nodes: HistoryNodeResult[];
}

export interface BatchGroup {
    id: string;
    name: string;
    mode: 'serial' | 'parallel';
    commands: string[];
}

export interface WorkbenchData {
    checklist: ChecklistTask[];
    workflows: Workflow[];
    templates: WfTemplate[];
    history: RunHistoryEntry[];
    batchGroups: BatchGroup[];
    hiddenTabs: string[];
}
