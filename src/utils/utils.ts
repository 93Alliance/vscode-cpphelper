import { Disposable, Uri, workspace } from "vscode";

export function disposeAll(items: Disposable[]): any[] {
    return items.reverse().map((d) => d.dispose());
}

// check wether file in current editor
export function isOpenedInEditor(file: Uri): boolean {
    return workspace.textDocuments.some(doc => {
        return doc.uri.toString() === file.toString();
    });
}

export function fistLetterUpper(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export function replaceAll(str: string, search: string, replace: string) {
    return str.split(search).join(replace);
}