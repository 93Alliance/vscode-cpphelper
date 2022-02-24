import { Cpphelper } from './cpphelper';
import * as vscode from 'vscode';
import { ClangdApi } from './lsp/clangd';

function importClangdApi(clangd: vscode.Extension<any>, clangApi: ClangdApi) {
    if (clangd.isActive) { 
        if (clangd.exports.ast) {
            clangApi.ast = clangd.exports.ast;
        }
        if (clangd.exports.hover) {
            clangApi.hover = clangd.exports.hover;
        }
        if (clangd.exports.documentSymbol) {
            clangApi.documentSymbol = clangd.exports.documentSymbol;
        }
    }
    else {
        const si = setInterval(() => {
            if (clangd.isActive) {
                if (clangd.exports.ast) {
                    clangApi.ast = clangd.exports.ast;
                }
                if (clangd.exports.hover) {
                    clangApi.hover = clangd.exports.hover;
                }
                if (clangd.exports.documentSymbol) {
                    clangApi.documentSymbol = clangd.exports.documentSymbol;
                }
                clearInterval(si);
            }
        }, 1500);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    // check clangd
    let clangd = vscode.extensions.getExtension('flywine.vscode-clangd');
    const clangApi = new ClangdApi();
    if (clangd) {
        importClangdApi(clangd, clangApi);
    } else {
        clangd = vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd');
        if (clangd) {
            importClangdApi(clangd, clangApi);
        } else {
            vscode.window.showWarningMessage("Not found clangd plugin");
        }
    }

    const ctx = new Cpphelper(clangApi);
    context.subscriptions.push(ctx);
}

export function deactivate() { }