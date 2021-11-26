import * as fs from 'fs';
import { window } from 'vscode';

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