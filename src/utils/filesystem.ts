import * as fs from 'fs';
import * as path from 'path';
import { window } from 'vscode';

export interface FileInfo {
    dir: string;            // /opt/include
    fileName: string;       // fileInfo
    headerName: string;     // fileInfo.hpp
    headerExtName: string;  // .hpp
    sourceName: string;     // fileInfo.cpp
    sourceExtName: string;  // .cpp
}

// some operator function of file or directory 
export class Filesystem {
    // check whether file or directory exists
    static async exists(path: string): Promise<boolean> {
        try {
            fs.accessSync(path);

            return true;
        } catch (error) {
            return false;
        }
    }

    // check whether path is a file
    static async isFile(path: string): Promise<boolean> {
        try {
            let stat = fs.lstatSync(path);

            return stat.isFile();
        } catch (error) {
            return false;
        }
    }

    // check whether file is header file
    static isHeader(filePath: string): boolean {
        const headerExtensions = [".h", ".hpp", ".h++", ".hh"];
        return headerExtensions.some(headerExtension => filePath.endsWith(headerExtension));
    }

    static sourceExtName(headerExtName: string): string {
        if (headerExtName === ".hpp") {
            return ".cpp";
        } else if (headerExtName === ".h") {
            return ".c";
        }
        return ".cpp";
    }

    static headerExtName(sourceExtName: string): string {
        if (sourceExtName === ".cpp") {
            return ".hpp";
        } else if (sourceExtName === ".c") {
            return ".h";
        }
        return ".hpp";
    }

    static fileInfo(filePath: string): FileInfo {
        const fileInfo: FileInfo = {
            dir: '',
            headerName: '',
            headerExtName: '',
            sourceName: '',
            sourceExtName: '',
            fileName: ''
        };
        fileInfo.dir = path.dirname(filePath);
        if (Filesystem.isHeader(filePath)) {
            fileInfo.headerExtName = path.extname(filePath);
            fileInfo.fileName = path.basename(filePath, fileInfo.headerExtName);
            fileInfo.headerName = fileInfo.fileName + fileInfo.headerExtName;
            fileInfo.sourceExtName = Filesystem.sourceExtName(fileInfo.headerExtName);
            fileInfo.sourceName = fileInfo.fileName + fileInfo.sourceExtName;
            return fileInfo;
        }
        fileInfo.sourceExtName = path.extname(filePath);
        fileInfo.fileName = path.basename(filePath, fileInfo.sourceExtName);
        fileInfo.sourceName = fileInfo.fileName + fileInfo.sourceExtName;
        fileInfo.headerExtName = Filesystem.headerExtName(fileInfo.sourceExtName);
        fileInfo.headerName = fileInfo.fileName + fileInfo.headerExtName;
        return fileInfo;
    }

    // find header guard postion in file
    static findHeaderGuardLines(): Array<number> {
        const editor = window.activeTextEditor;
        if (editor === undefined) {
            return [];
        }
        const matchAll = (str: string, reg: RegExp) => {
            let res = [];
            let match;
            while (match = reg.exec(str)) {
                res.push(match);
            }
            return res;
        };

        const document = editor.document;
        const text = document.getText();
        const match1 = /^#ifndef\s+(\S+)\s*$/m.exec(text);
        const match2 = /^#define\s+(\S+)\s*$/m.exec(text);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const match3_block = /^#endif\s+\/\*\s+(\S+)\s*\*\/\s*$/m.exec(text);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const match3_line = /^#endif\s+\/\/\s+(\S+)\s*$/m.exec(text);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const tmpReg = /^#endif\s*$/gm;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        let match3_none = matchAll(text, tmpReg);

        let match3Index;
        let match3Macro;
        if (match3_block !== null) {
            match3Index = match3_block.index;
            match3Macro = match3_block[1];
        } else if (match3_line !== null) {
            match3Index = match3_line.index;
            match3Macro = match3_line[1];
        } else if (match3_none.length > 0) {
            match3Index = match3_none[match3_none.length - 1].index;
        } else {
            return [];
        }

        if (!match1 || !match2 || match3Index === undefined) {
            return [];
        }

        if (match1[1] !== match2[1]) {
            return [];
        }

        if (match3Macro !== undefined && match2[1] !== match3Macro) {
            return [];
        }

        if (match1.index > match2.index || match2.index > match3Index) {
            return [];
        }

        return [
            document.positionAt(match1.index).line,
            document.positionAt(match2.index).line,
            document.positionAt(match3Index).line,
        ];
    }
}