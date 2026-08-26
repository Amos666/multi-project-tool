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
                <button class="wf-btn" id="wfBackBtn" style="display:none" onclick="wfBackToEdit()" data-i18n-title="wb.wf.backToEdit" title="Back to editor"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg><span data-i18n="wb.wf.backToEdit">Back</span></button>
                <span class="wf-mode-badge" id="wfModeBadge" style="display:none"></span>
                <button class="wf-btn primary" id="wfRunBtn" onclick="wfRun()" data-i18n-title="wb.wf.run" title="Run"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5v9l7.5-4.5z"/></svg></button>
                <button class="wf-btn" id="wfStopBtn" onclick="wfStop()" data-i18n-title="wb.wf.stop" title="Stop"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1"/></svg></button>
                <button class="wf-btn" id="wfLinkBtn" onclick="wfToggleLink()" data-i18n-title="wb.wf.link" title="Link mode"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 9.8l3.6-3.6"/><path d="M7.4 5.4l1.3-1.3a2.4 2.4 0 0 1 3.4 3.4l-1.3 1.3"/><path d="M8.6 10.6l-1.3 1.3a2.4 2.4 0 0 1-3.4-3.4l1.3-1.3"/></svg></button>
                <button class="wf-btn" id="wfSaveBtn" onclick="wfSave()" data-i18n-title="wb.wf.save" title="Save"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h8.5L14 5.5V13H3z"/><path d="M5.5 3v3h4V3"/><path d="M5.5 13v-3.5h5V13"/></svg></button>
                <button class="wf-btn danger" id="wfClearBtn" onclick="wfClear()" data-i18n-title="wb.wf.clear" title="Clear canvas"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10"/><path d="M6.3 4.5V3h3.4v1.5"/><path d="M4.5 4.5l.8 8.5h5.4l.8-8.5"/><path d="M6.8 7v3.5M9.2 7v3.5"/></svg></button>
                <input type="text" id="wfName" value="workflow" style="width:150px;background-color:var(--brand-surface-raised);color:var(--brand-text);border:1px solid var(--brand-border);border-radius:var(--radius-sm);font-size:11px;padding:3px 6px;outline:none;">
                <select id="wfShell" title="Shell">
                    <option value="git-bash">Git Bash</option>
                    <option value="cmd">CMD</option>
                    <option value="powershell">PowerShell</option>
                    <option value="wsl">WSL</option>
                </select>
                <span class="wf-hint" id="wfHint"></span>
            </div>
            <div class="wf-svg-wrap" id="wfSvgWrap">
                <svg id="wfSvg" class="wf-svg" viewBox="0 0 1000 460" preserveAspectRatio="xMidYMid meet"></svg>
                <!-- 节点上方浮动操作条：人工确认（继续/取消/暂停）与失败续跑（Resume/Cancel）统一放置于此 -->
                <div class="wf-node-actions" id="wfNodeActions" style="display:none">
                    <span class="wf-node-actions-text" id="wfNodeActionsText"></span>
                    <button class="wf-btn primary" id="wfConfirmOkBtn" style="display:none" onclick="wfConfirm(true)" data-i18n="wb.wf.confirmApprove">Continue</button>
                    <button class="wf-btn danger" id="wfConfirmNoBtn" style="display:none" onclick="wfConfirm(false)" data-i18n="wb.wf.confirmCancel">Cancel workflow</button>
                    <button class="wf-btn" id="wfPauseBtn" style="display:none" onclick="wfPause()" data-i18n-title="wb.wf.pause" title="Pause"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 3.5v9"/><path d="M10 3.5v9"/></svg><span data-i18n="wb.wf.pause">Pause</span></button>
                    <button class="wf-btn primary" id="wfResumeBtn" style="display:none" onclick="wfResume()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5v9l7.5-4.5z"/></svg><span data-i18n="wb.wf.resume">Resume</span></button>
                    <button class="wf-btn danger" id="wfCancelBtn" style="display:none" onclick="wfCancelRun()"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1"/></svg><span data-i18n="wb.wf.cancelRun">Cancel</span></button>
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
                <label id="wfPSchedModeLabel" data-i18n="wb.wf.schedMode" style="display:none">Schedule</label>
                <select id="wfPSchedMode" style="display:none" onchange="wfEditProp('scheduleMode',this.value);wfSchedModeChange()">
                    <option value="none" data-i18n="wb.wf.schedNone">None (manual)</option>
                    <option value="countdown" data-i18n="wb.wf.schedCountdown">Countdown</option>
                    <option value="clock" data-i18n="wb.wf.schedClock">Fixed time</option>
                </select>
                <label id="wfPSchedValueLabel" style="display:none">Value</label>
                <input type="text" id="wfPSchedValue" style="display:none" oninput="wfEditProp('scheduleValue',this.value)">
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
                    <span class="wf-btn" style="margin-left:auto;padding:1px 6px" onclick="wfExportLog()" data-i18n-title="wb.wf.exportLog" title="Export log"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;vertical-align:-2px"><path d="M8 2v8"/><path d="M5 7l3 3 3-3"/><path d="M2.5 12.5h11"/></svg> <span data-i18n="wb.wf.exportLog">Export</span></span>
                    <span class="wf-btn" style="padding:1px 6px" onclick="wfClearOutput()" data-i18n="log.clear">Clear</span>
                </div>
                <div class="wf-output" id="wfOutput"></div>
            </div>
        </div>
    </div>
</div>`;
