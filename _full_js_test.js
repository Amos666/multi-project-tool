const vscode = acquireVsCodeApi();
let currentTab = 'git';
let projects = [];
let selectedProjectIds = new Set();
let logs = [];
let customCommands = [];
let envVariables = [];
let editingCommandId = null;
let logExpanded = false;
let savedLogHeight = 180;
let logUserResized = false;
let logInitHeight = '60px';
let branchList = [];
let currentBranch = '';

window.addEventListener('load', () => { vscode.postMessage({ command: 'init' }); });

function switchTab(tabId) {
    currentTab = tabId;
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');
    const tabNames = ['git', 'custom', 'settings', 'txtcmd'];
    tabs.forEach((t, i) => {
        if (tabNames[i] === tabId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    panels.forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
    vscode.postMessage({ command: 'switchTab', tabId: tabId });
}

function toggleProjectSelection(projectId) {
    // Directly toggle the selection state in the Set
    if (selectedProjectIds.has(projectId)) {
        selectedProjectIds.delete(projectId);
    } else {
        selectedProjectIds.add(projectId);
    }
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'toggleProjectSelection', projectId: projectId });
}

function selectAllProjects() {
    projects.forEach(p => { if (p.isGitRepo) selectedProjectIds.add(p.id); });
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'selectAllProjects' });
}

function deselectAllProjects() {
    selectedProjectIds.clear();
    updateProjectList();
    updatePushBadge();
    updateSelectionWarning();
    vscode.postMessage({ command: 'deselectAllProjects' });
}

function executeGitAction(action) {
    if (selectedProjectIds.size === 0) { alert('Please select at least one project'); return; }
    const btn = document.querySelector('.git-btn.' + action);
    if (btn) btn.classList.add('executing');

    switch(action) {
        case 'pull': vscode.postMessage({ command: 'gitPull' }); break;
        case 'commit':
            const message = prompt('Enter commit message:', 'Auto commit');
            if (message) vscode.postMessage({ command: 'gitCommit', message: message });
            else if (btn) btn.classList.remove('executing');
            break;
        case 'change': vscode.postMessage({ command: 'gitChange' }); break;
        case 'branch':
            const branchInput = document.getElementById('branchInput');
            const branchName = branchInput.value.trim();
            if (branchName) {
                vscode.postMessage({ command: 'gitBranch', branch: branchName });
            } else {
                alert('请选择或输入分支名称');
                if (btn) btn.classList.remove('executing');
            }
            break;
        case 'push': vscode.postMessage({ command: 'gitPush' }); break;
    }
}

function refreshProjects() { vscode.postMessage({ command: 'refreshProjects' }); }
function setShell(shell) { vscode.postMessage({ command: 'setShell', shell: shell }); }

function onBranchInputClick(e) {
    e.stopPropagation();
    const selected = projects.find(p => selectedProjectIds.has(p.id));
    if (!selected) {
        return;
    }
    if (branchList.length === 0) {
        document.getElementById('branchLoading').style.display = 'block';
        document.getElementById('branchList').innerHTML = '';
        document.getElementById('branchDropdown').classList.add('show');
        vscode.postMessage({ command: 'getBranchList', projectId: selected.id });
    } else {
        document.getElementById('branchDropdown').classList.toggle('show');
    }
}

function toggleBranchDropdown() {
    const dropdown = document.getElementById('branchDropdown');
    dropdown.classList.toggle('show');
}

function filterBranchList(filter) {
    const list = document.getElementById('branchList');
    const filtered = branchList.filter(b => b.includes(filter.toLowerCase()));
    renderBranchList(filtered);
}

function selectBranch(branchName) {
    document.getElementById('branchInput').value = branchName;
    currentBranch = branchName;
    document.getElementById('branchDropdown').classList.remove('show');
}

function renderBranchList(list) {
    const container = document.getElementById('branchList');
    container.innerHTML = '';
    list.forEach(b => {
        const isCurrent = b === currentBranch;
        const div = document.createElement('div');
        if (isCurrent) div.className = 'current';
        div.textContent = b;
        div.onclick = function() { selectBranch(b); };
        container.appendChild(div);
    });
}

