// Flow 编辑器面板（主编辑区 WebviewPanel）的 HTML 片段
// 布局：左侧节点面板 | 中间画布+工具栏 | 右侧属性 | 底部执行监控

export const FLOW_EDITOR_BODY = `
<div class="wf-tab">
    <div class="wf-main">
        <div class="wf-left">
            <div class="wb-section-title" style="padding:8px 8px 2px" data-i18n="wb.wf.nodes">Nodes</div>
            <div id="wfPalette"></div>
        </div>
        <div class="wf-canvas-wrap" id="wfCanvasWrap">
            <div class="wf-toolbar">
                <button class="wf-btn" id="wfBackBtn" style="display:none" onclick="wfBackToEdit()" data-i18n-title="wb.wf.backToEdit" title="Back to editor"><span class="codicon codicon-arrow-left" aria-hidden="true"></span><span data-i18n="wb.wf.backToEdit">Back</span></button>
                <span class="wf-mode-badge" id="wfModeBadge" style="display:none"></span>
                <button class="wf-btn primary" id="wfRunBtn" onclick="wfRun()" data-i18n-title="wb.wf.run" title="Run"><span class="codicon codicon-play" aria-hidden="true"></span></button>
                <button class="wf-btn" id="wfStopBtn" onclick="wfStop()" data-i18n-title="wb.wf.stop" title="Stop"><span class="codicon codicon-debug-stop" aria-hidden="true"></span></button>
                <!-- 失败暂停：工具栏常驻 Resume/Cancel（与节点上方浮动操作条等价，入口更醒目） -->
                <button class="wf-btn primary" id="wfResumeBarBtn" style="display:none" onclick="wfResume()" data-i18n-title="wb.wf.resume" title="Resume"><span class="codicon codicon-play" aria-hidden="true"></span><span data-i18n="wb.wf.resume">Resume</span></button>
                <button class="wf-btn danger" id="wfCancelBarBtn" style="display:none" onclick="wfCancelRun()" data-i18n-title="wb.wf.cancelRun" title="Cancel"><span class="codicon codicon-debug-stop" aria-hidden="true"></span><span data-i18n="wb.wf.cancelRun">Cancel</span></button>
                <button class="wf-btn" id="wfLinkBtn" onclick="wfToggleLink()" data-i18n-title="wb.wf.link" title="Link mode"><span class="codicon codicon-link" aria-hidden="true"></span></button>
                <button class="wf-btn" id="wfSaveBtn" onclick="wfSave()" data-i18n-title="wb.wf.save" title="Save"><span class="codicon codicon-save" aria-hidden="true"></span></button>
                <button class="wf-btn danger" id="wfClearBtn" onclick="wfClear()" data-i18n-title="wb.wf.clear" title="Clear canvas"><span class="codicon codicon-trash" aria-hidden="true"></span></button>
                <button class="wf-btn" id="wfRenameBtn" onclick="wfRename()" data-i18n-title="cmd.rename" title="Rename"><span class="codicon codicon-edit" aria-hidden="true"></span><span id="wfName" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">workflow</span></button>
                <span class="wf-hint" id="wfHint"></span>
            </div>
            <div class="wf-svg-wrap" id="wfSvgWrap">
                <svg id="wfSvg" class="wf-svg" viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid meet"></svg>
                <!-- 节点上方浮动操作条：人工确认（继续/取消/暂停）与失败续跑（Resume/Cancel）统一放置于此 -->
                <div class="wf-node-actions" id="wfNodeActions" style="display:none">
                    <span class="wf-node-actions-text" id="wfNodeActionsText"></span>
                    <button class="wf-btn primary" id="wfConfirmOkBtn" style="display:none" onclick="wfConfirm(true)" data-i18n="wb.wf.confirmApprove">Continue</button>
                    <button class="wf-btn danger" id="wfConfirmNoBtn" style="display:none" onclick="wfConfirm(false)" data-i18n="wb.wf.confirmCancel">Cancel workflow</button>
                    <button class="wf-btn" id="wfPauseBtn" style="display:none" onclick="wfPause()" data-i18n-title="wb.wf.pause" title="Pause"><span class="codicon codicon-debug-pause" aria-hidden="true"></span><span data-i18n="wb.wf.pause">Pause</span></button>
                    <button class="wf-btn primary" id="wfResumeBtn" style="display:none" onclick="wfResume()"><span class="codicon codicon-play" aria-hidden="true"></span><span data-i18n="wb.wf.resume">Resume</span></button>
                    <button class="wf-btn danger" id="wfCancelBtn" style="display:none" onclick="wfCancelRun()"><span class="codicon codicon-debug-stop" aria-hidden="true"></span><span data-i18n="wb.wf.cancelRun">Cancel</span></button>
                </div>
            </div>
        </div>
        <div class="wf-props">
            <h4 data-i18n="wb.wf.props">Properties</h4>
            <div id="wfPropsEmpty" class="wb-empty" data-i18n="wb.wf.propsEmpty">Click a node to edit</div>
            <div id="wfPropsForm" style="display:none">
                <label data-i18n="wb.wf.nodeName">Node Name</label>
                <input type="text" id="wfPName" oninput="wfEditProp('label',this.value)">
                <label id="wfPCmdLabel" data-i18n="wb.wf.cmd">Command</label>
                <input type="text" id="wfPCmd" oninput="wfEditProp('cmd',this.value)">
                <label id="wfPNotifyTypeLabel" data-i18n="wb.wf.notifyType" style="display:none">Notify Type</label>
                <select id="wfPNotifyType" style="display:none" onchange="wfEditProp('notifyType',this.value)">
                    <option value="text" data-i18n="wb.wf.notifyTypeText">Text popup</option>
                    <option value="cmd" data-i18n="wb.wf.notifyTypeCmd">Command</option>
                    <option value="http" data-i18n="wb.wf.notifyTypeHttp">HTTP request</option>
                </select>
                <label id="wfPHttpMethodLabel" data-i18n="wb.wf.httpMethod" style="display:none">Method</label>
                <select id="wfPHttpMethod" style="display:none" onchange="wfEditProp('httpMethod',this.value)">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                </select>
                <label id="wfPHttpHeadersLabel" data-i18n="wb.wf.httpHeaders" style="display:none">Headers (JSON)</label>
                <textarea id="wfPHttpHeaders" rows="3" style="display:none" oninput="wfEditProp('httpHeaders',this.value)" placeholder='{"Content-Type": "application/json"}'></textarea>
                <label id="wfPHttpBodyLabel" data-i18n="wb.wf.httpBody" style="display:none">Payload</label>
                <textarea id="wfPHttpBody" rows="4" style="display:none" oninput="wfEditProp('httpBody',this.value)"></textarea>
                <label id="wfPRefTabLabel" data-i18n="wb.wf.refTab" style="display:none">Source Tab</label>
                <select id="wfPRefTab" style="display:none" onchange="wfRefTabChange(this.value)">
                    <option value="cmd" data-i18n="tab.custom">JSON Commands</option>
                    <option value="pyt" data-i18n="tab.txtcmd">Python Txt</option>
                    <option value="shortcut" data-i18n="tab.shortcut">ShortCut Cmd</option>
                    <option value="git" data-i18n="tab.git">Git</option>
                </select>
                <label id="wfPRefCmdLabel" data-i18n="wb.wf.refCmd" style="display:none">Referenced Command</label>
                <select id="wfPRefCmd" style="display:none" onchange="wfEditProp('refCommandId',this.value)"></select>
                <label id="wfPVscodeCmdLabel" data-i18n="wb.wf.vscodeCommandId" style="display:none">VSCode Command ID</label>
                <input type="text" id="wfPVscodeCmd" list="wfVscodeCmdList" style="display:none" placeholder="workbench.action.tasks.build" oninput="wfEditProp('vscodeCommandId',this.value)">
                <datalist id="wfVscodeCmdList"></datalist>
                <label id="wfPSchedModeLabel" data-i18n="wb.wf.schedMode" style="display:none">Schedule</label>
                <select id="wfPSchedMode" style="display:none" onchange="wfEditProp('scheduleMode',this.value);wfSchedModeChange()">
                    <option value="none" data-i18n="wb.wf.schedNone">None (manual)</option>
                    <option value="countdown" data-i18n="wb.wf.schedCountdown">Countdown</option>
                    <option value="clock" data-i18n="wb.wf.schedClock">Fixed time</option>
                </select>
                <label id="wfPSchedValueLabel" style="display:none">Value</label>
                <input type="text" id="wfPSchedValue" style="display:none" oninput="wfEditProp('scheduleValue',this.value)">
                <label id="wfPShellLabel" data-i18n="wb.wf.shell" style="display:none">Shell</label>
                <select id="wfPShell" style="display:none" onchange="wfEditProp('shell',this.value)">
                    <option value="git-bash">Git Bash</option>
                    <option value="cmd">CMD</option>
                    <option value="powershell">PowerShell</option>
                    <option value="wsl">WSL</option>
                </select>
                <label data-i18n="wb.wf.timeout">Timeout (sec)</label>
                <input type="number" id="wfPTimeout" min="1" max="36000" oninput="wfEditProp('timeout',Number(this.value)||300)">
                <label data-i18n="wb.wf.failPolicy">Fail Policy</label>
                <select id="wfPFail" onchange="wfEditProp('failPolicy',this.value)">
                    <option value="stop" data-i18n="wb.wf.policyStop">Stop workflow</option>
                    <option value="skip" data-i18n="wb.wf.policySkip">Skip &amp; continue</option>
                    <option value="retry1" data-i18n="wb.wf.policyRetry">Retry once</option>
                </select>
                <div id="wfPOutEdges"></div>
                <div class="wf-deps"><span data-i18n="wb.wf.deps">Dependencies</span>: <span id="wfPDeps">--</span></div>
                <button class="wf-del-btn" id="wfDelBtn" onclick="wfDeleteSelected()" data-i18n="wb.wf.deleteNode">Delete Node</button>
            </div>
        </div>
    </div>
    <div class="wf-splitter" id="wfMonitorSplitter" title="Drag to resize"></div>
    <div class="wf-monitor" id="wfMonitor">
        <div class="wf-monitor-head">
            <span data-i18n="wb.wf.monitor">Execution Monitor</span>
            <span class="wf-summary"><span data-i18n="wb.wf.state">State</span>: <span id="wfState">-</span> | <span data-i18n="wb.wf.dur">Duration</span>: <span id="wfDur">--</span> | <span data-i18n="wb.wf.failed">Failed</span>: <span id="wfFailed">0</span> | <span data-i18n="wb.wf.skipped">Skipped</span>: <span id="wfSkipped">0</span></span>
        </div>
        <div class="wf-monitor-body">
            <div class="wf-run-table-wrap">
                <table class="wf-run-table">
                    <thead><tr>
                        <th data-i18n="wb.wf.colTime">Time</th>
                        <th data-i18n="wb.wf.colNode">Node</th>
                        <th data-i18n="wb.wf.colState">State</th>
                        <th data-i18n="wb.wf.colDur">Dur</th>
                        <th></th>
                    </tr></thead>
                    <tbody id="wfRunTbody"></tbody>
                </table>
            </div>
            <div class="wf-output-wrap">
                <div class="wf-output-bar">
                    <span data-i18n="wb.wf.output">Output</span>
                    <select id="wfLogFilter" onchange="wfApplyLogFilter()">
                        <option value="" data-i18n="wb.wf.allNodes">All nodes</option>
                    </select>
                    <span class="wf-btn" style="margin-left:auto;padding:1px 6px" onclick="wfExportLog()" data-i18n-title="wb.wf.exportLog" title="Export log"><span class="codicon codicon-export" aria-hidden="true" style="font-size:11px"></span> <span data-i18n="wb.wf.exportLog">Export</span></span>
                    <span class="wf-btn" style="padding:1px 6px" onclick="wfClearOutput()" data-i18n="log.clear">Clear</span>
                </div>
                <div class="wf-output" id="wfOutput"></div>
            </div>
        </div>
    </div>
    <!-- 重命名弹窗：webview 中原生 prompt 被禁用 -->
    <div id="wbPromptModal" class="modal-overlay" style="display:none">
        <div class="modal-dialog">
            <div class="modal-header">
                <span class="modal-title" data-i18n="wb.prompt.title">Input</span>
                <button class="modal-close" onclick="wbPromptClose()" data-i18n-title="cmd.cancel" title="Cancel"><span class="codicon codicon-close" aria-hidden="true"></span></button>
            </div>
            <div class="modal-body">
                <p style="font-size:12px;margin-bottom:6px" id="wbPromptText"></p>
                <input type="text" id="wbPromptInput" style="width:100%;background-color:var(--brand-surface-raised);color:var(--brand-text);border:1px solid var(--brand-border);border-radius:var(--radius-sm);font-size:12px;padding:4px 6px;" onkeydown="wbPromptKey(event)" autocomplete="off">
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="wbPromptClose()" data-i18n="cmd.cancel">Cancel</button>
                <button class="btn btn-primary" onclick="wbPromptOk()" data-i18n="cmd.save">Save</button>
            </div>
        </div>
    </div>
</div>`;
