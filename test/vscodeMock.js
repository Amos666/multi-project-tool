'use strict';
const Module = require('module');

const state = { workspaceFolders: undefined };

const outputChannel = {
    appendLine() {}, append() {}, show() {}, clear() {}, hide() {}, dispose() {}
};

const vscodeMock = {
    workspace: {
        get workspaceFolders() { return state.workspaceFolders; },
        onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
        onDidSaveTextDocument: () => ({ dispose() {} })
    },
    window: {
        activeTextEditor: undefined,
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        showErrorMessage: () => Promise.resolve(undefined),
        createOutputChannel: () => outputChannel,
        createWebviewPanel: () => ({ webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) }, onDidDispose: () => ({ dispose() {} }), reveal() {} })
    },
    commands: { registerCommand: () => ({ dispose() {} }), executeCommand: () => Promise.resolve() },
    ViewColumn: { One: 1, Two: 2, Beside: -2 },
    Uri: {
        file: (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => 'file://' + p })
    },
    EventEmitter: class {
        constructor() { this.event = () => ({ dispose() {} }); }
        fire() {}
        dispose() {}
    },
    Disposable: { from: () => ({ dispose() {} }) }
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return origLoad.apply(this, arguments);
};

function setWorkspace(dir) {
    state.workspaceFolders = dir ? [{ uri: { fsPath: dir }, name: 'test', index: 0 }] : undefined;
}

module.exports = { vscodeMock, setWorkspace };
