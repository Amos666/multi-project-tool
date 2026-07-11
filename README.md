# Multi-Project Tool VSCode Extension

一个VSCode插件，用于管理多个项目，提供统一的Git操作和配置管理功能。

## 功能特性

### 1. 设置JSON Tab
- JSON公共参数配置
- Tab页面显示/隐藏控制
- 配置持久化存储

### 2. Git Tab
- 工作区目录扫描，自动识别Git项目
- 单选和多选项目功能
- 批量Git操作：
  - Git Pull
  - Git分支切换
  - Git状态检查
  - Git提交

## 项目结构

```
multi-project-tool/
├── src/
│   ├── extension.ts          # 主入口文件
│   ├── providers/           # 提供者
│   │   ├── jsonTabProvider.ts  # JSON Tab提供者
│   │   └── gitTabProvider.ts   # Git Tab提供者
│   ├── models/              # 数据模型
│   │   ├── project.ts
│   │   └── settings.ts
│   ├── utils/               # 工具函数
│   │   ├── gitUtils.ts
│   │   └── projectScanner.ts
│   └── webviews/            # Webview UI
│       ├── jsonTab/
│       │   ├── JsonTabView.ts
│       │   └── JsonTabWebview.ts
│       └── gitTab/
│           ├── GitTabView.ts
│           └── GitTabWebview.ts
├── package.json
├── tsconfig.json
├── vsc-extension-quickstart.md
└── README.md
```

## 安装和运行

### 1. 安装依赖
```bash
npm install
```

### 2. 编译TypeScript
```bash
npm run compile
```

### 3. 启动调试
1. 按F5启动调试
2. 在VSCode中打开一个包含多个Git项目的工作区
3. 在侧边栏中可以看到"Multi-Project Tool"视图
4. 点击"JSON Settings"或"Git Projects"标签页

### 4. 构建发布
```bash
npm run compile
vsce package
```

## 使用说明

### JSON Tab功能
- **JSON配置**: 在文本框中编辑JSON格式的公共参数
- **Tab控制**: 通过复选框控制JSON Tab和Git Tab的显示/隐藏
- **保存设置**: 点击"Save Settings"按钮保存配置
- **重置设置**: 点击"Reset to Default"按钮恢复默认设置

### Git Tab功能
- **项目扫描**: 自动扫描工作区目录，识别Git项目
- **项目选择**: 通过复选框选择单个或多个项目
- **批量操作**: 对选中的项目执行Git操作
  - **Git Pull**: 拉取所有远程分支的最新代码
  - **Switch Branch**: 切换到指定分支
  - **Status**: 查看Git状态
  - **Commit**: 提交更改

## 配置选项

在VSCode设置中可以配置以下选项：

```json
{
  "multi-project-tool.showJsonTab": true,
  "multi-project-tool.showGitTab": true,
  "multi-project-tool.gitDefaultBranch": "main",
  "multi-project-tool.projectScanDepth": 3
}
```

## 技术栈

- **VSCode Extension API**: 插件开发框架
- **TypeScript**: 类型安全的JavaScript
- **Webview UI**: 插件界面开发
- **Node.js**: 运行时环境

## 开发注意事项

1. **权限管理**: 确保插件有访问工作区文件的权限
2. **错误处理**: 添加适当的错误处理机制
3. **性能优化**: 项目扫描和Git操作需要考虑性能
4. **用户体验**: 提供清晰的反馈和状态提示

## 故障排除

### 常见问题

1. **项目不显示**: 检查工作区目录是否包含Git项目
2. **Git操作失败**: 确保项目是有效的Git仓库
3. **配置不生效**: 重启VSCode或重新加载窗口

### 调试技巧

1. 查看开发者工具控制台输出
2. 使用VSCode的调试功能
3. 检查插件日志文件

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

MIT License