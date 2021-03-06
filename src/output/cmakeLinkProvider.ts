import {
    CancellationToken, DocumentLink, DocumentLinkProvider, Position, Range, TextDocument, Uri, workspace
} from "vscode";
import * as path from 'path';
import { Filesystem } from "../utils/filesystem";
import { ILineColumnInfo } from "./lineParse";


export class CmakeLinkProvider implements DocumentLinkProvider {
    // @ts-ignore
    private eol: string;
    private localLinkPattern: RegExp;
    private startHeader = "[build] ";
    private processCwd: string;

    constructor() {
        this.eol = workspace.getConfiguration('files', null).get('eol')!;
        this.localLinkPattern = process.platform === 'win32' ?
            new RegExp("^\\[build\\]\\s.*?\\(\\d+\\)") :
            new RegExp("^\\[build\\]\\s.*?:(\\d+):(\\d+)");
        const wss = workspace.workspaceFolders;
        if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
        this.processCwd = wss[0].uri.fsPath;
    }

    public async provideDocumentLinks(doc: TextDocument, _token: CancellationToken): Promise<DocumentLink[]> {
        let results: DocumentLink[] = [];
        if (doc.fileName.indexOf('extension-output-ms-vscode.cmake-tools') !== -1) {
            // @ts-ignore
            let lines = doc.getText().split(this.eol);

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

        if (!line.startsWith(this.startHeader)) {
            return Promise.resolve(results);
        }

        // linux ^\[build\]\s.*?:(\d+):(\d+)
        // win ^\[build\]\s.*?\(\d+\)

        // [build] ../../../src/kit/test/Auxiliary/test_stringformat.cpp:14:5
        // [build] ..\..\..\src\kit\test\Archive\json\test_tool.cpp(412)
        // [build] D:\code\framework\src\kit\src\Archive/Json/Json.hpp(233):
        let pathWithHeader = line.match(this.localLinkPattern);
        if (pathWithHeader === null || pathWithHeader.length === 0) {
            return Promise.resolve(results);
        }
        // ??????header
        // ../../../src/kit/test/Auxiliary/test_stringformat.cpp:14:5
        // ..\..\..\src\kit\test\Archive\json\test_tool.cpp(412)
        // D:\code\framework\src\kit\src\Archive/Json/Json.hpp(233)
        let pathLink = pathWithHeader[0].substring(7);
        // ??????????????????+?????????????????????????????????ccls???????????????
        const endChar = process.platform === 'win32' ? "(" : ":";
        // ../../../src/kit/test/Auxiliary/test_stringformat.cpp
        // ..\..\..\src\kit\test\Archive\json\test_tool.cpp
        // D:\code\framework\src\kit\src\Archive/Json/Json.hpp
        const end = pathLink.length + 1;
        let lineColumn = pathLink.substring(pathLink.indexOf(endChar)); // (32) | :14:5
        pathLink = pathLink.substring(0, pathLink.indexOf(endChar));
        // ../.././src => ../../src
        if (pathLink.indexOf("/./")) {
            pathLink = pathLink.replace("/./", "/");
        }
        if (pathLink.indexOf("\\.\\")) {
            pathLink = pathLink.replace("\\.\\", "\\");
        }
        if (!path.isAbsolute(pathLink)) { // ?????????????????????
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

        let fileUri = Uri.file(pathLink);
        let lineColumnInfo = this.extractLineColumnInfo(lineColumn);

        const linkTarget = fileUri.with({ fragment: `${lineColumnInfo.lineNumber},${lineColumnInfo.columnNumber}` });
        // @ts-ignore
        // 8???????????????1????????? startHeader ????????????
        results.push(new DocumentLink(new Range(new Position(lineNumber, 8), new Position(lineNumber, end)), linkTarget));
        return Promise.resolve(results);
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