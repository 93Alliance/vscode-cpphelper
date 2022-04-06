import { CompilerOutputer } from './output/compilerOutputer';
import { ClangdApi } from './lsp/clangd';
import {
    commands, Disposable, languages, Position, Range, SnippetString, TextDocument, Uri, ViewColumn, window, workspace,
    WorkspaceConfiguration, WorkspaceEdit
} from 'vscode';
import { FileInfo, Filesystem } from './utils/filesystem';
import { disposeAll, fistLetterUpper, openFile, replaceAll, space } from './utils/utils';
import { CmakeLinkProvider } from './output/cmakeLinkProvider';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractFuncSignature } from './lsp/funcSignature';
import { GetterSetter } from './lsp/getterSetter';
import { SpecialMember, SpecialMemberOptions } from './lsp/specialMember';

export enum FilePane {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Current,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Left,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Right
}

interface FileMapping {
    header: string[]
    source: string[]
    name: string
}

export class Cpphelper implements Disposable {
    private _dispose: Disposable[] = [];
    private _srvCwd: string;

    public constructor(private _clangd: ClangdApi) {
        const wss = workspace.workspaceFolders;
        if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
        this._srvCwd = wss[0].uri.fsPath;

        // regist command
        this._dispose.push(commands.registerCommand('cpphelper.createHeaderGuard', this.createHeaderGuard, this));
        this._dispose.push(commands.registerCommand("cpphelper.createCppClass", (uri: Uri) => this.createClass(uri.fsPath)));
        this._dispose.push(commands.registerCommand('cpphelper.insertRegion', this.insertRegion, this));
        this._dispose.push(commands.registerCommand("cpphelper.createUnitTest", (uri: Uri) => this.createUnitTest(uri.fsPath)));
        this._dispose.push(commands.registerCommand("cpphelper.switch", () => this.openCppFileInPane(FilePane.Current)));
        this._dispose.push(commands.registerCommand("cpphelper.switchRightPane", () => this.openCppFileInPane(FilePane.Right)));
        this._dispose.push(commands.registerCommand("cpphelper.switchLeftPane", () => this.openCppFileInPane(FilePane.Left)));
        this._dispose.push(commands.registerCommand("cpphelper.createFuncImpl", () => this.createFuncImplement()));
        this._dispose.push(commands.registerCommand("cpphelper.createGetterSetter", () => this.createGetterSetter()));
        this._dispose.push(commands.registerCommand("cpphelper.createSpecialMember", () => this.createSpecialMember()));

        // ouput log doc link
        const enableCmakeBuildDoclink = this.config().get<boolean>("cmakeBuildOutputDoclinkEnable")!;
        if (enableCmakeBuildDoclink) {
            let languagesIds: string[] = this.config().get<string[]>('linkFileLanguagesIds')!;
            let linkProvider = new CmakeLinkProvider();
            this._dispose.push(languages.registerDocumentLinkProvider(languagesIds, linkProvider));
        }
        const enableCmakeBuildFormat = this.config().get<boolean>("cmakeBuildOutputFormatEnable")!;
        if (enableCmakeBuildFormat) {
            let languagesIds: string[] = this.config().get<string[]>('linkFileLanguagesIds')!;
            let linkProvider = new CompilerOutputer();
            this._dispose.push(languages.registerDocumentLinkProvider(languagesIds, linkProvider));
        }

        this.autoAmendHeaderGuard();
        // strip compile command
        const compileCmdConfig: any = this.config().get("compileCommandsStrip");
        if (compileCmdConfig.enable) {
            var re = /\${workspaceFolder}/gi;
            const srcDbPath = compileCmdConfig.dir.replace(re, this._srvCwd) + "/compile_commands.json";
            const dstDbPath = compileCmdConfig.outputDir.replace(re, this._srvCwd) + "/compile_commands.json";
            // const dbPath = compileCmdConfig
            const dbWatcher = workspace.createFileSystemWatcher(srcDbPath, false, false, true);
            this._dispose.push(dbWatcher.onDidChange(_e => { // amend
                this.stripCompileCommands(srcDbPath, dstDbPath);
            }));
            this._dispose.push(dbWatcher.onDidCreate(_e => { // create
                this.stripCompileCommands(srcDbPath, dstDbPath);
            }));
        }
        // TODO: 如何解决换系统时不能及时更改？多测试一下。目前是手动删除build下和根目录下的command文件
    }

    public async dispose() {
        disposeAll(this._dispose);
    }

