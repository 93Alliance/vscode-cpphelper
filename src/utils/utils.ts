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
    console.log("Opening " + fileName + " in " + column + " pane");

    let uriFile = Uri.file(fileName);

    try {
        let document = await workspace.openTextDocument(uriFile);

        await window.showTextDocument(document, column, preserveFocus);
        console.log("Done opening " + document.fileName);
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

