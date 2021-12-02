import { Disposable, Uri, ViewColumn, window, workspace } from "vscode";

export function disposeAll(items: Disposable[]): any[] {
    return items.reverse().map((d) => d.dispose());
}

// check wether file in current editor
export function isOpenedInEditor(file: Uri): boolean {
    return workspace.textDocuments.some(doc => {
        return doc.uri.toString() === file.toString();
    });
}

export async function openFile(fileName: string, column: ViewColumn, preserveFocus: boolean = false) {
    let uriFile = Uri.file(fileName);

    try {
        let document = await workspace.openTextDocument(uriFile);

        await window.showTextDocument(document, column, preserveFocus);
    }
    catch (error) {
        console.error(error);
    }
}

export function fistLetterUpper(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export function replaceAll(str: string, search: string, replace: string) {
    return str.split(search).join(replace);
}

// get string with chinese char length
export function getByteLen(val: string) {
    var len = 0;
    for (var i = 0; i < val.length; i++) {
        var a = val.charAt(i);
        if (a.match(/[^\x00-\xff]/ig) !== null) {
            len += 2;
        }
        else {
            len += 1;
        }
    }
    return len;
}

export function hasKey(str: string, key: string): boolean {
    return str.indexOf(key) !== -1;
}