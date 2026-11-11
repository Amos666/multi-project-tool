import * as vscode from 'vscode';

/**
 * git 可执行文件定位器：优先复用 VS Code 内置 git 扩展已解析出的 git 路径
 * （跟随 git.path 设置 / 自动发现逻辑，扩展宿主 PATH 缺失 git 时依然可用），
 * 解析结果进程级缓存；取不到时回退 'git' 交由系统 PATH 解析。
 */
let cached: string | undefined;

export async function resolveGitPath(): Promise<string> {
    if (cached) {
        return cached;
    }
    try {
        const ext = vscode.extensions.getExtension && vscode.extensions.getExtension('vscode.git');
        if (ext) {
            const exports = ext.isActive ? ext.exports : await ext.activate();
            const api = exports && (exports as any).getAPI ? (exports as any).getAPI(1) : undefined;
            const gitPath: unknown = api && api.git && typeof api.git.path === 'string' ? api.git.path : undefined;
            if (typeof gitPath === 'string' && gitPath) {
                cached = gitPath;
                return cached;
            }
        }
    } catch {
        // git 扩展不可用（如测试环境）时回退
    }
    cached = 'git';
    return cached;
}
