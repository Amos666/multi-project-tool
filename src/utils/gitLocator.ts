import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Git Bash 的 bash.exe 定位器（Windows 专用，其他平台直接回退 'bash'）。
 *
 * 背景：裸 'bash' 依赖 PATH 解析，Windows 上极易命中 System32 的 WSL bash 启动器，
 * 每次执行都要拉起整个 WSL 虚拟机——表现为命令点击后数秒才出结果。
 *
 * 解析顺序（结果进程级缓存）：
 * 1. 由已解析的 git.exe 推导同发行版内的 bash.exe（Git for Windows 布局：
 *    <root>\cmd\git.exe | <root>\mingw64\bin\git.exe | <root>\usr\bin\git.exe
 *    → <root>\bin\bash.exe）；
 * 2. 常见安装位置探测（Program Files / Program Files (x86)）；
 * 3. 回退 'bash'（PATH；Linux/macOS 或用户自带环境的正确场景）。
 */
let bashCached: string | undefined;

export async function resolveBashPath(): Promise<string> {
    if (bashCached) {
        return bashCached;
    }
    if (process.platform !== 'win32') {
        bashCached = 'bash';
        return bashCached;
    }
    try {
        const gitPath = await resolveGitPath();
        if (gitPath && path.isAbsolute(gitPath) && /\.exe$/i.test(gitPath)) {
            // <root>\cmd\git.exe → <root>；<root>\mingw64\bin\git.exe → <root>；<root>\usr\bin\git.exe → <root>
            const gitDir = path.dirname(gitPath);
            const root = /\\cmd$/i.test(gitDir)
                ? path.dirname(gitDir)
                : /\\(mingw64|usr)\\bin$/i.test(gitDir)
                    ? path.dirname(path.dirname(gitDir))
                    : undefined;
            if (root) {
                const candidate = path.join(root, 'bin', 'bash.exe');
                if (fs.existsSync(candidate)) {
                    bashCached = candidate;
                    return bashCached;
                }
            }
        }
    } catch {
        // 推导失败继续探测常见位置
    }
    const commonRoots = [
        process.env['ProgramFiles'] || 'C:\\Program Files',
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    ];
    for (const root of commonRoots) {
        const candidate = path.join(root, 'Git', 'bin', 'bash.exe');
        try {
            if (fs.existsSync(candidate)) {
                bashCached = candidate;
                return bashCached;
            }
        } catch {
            // ignore
        }
    }
    bashCached = 'bash';
    return bashCached;
}
