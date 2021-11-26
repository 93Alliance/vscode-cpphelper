import { Cpphelper } from './cpphelper';
import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    const ctx = new Cpphelper();
    context.subscriptions.push(ctx);
}

export function deactivate() { }