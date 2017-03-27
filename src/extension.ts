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
        runCommand(editor, { withoutFilename: true });
    });
    vscode.commands.registerTextEditorCommand('editor.openSubdocument.named', editor => {
        runCommand(editor, { withoutFilename: false });
    });

    function runCommand(editor: vscode.TextEditor, options: { withoutFilename: boolean }) {
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
                        options.withoutFilename,
                    ).catch(err => {
                        if (DEBUG) {
                            console.log('ACTIVATION ERROR: %s', err && err.stack || err)
                        }
                        throw err;
                    });
                }
            });
        });
    }

    async function activateSubdocument(language: string, editor: vscode.TextEditor, start: vscode.Position, end: vscode.Position, withoutFilename: boolean) {
        const doc = editor.document;
        // Keep track of document range where template literal resides
        let templateRange = new vscode.Range(start, end);

        // Calculate cursor position relative to viewport top for subdocument scroll to match
        // const cursorPosition = editor.selection.active;
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
            await activeDocuments.get(doc)!.closeActiveSubdocumentWithReason('Reloading.');
            if (withoutFilename) {
                // Add artificial delay, as otherwise the new document is not created for some reason. Perhaps there's a race condition and the new doc is destroyed immediately.
                await new Promise(resolve => {
                    setTimeout(() => {
                        resolve();
                    }, 100);
                });
            }
        }
        activeDocuments.set(doc, { async closeActiveSubdocumentWithReason() { } });

        // Create subdocument with chosen language/extension. "withoutFilename" version always creates a new untitled document,
        // the other version reuses the same document when languages match (and if the API works at all on Windows).
        // Reusing is a bit quicker, and won't flicker as much, but results in intertwined undo histories and a larger amount of stale editors.
        // Could be made configurable depending on template tag, keybinding, etc.
        let subdoc: vscode.TextDocument;

        if (withoutFilename) {
            // This form is not in typescript definitions but is documented here https://code.visualstudio.com/docs/extensionAPI/vscode-api#workspace.openTextDocument
            // It always creates a new untitled file.
            subdoc = await (vscode.workspace.openTextDocument as any)({ language }) as vscode.TextDocument;
        } else {
            // This works usually nicely, reusing the same subdocument for same source, but may give invalid document on some platforms?
            const filepath = doc.fileName + '.virtual.' + language; // Needs path too? Don't want to save it...
            subdoc = await vscode.workspace.openTextDocument(vscode.Uri.file(filepath).with({ scheme: 'untitled' })); // Not actually untitled as has a bogus filename, but helps keep track of tab names
            // See https://github.com/Microsoft/vscode/issues/723#issuecomment-252411918
            // _subdoc = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:/' + filepath)); // Not actually untitled as has a bogus filename, but helps keep track of tab names
        }

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
                    closeSubdocumentWithReason('Source document has been modified. This virtual editor can be closed.').catch(err => {
                        if (DEBUG) {
                            console.log('onDidChangeTextDocument error: %s', err && err.stack || err);
                        }
                    });
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
        await vscode.commands.executeCommand('cursorMove', {
            to: 'down',
            value: (editor.selection.active.line - templateRange.start.line) - subeditor.selection.active.line
        });
        await vscode.commands.executeCommand('cursorMove', {
            to: 'right',
            value: Math.max(
                editor.selection.active.character - (editor.selection.active.line === 0 ? templateRange.start.character : 0),
                0
            ) - subeditor.selection.active.character
        });

        // // How to scroll subdocument to match document viewport, and keep them in sync?
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
            lineNumber: subeditor.selection.active.line,
            at: 'center'
        });

        // const statusBarItem = vscode.window.createStatusBarItem();
        // statusBarItem.text = 'Currently open template editors $(file-code): sync scroll, close all, etc';
        // statusBarItem.show();

        // const decorationType = vscode.window.createTextEditorDecorationType({
        //     isWholeLine: true,
        //     backgroundColor: '#222'
        // })

        // Experiment with cursor syncing
        // vscode.window.onDidChangeTextEditorSelection(event => {
        //     if (event.textEditor === subeditor) {
        //
        //         (async() => {
        //
        //             // Experimental line highlighter (won't be native-like)
        //             // editor.setDecorations(
        //             //     decorationType, [
        //             //         new vscode.Range(
        //             //             templateRange.start.line + subeditor.selection.active.line, 0, templateRange.start.line + subeditor.selection.active.line, 1,
        //             //         )
        //             //     ]
        //             // )
        //
        //             // Experimental cursor sync (flickers)
        //             // await vscode.window.showTextDocument(doc, editor.viewColumn, /* preserveFocus */ false);
        //             // await vscode.commands.executeCommand('cursorMove', {
        //             //     to: 'down',
        //             //     value: (templateRange.start.line + subeditor.selection.active.line) - editor.selection.active.line
        //             // });
        //             // await vscode.commands.executeCommand('cursorMove', {
        //             //     to: 'right',
        //             //     value: (subeditor.selection.active.line === 0 ? templateRange.start.character : 0) +
        //             //         subeditor.selection.active.character - editor.selection.active.character
        //             // });
        //             // await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ false);
        //
        //         })().catch(err => {
        //             if (DEBUG) {
        //                 console.log('didChangeSelection error: %s', err && err.stack || err);
        //             }
        //             throw err;
        //         });
        //     }
        // })

        /**
         * Handlers
         */

        const documentCloseListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
            if (closedDoc === doc) {
                closeSubdocumentWithReason('Source document closed. This virtual document can be closed.').catch(err => {
                    if (DEBUG) {
                        console.log('documentCloseListener error: %s', err && err.stack || err);
                    }
                });
            }
        });
        const subdocumentCloseListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
            if (closedDoc === subdoc) {
                closeSubdocumentWithReason('Subdocument closed. This virtual document can be closed.').catch(err => {
                    if (DEBUG) {
                        console.log('subdocumentCloseListener error: %s', err && err.stack || err);
                    }
                });
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
                closeSubdocumentWithReason('Source document could not be synced with subdocument. This virtual editor can be closed.').catch(err => {
                    if (DEBUG) {
                        console.log('thottleDocumentSync error: %s', err && err.stack || err);
                    }
                });
            }
        }, 100);

        async function closeSubdocumentWithReason(reason: string) {
            try {
                if (DEBUG) {
                    console.log('DISPOSING: %s', reason);
                }
                changeOrigin = 'dispose';
                changeListener.dispose();

                documentCloseListener.dispose();
                subdocumentCloseListener.dispose();

                activeDocuments.delete(doc);

                if (withoutFilename) {
                    // Experimental closing via action, moves focus so may pipe quick keypresses to wrong doc unfortunately
                    await closeSubeditor(vscode.window.activeTextEditor);
                } else {
                    // Alternatively just mark the document as tainted, as it will ask to be saved otherwise.
                    await markSubdocumentAsTainted(reason);
                }

                // TODO: perhaps there could be a status bar widget of some sort that would allow easy closing of subdocuments.
            } catch (err) {
                if (DEBUG) {
                    console.log('closeSubdocumentWithReason error: %s', err && err.stack || err);
                }
                throw err;
            }
        }

        async function markSubdocumentAsTainted(reason: string) {
            if (vscode.workspace.textDocuments.indexOf(subdoc) >= 0) {
                try {
                    let newSubeditor = await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ true);
                    let ok = await newSubeditor.edit(builder => {
                        const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 100000, 100000));
                        builder.replace(totalRange, reason || 'This virtual editor can be closed.');
                    });
                    if (!ok) {
                        throw new Error('Dispose edit could not succeed');
                    }
                } catch (err) {
                    if (DEBUG) {
                        console.log('DISPOSE ERR %s', err && err.stack || err);
                    }
                }
            }
        }

        // No proper way to close the subeditor, other than deprecated editor.hide() method or using actions to close editors.
        // This tries to show the subeditor and then close it via command. Needs to suppress save dialog by clearing the doc,
        // and focusing back to the original editor.
        // Internally just editorService.closeEditor(position, input).
        async function closeSubeditor(returnToEditor?: vscode.TextEditor) {
            if (vscode.workspace.textDocuments.indexOf(subdoc) >= 0) {
                try {
                    // TODO: subdocument may be visible in multiple editors, this closes just one of them.
                    let newSubeditor = await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ true);
                    let ok = await newSubeditor.edit(builder => {
                        const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 100000, 100000));
                        builder.replace(totalRange, ''); // Return to initial state (empty document) to prevent save dialog
                    });
                    if (!ok) {
                        throw new Error('Dispose edit could not succeed')
                    }
                    // Move focus temporarily to subdocument. Do this here to minimize time for the focus to be in wrong doc as the user is typing.
                    await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ false);
                    // Artificial delay, to prevent "TextEditor disposed" warning (in Extension Development Host only).
                    await new Promise(resolve => {
                        setTimeout(() => {
                            resolve();
                        }, 0);
                    });
                    // NOTE! If the document was created "with filename, but untitled" it might always ask to be saved.
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

        // We are ready, update document disposer to proper one
        activeDocuments.set(doc, { closeActiveSubdocumentWithReason: closeSubdocumentWithReason });
    }
}

// Cleanup on exit. This does not seem to help when reloading workspace? Subdocuments cannot be cleared on exit?
export async function deactivate(_context: vscode.ExtensionContext) {
    try {
        for (let handle of activeDocuments.values()) {
            await handle.closeActiveSubdocumentWithReason('Extension deactivated. This virtual document can be closed.');
        }
    } catch (err) {
        if (DEBUG) {
            console.log('DEACTIVATE error: %s', err && err.stack || err);
        }
    }
}
