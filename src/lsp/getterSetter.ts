import { fistLetterUpper, hasKey } from "../utils/utils";

// ### field `m_defaultVal`  
// ---
// Type: `std::any`  
// Offset: 80 bytes  
// Size: 16 bytes  
// ---
// ```cpp
// // In HandlerBinding
// private: std::any m_defaultVal {}
// ```

export type GetterSetterOption = 'Getter & Setter' | 'Getter' | 'Setter';

export interface MemberSignature {
    type: string;
    name: string;
    oriname: string;
    className: string;
    isBuiltin: boolean;
}

export interface GetterSetterSignature {
    declaration: string;
    definition: string;
}

export class GetterSetter {
    private readonly _hover;
    private readonly _ast;
    private readonly _extBuiltinTypes;
    private readonly _builtinTypes = ["std::size_t"];
    private memberSig: MemberSignature;

    constructor(hover: string, ast: any, extBuiltinTypes: string[]) {
        this._hover = hover;
        this._ast = ast;
        this._extBuiltinTypes = extBuiltinTypes;
        this.memberSig = {
            type: "",
            name: "",
            oriname: "",
            className: "",
            isBuiltin: false
        };
        this.extractMemberSignature(this._hover);
        this.checkBuiltin(this._ast);
    }

    public isBuiltin(): boolean {
        return this.memberSig.isBuiltin;
    }

    public getOptions(): string[] {
        // TODO: add filter option by active document
        return ['Getter & Setter', 'Getter', 'Setter'];
    }

    public toFuncSig(option: GetterSetterOption): GetterSetterSignature[] {
        // convert m_* to *, ex. m_name -> name
        let funcs: GetterSetterSignature[] = [];
        let sig = this.memberSig;
        if (sig.name === '' || sig.type === '') {
            return funcs;
        }

        let genGetter = () => {
            let func: GetterSetterSignature = {
                declaration: "",
                definition: ""
            };
            // definition
            if (this.memberSig.isBuiltin) {
                func.definition = `${sig.type} ${sig.className}::get${fistLetterUpper(sig.name)}() const`;
                // declaration
                func.declaration = `${sig.type} get${fistLetterUpper(sig.name)}() const;\n`;
            } else {
                func.definition = `const ${sig.type}& ${sig.className}::get${fistLetterUpper(sig.name)}() const`;
                func.declaration = `const ${sig.type}& get${fistLetterUpper(sig.name)}() const;\n`
            }
            // add implement
            func.definition += `\n{\n    return this->${sig.oriname};\n}\n`
            funcs.push(func);
        }

        let genSetter = () => {
            let param = "";
            const paramName = `new${fistLetterUpper(sig.name)}`;
            if (this.memberSig.isBuiltin) {
                param = `${sig.type} ${paramName}`;
            } else {
                param = `const ${sig.type}& ${paramName}`;
            }
            let func: GetterSetterSignature = {
                declaration: "",
                definition: ""
            };
            func.definition = `void ${sig.className}::set${fistLetterUpper(sig.name)}(${param})`;
            func.declaration = `void set${fistLetterUpper(sig.name)}(${param});\n`;
            func.definition += `\n{\n    this->${sig.oriname} = ${paramName};\n}\n`;
            funcs.push(func);
        }


        switch (option) {
            case 'Getter':
                genGetter();
                break;
            case 'Setter':
                genSetter();
                break;
            case 'Getter & Setter':
                genGetter();
                genSetter();
                break;
        }

        return funcs;
    }

    private extractMemberSignature(hover: string): void {
        const values: string[] = hover.split("\n");
        const value = values[0];
        if (hasKey(value, "field")) {
            this.memberSig.oriname = value.substring(value.indexOf("`") + 1, value.length - 3);
            if (this.memberSig.oriname.startsWith("m_")) {
                this.memberSig.name = this.memberSig.oriname.slice(2);
            } else {
                this.memberSig.name = this.memberSig.oriname;
            }
            for (const v of values) {
                if (hasKey(v, "Type: `")) {
                    this.memberSig.type = v.substring(v.indexOf("`") + 1, v.length - 3)
                    break;
                }
            }
            this.memberSig.className = this.extractClassName(hover);
        }
    }

    private extractClassName(hover: string): string {
        // find ```...```
        // 4 is ``` length + 1
        const start = hover.lastIndexOf('```', hover.length - 4);
        // 7 is ``` + cpp + \n
        const cppRange = hover.substring(start + 7, hover.length - 4);
        const key = "// In";
        return cppRange.substring(cppRange.indexOf(key) + key.length + 1, cppRange.indexOf("\n"));
    }

    private checkBuiltin(ast: any): void {
        if (ast && ast.children.length > 0 && ast.children[0].kind === "Builtin") {
            this.memberSig.isBuiltin = true;
            return
        }
        for (const bt of this._builtinTypes) {
            if (bt === this.memberSig.type) {
                this.memberSig.isBuiltin = true;
                return
            }
        }
        for (const bt of this._extBuiltinTypes) {
            if (bt === this.memberSig.type) {
                this.memberSig.isBuiltin = true;
                return
            }
        }
    }
}


