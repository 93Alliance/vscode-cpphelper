import { Range, TextEditor } from "vscode";

export interface FunctionSignature {
    declaration: string;
    definition: string;
}

export function findClassFromSymbol(symbol: any): any[] {
    const classSymbols: any[] = [];
    for (const ele of symbol) {
        // 5 is class, 23 is struct
        if (ele.kind === 5 || ele.kind === 23) {
            classSymbols.push(ele);
            if (ele.children && ele.children.length > 0) {
                const r = findClassFromSymbol(ele.children);
                if (r.length > 0) {
                    for (const v of r) {
                        classSymbols.push(v);
                    }
                }
            }
        } else {
            if (ele.children && ele.children.length > 0) {
                const r = findClassFromSymbol(ele.children);
                if (r.length > 0) {
                    for (const v of r) {
                        classSymbols.push(v);
                    }
                }
            }
        }
    }
    return classSymbols;
}

export function getClassSymbol(cs: any[], target: Range): any {
    const results: any[] = [];
    for (const c of cs) {
        if (target.start.line >= c.range.start.line && target.end.line <= c.range.end.line) {
            results.push({
                distance: target.start.line - c.range.start.line,
                target: c
            });
        }
    }
    if (results.length === 0) { return null; }

    let result: any = results[0];
    for (let index = 1; index < results.length; index++) {
        const element = results[index];
        if (element.distance < result.distance) {
            result = element;
        }
    }
    return result.target;
}

const PublicAccessRegx = new RegExp("^public(\\sslots)?:.*");
const PrivateAccessRegx = new RegExp("^private:.*");
const ProtectedAccessRegx = new RegExp("^protected:.*");

export function getPublicAccessRange(classSymbol: any, editor: TextEditor): Range {
    const classRange = classSymbol.range;
    let content = '';
    try {
        content = editor.document.getText(
            new Range(classRange.start.line, classRange.start.character, classRange.end.line, classRange.end.character)
        );
    } catch (error) {
        console.log(error);
    }

    const lines = content.split("\n");
    let publicMatch: any = null;
    const range = {
        start: { line: classRange.start.line, character: classRange.start.character},
        end: { line: classRange.end.line, character: classRange.start.character}
    };

    for (let i = 0; i < lines.length; i++) {
        const nline = lines[i].substring(classRange.start.character);
        // until matched public
        if (!publicMatch) {
            publicMatch = nline.match(PublicAccessRegx);
            range.start.line = classRange.start.line + i;
            continue;
        }
        // until match public or private or protected or empty
        if (nline.match(PublicAccessRegx) || nline.match(PrivateAccessRegx) || nline.match(ProtectedAccessRegx)) {
            range.end.line = classRange.start.line + i - 1;
            break;
        } 
    }

    if (!publicMatch) { // not found public
        range.start.line = classRange.start.line;
    }

    return new Range(range.start.line, range.start.character, range.end.line, range.end.character);
}