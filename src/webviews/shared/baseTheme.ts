// 基础主题变量：侧边栏主视图与 Flow 编辑器面板共用（Tokyo Night 调优版）
export const BASE_THEME_CSS = `
:root {
    /* 与 VS Code 主题色板协调的深色基调（Tokyo Night 调优版） */
    --brand-background: #16161e;
    --brand-surface: #1a1b26;
    --brand-surface-raised: #24283b;
    --brand-surface-hover: #2f3347;
    --brand-border: #2f3347;
    --brand-border-subtle: #1f2233;
    --brand-text: #c0caf5;
    --brand-text-secondary: #a9b1d6;
    --brand-text-muted: #565f89;
    --brand-text-inverse: #16161e;
    --brand-primary: #7dcfff;
    --brand-primary-hover: #89dceb;
    --brand-primary-subtle: rgba(125, 207, 255, 0.08);
    --state-success: #9ece6a;
    --state-warning: #e0af68;
    --state-error: #f7768e;
    --state-info: #7aa2f7;
    /* 圆角系统：遵循 VS Code 的克制风格 */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    /* 间距系统：统一 4px 基准 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    /* 阴影：轻量、低对比，符合 VS Code 风格 */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
    /* 字体栈：优先 VS Code 内置字体，回退到系统字体 */
    --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Segoe WPC', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
    --font-mono: 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}`;
