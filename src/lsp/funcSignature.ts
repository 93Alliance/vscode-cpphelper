import { hasKey } from "../utils/utils";

const funcExt = "\n{\n}\n";

type Kind = 'Constructor' | 'Destructor' | 'StaticMember' | 'NormalMember' | 'NormalFunc' | 'NA';

interface FuncSignature {
    kind: Kind;
    rtnType: string;
    funcName: string;
    className: string;
    namespace: string;
    funcMain: string; // function name + parameter
}

export function extractFuncSignature(res: string): string {
    const result: FuncSignature = {
        kind: "NA",
        rtnType: "",
        funcName: "",
        className: "",
        funcMain: "",
        namespace: ""
    };

    const values: string[] = res.split("\n");
    const value = values[0];
    const cppRange = extractCppRange(res);
    result.funcName = value.substring(value.indexOf("`") + 1, value.length - 3);
    if (hasKey(value, "constructor")) {
        result.kind = 'Constructor';
        result.className = extractClassName(cppRange);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "static-method")) {
        result.kind = 'StaticMember';
        result.className = extractClassName(cppRange);
        result.rtnType = extractRtnType(cppRange, result.funcName);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "instance-method")) {
        result.kind = 'NormalMember';
        result.className = extractClassName(cppRange);
        result.rtnType = extractRtnType(cppRange, result.funcName);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "class")) {
        result.kind = 'Destructor';
        result.className = result.funcName;
        result.rtnType = "void";
    } else if (hasKey(value, "function")) {
        result.kind = 'NormalFunc';
        result.namespace = extractNormalFuncNamespace(cppRange);
        result.rtnType = extractRtnType(cppRange, result.funcName);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else {
        console.log("not supported ", value);
        return "";
    }

    return sig2str(result);
}

function sig2str(fg: FuncSignature): string {
    let result = '';
    switch (fg.kind) {
        case 'Constructor':
            result = "\n" + fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'Destructor':
            result = "\n" + fg.className + "::~" + fg.className + "()" + funcExt;
            break;
        case 'StaticMember':
            result = "\n" + fg.rtnType + " " + fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'NormalMember':
            result = "\n" + fg.rtnType + " " + fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'NormalFunc':
            const namespaceStr = fg.namespace === "" ? "" : fg.namespace + "::";
            result = "\n" + fg.rtnType + " " + namespaceStr + fg.funcMain + funcExt;
            break;
        default:
            break;
    }
    return result;
}

function extractCppRange(res: string): string {
    // find ```...```
    // 4 is ``` length + 1
    const start = res.lastIndexOf('```', res.length - 4);
    // 7 is ``` + cpp + \n
    return res.substring(start + 7, res.length - 4);
}

// // In SignalTower => SignalTower
function extractClassName(cppRange: string): string {
    const key = "// In";
    return cppRange.substring(cppRange.indexOf(key) + key.length + 1, cppRange.indexOf("\n"));
}

// // In namespace jet::handler => jet::handler
function extractNormalFuncNamespace(cppRange: string): string {
    const key = "// In namespace";
    const s = cppRange.indexOf(key);
    if (s === -1) {
        return "";
    }
    return cppRange.substring(s + key.length + 1, cppRange.indexOf("\n"));
}

// public: static void appendResponseFunc(int responseFunc)
// => void
function extractRtnType(cppRange: string, funcName: string): string {
    let result = '';
    if (hasKey(cppRange, "static")) {
        result = cppRange.substring(cppRange.indexOf("static") + 7, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "virtual")) {
        result = cppRange.substring(cppRange.indexOf("virtual") + 8, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "public:")) {
        result = cppRange.substring(cppRange.indexOf("public:") + 8, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "private:")) {
        result = cppRange.substring(cppRange.indexOf("private:") + 9, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "protected:")) {
        result = cppRange.substring(cppRange.indexOf("protected:") + 11, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "template<")) {
        result = '';
    } else { // global normal function
        let start = 0;
        if (hasKey(cppRange, "// In")) {
            start = cppRange.indexOf("\n") + 1;
        }
        result = cppRange.substring(start, cppRange.indexOf(funcName + "("));
        console.log(result);
    }
    return result;
}

// public: static void appendResponseFunc(int responseFunc)
// => appendResponseFunc(int responseFunc)
function extractFuncMain(cppRange: string, funcName: string): string {
    return cppRange.substring(cppRange.indexOf(funcName + "("));
}

