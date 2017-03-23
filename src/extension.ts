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

export function activate(_context: vscode.ExtensionContext) {

    vscode.commands.registerTextEditorCommand('editor.openSubdocument', editor => {
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
            vscode.window.showQuickPick(sorted, { placeHolder: 'Open Language Mode' }).then(language => {
                if (language) {
                    activateSubdocument(
                        language,
                        editor,
                        doc.positionAt(template!.getStart() + 1),
                        doc.positionAt(template!.getEnd() - 1),
                    ).catch(err => {
                        throw err;
                    });
                }
            });
        });
    });

    const activeDocuments = new Map<vscode.TextDocument, { dispose(reason: string): Promise<void> }>();

    async function activateSubdocument(language: string, editor: vscode.TextEditor, start: vscode.Position, end: vscode.Position) {
        // Only one subdocument per document allowed for simplicity
        if (activeDocuments.has(editor.document)) {
            await activeDocuments.get(editor.document)!.dispose('Subdocument closed. This virtual document can be closed.');
        }
        const doc = editor.document;
        activeDocuments.set(doc, { async dispose() { } });
        let templateRange = new vscode.Range(start, end);

        // Create subdocument with chosen language/extension. Uses an existing subdocument if available.
        // Could be made configurable depending on template tag, keybinding, etc.
        const filepath = doc.fileName + '.virtual.' + language;
        const subdoc = await vscode.workspace.openTextDocument(vscode.Uri.file(filepath).with({ scheme: 'untitled' }));
        // const subdoc = await vscode.workspace.openTextDocument({ language: 'html' });

        // Open editor in side by side view
        const subeditor = await vscode.window.showTextDocument(subdoc, editor.viewColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One);

        // Keep track of change origins. Only subdocument changes allowed. Initial edit need to be suppressed.
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
                    // try infer which template is which.
                    disposeSubdocument('Source document has been modified. This virtual editor can be closed.');
                }
            }
            if (change.document === subdoc) {
                // Suppress first edit.
                // NOTE: first edit may have gotten past happened, then this supresses first change.
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
            const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 10000, 10000))
            builder.replace(totalRange, doc.getText(templateRange));
        }, { undoStopBefore: false, undoStopAfter: true });

        // Move cursor to proper position
        const cursorPosition = editor.selection.active;
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

        /**
         * Handlers
         */

        const closeListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
            if (closedDoc === doc) {
                disposeSubdocument('Source document closed. This virtual document can be closed.');
            } else if (closedDoc === subdoc) {
                disposeSubdocument('Subdocument closed. This virtual document can be closed.');
            }
        });

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
                disposeSubdocument('Source document could not be synced with subdocument. This virtual editor can be closed.');
            }
        }, 100);

        async function disposeSubdocument(reason: string) {
            if (DEBUG) {
                console.log('DISPOSING: %s', reason);
            }
            changeOrigin = 'dispose';
            changeListener.dispose();
            closeListener.dispose();
            // No way to close the subeditor, other than deprecated editor.hide() method or using actions to close all editors.
            // Could show subeditor and then close it via command, but focus would need to be moved back to original editor.
            // this.editorService.closeEditor(position, input);
            if (vscode.workspace.textDocuments.indexOf(subdoc) >= 0) {
                let newSubeditor = await vscode.window.showTextDocument(subdoc, subeditor.viewColumn, /* preserveFocus */ true);
                try {
                    let ok = await newSubeditor.edit(builder => {
                        const totalRange = subdoc.validateRange(new vscode.Range(0, 0, 10000, 10000));
                        builder.replace(totalRange, reason || 'This virtual editor can be closed.');
                    });
                    if (!ok) {
                        throw new Error('Dispose edit could not succeed')
                    }
                } catch (err) {
                    if (DEBUG) {
                        console.log('DISPOSE ERR %s', err && err.stack || err);
                    }
                }
            }
            activeDocuments.delete(doc);
        }

        // We are ready, update disposer
        activeDocuments.set(doc, { dispose: disposeSubdocument });
    }
}