    // create function implement
    public async createFuncImplement() {
        const item: any = await this._clangd.hover();
        if (!item) { return; }
        if (!item.contents || item.contents.value === '') {
            return;
        }

        const funcSignature = extractFuncSignature(item.contents.value);
        if (funcSignature == "") {
            return;
        }
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }
        const uri = editor.document.uri;
        const fileInfo = Filesystem.fileInfo(uri.path);

        await this.insertSourceEnd(fileInfo, funcSignature);
    }

    // create getter and setter for member Variable
    public async createGetterSetter() {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }

        const ast: any = await this._clangd.ast();
        if (!ast || ast.kind != 'Field' || ast.role != 'declaration') { return; }
        const hover: any = await this._clangd.hover();
        if (!hover) { return; }
        if (!hover.contents || hover.contents.value === '') {
            return;
        }
        const symbol: any = await this._clangd.documentSymbol();
        if (!symbol) { return; }

        const gs = new GetterSetter(hover.contents.value, ast, symbol, editor);
        const options = gs.getOptions();
        if (options.length === 0) { return; }
        window.showQuickPick(gs.getOptions()).then(async (value: any) => {
            if (!value) {
                return;
            }

            const funcs = gs.toFuncSig(value);
            if (funcs.length === 0) {
                return;
            }

            const publicRange = gs.publicAccessRange();
            const spaceStr = space(publicRange.start.character + 4);

            let funcDeclarations = "";
            for (const funcSig of funcs) {
                funcDeclarations += spaceStr + funcSig.declaration;
            }

            // let selection = editor.selection;
            let uri = editor.document.uri;
            let editWs = new WorkspaceEdit();

            editWs.insert(
                uri,
                new Position(publicRange.end.line, 0),
                funcDeclarations
            );
            await workspace.applyEdit(editWs);

            if (value == 'Getter & Setter in cpp' ||
                value == 'Getter in cpp' ||
                value == 'Setter in cpp') {
                // header
                const fileInfo = Filesystem.fileInfo(uri.path);

                let funcDefinitions = "";
                for (const funcSig of funcs) {
                    funcDefinitions += funcSig.definition + "\n";
                }

                // source
                await this.insertSourceEnd(fileInfo, funcDefinitions);
            }
        })
    }

    // create class special member
    public async createSpecialMember() {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }

        // get cursor position
        const cursor = editor.selection.end;
        const symbol: any = await this._clangd.documentSymbol();
        if (!symbol) { return; }

        const sm = new SpecialMember(symbol, cursor, editor);
        if (!sm.isValid()) {
            window.showWarningMessage("Not found valid class!");
            return;
        }

        // if (!Filesystem.isHeader(editor.document.uri.fsPath)) {
        //     return;
        // }

        window.showQuickPick(SpecialMemberOptions, { canPickMany: true }).then(async (values: any) => {
            if (!values || values.length === 0) {
                return;
            }
            const funcs = sm.toFuncSig(values);
            if (funcs.length === 0) {
                return;
            }

            const publicRange = sm.publicAccessRange();
            let funcDeclarations = "";
            const spaceStr = space(publicRange.end.character + 4);
            for (const funcSig of funcs) {
                funcDeclarations += spaceStr + funcSig.declaration;
            }

            let editWs = new WorkspaceEdit();
            let uri = editor.document.uri;
            // start.line value is public position, change to next line
            editWs.insert(uri, new Position(publicRange.start.line + 1, 0), funcDeclarations);
            await workspace.applyEdit(editWs);

            const withoutImpl: boolean = this.config().get("createSpecialMemberWithImpl")!;
            if (withoutImpl) {
                // header ext
                const fileInfo = Filesystem.fileInfo(uri.path);
                let funcDefinitions = "";
                for (const funcSig of funcs) {
                    funcDefinitions += funcSig.definition + "\n";
                }

                await this.insertSourceEnd(fileInfo, funcDefinitions);
            }
        });
    }

    private async insertSourceEnd(fileInfo: FileInfo, content: string) {
        const sourceFile = fileInfo.dir + "/" + fileInfo.sourceName;
        let workspaceEdit = new WorkspaceEdit();
        workspaceEdit.createFile(Uri.file(sourceFile), { overwrite: false, ignoreIfExists: true });
        const result = await workspace.applyEdit(workspaceEdit);

        if (result) {
            return workspace.openTextDocument(sourceFile).then(async (doc: TextDocument) => {
                const textEditor = await window.showTextDocument(doc, 1, true);
                await textEditor.insertSnippet(new SnippetString("#include \"" + fileInfo.headerName + "\"\n"));
                return await textEditor.insertSnippet(
                    new SnippetString("\n" + content), textEditor.document.positionAt(textEditor.document.getText().length));
            });
        }
        if (window.activeTextEditor) {
            return workspace.openTextDocument(sourceFile).then(async (doc: TextDocument) => {
                const textEditor = await window.showTextDocument(doc);
                return await textEditor.insertSnippet(
                    new SnippetString("\n" + content), textEditor.document.positionAt(textEditor.document.getText().length));
            });
        }
        return;
    }

    public async stripCompileCommands(srcPath: string, dstPath: string) {
        try {
            // read config
            const dbConfig: any = this.config().get("compileCommandsStrip");
            let conf: any;
            if (os.platform() === "win32") {
                conf = dbConfig.windows;
            } else if (os.platform() === "linux") {
                conf = dbConfig.linux;
            } else {
                console.log("not supported platform ", os.platform());
                return;
            }

            const data = fs.readFileSync(srcPath, 'utf8').toString();
            if (data === "" || data === "\n") {
                return;
            }

            let compileCommands = JSON.parse(data);
            for (let i = 0; i < compileCommands.length; i++) {
                let element = compileCommands[i];
                for (let j = 0; j < conf.length; j++) {
                    let tc = conf[j];
                    const re = new RegExp(tc.match);
                    element.command = element.command.replace(re, tc.replace);
                }
            }
            let result = JSON.stringify(compileCommands);
            fs.writeFileSync(dstPath, result);
        } catch (error) {
            console.log(error);
        }
    }

    public async openCppFileInPane(pane: FilePane) {
        let fileName = await this.findCppFileNameMatchToCurrent();

        let viewColumn: any = null;
        let currentColumn = window.activeTextEditor!.viewColumn!;

        if (currentColumn === null) {
            currentColumn = ViewColumn.One;
        }

        switch (pane) {
            case FilePane.Current:
                viewColumn = currentColumn;
                break;
            case FilePane.Left:
                viewColumn = currentColumn - 1;
                break;
            case FilePane.Right:
                viewColumn = currentColumn + 1;
                break;
        }

        openFile(fileName, viewColumn);
    }

    // create header guard of file
    public async createHeaderGuard(fileName: string) {
        const headerGuard = this.genHeaderGuard(fileName);
        if (window.activeTextEditor) {
            window.activeTextEditor.insertSnippet(
                new SnippetString('\n#endif // ' + headerGuard),
                window.activeTextEditor.document.positionAt(window.activeTextEditor.document.getText().length)
            );
            window.activeTextEditor.insertSnippet(
                new SnippetString('#ifndef ' + headerGuard + '\n#define ' + headerGuard + '\n\n'),
                window.activeTextEditor.document.positionAt(0)
            );
        }
    }

    // create class file, xxx.hpp, xxx.cpp
    public async createClass(dir: string) {
        try {
            window.showInputBox({
                password: false, // 输入内容是否是密码
                ignoreFocusOut: false, // 默认false，设置为true时鼠标点击别的地方输入框不会消失
                placeHolder: '', // 在输入框内的提示信息
                prompt: 'Please input class name', // 在输入框下方的提示信息
                // validateInput: (text) => { return text; } // 对输入内容进行验证并返回
            }).then(async (className) => {
                if (className === undefined) {
                    return;
                }
                // 获取header guard
                const headerGuard = this.genHeaderGuard(className);
                // 创建文件
                const headerGuardExt: any = this.config().get<any>('classCreatorExtension');
                const headerFile = dir + "/" + className + headerGuardExt.header;
                const sourceFile = dir + "/" + className + headerGuardExt.source;

                if (await Filesystem.exists(headerFile)) {
                    window.showErrorMessage(`The ${className}.hpp already exists.`);
                } else {
                    let content = "#ifndef " + headerGuard + "\n" + "#define " + headerGuard + "\n";
                    content += this.genClassTemplate(className);
                    content += "\n#endif" + " // " + headerGuard + "\n";
                    fs.writeFileSync(headerFile, content, 'utf8');
                }

                if (await Filesystem.exists(sourceFile)) {
                    window.showErrorMessage(`The ${className}.cpp already exists.`);
                } else {
                    const content = "#include \"" + className + ".hpp" + "\"\n";
                    fs.writeFileSync(sourceFile, content, 'utf8');
                }
            }, (rej) => {
                console.log(rej);
            });
        }
        catch (err) {
            console.error(err);
        }
    }

    // create unit test file
    public async createUnitTest(dir: string) {
        try {
            window.showInputBox({
                password: false, // 输入内容是否是密码
                ignoreFocusOut: false, // 默认false，设置为true时鼠标点击别的地方输入框不会消失
                placeHolder: '', // 在输入框内的提示信息
                prompt: 'Please input file name', // 在输入框下方的提示信息
                // validateInput: (text) => { return text; } // 对输入内容进行验证并返回
            }).then(async (fileName) => {
                if (fileName === undefined) {
                    return;
                }
                fileName = fileName.toLowerCase();
                const sourceFile = dir + "/test_" + fileName + ".cpp";
                fs.access(sourceFile, fs.constants.F_OK, (err) => {
                    if (err) { // 不存在
                        const content = this.genUnitTestTemplate(fileName!); // 不可能为undefined
                        fs.writeFileSync(sourceFile, content, 'utf8');
                    } else {
                        window.showErrorMessage(`The test_${fileName}.cpp already exists.`);
                    }
                });
            });
        }
        catch (err) {
            console.error(err);
        }
    }

    public async createSubProject() {
        // try {
        //     let projectTypes = ["dynamic", "executable"];
        //     window.showQuickPick(projectTypes, { canPickMany: false }).then(async (values: any) => {
        //         if (!values || values.length === 0) {
        //             return;
        //         }
        //         window.showInputBox({
        //             password: false, // 输入内容是否是密码
        //             ignoreFocusOut: false, // 默认false，设置为true时鼠标点击别的地方输入框不会消失
        //             placeHolder: '', // 在输入框内的提示信息
        //             prompt: 'Please input project name', // 在输入框下方的提示信息
        //         }).then(async (className) => {
        //             if (className === undefined) {
        //                 return;
        //             }

        //         });
        //     });
        // }
        // catch (err) {
        //     console.error(err);
        // }
    }

    // insert region to selection
    public async insertRegion() {
        try {
            const editor = window.activeTextEditor;
            if (editor === undefined) {
                return;
            }
            let selection = editor.selection;
            let uri = editor.document.uri;
            let editWs = new WorkspaceEdit();
            let region: any = this.config().get<any>('region');
            editWs.insert(uri, selection.start, "\n" + region.start + "\n");
            editWs.insert(uri, selection.end, "\n" + region.end + "\n");
            workspace.applyEdit(editWs);
        }
        catch (err) {
            console.log(err);
        }
    }

    // auto amend header guard when file is created or file is rename
    private autoAmendHeaderGuard() {
        if (!this.config().get<boolean>('autoCreateHeaderGuard')) {
            return;
        }
        /*When adding a new header file, automatically invoke insertIncludeGuard() */
        this._dispose.push(workspace.onDidCreateFiles(
            async (event) => {
                for (const newFile of event.files) {
                    if (Filesystem.isHeader(newFile.fsPath)) {
                        workspace.openTextDocument(newFile).then(doc =>
                            window.showTextDocument(doc, 1, true).then((editor) => {
                                return this.createHeaderGuard(editor.document.fileName);
                            })
                        );
                    }
                }
            }
        ));

        // rename
        this._dispose.push(workspace.onDidRenameFiles(event => {
            for (const renamedFile of event.files) {
                if (Filesystem.isHeader(renamedFile.newUri.fsPath)) {
                    workspace.openTextDocument(renamedFile.newUri).then((doc) => {
                        window.showTextDocument(doc, 1, true).then((editor) => {
                            if (editor === undefined) {
                                return;
                            }
                            const linesToRemove = Filesystem.findHeaderGuardLines();
                            if (linesToRemove.length !== 0) {
                                editor.edit((edit) => {
                                    let fileName = window.activeTextEditor?.document.fileName;
                                    if (fileName === undefined) {
                                        return;
                                    }
                                    const headerGuard = this.genHeaderGuard(fileName);

                                    const directives = [
                                        "#ifndef " + headerGuard + "\n",
                                        "#define " + headerGuard + "\n",
                                        "#endif" + " // " + headerGuard + "\n",
                                    ];
                                    for (let i = 0; i < 3; ++i) {
                                        edit.replace(
                                            new Range(new Position(linesToRemove[i], 0), new Position(linesToRemove[i] + 1, 0)),
                                            directives[i]
                                        );
                                    }
                                });
                            } else {
                                this.createHeaderGuard(editor.document.fileName);
                            }
                        });
                    });
                }
            }
        }));
    }

    // get cpphelper config
    private config(): WorkspaceConfiguration {
        return workspace.getConfiguration('cpphelper');
    }

    // generate header guard string
    private genHeaderGuard(fileName: string): string {
        let name = fileName.replace(/^.*[\\\/]/, '').replace(/\.[^\.]+$/, '');
        let headerGuard: any = this.config().get<string>('headerGuardPattern');
        return headerGuard.replace('{FILE}', name.toUpperCase());
    }

    // generate class template string
    private genClassTemplate(className: string): string {
        let classTemplate: string = this.config().get<string>('classCreatorTemplate')!;
        return replaceAll(classTemplate, '${className}', className);
    }

    // generate unit test template
    private genUnitTestTemplate(fileName: string): string {
        let unitTestTemplate: string = this.config().get<string>('unitTestCreatorTemplate')!;
        return replaceAll(unitTestTemplate, '${fileName}', fistLetterUpper(fileName));
    }

    private async findCppFileNameMatchToCurrent() {
        let activeTextEditor = window.activeTextEditor!;
        let document = activeTextEditor.document;
        let fileName = await this.findCppFileNameMatchedFileAsync(document.fileName);
        return fileName;
    }

    private findCppFileNameMatchedFileAsync(currentFileName: string): Thenable<string> {
        let dir = path.dirname(currentFileName);
        let extension = path.extname(currentFileName);

        // If there's no extension, then nothing to do
        if (!extension) {
            // @ts-ignore
            return;
        }

        let fileWithoutExtension = path.basename(currentFileName).replace(extension, '');

        // Determine if the file is a header or source file.
        // @ts-ignore
        let extensions: string[] = null;

        let mappings = this.config().get<FileMapping[]>('headerSourceMappings')!;

        for (let i = 0; i < mappings.length; i++) {
            let mapping = mappings[i];

            if (mapping.header.indexOf(extension) !== -1) {
                extensions = mapping.source;
            }
            else if (mapping.source.indexOf(extension) !== -1) {
                extensions = mapping.header;
            }

            if (extensions) {
                console.log("Detected extension using map: " + mapping.name);
                break;
            }
        }

        if (!extensions) {
            console.log("No matching extension found");
            // @ts-ignore
            return;
        }

        let extRegex = "(\\" + extensions.join("|\\") + ")$";
        let newFileName = fileWithoutExtension;
        let found: boolean = false;

        // Search the current directory for a matching file
        let filesInDir: string[] = fs.readdirSync(dir).filter((value: string, _index: number, _array: string[]) => {
            return (path.extname(value).match(extRegex) !== undefined);
        });

        for (var i = 0; i < filesInDir.length; i++) {
            let fileName: string = filesInDir[i];
            let match = fileName.match(fileWithoutExtension + extRegex);
            if (match) {
                found = true;
                newFileName = match[0];
                break;
            }
        }

        if (found) {
            let newFile = path.join(dir, newFileName);
            return new Promise<string>((resolve, _reject) => {
                resolve(newFile);
            });
        }
        else {
            return new Promise<string>((resolve, reject) => {
                let promises = new Array<Promise<Uri[]>>();
                extensions.forEach(ext => {
                    promises.push(new Promise<Uri[]>(
                        (resolve, _reject) => {
                            workspace.findFiles('**/' + fileWithoutExtension + ext).then(
                                (uris) => {
                                    resolve(uris);
                                }
                            );
                        }));
                });

                Promise.all(promises).then(
                    (values: any[]) => {
                        if (values.length === 0) {
                            // @ts-ignore
                            resolve(null);
                            return;
                        }

                        values = values.filter((value: any) => {
                            return value && value.length > 0;
                        });

                        // flatten the values to a single array
                        let filePaths: any = [].concat.apply([], values);
                        filePaths = filePaths.map((uri: Uri, _index: number) => {
                            return path.normalize(uri.fsPath);
                        });

                        // Try to order the filepaths based on closeness to original file
                        filePaths.sort((a: string, b: string) => {
                            let aRelative = path.relative(currentFileName, a);
                            let bRelative = path.relative(currentFileName, b);

                            let aDistance = aRelative.split(path.sep).length;
                            let bDistance = bRelative.split(path.sep).length;

                            return aDistance - bDistance;
                        });

                        if (filePaths && filePaths.length > 0) {
                            resolve(filePaths[0]);
                        }
                        else {
                            reject('no paths matching');
                        }
                    }
                );
            });
        }
    }
}