function updateBranchList(branches, current) {
    branchList = branches;
    currentBranch = current;
    document.getElementById('branchLoading').style.display = 'none';
    renderBranchList(branches);
    const branchInput = document.getElementById('branchInput');
    if (branchInput && current && !branchInput.value) {
        branchInput.value = current;
    }
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('branchDropdown');
    const selector = document.querySelector('.git-branch-selector');
    if (dropdown && dropdown.classList.contains('show') && !selector.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

function showCommandEditor(commandId) {
    editingCommandId = commandId;
    document.getElementById('commandEditor').classList.add('show');
    if (commandId) {
        const cmd = customCommands.find(c => c.id === commandId);
        if (cmd) {
            document.getElementById('commandAlias').value = cmd.alias;
            document.getElementById('commandContent').value = cmd.content;
        }
    } else {
        document.getElementById('commandAlias').value = '';
        document.getElementById('commandContent').value = '';
    }
}

function hideCommandEditor() {
    editingCommandId = null;
    document.getElementById('commandEditor').classList.remove('show');
    document.getElementById('commandAlias').value = '';
    document.getElementById('commandContent').value = '';
}

function saveCommand() {
    const alias = document.getElementById('commandAlias').value.trim();
    const content = document.getElementById('commandContent').value.trim();
    if (!alias || !content) { alert('请填写命令别名和内容'); return; }

    const command = {
        id: editingCommandId || Date.now().toString(),
        alias: alias,
        content: content
    };

    if (editingCommandId) {
        vscode.postMessage({ command: 'updateCommand', cmd: command });
    } else {
        vscode.postMessage({ command: 'addCommand', cmd: command });
    }
    hideCommandEditor();
}

function deleteCommand(commandId) { vscode.postMessage({ command: 'deleteCommand', commandId: commandId }); }

function runCommand(commandId) {
    if (selectedProjectIds.size === 0) {
        document.getElementById('selectionWarning').classList.add('show');
        return;
    }
    vscode.postMessage({ command: 'runCommand', commandId: commandId });
}

function saveCommonParams() {
    const params = document.getElementById('commonParams').value;
    vscode.postMessage({ command: 'saveCommonParameters', parameters: params });
}

function resetCommonParams() {
    document.getElementById('commonParams').value = JSON.stringify({
        "deployBucket": "my-bucket",
        "registry": "registry.example.com",
        "nodeVersion": "18",
        "buildCommand": "npm run build",
        "stagingUrl": "https://staging.example.com"
    }, null, 2);
}

function addEnvVariable() { vscode.postMessage({ command: 'addEnvVariable', variable: { key: '', value: '' } }); }

function updateEnvVariable(index, key, value) {
    vscode.postMessage({ command: 'updateEnvVariable', index: index, variable: { key: key, value: value } });
}

function deleteEnvVariable(index) { vscode.postMessage({ command: 'deleteEnvVariable', index: index }); }

function saveSettings() {
    const settings = {
        autoRefresh: document.getElementById('autoRefreshToggle').classList.contains('active'),
        logRetention: parseInt(document.getElementById('logRetentionInput').value) || 50,
        concurrency: parseInt(document.getElementById('concurrencyInput').value) || 1,
        defaultShell: document.getElementById('defaultShellSelector').value,
        commandTimeout: parseInt(document.getElementById('commandTimeoutInput').value) || 300
    };
    vscode.postMessage({ command: 'saveSettings', settings: settings });
    alert('Settings saved!');
}

function toggleAutoRefresh() {
    document.getElementById('autoRefreshToggle').classList.toggle('active');
}

function clearLogs(e) { e.stopPropagation(); vscode.postMessage({ command: 'clearLogs' }); }

function toggleLog() {
    const containers = document.querySelectorAll('.log-container');
    const currentHeight = containers[0] ? containers[0].getBoundingClientRect().height : 60;

    if (currentHeight <= 80) {
        // Expand to saved height
        logExpanded = true;
        logUserResized = true;
        const targetH = savedLogHeight + 'px';
        logInitHeight = targetH;
        containers.forEach(c => { c.style.height = targetH; });
    } else {
        // Collapse to minimum
        logExpanded = false;
        logUserResized = false;
        logInitHeight = '60px';
        containers.forEach(c => { c.style.height = '60px'; });
    }
    vscode.postMessage({ command: 'toggleLogExpanded', expanded: logExpanded });
}

// --- Log resizer drag-to-resize ---
(function initLogResizer() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    let activeResizer = null;
    let activeContainer = null;
    let draggedHeight = '';

    function onMouseDown(e) {
        const resizer = e.target.closest('.log-resizer');
        if (!resizer) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        activeResizer = resizer;
        activeContainer = resizer.parentElement;
        startY = e.clientY;
        startHeight = activeContainer.getBoundingClientRect().height;
        draggedHeight = '';
        resizer.classList.add('active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        // Disable pointer events on log-header to prevent click after drag
        document.querySelectorAll('.log-header').forEach(h => {
            h.dataset._oldPointerEvents = h.style.pointerEvents;
            h.style.pointerEvents = 'none';
        });
    }

    function onMouseMove(e) {
        if (!isResizing || !activeContainer) return;
        e.preventDefault();
        const delta = startY - e.clientY;
        const newHeight = Math.min(Math.max(startHeight + delta, 40), window.innerHeight * 0.8);
        activeContainer.style.height = newHeight + 'px';
        draggedHeight = newHeight + 'px';
        logExpanded = newHeight > 60;
        if (newHeight > 80) {
            savedLogHeight = newHeight;
            logUserResized = true;
            logInitHeight = newHeight + 'px';
        }
        vscode.postMessage({ command: 'logHeightChange', height: newHeight });
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        const finalHeight = draggedHeight;
        if (activeResizer) activeResizer.classList.remove('active');
        activeResizer = null;
        activeContainer = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Restore pointer events on log-header
        document.querySelectorAll('.log-header').forEach(h => {
            h.style.pointerEvents = h.dataset._oldPointerEvents || '';
            delete h.dataset._oldPointerEvents;
        });
        // Sync all log containers to the same final height
        if (finalHeight) {
            document.querySelectorAll('.log-container').forEach(c => {
                c.style.height = finalHeight;
            });
        }
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
})();

function updateProjectList() {
    const list1 = document.getElementById('projectList');
    const list2 = document.getElementById('customProjectList');
    
    if (projects.length === 0) {
        list1.innerHTML = '<div class="no-projects-message">No projects found</div>';
        list2.innerHTML = list1.innerHTML;
        return;
    }

    list1.innerHTML = '';
    list2.innerHTML = '';

    projects.forEach(p => {
        const isSelected = selectedProjectIds.has(p.id);
        const changeClass = (p.changeCount === 0) ? 'success' : (p.changeCount <= 2 ? 'warning' : 'error');

        function createItem() {
            const item = document.createElement('div');
            item.className = 'project-item' + (isSelected ? ' selected' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'project-checkbox';
            checkbox.dataset.projectId = p.id;
            checkbox.checked = isSelected;
            checkbox.onchange = function(e) { e.stopPropagation(); toggleProjectSelection(p.id); };
            item.appendChild(checkbox);

            const info = document.createElement('div');
            info.className = 'project-info';

            const name = document.createElement('div');
            name.className = 'project-name';
            name.textContent = p.name;
            info.appendChild(name);

            const branch = document.createElement('div');
            branch.className = 'project-branch';
            branch.innerHTML = '<span>🌿</span>' + (p.currentBranch || 'No branch');
            info.appendChild(branch);

            item.appendChild(info);

            const count = document.createElement('span');
            count.className = 'change-count ' + changeClass;
            count.textContent = p.changeCount || 0;
            item.appendChild(count);

            item.onclick = function() { toggleProjectSelection(p.id); };

            return item;
        }

        list1.appendChild(createItem());
        list2.appendChild(createItem());
    });

    document.getElementById('projectCount').textContent = projects.length;
    document.getElementById('customProjectCount').textContent = projects.length;
}

function updatePushBadge() { document.getElementById('pushBadge').textContent = selectedProjectIds.size; }

function updateSelectionWarning() {
    const warning = document.getElementById('selectionWarning');
    warning.classList.toggle('show', selectedProjectIds.size === 0);
}

function updateCommandList() {
    const list = document.getElementById('commandList');
    if (customCommands.length === 0) {
        list.innerHTML = '<div class="empty-state">暂无命令</div>';
        return;
    }

    list.innerHTML = '';
    customCommands.forEach(cmd => {
        const preview = cmd.content.split('\\n')[0];

        const item = document.createElement('div');
        item.className = 'command-item';

        const main = document.createElement('div');
        main.className = 'cmd-main';
        main.onclick = function() { showCommandEditor(cmd.id); };

        const alias = document.createElement('span');
        alias.className = 'alias';
        alias.textContent = cmd.alias;
        main.appendChild(alias);

        const previewSpan = document.createElement('span');
        previewSpan.className = 'cmd-content-preview';
        previewSpan.textContent = preview;
        main.appendChild(previewSpan);

        item.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'actions';

        const runBtn = document.createElement('button');
        runBtn.className = 'cmd-action-btn run';
        runBtn.title = '运行';
        runBtn.textContent = '▶';
        runBtn.onclick = function() { runCommand(cmd.id); };
        actions.appendChild(runBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'cmd-action-btn edit';
        editBtn.title = '编辑';
        editBtn.textContent = '✎';
        editBtn.onclick = function() { showCommandEditor(cmd.id); };
        actions.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'cmd-action-btn delete';
        delBtn.title = '删除';
        delBtn.textContent = '🗑';
        delBtn.onclick = function() { deleteCommand(cmd.id); };
        actions.appendChild(delBtn);

        item.appendChild(actions);
        list.appendChild(item);
    });
}

function updateEnvVariables() {
    const list = document.getElementById('envVariableList');
    list.innerHTML = '';
    envVariables.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'env-variable-item';

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'key';
        keyInput.value = v.key;
        keyInput.placeholder = 'Key';
        keyInput.onchange = function() { updateEnvVariable(i, this.value, v.value); };
        item.appendChild(keyInput);

        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.textContent = '=';
        item.appendChild(separator);

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.value = v.value;
        valInput.placeholder = 'Value';
        valInput.onchange = function() { updateEnvVariable(i, v.key, this.value); };
        item.appendChild(valInput);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.onclick = function() { deleteEnvVariable(i); };
        item.appendChild(delBtn);

        list.appendChild(item);
    });
}

function addLogEntry(entry) {
    logs.push(entry);
    if (logs.length > 50) logs.shift();
    renderLogs();
}

function renderLogs() {
    const content1 = document.getElementById('logContent');
    const content2 = document.getElementById('customLogContent');
    
    if (logs.length === 0) {
        content1.innerHTML = '<div class="log-entry info"><span class="timestamp">[--:--:--]</span><span class="status-icon">▶</span><span class="message">Multi Project Tools ready</span></div>';
        content2.innerHTML = content1.innerHTML;
        return;
    }

    content1.innerHTML = logs.map(entry => renderLogEntry(entry)).join('');
    content2.innerHTML = content1.innerHTML;
    content1.scrollTop = content1.scrollHeight;
    content2.scrollTop = content2.scrollHeight;
}

function renderLogEntry(entry) {
    const statusIcon = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✗' : '▶';
    let html = '<div class="log-entry ' + entry.type + '">';
    html += '<span class="timestamp">[' + entry.timestamp + ']</span>';
    html += '<span class="status-icon">' + statusIcon + '</span>';
    if (entry.shellType) html += '<span class="shell-type">[' + entry.shellType + ']</span>';
    if (entry.projectName) html += '<span class="project-name">' + entry.projectName + '</span>';
    html += '<span class="message">' + entry.message + '</span>';
    if (entry.details) html += '<div class="tree-line">' + entry.details + '</div>';
    html += '</div>';
    return html;
}

let pythonTxtCommands = [];
let pythonTxtEditingId = null;
let txtCmdLogExpanded = false;
let txtCmdSavedLogHeight = 180;
let txtCmdLogs = [];

function addPythonTxtCmd() {
    pythonTxtEditingId = null;
    document.getElementById('pythonTxtCmdEditorTitle').textContent = '新建命令';
    document.getElementById('pythonTxtCmdAlias').value = '';
    document.getElementById('pythonTxtCmdContent').value = 'import sys\\n\\ntext = sys.stdin.read()\\nresult = text\\nprint(result)';
    document.getElementById('pythonTxtCmdEditor').style.display = 'flex';
}

function editPythonTxtCmd(id) {
    const cmd = pythonTxtCommands.find(c => c.id === id);
    if (!cmd) return;
    pythonTxtEditingId = id;
    document.getElementById('pythonTxtCmdEditorTitle').textContent = '编辑命令';
    document.getElementById('pythonTxtCmdAlias').value = cmd.alias;
    document.getElementById('pythonTxtCmdContent').value = cmd.content;
    document.getElementById('pythonTxtCmdEditor').style.display = 'flex';
}

function closePythonTxtCmdEditor() {
    pythonTxtEditingId = null;
    document.getElementById('pythonTxtCmdEditor').style.display = 'none';
}

function savePythonTxtCmd() {
    const alias = document.getElementById('pythonTxtCmdAlias').value.trim();
    const content = document.getElementById('pythonTxtCmdContent').value;
    if (!alias) { alert('请输入命令别名'); return; }

    if (pythonTxtEditingId) {
        const idx = pythonTxtCommands.findIndex(c => c.id === pythonTxtEditingId);
        if (idx >= 0) {
            pythonTxtCommands[idx].alias = alias;
            pythonTxtCommands[idx].content = content;
        }
    } else {
        const newCmd = { id: 'cmd_' + Date.now(), alias, content };
        pythonTxtCommands.push(newCmd);
        pythonTxtEditingId = newCmd.id;
    }
    vscode.postMessage({ command: 'savePythonTxtCommands', commands: pythonTxtCommands });
    renderPythonTxtCmdList();
    closePythonTxtCmdEditor();
}

function deletePythonTxtCmd(id) {
    if (!confirm('确定删除该命令？')) return;
    pythonTxtCommands = pythonTxtCommands.filter(c => c.id !== id);
    vscode.postMessage({ command: 'savePythonTxtCommands', commands: pythonTxtCommands });
    if (pythonTxtEditingId === id) closePythonTxtCmdEditor();
    renderPythonTxtCmdList();
}

function runPythonTxtCmd(id) {
    const cmd = pythonTxtCommands.find(c => c.id === id);
    if (!cmd) return;
    vscode.postMessage({ command: 'runPythonTxtCmd', cmd: cmd });
}

function runPythonTxtCmdFromEditor() {
    const alias = document.getElementById('pythonTxtCmdAlias').value.trim() || '临时命令';
    const content = document.getElementById('pythonTxtCmdContent').value;
    vscode.postMessage({ command: 'runPythonTxtCmd', cmd: { id: 'temp', alias, content } });
}

function renderPythonTxtCmdList() {
    const list = document.getElementById('pythonTxtCmdList');
    if (!list) return;
    if (pythonTxtCommands.length === 0) {
        list.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-size: 11px; padding: 10px; text-align: center;">暂无命令，点击"新建"添加</div>';
        return;
    }
    list.innerHTML = '';
    pythonTxtCommands.forEach(cmd => {
        const firstLine = cmd.content.split('\\n')[0].substring(0, 50);
        const item = document.createElement('div');
        item.className = 'cmd-item';
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--brand-surface); border: 1px solid var(--brand-border); border-radius: 4px; cursor: pointer;';
        item.onmouseover = function() { this.style.borderColor = 'var(--vscode-focusBorder)'; };
        item.onmouseout = function() { this.style.borderColor = 'var(--brand-border)'; };

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'flex: 1; overflow: hidden;';
        infoDiv.innerHTML = '<div style="font-weight: 600; font-size: 12px; color: var(--vscode-foreground);">' + cmd.alias + '</div>' +
            '<div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + firstLine + '</div>';
        item.appendChild(infoDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; gap: 4px; margin-left: 8px;';

        const runBtn = document.createElement('button');
        runBtn.className = 'btn btn-secondary';
        runBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        runBtn.textContent = '▶ 运行';
        runBtn.title = '运行';
        runBtn.onclick = function(e) { e.stopPropagation(); runPythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(runBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary';
        editBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        editBtn.textContent = '✎';
        editBtn.title = '编辑';
        editBtn.onclick = function(e) { e.stopPropagation(); editPythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-secondary';
        deleteBtn.style.cssText = 'font-size: 11px; padding: 3px 8px;';
        deleteBtn.textContent = '🗑';
        deleteBtn.title = '删除';
        deleteBtn.onclick = function(e) { e.stopPropagation(); deletePythonTxtCmd(cmd.id); };
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(actionsDiv);
        list.appendChild(item);
    });
}

function toggleTxtCmdLog() {
    const container = document.getElementById('txtCmdLogContainer');
    if (!container) return;
    const currentHeight = container.getBoundingClientRect().height;
    if (currentHeight <= 80) {
        txtCmdLogExpanded = true;
        container.style.height = txtCmdSavedLogHeight + 'px';
    } else {
        txtCmdLogExpanded = false;
        container.style.height = '60px';
    }
    const icon = document.getElementById('txtCmdLogToggle');
    if (icon) icon.textContent = txtCmdLogExpanded ? '▼' : '▶';
}

function addTxtCmdLogEntry(entry) {
    txtCmdLogs.push(entry);
    if (txtCmdLogs.length > 50) txtCmdLogs.shift();
    renderTxtCmdLogs();
}

function renderTxtCmdLogs() {
    const content = document.getElementById('txtCmdLogContent');
    if (!content) return;
    if (txtCmdLogs.length === 0) {
        content.innerHTML = '<div class="log-entry info"><span class="timestamp">[--:--:--]</span><span class="status-icon">▶</span><span class="message">选择文本后运行 Python 命令即可转换</span></div>';
        return;
    }
    content.innerHTML = txtCmdLogs.map(entry => {
        const statusIcon = entry.type === 'success' ? '✓' : entry.type === 'error' ? '✗' : '▶';
        let html = '<div class="log-entry ' + entry.type + '">';
        html += '<span class="timestamp">[' + entry.timestamp + ']</span>';
        html += '<span class="status-icon">' + statusIcon + '</span>';
        if (entry.shellType) html += '<span class="shell-type">[' + entry.shellType + ']</span>';
        html += '<span class="message">' + entry.message + '</span>';
        if (entry.details) html += '<div class="tree-line">' + entry.details + '</div>';
        html += '</div>';
        return html;
    }).join('');
    content.scrollTop = content.scrollHeight;
}

(function initTxtCmdLogResizer() {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    function onMouseDown(e) {
        const resizer = e.target.closest('#txtCmdLogResizer');
        if (!resizer) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startY = e.clientY;
        const container = document.getElementById('txtCmdLogContainer');
        startHeight = container.getBoundingClientRect().height;
        resizer.classList.add('active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        const headers = document.querySelectorAll('#txtCmdLogContainer .log-header');
        headers.forEach(h => { h.dataset._oldPE = h.style.pointerEvents; h.style.pointerEvents = 'none'; });
    }

    function onMouseMove(e) {
        if (!isResizing) return;
        e.preventDefault();
        const delta = startY - e.clientY;
        const newHeight = Math.min(Math.max(startHeight + delta, 40), window.innerHeight * 0.8);
        const container = document.getElementById('txtCmdLogContainer');
        container.style.height = newHeight + 'px';
        txtCmdLogExpanded = newHeight > 60;
        if (newHeight > 80) txtCmdSavedLogHeight = newHeight;
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const resizer = document.getElementById('txtCmdLogResizer');
        if (resizer) resizer.classList.remove('active');
        const headers = document.querySelectorAll('#txtCmdLogContainer .log-header');
        headers.forEach(h => { h.style.pointerEvents = h.dataset._oldPE || ''; delete h.dataset._oldPE; });
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
})();

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateProjects': projects = message.projects; updateProjectList(); break;
        case 'updateLogs': logs = message.logs; renderLogs(); break;
        case 'addLog': addLogEntry(message.entry); break;
        case 'updateCommands': customCommands = message.commands; updateCommandList(); break;
        case 'updateEnvVariables': envVariables = message.variables; updateEnvVariables(); break;
        case 'updateBranchList': updateBranchList(message.branches, message.current); break;
        case 'updateSettings':
            document.getElementById('commonParams').value = JSON.stringify(message.settings.commonParameters, null, 2);
            document.getElementById('autoRefreshToggle').classList.toggle('active', message.settings.autoRefresh);
            document.getElementById('logRetentionInput').value = message.settings.logRetention;
            document.getElementById('concurrencyInput').value = message.settings.concurrency;
            document.getElementById('defaultShellSelector').value = message.settings.defaultShell;
            document.getElementById('commandTimeoutInput').value = message.settings.commandTimeout;
            document.getElementById('shellSelector').value = message.settings.defaultShell;
            break;
        case 'jsonError':
            const jsonStatus = document.getElementById('jsonStatus');
            jsonStatus.textContent = message.error;
            jsonStatus.className = 'status-message error';
            setTimeout(() => { jsonStatus.textContent = ''; jsonStatus.className = 'status-message'; }, 3000);
            break;
        case 'jsonSuccess':
            const jsonStatus2 = document.getElementById('jsonStatus');
            jsonStatus2.textContent = '已保存';
            jsonStatus2.className = 'status-message success';
            setTimeout(() => { jsonStatus2.textContent = ''; jsonStatus2.className = 'status-message'; }, 2000);
            break;
        case 'restoreLogHeight':
            const restoredH = message.height;
            if (restoredH && restoredH > 60) {
                const containers = document.querySelectorAll('.log-container');
                containers.forEach(c => { c.style.height = restoredH + 'px'; });
                logExpanded = true;
                savedLogHeight = restoredH;
                logUserResized = true;
            }
            break;
        case 'updatePythonTxtCommands':
            pythonTxtCommands = message.commands;
            renderPythonTxtCmdList();
            break;
        case 'addTxtCmdLog':
            addTxtCmdLogEntry(message.entry);
            break;
    }
});