// 工作台新增 Tab 的 HTML 片段（追加到现有 tab-bar / tab-content，不改动既有结构）

/** 追加到 tab-bar 内的三个新 Tab 按钮 */
export const WORKBENCH_TAB_BUTTONS = `
        <div class="tab" id="tabBtn-checklist" onclick="switchTab('checklist')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2" width="11" height="12" rx="1.5"/><path d="M5 5.5l1 1 2-2"/><path d="M5 9h6"/><path d="M5 11.5h4"/></svg><span data-i18n="tab.checklist">ToDo</span>
        </div>
        <div class="tab" id="tabBtn-workflow" onclick="switchTab('workflow')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="6" width="4" height="4" rx="1"/><rect x="10.5" y="2" width="4" height="4" rx="1"/><rect x="10.5" y="10" width="4" height="4" rx="1"/><path d="M5.5 8h2.5M8 8V4h2.5M8 8v4h2.5"/></svg><span data-i18n="tab.workflow">Flow</span>
        </div>
        <div class="tab" id="tabBtn-batch" onclick="switchTab('batch')">
            <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5h10"/><path d="M3 8h10"/><path d="M3 12.5h6"/><path d="M12 10.5l1.5 1.5-1.5 1.5"/></svg><span data-i18n="tab.batch">Batch</span>
        </div>`;

