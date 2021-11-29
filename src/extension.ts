import { Cpphelper } from './cpphelper';
import * as vscode from 'vscode';
import { ClangdApi } from './lsp/clangd';

export async function activate(context: vscode.ExtensionContext) {
    // check clangd
    const clangd = vscode.extensions.getExtension('flywine.vscode-clangd');
    const clangApi = new ClangdApi();
    if (clangd) {
        if (clangd.isActive) { clangApi.ast = clangd.exports.ast; }
        else {
            const si = setInterval(() => {
                if (clangd.isActive) {
                    clangApi.ast = clangd.exports.ast;
                    clearInterval(si);
                }
            }, 1500);
        }

    }

    const ctx = new Cpphelper(clangApi);
    context.subscriptions.push(ctx);
}

export function deactivate() { }