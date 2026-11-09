// 基础主题变量：侧边栏主视图与 Flow 编辑器面板共用（令牌层映射 VS Code 主题语义变量，四套主题自动适配）
export const BASE_THEME_CSS = `
/* 焦点可见性：键盘焦点显式轮廓，鼠标焦点交由控件自身反馈；尊重系统减动效设置 */
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
:root {
    /* 视觉令牌全部映射 VS Code 主题语义变量：Light / Dark / High Contrast（含 HC Light）自动适配，无硬编码颜色 */
    --brand-background: var(--vscode-editor-background);
    --brand-surface: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --brand-surface-raised: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --brand-surface-hover: var(--vscode-list-hoverBackground);
    --brand-border: var(--vscode-panel-border, var(--vscode-widget-border));
    --brand-border-subtle: var(--vscode-widget-border, var(--vscode-panel-border));
    --brand-text: var(--vscode-editor-foreground);
    --brand-text-secondary: var(--vscode-descriptionForeground);
    --brand-text-muted: color-mix(in srgb, var(--vscode-foreground, var(--brand-text)) 55%, transparent);
    --brand-text-inverse: var(--vscode-button-foreground);
    --brand-primary: var(--vscode-button-background);
    --brand-primary-hover: var(--vscode-button-hoverBackground);
    --brand-primary-subtle: color-mix(in srgb, var(--vscode-button-background) 8%, transparent);
    --state-success: var(--vscode-testing-iconPassed, var(--vscode-terminal-ansiGreen));
    --state-warning: var(--vscode-editorWarning-foreground);
    --state-error: var(--vscode-errorForeground);
    --state-info: var(--vscode-notificationsInfoIcon-foreground);
    /* 圆角系统：遵循 VS Code 的克制风格 */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    /* 间距系统：统一 4px 基准 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    /* 阴影：轻量、低对比（黑色透明度叠加），符合 VS Code 风格 */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
    /* 字体：继承 VS Code 主题字体设置 */
    --font-ui: var(--vscode-font-family);
    --font-mono: var(--vscode-editor-font-family, var(--vscode-font-family));
}`;
