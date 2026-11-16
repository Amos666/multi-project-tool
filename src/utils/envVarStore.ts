import * as fs from 'fs';
import * as path from 'path';

/** 插件级环境变量存储：扩展 globalStorage 下的 env-variables.json。
 *  跨工作区、跨 VS Code 实例共享同一份配置（实例 A 修改后实例 B 经 FileSystemWatcher 即时同步）。 */
export interface EnvVarEntry {
    key: string;
    value: string;
}

export const ENV_VAR_FILE = 'env-variables.json';

export function envVarStorePath(storeDir: string): string {
    return path.join(storeDir, ENV_VAR_FILE);
}

/** 读取全局环境变量文件；文件不存在或损坏返回 undefined（区分「空列表」与「未初始化」，供一次性迁移判断） */
export function readEnvVarStore(storeDir: string): EnvVarEntry[] | undefined {
    try {
        const file = envVarStorePath(storeDir);
        if (!fs.existsSync(file)) { return undefined; }
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return normalizeEnvVars(parsed);
    } catch {
        return undefined;
    }
}

export function writeEnvVarStore(storeDir: string, vars: EnvVarEntry[]): boolean {
    try {
        if (!fs.existsSync(storeDir)) {
            fs.mkdirSync(storeDir, { recursive: true });
        }
        fs.writeFileSync(envVarStorePath(storeDir), JSON.stringify(normalizeEnvVars(vars), null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Failed to save env variables store:', error);
        return false;
    }
}

/** 容错归一化：过滤无效项，key/value 统一为字符串 */
export function normalizeEnvVars(vars: any): EnvVarEntry[] {
    if (!Array.isArray(vars)) { return []; }
    return vars
        .filter(v => v && typeof v === 'object')
        .map(v => ({ key: String(v.key ?? ''), value: String(v.value ?? '') }))
        .filter(v => v.key);
}
