
import * as vscode from 'vscode';
import { CancellationToken, Disposable, DocumentLink, DocumentLinkProvider, Position, Range, TextDocument, workspace } from 'vscode';
import { disposeAll, hasKey } from '../utils/utils';
import * as path from 'path';
import { Filesystem } from '../utils/filesystem';
import { ILineColumnInfo } from './lineParse';

interface LineInfo {
    kind: 'Eror' | 'Warn';
    file: string;
    hint: string;
}

// format and beautify msvc、gcc output infomation
// format
// -[Eror] filePath || hint
// -[Warn] filePath || hint 
export class CompilerOutputer implements DocumentLinkProvider, Disposable {
    // BCO => beautify compiler output 
    private channel: vscode.OutputChannel;
    private _eol: string;
    private _dispose: Disposable[] = [];
    private startHeader = "[build] ";
    private localLinkPattern: RegExp;
    private bcoLinkPattern: RegExp;
    private errKeys = [": error ", ": 致命错误：", ": 错误："];
    private warnKeys = [": 警告：", ": warning "];
    private processCwd: string;

    constructor() {
        this.channel = vscode.window.createOutputChannel('BCO');
        this._dispose.push(this.channel);
        this._eol = workspace.getConfiguration('files', null).get('eol')!;
        this.localLinkPattern = process.platform === 'win32' ?
            new RegExp("^\\[build\\]\\s.*?\\(\\d+\\)") :
            new RegExp("^\\[build\\]\\s.*?:(\\d+):(\\d+)");
        this.bcoLinkPattern = process.platform === 'win32' ?
            new RegExp("^.*\\(\\d+\\)") :
            new RegExp("^.*:(\\d+):(\\d+)");
        const wss = workspace.workspaceFolders;
        if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
        this.processCwd = wss[0].uri.fsPath;
    }

    public async dispose() {
        disposeAll(this._dispose);
    }

    public async provideDocumentLinks(doc: TextDocument, _token: CancellationToken): Promise<DocumentLink[]> {
        let results: DocumentLink[] = [];
        if (doc.fileName.indexOf('extension-output-ms-vscode.cmake-tools') !== -1) {
            // @ts-ignore
            let lines = doc.getText().split(this._eol);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (hasKey(line, "[build] Starting build")) {
                    this.channel.clear();
                }
                const lineInfo = await this.checkIsBuildLine(line);
                if (lineInfo) {
                    this.output(lineInfo);
                }
            }
        } else if (doc.fileName.indexOf('extension-output-flywine.cpphelper') !== -1) {
            let lines = doc.getText().split(this._eol);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let result = await this.getLinksOnLine(line, i);
                if (result.length > 0) {
                    results.push(...result);
                }
            }
        }

        return Promise.resolve(results);
    }

    public async getLinksOnLine(line: string, lineNumber: number): Promise<DocumentLink[]> {
        const results: DocumentLink[] = [];
        let nline = line.substring(8);
        let matchs = nline.match(this.bcoLinkPattern);
        if (matchs === null || matchs.length === 0) {
            return Promise.resolve(results);
        }
        let pathLink = matchs[0];
        const endChar = process.platform === 'win32' ? "(" : ":";
        const end = pathLink.length + 1;
        let lineColumn = pathLink.substring(pathLink.indexOf(endChar)); // (32) | :14:5
        pathLink = pathLink.substring(0, pathLink.indexOf(endChar));
        if (!path.isAbsolute(pathLink)) { // 绝对路径直接过
            let inx = pathLink.lastIndexOf('./');
            if (inx === -1) {
                inx = pathLink.lastIndexOf('.\\');
            }
            pathLink = pathLink.substring(inx + 2);
            pathLink = this.processCwd + "/" + pathLink;
        }
        pathLink = path.normalize(pathLink);
        if (!(await Filesystem.exists(pathLink))) {
            return Promise.resolve(results);
        }

        if (!(await Filesystem.isFile(pathLink))) {
            return Promise.resolve(results);
        }

        let fileUri = vscode.Uri.file(pathLink);
        let lineColumnInfo = this.extractLineColumnInfo(lineColumn);
        const linkTarget = fileUri.with({ fragment: `${lineColumnInfo.lineNumber},${lineColumnInfo.columnNumber}` });
        results.push(new DocumentLink(new Range(new Position(lineNumber, 8), new Position(lineNumber, end)), linkTarget));
        return Promise.resolve(results);
    }

    public async checkIsBuildLine(line: string): Promise<LineInfo | null> {
        if (!line.startsWith(this.startHeader)) {
            return Promise.resolve(null);
        }
        let pathWithHeader = line.match(this.localLinkPattern);
        if (pathWithHeader === null || pathWithHeader.length === 0) {
            return Promise.resolve(null);
        }
        // extract erro or warn info
        const lineInfo = this.extractHint(line);
        if (!lineInfo) {
            return Promise.resolve(null);
        }

        // ../../../src/kit/test/Auxiliary/test_stringformat.cpp:14:5
        // ..\..\..\src\kit\test\Archive\json\test_tool.cpp(412)
        // D:\code\framework\src\kit\src\Archive/Json/Json.hpp(233)
        let pathLink = pathWithHeader[0].substring(7);
        // ../.././src => ../../src
        if (pathLink.indexOf("/./")) {
            pathLink = pathLink.replace("/./", "/");
        }
        if (pathLink.indexOf("\\.\\")) {
            pathLink = pathLink.replace("\\.\\", "\\");
        }
        lineInfo.file = pathLink;
        return Promise.resolve(lineInfo);
    }

    private output(info: LineInfo) {
        const s = `-[${info.kind}] ${info.file} || ${info.hint}`;
        this.channel.appendLine(s);
    }

    private extractHint(line: string): LineInfo | null {
        const info: LineInfo = {
            kind: 'Eror',
            file: '',
            hint: ''
        };

        for (let i = 0; i < this.errKeys.length; i++) {
            const ele = this.errKeys[i];
            if (hasKey(line, ele)) {
                info.hint = line.substring(line.indexOf(ele) + ele.length);
                return info;
            }
        }

        info.kind = 'Warn';
        for (let i = 0; i < this.warnKeys.length; i++) {
            const ele = this.warnKeys[i];
            if (hasKey(line, ele)) {
                info.hint = line.substring(line.indexOf(ele) + ele.length);
                return info;
            }
        }
        return null;
    }

    private extractLineColumnInfo(link: string): ILineColumnInfo {
        const lineColumnInfo: ILineColumnInfo = {
            lineNumber: 1,
            columnNumber: 1,
        };
        // (43) | :12:3
        if (process.platform === 'win32') {
            let line = link.substring(link.indexOf("(") + 1, link.indexOf(")"));
            lineColumnInfo.lineNumber = parseInt(line, 10);
        } else {
            let line = link.substring(1, link.lastIndexOf(":"));
            let column = link.substring(link.lastIndexOf(":") + 1);
            lineColumnInfo.lineNumber = parseInt(line, 10);
            lineColumnInfo.columnNumber = parseInt(column, 10);
        }

        return lineColumnInfo;
    }
}