/** 追加到 tab-content 内的三个新面板 + 快速启动器浮层 */
export const WORKBENCH_PANELS = `
        <div id="tab-checklist" class="tab-panel">
            <div class="wb-panel">
                <div class="wb-scroll">
                    <div class="wb-section-title">
                        <span><span data-i18n="wb.cl.title">Today's Checklist</span> <span id="clDate"></span></span>
                        <span class="wf-btn" onclick="wbClearDone()" data-i18n="wb.cl.clearDone">Clear Done</span>
                    </div>
                    <div id="clList"></div>
                </div>
                <div class="wb-add-row">
                    <input type="text" id="clInput" data-i18n-placeholder="wb.cl.placeholder" placeholder="Add task, press Enter" onkeydown="if(event.key==='Enter')wbAddTask()">
                    <select id="clPrio">
                        <option value="urgent" data-i18n="wb.cl.prio.urgent">Urgent</option>
                        <option value="normal" selected data-i18n="wb.cl.prio.normal">Normal</option>
                        <option value="low" data-i18n="wb.cl.prio.low">Low</option>
                    </select>
                    <button class="wf-btn primary" onclick="wbAddTask()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg></button>
                </div>
                <div class="wb-progress-wrap">
                    <div class="wb-progress-text"><span data-i18n="wb.cl.progress">Progress</span>: <span id="clProgText">0%</span></div>
                    <div class="wb-progress"><div id="clProgBar" style="width:0%"></div></div>
                </div>
            </div>
        </div>

        <div id="tab-workflow" class="tab-panel">
            <div class="wf-tab">
                <div class="wf-side">
                    <button class="wf-open-btn" onclick="wfOpenEditor()">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="6" width="4" height="4" rx="1"/><rect x="10.5" y="2" width="4" height="4" rx="1"/><rect x="10.5" y="10" width="4" height="4" rx="1"/><path d="M5.5 8h2.5M8 8V4h2.5M8 8v4h2.5"/></svg>
                        <span data-i18n="wb.wf.openEditor">Open Flow Editor</span>
                    </button>
                    <div class="wf-side-hint" data-i18n="wb.wf.editorHint">The flow chart is edited in the main editor area</div>
                    <div class="wb-section-title" style="padding:8px 8px 2px">
                        <span data-i18n="wb.wf.workflows">Workflows</span>
                        <span class="wf-btn" style="padding:1px 6px" onclick="wfNew()" data-i18n-title="wb.wf.newFlow" title="New workflow"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg></span>
                    </div>
                    <div id="wfFlowList"></div>
                    <div class="wb-section-title" style="padding:6px 8px 2px" data-i18n="wb.wf.running">Running</div>
                    <div id="wfRunningList"></div>
                    <div class="wb-section-title" style="padding:6px 8px 2px">
                        <span data-i18n="wb.wf.history">History</span>
                        <span class="wf-btn" style="padding:1px 6px" onclick="wfClearHistory()" data-i18n-title="wb.wf.clearHistory" title="Clear All" data-i18n="wb.wf.clearHistory">Clear All</span>
                    </div>
                    <div id="wfHistoryList"></div>
                </div>
            </div>
        </div>

        <div id="tab-batch" class="tab-panel">
            <div class="batch-panel">
                <div class="batch-controls">
                    <label><span data-i18n="wb.batch.group">Group</span>
                        <select id="batchGroupSel" onchange="batchSelectGroup()"></select>
                    </label>
                    <label><span data-i18n="wb.batch.mode">Mode</span>
                        <select id="batchMode" onchange="batchModeChange()">
                            <option value="serial" data-i18n="wb.batch.serial">Serial</option>
                            <option value="parallel" data-i18n="wb.batch.parallel">Parallel</option>
                        </select>
                    </label>
                    <label><span data-i18n="wb.batch.shell">Shell</span>
                        <select id="batchShell" title="Shell">
                            <option value="git-bash">Git Bash</option>
                            <option value="cmd">CMD</option>
                            <option value="powershell">PowerShell</option>
                            <option value="wsl">WSL</option>
                        </select>
                    </label>
                    <input type="text" id="batchGroupName" data-i18n-placeholder="wb.batch.namePh" placeholder="Group name" style="width:110px">
                    <button class="wf-btn" onclick="batchRenameGroup()" data-i18n="wb.batch.rename">Rename</button>
                    <button class="wf-btn" onclick="batchAddGroup()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg> <span data-i18n="wb.batch.group">Group</span></button>
                    <button class="wf-btn danger" onclick="batchDeleteGroup()" data-i18n="cmd.delete">Delete</button>
                </div>
                <ul id="batchList" class="batch-list"></ul>
                <div class="batch-actions">
                    <button class="wf-btn" onclick="batchAddCmd()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg> <span data-i18n="wb.batch.cmd">Command</span></button>
                    <button class="wf-btn primary" onclick="batchRun()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5v9l7.5-4.5z"/></svg> <span data-i18n="wb.batch.run">Run All</span></button>
                    <button class="wf-btn" onclick="wfStop()" data-i18n="wb.wf.stop">Stop</button>
                    <button class="wf-btn" onclick="batchToFlow()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="6" width="4" height="4" rx="1"/><rect x="10.5" y="2" width="4" height="4" rx="1"/><rect x="10.5" y="10" width="4" height="4" rx="1"/><path d="M5.5 8h2.5M8 8V4h2.5M8 8v4h2.5"/></svg> <span data-i18n="wb.batch.toFlow">To Flowchart</span></button>
                </div>
                <div class="batch-log-bar">
                    <span><span data-i18n="wb.batch.log">Execution Log</span></span>
                    <span class="wf-btn" style="padding:1px 6px" onclick="batchClearLog()" data-i18n="log.clear">Clear</span>
                    <span style="margin-left:auto;font-size:11px;color:var(--brand-text-muted)" id="batchStatus"></span>
                </div>
                <div class="wf-output batch-output" id="batchOutput">
                    <div class="dim" data-i18n="wb.batch.logHint">Run a group to see real-time command output here</div>
                </div>
            </div>
        </div>

        <div id="wbConfirmModal" class="modal-overlay" style="display:none">
            <div class="modal-dialog">
                <div class="modal-header">
                    <span class="modal-title" data-i18n="wb.confirm.title">Confirm</span>
                    <button class="modal-close" onclick="wbConfirmClose()">×</button>
                </div>
                <div class="modal-body">
                    <p style="font-size:12px;margin-bottom:6px" id="wbConfirmText"></p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="wbConfirmClose()" data-i18n="cmd.cancel">Cancel</button>
                    <button class="btn btn-danger" onclick="wbConfirmOk()" data-i18n="cmd.delete">Delete</button>
                </div>
            </div>
        </div>
        <div id="launcherMask" class="launcher-mask" style="display:none" onmousedown="if(event.target===this)launcherClose()">
            <div class="launcher">
                <input type="text" id="launcherInput" data-i18n-placeholder="wb.launcher.placeholder" placeholder="Search... (↑↓ select, Enter run, Esc close)" oninput="launcherRender()" onkeydown="launcherKey(event)" autocomplete="off">
                <div class="launcher-list" id="launcherList"></div>
            </div>
        </div>`;
