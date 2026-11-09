// 基础主题变量：侧边栏主视图与 Flow 编辑器面板共用（令牌层映射 VS Code 主题语义变量，四套主题自动适配）
export const BASE_THEME_CSS = `
/* 全局尺寸模型：与 VS Code workbench 一致的 border-box，保证控件宽度含 padding/border、栅格对齐 */
*, *::before, *::after { box-sizing: border-box; }
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

/** Codicon @font-face（src 地址随 webview 实例变化，必须由各宿主注入 asWebviewUri 实际地址） */
export const codiconFontFace = (fontUri: string): string => `
@font-face {
    font-family: "codicon";
    src: url("${fontUri}") format("truetype");
    font-weight: normal;
    font-style: normal;
    font-display: block;
}`;

/**
 * Codicon 图标（@vscode/codicons 官方字体，本地 resources/codicon.ttf 经 asWebviewUri 加载，无外部网络请求）。
 * 仅内嵌本插件实际使用的字形子集，码点逐一取自官方 dist/codicon.css；颜色继承 currentColor，四套主题自动适配。
 */
export const CODICON_CSS = `
.codicon {
    font: normal normal normal 16px/1 codicon;
    display: inline-block;
    flex: none;
    text-decoration: none;
    text-rendering: auto;
    text-align: center;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    user-select: none;
}
/* 加载自旋（与官方 codicon.css 一致；steps 节流降 CPU；上方 prefers-reduced-motion 规则可覆盖停用） */
@keyframes codicon-spin { 100% { transform: rotate(360deg); } }
.codicon-sync.codicon-modifier-spin, .codicon-loading.codicon-modifier-spin { animation: codicon-spin 1.5s steps(30) infinite; }
.codicon-loading { animation-duration: 1s; animation-timing-function: cubic-bezier(0.53, 0.21, 0.29, 0.67); }
.codicon-add:before { content: "\\ea60" }
.codicon-arrow-down:before { content: "\\ea9a" }
.codicon-arrow-left:before { content: "\\ea9b" }
.codicon-arrow-right:before { content: "\\ea9c" }
.codicon-arrow-swap:before { content: "\\ebcb" }
.codicon-check:before { content: "\\eab2" }
.codicon-checklist:before { content: "\\eab3" }
.codicon-chevron-down:before { content: "\\eab4" }
.codicon-chevron-right:before { content: "\\eab6" }
.codicon-circuit-board:before { content: "\\eabe" }
.codicon-close:before { content: "\\ea76" }
.codicon-debug-pause:before { content: "\\ead1" }
.codicon-debug-stop:before { content: "\\ead7" }
.codicon-download:before { content: "\\ec74" }
.codicon-edit:before { content: "\\ea73" }
.codicon-error:before { content: "\\ea87" }
.codicon-export:before { content: "\\ebac" }
.codicon-file-code:before { content: "\\eae9" }
.codicon-folder:before { content: "\\ea83" }
.codicon-gear:before { content: "\\eaf8" }
.codicon-git-branch:before { content: "\\ec6f" }
.codicon-git-commit:before { content: "\\eafc" }
.codicon-globe:before { content: "\\eb01" }
.codicon-keyboard:before { content: "\\ea65" }
.codicon-layout:before { content: "\\ebeb" }
.codicon-link:before { content: "\\eb15" }
.codicon-list-flat:before { content: "\\eb84" }
.codicon-list-ordered:before { content: "\\eb16" }
.codicon-loading:before { content: "\\eb19" }
.codicon-multiple-windows:before { content: "\\eb23" }
.codicon-new-folder:before { content: "\\ea80" }
.codicon-output:before { content: "\\eb9d" }
.codicon-pin:before { content: "\\eb2b" }
.codicon-play:before { content: "\\eb2c" }
.codicon-refresh:before { content: "\\eb37" }
.codicon-repo-pull:before { content: "\\eb40" }
.codicon-repo-push:before { content: "\\eb41" }
.codicon-save:before { content: "\\eb4b" }
.codicon-settings-gear:before { content: "\\eb51" }
.codicon-symbol-parameter:before { content: "\\ea92" }
.codicon-sync:before { content: "\\ea77" }
.codicon-terminal:before { content: "\\ea85" }
.codicon-trash:before { content: "\\ea81" }
.codicon-variable:before { content: "\\ea88" }
.codicon-watch:before { content: "\\eb7c" }
.codicon-zap:before { content: "\\ea86" }`;
