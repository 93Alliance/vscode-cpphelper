import { commands, Disposable, languages, Position, Range, SnippetString, Uri, window, workspace, WorkspaceConfiguration, WorkspaceEdit } from 'vscode';
import { Filesystem } from './utils/filesystem';
import { disposeAll, fistLetterUpper, isOpenedInEditor, replaceAll } from './utils/utils';
import * as fs from 'fs';
import { LinkProvider } from './output/linkProvider';

export class Cpphelper implements Disposable {
    private _dispose: Disposable[] = [];

    public constructor() {
        // regist command
        this._dispose.push(commands.registerCommand('cpphelper.createHeaderGuard', this.createHeaderGuard, this));
        this._dispose.push(commands.registerCommand("cpphelper.createCppClass", (uri: Uri) => this.createClass(uri.fsPath)));
        this._dispose.push(commands.registerCommand('cpphelper.instertRegion', this.instertRegion));
        this._dispose.push(commands.registerCommand("cpphelper.createUnitTest", (uri: Uri) => this.createUnitTest(uri.fsPath)));

        // ouput log doc link
        let languagesIds: string[] = this.config().get<string[]>('linkFileLanguagesIds')!;
        let linkProvider = new LinkProvider();
        let outputLinkProvider = languages.registerDocumentLinkProvider(languagesIds, linkProvider);
        this._dispose.push(workspace.onDidChangeConfiguration((_e) => {
            outputLinkProvider.dispose();
            languagesIds = this.config().get('linkFileLanguagesIds')!;
            outputLinkProvider = languages.registerDocumentLinkProvider(languagesIds, linkProvider);
        }));

        this.autoAmendHeaderGuard();
    }

    public async dispose() {
        disposeAll(this._dispose);
    }

    // create header guard of file
    public async createHeaderGuard() {
        if (window.activeTextEditor && window.activeTextEditor.selection) {
            let fileName = window.activeTextEditor?.document.fileName;
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

    // insert region to selection
    public async instertRegion() {
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
                            window.showTextDocument(doc).then(this.createHeaderGuard)
                        );
                    }
                }
            }
        ));

        // rename
        this._dispose.push(workspace.onDidRenameFiles(event => {
            for (const renamedFile of event.files) {
                if (Filesystem.isHeader(renamedFile.newUri.fsPath) && isOpenedInEditor(renamedFile.newUri)) {
                    workspace.openTextDocument(renamedFile.newUri).then(_doc => {
                        const editor = window.activeTextEditor;
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
                            this.createHeaderGuard();
                        }
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
}