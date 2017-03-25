'use strict';

import * as vscode from 'vscode';
import * as ts from 'typescript';
import throttle = require('lodash.throttle');

const DEBUG = false;

if (DEBUG) {
    process.on('unhandledRejection', (_p: Promise<any>, reason: any) => {
        console.log('UNHANDLED: %s', reason && reason.stack || reason);
    });
}

// Tracks all documents with open subdocuments
const activeDocuments = new Map<vscode.TextDocument, {
    closeActiveSubdocumentWithReason(reason: string): Promise<void>
}>();

export function activate(_context: vscode.ExtensionContext) {

    vscode.commands.registerTextEditorCommand('editor.openSubdocument', editor => {
        runCommand(editor, { createUntitled: true });
    });
    vscode.commands.registerTextEditorCommand('editor.openSubdocument.named', editor => {
        runCommand(editor, { createUntitled: false });
    });

    function runCommand(editor: vscode.TextEditor, options: { createUntitled: boolean }) {
        const doc = editor.document;
        if (doc.languageId !== 'typescript' && doc.languageId !== 'javascript') {
            return;
        }

        const cursorOffset = doc.offsetAt(editor.selection.active);
        const source = ts.createSourceFile(doc.fileName, doc.getText(), ts.ScriptTarget.Latest, true);

        // Find the outermost template literal
        let template: ts.TemplateLiteral | undefined;
        let token = (ts as any).getTokenAtPosition(source, cursorOffset);
        while (token) {
            if (token.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral || token.kind === ts.SyntaxKind.TemplateExpression) {
                template = token;
            }
            token = token.parent;
        }
        if (!template) {
            // Not inside any template literal
            return;
        }

        vscode.languages.getLanguages().then(languages => {
            // How to get proper language list, with icons etc?
            const sorted = ['html'].concat(languages.filter(lang => lang !== 'html'));
            vscode.window.showQuickPick(sorted, { placeHolder: 'Open in Language Mode' }).then(language => {
                if (language) {
                    activateSubdocument(
                        language,
                        editor,
                        doc.positionAt(template!.getStart() + 1),
                        doc.positionAt(template!.getEnd() - 1),
                        options.createUntitled,
                    ).catch(err => {
                        throw err;
                    });
                }
            });
        });
    }

    async function activateSubdocument(language: string, editor: vscode.TextEditor, start: vscode.Position, end: vscode.Position, createUntitled: boolean) {
        const doc = editor.document;
        // Keep track of document range where template literal resides
        let templateRange = new vscode.Range(start, end);

        // Calculate cursor position relative to viewport top for subdocument scroll to match
        const cursorPosition = editor.selection.active;
        // await vscode.commands.executeCommand('cursorMove', {
        //     to: 'viewPortTop'
        // });
        // const viewPortTopPosition = editor.selection.active;
        // // Move cursor back to where it was
        // await vscode.commands.executeCommand('cursorMove', {
        //     to: 'down',
        //     value: cursorPosition.line - viewPortTopPosition.line
        // });

        // Only one active subdocument per document allowed for simplicity.
        if (activeDocuments.has(doc)) {
            await activeDocuments.get(doc)!.closeActiveSubdocumentWithReason('Subdocument closed. This virtual document can be closed.');
        }
        activeDocuments.set(doc, { async closeActiveSubdocumentWithReason() { } });

        // Create subdocument with chosen language/extension. Always creates a new document for simplicity.
        // Could be made configurable depending on template tag, keybinding, etc.
        let _subdoc: vscode.TextDocument | undefined;

        if (!_subdoc) {
            if (createUntitled) {
                // This form is not in typescript definitions but is documented here https://code.visualstudio.com/docs/extensionAPI/vscode-api#workspace.openTextDocument
                // It always creates a new untitled file.
                _subdoc = await (vscode.workspace.openTextDocument as any)({ language }) as vscode.TextDocument;
            } else {
                // This works usually nicely, reusing the same subdocument for same source, but may give invalid document on some platforms?
                const filepath = doc.fileName + '.virtual.' + language; // Needs path too? Don't want to save it...
                // _subdoc = await vscode.workspace.openTextDocument(vscode.Uri.file(filepath).with({ scheme: 'untitled' })); // Not actually untitled as has a bogus filename
                // See https://github.com/Microsoft/vscode/issues/723#issuecomment-252411918
                _subdoc = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:/' + filepath)); // Not actually untitled as has a bogus filename, but helps keep track of tab names
            }
        }

        // Make typescript narrow the above happily
        const subdoc: vscode.TextDocument = _subdoc;

        // Open editor in side by side view
        const subeditor = await vscode.window.showTextDocument(subdoc, editor.viewColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One);

        // Keep track of change origins. Only subdocument changes allowed. Initial edit needs to be suppressed.
        let changeOrigin: 'activate' | 'subdocument' | 'dispose' | null = 'activate';

        // Install document change lister before first edit
        const changeListener = vscode.workspace.onDidChangeTextDocument(change => {
            // Suppress possible late edits
            if (changeOrigin === 'dispose') {
                return;
            }
            if (change.document === doc) {
                if (changeOrigin === 'subdocument') {
                    // Subdocument sync received, mark further edits as external
                    changeOrigin = null;
                } else {
                    // We don't track edits in original document, let's close
                    // subdocument for safety. We don't want to retokenize the document and
                    // try to infer which template is which.
                    closeSubdocumentWithReason('Source document has been modified. This virtual editor can be closed.');
                }
            }
            if (change.document === subdoc) {
                // Suppress first edit.
                if (changeOrigin === 'activate') {
                    changeOrigin = null;
                    return;
                }

                // We don't care about actual edits and partial templateRange synchronization,
                // just copy everything in case there are changes
                throttledDocumentSync();
            }
        });

        // Make first edit to the subdocument.
        await subeditor.edit(builder => {
            const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 100000, 100000))
            builder.replace(totalRange, doc.getText(templateRange));
        }, { undoStopBefore: false, undoStopAfter: true });

        // Move cursor to proper position
        // const cursorPosition = editor.selection.active;
        const cursorOnFirstLine = cursorPosition.line === templateRange.start.line;
        const cursorSubposition = new vscode.Position(
            cursorPosition.line - templateRange.start.line,
            Math.max(cursorPosition.character - (cursorOnFirstLine ? templateRange.start.character : 0), 0)
        )
        await vscode.commands.executeCommand('cursorMove', {
            to: 'down',
            value: cursorSubposition.line - subeditor.selection.active.line
        });
        await vscode.commands.executeCommand('cursorMove', {
            to: 'right',
            value: cursorSubposition.character - subeditor.selection.active.character
        });

        // // How to scroll subdocument to match document viewport?
        // await vscode.commands.executeCommand('revealLine', {
        //     lineNumber: cursorSubposition.line,
        //     at: 'top'
        // });
        // // Proper implementation would leave dead space at top, so that lines would be matched even for small documents
        // await vscode.commands.executeCommand('editorScroll', {
        //     to: 'up',
        //     by: 'line',
        //     value: cursorPosition.line - viewPortTopPosition.line,
        // });

        // Center viewport if possible, for now
        await vscode.commands.executeCommand('revealLine', {
            lineNumber: cursorSubposition.line,
            at: 'center'
        });

        /**
         * Handlers
         */

        const documentCloseListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
            if (closedDoc === doc) {
                closeSubdocumentWithReason('Source document closed. This virtual document can be closed.');
            }
        });
        const subdocumentCloseListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
            if (closedDoc === subdoc) {
                closeSubdocumentWithReason('Subdocument closed. This virtual document can be closed.');
            }
        });
        // These may prevent some sync issues, but may also annoy the user if they are unnecessary.
        // Unfortunately reloading the window won't trigger any listeners, and changing e.g. line endings are untested.
        // const configChangeListener = vscode.workspace.onDidChangeConfiguration(() => {
        //     disposeSubdocument('Workspace configuration changed. This virtual document can be closed.');
        // });
        // const optionsChangeListener = vscode.window.onDidChangeTextEditorOptions(({textEditor}) => {
        //     if (textEditor.document === doc || textEditor.document === subdoc) {
        //         disposeSubdocument('Document options changed. This virtual document can be closed.');
        //     }
        // });
        // It would be nice if saving the subdocument could be interrupted and the original would be saved instead.

        const throttledDocumentSync = throttle(async () => {
            try {
                // We have to always take a new reference to the editor, as it may have been hidden
                // and a new editor may need to be created.
                const newEditor = await vscode.window.showTextDocument(doc, editor.viewColumn, /* preserveFocus */ true);
                const editOk = await newEditor.edit(editBuilder => {
                    // We don't care about actual edits and partial templateRange synchronization,
                    // just copy everything in case there are changes

                    // Mark next edit as originating from subdocument. Does not consider multiple edits
                    // at the same time to both documents.
                    changeOrigin = 'subdocument';
                    editBuilder.replace(templateRange, subdoc.getText());
                    // We calculate new range based on subdoc size. Depends on both documents having the same config.
                    templateRange = new vscode.Range(
                        // Start row and col stay the same
                        templateRange.start.line,
                        templateRange.start.character,
                        // End row depends on subdoc line count
                        templateRange.start.line + subdoc.lineCount - 1,
                        // End col depends on whether there is only single line or more
                        (subdoc.lineCount === 1 ? templateRange.start.character : 0) + subdoc.lineAt(subdoc.lineCount - 1).range.end.character
                    )
                });
                if (!editOk) {
                    // If there are multiple edits, they may not succeed, and then templateRange will be out of sync. Better to fail then.
                    throw new Error('Sync did not succeed');
                }
            } catch (err) {
                if (DEBUG) {
                    console.log('SYNC ERROR %s', err && err.stack || err);
                }
                closeSubdocumentWithReason('Source document could not be synced with subdocument. This virtual editor can be closed.');
            }
        }, 100);

        async function closeSubdocumentWithReason(reason: string) {
            if (DEBUG) {
                console.log('DISPOSING: %s', reason);
            }
            changeOrigin = 'dispose';
            changeListener.dispose();

            documentCloseListener.dispose();
            subdocumentCloseListener.dispose();

            activeDocuments.delete(doc);

            // Experimental closing via action, moves focus so may pipe quick keypresses to wrong doc unfortunately
            await closeSubdocument(vscode.window.activeTextEditor);

            // Alternatively just mark the document as tainted.
            // await markSubdocumentAsTainted(reason);

            // TODO: perhaps there could be a status bar widget of some sort that would allow easy closing of subdocuments.
        }

        // async function markSubdocumentAsTainted(_reason: string) {
        //     if (vscode.workspace.textDocuments.indexOf(subdoc) >= 0) {
        //         try {
        //             let newSubeditor = await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ true);
        //             let ok = await newSubeditor.edit(builder => {
        //                 const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 100000, 100000));
        //                 // builder.replace(totalRange, reason || 'This virtual editor can be closed.');
        //                 // Return to empty document so that the document won't be marked as dirty and can be closed quickly.
        //                 builder.replace(totalRange, '');
        //             });
        //             if (!ok) {
        //                 throw new Error('Dispose edit could not succeed');
        //             }
        //         } catch (err) {
        //             if (DEBUG) {
        //                 console.log('DISPOSE ERR %s', err && err.stack || err);
        //             }
        //         }
        //     }
        // }

        // No proper way to close the subeditor, other than deprecated editor.hide() method or using actions to close editors.
        // This tries to show the subeditor and then close it via command. Needs to suppress save dialog by clearing the doc,
        // and focusing back to the original editor.
        // Internally just editorService.closeEditor(position, input).
        async function closeSubdocument(returnToEditor?: vscode.TextEditor) {
            if (vscode.workspace.textDocuments.indexOf(subdoc) >= 0) {
                try {
                    // TODO: subdocument may be visible in multiple editors, this closes just one of them.
                    let newSubeditor = await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ true);
                    let ok = await newSubeditor.edit(builder => {
                        const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 100000, 100000));
                        builder.replace(totalRange, ''); // Return to empty document to prevent save dialog
                    });
                    if (!ok) {
                        throw new Error('Dispose edit could not succeed')
                    }
                    // Move focus temporarily to subdocument. Do this here to minimize time for the focus to be in wrong doc as the user is typing.
                    await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ false);
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    // Move focus back to where it was
                    if (returnToEditor) {
                        await vscode.window.showTextDocument(returnToEditor.document, returnToEditor.viewColumn, /* preserveFocus */ false);
                    }
                } catch (err) {
                    if (DEBUG) {
                        console.log('DISPOSE ERR %s', err && err.stack || err);
                    }
                }
            }
        }

        // We are ready, update document disposer with current subdocument
        activeDocuments.set(doc, { closeActiveSubdocumentWithReason: closeSubdocumentWithReason });
    }
}

// Cleanup on exit
export async function deactivate(_context: vscode.ExtensionContext) {
    for (let handle of activeDocuments.values()) {
        await handle.closeActiveSubdocumentWithReason('Extension deactivated. This virtual document can be closed.');
    }
}
