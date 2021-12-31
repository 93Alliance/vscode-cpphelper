import { Range } from "vscode";

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