import { Position } from 'vscode';
import { findClassFromSymbol, FunctionSignature } from './common';

export const SpecialMemberOptions = [
    'constructor', 'destructor', 'copy constructor',
    'move constructor', 'copy assignment', 'move assignment'
];

export type SpecialMemberOption =
    'constructor' | 'destructor' |
    'copy constructor' | 'move constructor' |
    'copy assignment' | 'move assignment';

export class SpecialMember {
    private classSymbol: any;
    private className: string = '';
    constructor(symbol: any, pos: Position) {
        this.classSymbol = this.ownerClass(findClassFromSymbol(symbol), pos);
        if (this.classSymbol) {
            this.className = this.classSymbol.name;
        }
    }

    public isValid(): boolean {
        return this.className !== '';
    }

    public toFuncSig(options: SpecialMemberOption[]): FunctionSignature[] {
        let funcs: FunctionSignature[] = [];
        if (this.className === '') { return funcs; }

        for (const option of options) {
            switch (option) {
                case 'constructor':
                    funcs.push(this.cconstructor());
                    break;
                case 'destructor':
                    funcs.push(this.destructor());
                    break;
                case 'copy constructor':
                    funcs.push(this.copyConstructor());
                    break;
                case 'move constructor':
                    funcs.push(this.moveConstructor());
                    break;
                case 'copy assignment':
                    funcs.push(this.copyAssignment());
                    break;
                case 'move assignment':
                    funcs.push(this.moveAssignment());
                    break;
                default:
                    break;
            }
        }
        return funcs;
    }


    public cconstructor(): FunctionSignature {
        return {
            declaration: `${this.className}();\n`,
            definition: `${this.className}::${this.className}()\n{\n}\n`
        };
    }

    public destructor(): FunctionSignature {
        return {
            declaration: `virtual ~${this.className}();\n`,
            definition: `${this.className}::~${this.className}()\n{\n}\n`
        };
    }

    public copyConstructor(): FunctionSignature {
        return {
            declaration: `${this.className}(const ${this.className}& other);\n`,
            definition: `${this.className}::${this.className}(const ${this.className}& other)\n{\n}\n`
        };
    }

    public moveConstructor(): FunctionSignature {
        return {
            declaration: `${this.className}(${this.className}&& other) noexcept;\n`,
            definition: `${this.className}::${this.className}(${this.className}&& other) noexcept\n{\n}\n`
        };
    }

    public copyAssignment(): FunctionSignature {
        return {
            declaration: `${this.className}& operator=(const ${this.className}& other);\n`,
            definition: `${this.className}& ${this.className}::operator=(const ${this.className}& other)\n{\n}\n`
        };
    }

    public moveAssignment(): FunctionSignature {
        return {
            declaration: `${this.className}& operator=(${this.className}&& other) noexcept;\n`,
            definition: `${this.className}& ${this.className}::operator=(${this.className}&& other) noexcept\n{\n}\n`
        };
    }


    private ownerClass(cs: any[], target: Position): any {
        for (const c of cs) {
            if (target.line >= c.range.start.line && target.line <= c.range.end.line) {
                return c;
            }
        }
        return null;
    }
}