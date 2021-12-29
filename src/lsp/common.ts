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