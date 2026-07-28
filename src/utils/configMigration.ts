// 命令树数据模型与旧版本扁平数据迁移（cmd / pyt 两个标签页共用）。
// 纯函数模块，不依赖 vscode，便于单元测试。

export interface CommandTreeNode {
    id: string;
    type: 'category' | 'command';
    name: string;
    content?: string;
    collapsed?: boolean;
    children?: CommandTreeNode[];
}

export const DEFAULT_CATEGORY_NAME = 'Default';
export const DEFAULT_CATEGORY_ID = 'default-category';

// 清洗并校验树节点，丢弃非法项，补齐缺省字段
export function sanitizeTree(nodes: any): CommandTreeNode[] {
    if (!Array.isArray(nodes)) {
        return [];
    }
    const result: CommandTreeNode[] = [];
    for (const raw of nodes) {
        if (!raw || typeof raw !== 'object') {
            continue;
        }
        const type = raw.type === 'category' ? 'category' : raw.type === 'command' ? 'command' : null;
        if (!type || typeof raw.name !== 'string' || !raw.name) {
            continue;
        }
        const node: CommandTreeNode = {
            id: typeof raw.id === 'string' && raw.id ? raw.id : `node-${result.length}-${raw.name}`,
            type,
            name: raw.name
        };
        if (type === 'command') {
            node.content = typeof raw.content === 'string' ? raw.content : '';
        } else {
            node.collapsed = raw.collapsed === true;
            node.children = sanitizeTree(raw.children);
        }
        result.push(node);
    }
    return result;
}

// 旧版本扁平命令数组（{id, alias, content}）整体迁移到 Default 分类
export function legacyCommandsToTree(commands: any): CommandTreeNode[] {
    const valid = (Array.isArray(commands) ? commands : []).filter(
        (c: any) => c && c.alias && typeof c.content === 'string'
    );
    if (valid.length === 0) {
        return [];
    }
    return [{
        id: DEFAULT_CATEGORY_ID,
        type: 'category',
        name: DEFAULT_CATEGORY_NAME,
        collapsed: false,
        children: valid.map((c: any) => ({
            id: String(c.id),
            type: 'command' as const,
            name: c.alias,
            content: c.content
        }))
    }];
}

export interface MigrationResult {
    customCommandTree: CommandTreeNode[];
    migrated: boolean;
}

// 将任意来源配置归一化为新的树结构。
// 旧版本配置只有扁平 customCommands 数组：首次加载时整体迁移到 Default 分类。
export function migrateConfig(config: any): MigrationResult {
    const hasCmdTree = Array.isArray(config?.customCommandTree);
    const legacy = Array.isArray(config?.customCommands) ? config.customCommands : [];
    const customCommandTree = hasCmdTree
        ? sanitizeTree(config.customCommandTree)
        : legacyCommandsToTree(legacy);
    return {
        customCommandTree,
        migrated: !hasCmdTree && legacy.length > 0
    };
}

export function findNodeById(nodes: CommandTreeNode[], id: string): CommandTreeNode | undefined {
    for (const node of nodes) {
        if (node.id === id) {
            return node;
        }
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}
