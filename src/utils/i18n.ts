export type Language = 'en' | 'zh';

export const translations: Record<Language, Record<string, string>> = {
    en: {
        // Tabs
        'tab.git': 'Git',
        'tab.custom': 'Cmd',
        'tab.settings': 'Set',
        'tab.txtcmd': 'Pyt',

        // Git actions
        'git.pull': 'Pull',
        'git.commit': 'Commit',
        'git.change': 'Change',
        'git.branch': 'Branch',
        'git.push': 'Push',

        // Project list
        'project.title': 'Projects',
        'project.selectAll': 'Select All',
        'project.selected': 'Selected',
        'project.loading': 'Loading...',
        'project.noProjects': 'No projects found',
        'project.noBranch': 'No branch',
        'project.refresh': 'Refresh',
        'project.selectAtLeastOne': 'Please select at least one project',
        'project.collapse': 'Collapse project list',
        'project.expand': 'Expand project list',

        // Branch
        'branch.selectPlaceholder': 'Select branch...',
        'branch.loading': 'Loading...',
        'branch.selectOrInput': 'Please select or input a branch name',
        'branch.createConfirm': 'Create Branch Confirmation',
        'branch.createMessage': 'Branch "%branch%" does not exist in the first selected project. Do you want to create this branch for all %count% selected projects?',
        'branch.create': 'Create Branch',

        // Log
        'log.title': 'Logs',
        'log.clear': 'Clear',
        'log.ready': 'Multi Project Tools ready',

        // Custom commands
        'cmd.shell': 'Shell:',
        'cmd.add': '+ Add',
        'cmd.alias': 'Command Alias',
        'cmd.content': 'Command Content',
        'cmd.save': 'Save',
        'cmd.cancel': 'Cancel',
        'cmd.empty': 'No commands',
        'cmd.fillAliasAndContent': 'Please fill in command alias and content',
        'cmd.selectProject': 'Please select projects first',
        'cmd.run': 'Run',
        'cmd.edit': 'Edit',
        'cmd.delete': 'Delete',

        // Settings
        'settings.globalParams': 'Global Parameters',
        'settings.globalParamsDesc': "Define global parameters, referenced via ${paramName}",
        'settings.resetDefault': 'Reset Default',
        'settings.envVars': 'Environment Variables',
        'settings.envVarsDesc': 'Injected into Shell environment during command execution',
        'settings.addVar': '+ Add Variable',
        'settings.other': 'Other Settings',
        'settings.language': 'Language',
        'settings.autoRefresh': 'Auto Refresh',
        'settings.logRetention': 'Log Retention',
        'settings.concurrency': 'Concurrency',
        'settings.defaultShell': 'Default Shell',
        'settings.commandTimeout': 'Command Timeout',
        'settings.saveSettings': 'Save Settings',
        'settings.saved': 'Saved',
        'settings.settingsSaved': 'Settings saved!',

        // Commit modal
        'commit.title': 'Commit Confirmation',
        'commit.message': 'Commit message (leave empty for default):',
        'commit.cancel': 'Cancel',
        'commit.confirm': 'Confirm Commit',

        // Python text commands
        'pytxt.title': 'Python Text Transform Commands',
        'pytxt.new': '+ New',
        'pytxt.desc': 'Use selected text as input, execute Python command, output replaces selection',
        'pytxt.editTitle': 'Edit Command',
        'pytxt.newTitle': 'New Command',
        'pytxt.aliasPlaceholder': 'Command alias',
        'pytxt.contentPlaceholder': 'Python code, use sys.stdin.read() for input, print for output',
        'pytxt.close': '× Close',
        'pytxt.save': 'Save',
        'pytxt.run': 'Run',
        'pytxt.runBtn': '▶ Run',
        'pytxt.empty': 'No commands, click "New" to add',
        'pytxt.logTitle': 'Execution Log',
        'pytxt.logReady': 'Select text and run Python command to transform',
        'pytxt.tempCmd': 'Temporary Command',
        'pytxt.inputAlias': 'Please enter command alias',
        'pytxt.confirmDelete': 'Confirm delete this command?',

        // Backend messages
        'backend.noGitProjects': 'No Git projects selected',
        'backend.noProjects': 'No projects selected',
        'backend.completed': 'Completed',
        'backend.success': 'success',
        'backend.jsonError': 'JSON format error: ',
        'backend.pythonNotFound': 'Python not found, please ensure Python is installed and added to system PATH',
        'backend.noEditor': 'No active text editor',
        'backend.selectText': 'Please select text to transform first',
        'backend.execCmd': 'Executing command',
        'backend.transformSuccess': 'Transform successful, output',
        'backend.chars': 'chars',
        'backend.execFailed': 'Execution failed',
        'backend.execError': 'Execution error',
        'backend.shellNotFound': 'command not found. Please add',
        'backend.toPath': 'to system PATH environment variable and retry.',

        // Units
        'unit.entries': 'entries',
        'unit.count': '',
        'unit.seconds': 'sec',
    },
    zh: {
        // Tabs
        'tab.git': 'Git',
        'tab.custom': 'Cmd',
        'tab.settings': 'Set',
        'tab.txtcmd': 'Pyt',

        // Git actions
        'git.pull': 'Pull',
        'git.commit': 'Commit',
        'git.change': 'Change',
        'git.branch': 'Branch',
        'git.push': 'Push',

        // Project list
        'project.title': '项目',
        'project.selectAll': '全选',
        'project.selected': '已选择',
        'project.loading': 'Loading...',
        'project.noProjects': 'No projects found',
        'project.noBranch': 'No branch',
        'project.refresh': '刷新',
        'project.selectAtLeastOne': '请至少选择一个项目',
        'project.collapse': '收起项目列表',
        'project.expand': '展开项目列表',

        // Branch
        'branch.selectPlaceholder': '选择分支...',
        'branch.loading': '加载中...',
        'branch.selectOrInput': '请选择或输入分支名称',
        'branch.createConfirm': '创建分支确认',
        'branch.createMessage': '分支 "%branch%" 在第一个选中的项目中不存在。是否为所有 %count% 个选中项目创建此分支？',
        'branch.create': '创建分支',

        // Log
        'log.title': '日志',
        'log.clear': '清除',
        'log.ready': 'Multi Project Tools ready',

        // Custom commands
        'cmd.shell': 'Shell:',
        'cmd.add': '+ 添加',
        'cmd.alias': '命令别名',
        'cmd.content': '命令内容',
        'cmd.save': '保存',
        'cmd.cancel': '取消',
        'cmd.empty': '暂无命令',
        'cmd.fillAliasAndContent': '请填写命令别名和内容',
        'cmd.selectProject': '请先选择项目',
        'cmd.run': '运行',
        'cmd.edit': '编辑',
        'cmd.delete': '删除',

        // Settings
        'settings.globalParams': '全局参数',
        'settings.globalParamsDesc': '定义全局参数，通过 ${paramName} 引用',
        'settings.resetDefault': '恢复默认',
        'settings.envVars': '环境变量',
        'settings.envVarsDesc': '执行命令时注入到 Shell 环境中',
        'settings.addVar': '+ 添加变量',
        'settings.other': '其他设置',
        'settings.language': '语言',
        'settings.autoRefresh': '自动刷新',
        'settings.logRetention': '日志保留条数',
        'settings.concurrency': '并发执行数',
        'settings.defaultShell': '默认 Shell',
        'settings.commandTimeout': '命令超时',
        'settings.saveSettings': '保存设置',
        'settings.saved': '已保存',
        'settings.settingsSaved': '设置已保存！',

        // Commit modal
        'commit.title': '提交确认',
        'commit.message': '提交信息（留空则使用默认）：',
        'commit.cancel': '取消',
        'commit.confirm': '确认提交',

        // Python text commands
        'pytxt.title': 'Python 文本转换命令',
        'pytxt.new': '+ 新建',
        'pytxt.desc': '使用编辑器当前选中的文本作为输入，执行 Python 命令，输出替换选中内容',
        'pytxt.editTitle': '编辑命令',
        'pytxt.newTitle': '新建命令',
        'pytxt.aliasPlaceholder': '命令别名',
        'pytxt.contentPlaceholder': 'Python 代码，使用 sys.stdin.read() 读取输入，print 输出结果',
        'pytxt.close': '× 关闭',
        'pytxt.save': '保存',
        'pytxt.run': '运行',
        'pytxt.runBtn': '▶ 运行',
        'pytxt.empty': '暂无命令，点击"新建"添加',
        'pytxt.logTitle': '执行日志',
        'pytxt.logReady': '选择文本后运行 Python 命令即可转换',
        'pytxt.tempCmd': '临时命令',
        'pytxt.inputAlias': '请输入命令别名',
        'pytxt.confirmDelete': '确定删除该命令？',

        // Backend messages
        'backend.noGitProjects': 'No Git projects selected',
        'backend.noProjects': 'No projects selected',
        'backend.completed': '完成',
        'backend.success': '成功',
        'backend.jsonError': 'JSON 格式错误: ',
        'backend.pythonNotFound': 'Python 未找到，请确保已安装 Python 并加入系统 PATH',
        'backend.noEditor': '没有活动的文本编辑器',
        'backend.selectText': '请先在编辑器中选择要转换的文本',
        'backend.execCmd': '执行命令',
        'backend.transformSuccess': '转换成功，输出',
        'backend.chars': '字符',
        'backend.execFailed': '执行失败',
        'backend.execError': '执行出错',
        'backend.shellNotFound': '命令未找到。请将',
        'backend.toPath': '加入系统 PATH 环境变量后重试。',

        // Units
        'unit.entries': '条',
        'unit.count': '个',
        'unit.seconds': '秒',
    }
};

export function t(key: string, lang: Language = 'en'): string {
    return translations[lang]?.[key] || translations.en[key] || key;
}
