// 工作台（清单/工作流/批量执行）数据模型
// 独立存储域，不影响现有 WorkspaceConfig 结构

export interface ChecklistTask {
    id: string;
    text: string;
    priority: 'urgent' | 'normal' | 'low';
    done: boolean;
    createdAt: number;
}

export type WfNodeTag = 'start' | 'cmd' | 'condition' | 'fork' | 'join' | 'notify' | 'confirm' | 'ref' | 'vscode';
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
    /** 仅真实执行 shell 的节点（cmd / condition / notify+cmd）：指定解释器；缺省 = 继承运行级 shell（全局默认） */
    shell?: string;
    /** 仅 notify+http：请求方法，默认 GET */
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** 仅 notify+http：请求头（JSON 对象字符串） */
    httpHeaders?: string;
    /** 仅 notify+http：请求体（支持 ${var} 变量替换） */
    httpBody?: string;
    /** 仅 ref 节点：引用其他页签已保存命令的 (tab, commandId)；git 为内置操作集 */
    refTab?: 'cmd' | 'pyt' | 'shortcut' | 'git';
    refCommandId?: string;
    /** 仅 vscode 节点：要执行的 VSCode 命令 ID（任意插件通过 vscode.commands.registerCommand 注册的命令） */
    vscodeCommandId?: string;
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
    /** 'batch' = Batch Tab 的清单式工作流（Batch 面板按此过滤展示，shell 随节点属性持久化）；缺省 = Flow 画布工作流 */
    kind?: 'batch';
    nodes: WfNode[];
    edges: WfEdge[];
    updatedAt: number;
}

/** Batch 清单命令项：cmd + 可选 shell（空 = 继承全局默认 shell），webview 与宿主建图的统一入参 */
export interface BatchCmdItem {
    cmd: string;
    shell?: string;
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

export interface WfLogEntry {
    nodeId: string;
    level: 'info' | 'ok' | 'err' | 'dim' | 'hdr';
    text: string;
}

export interface RunHistoryEntry {
    id: string;
    workflowName: string;
    result: RunResult;
    /** 毫秒 */
    duration: number;
    time: number;
    nodes: HistoryNodeResult[];
    /** 工作流快照（画布结构），用于历史详情只读回放；旧记录可能缺失 */
    workflow?: Workflow;
    /** 执行日志（截断保存），用于历史详情回放；旧记录可能缺失 */
    logs?: WfLogEntry[];
}

export interface WorkbenchData {
    /** 用户删除的内置模板 id（内置模板代码内置，删除即隐藏） */
    hiddenTemplates?: string[];
    checklist: ChecklistTask[];
    workflows: Workflow[];
    templates: WfTemplate[];
    history: RunHistoryEntry[];
    hiddenTabs: string[];
}
