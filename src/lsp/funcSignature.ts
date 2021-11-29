import { replaceAll } from "../utils/utils";

function hasKey(str: string, key: string): boolean {
    return str.indexOf(key) !== -1;
}

const funcExt = "\n{\n}\n";

type Kind = 'Constructor' | 'Destructor' | 'StaticMember' | 'NormalMember' | 'NormalFunc' | 'NA';

interface FuncSignature {
    kind: Kind;
    rtnType: string;
    funcName: string;
    className: string;
    funcMain: string; // function name + parameter
}

export function extractSignature(res: string): string {
    const result: FuncSignature = {
        kind: "NA",
        rtnType: "",
        funcName: "",
        className: "",
        funcMain: ""
    };

    const values: string[] = res.split("\n");
    const value = values[0];
    const cppRange = extractCppRange(res);
    result.funcName = value.substring(value.indexOf("`") + 1, value.length - 1);
    if (hasKey(value, "constructor")) {
        result.kind = 'Constructor';
        result.className = extractClassName(cppRange);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "static-method")) {
        result.kind = 'StaticMember';
        result.className = extractClassName(cppRange);
        result.rtnType = extractMemberRtnType(cppRange, result.funcName);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "instance-method")) {
        result.kind = 'NormalMember';
        result.className = extractClassName(cppRange);
        result.rtnType = extractMemberRtnType(cppRange, result.funcName);
        result.funcMain = extractFuncMain(cppRange, result.funcName);
    } else if (hasKey(value, "class")) {
        result.kind = 'Destructor';
        result.className = result.funcName;
        result.rtnType = "void";
    } else if (hasKey(value, "function")) {
        result.kind = 'NormalFunc';
        result.funcMain = cppRange.substring(cppRange.indexOf("\n") + 1);
        result.funcMain = replaceAll(result.funcMain, "static ", "");
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
            result = fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'Destructor':
            result = fg.className + "::~" + fg.className + "()" + funcExt;
            break;
        case 'StaticMember':
            result = fg.rtnType + " " + fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'NormalMember':
            result = fg.rtnType + " " + fg.className + "::" + fg.funcMain + funcExt;
            break;
        case 'NormalFunc':
            result = fg.funcMain + funcExt;
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
    return cppRange.substring(cppRange.indexOf("// In") + 6, cppRange.indexOf("\n"));
}

// public: static void appendResponseFunc(int responseFunc)
// => void
function extractMemberRtnType(cppRange: string, funcName: string): string {
    let result = '';
    if (hasKey(cppRange, "static")) {
        result = cppRange.substring(cppRange.indexOf("static") + 7, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "virtual")) {
        result = cppRange.substring(cppRange.indexOf("virtual") + 8, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "public:")) {
        result = cppRange.substring(cppRange.indexOf("public:") + 8, cppRange.indexOf(funcName + "(") - 1);
    } else if (hasKey(cppRange, "private:")) {
        result = cppRange.substring(cppRange.indexOf("private:") + 9, cppRange.indexOf(funcName + "(") - 1);
    }
    return result;
}

// public: static void appendResponseFunc(int responseFunc)
// => appendResponseFunc(int responseFunc)
function extractFuncMain(cppRange: string, funcName: string): string {
    return cppRange.substring(cppRange.indexOf(funcName + "("));
}

