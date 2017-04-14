# Template Literal Editor for VS Code

Open ES6 template literals and other configurable multi-line strings or heredocs in any language in a synced editor, with language support (HTML, CSS, SQL, shell, markdown etc).

Instructions:
- Install extension from VS Code
- Open JavaScript or TypeScript file, or a file in some other language if customized via "templateLiteralEditor.regexes" configuration. Many languages have a starter configuration for your convenience.
- Place cursor inside any template literal string and press Ctrl+Enter
- Select language (defaults to html)
- Outermost template literal range opens in the selected language in a side-by-side view, synced with the original. Multiple cursors and undo works as usual, and saving the template results in saving of the original document.
- Enjoy syntax highlighting, completions, formatting, commenting, snippets, your preferred editing extensions, etc!
- When you edit the original document the template editor is kept in sync, but if template boundaries are modified or a sync error happens, then the template literal editor is closed for safety.
- Close views by pressing Ctrl+Backspace, or via "Revert And Close Editor" action, to avoid unnecessary save dialogs.

## Releases

See [changelog](https://marketplace.visualstudio.com/items/plievone.vscode-template-literal-editor/changelog).

## Notes

This proof-of-concept-turned-into-useful-extension uses only public extension APIs and could be made quite a bit more polished if implemented in VS Code proper. There might be some unsupported edge cases (duplicating editors and moving them around, changing encodings and line endings) and unknown plugin interactions, but for ordinary use it is already a robust and helpful tool for reading and editing templates in different languages.

Note that creating and closing files in multiple editors is a bit poorly supported in extension API. Internally, Ctrl+Enter currently creates untitled documents. They are refocused when commanded to close, which causes tab flicker. Reloading VS Code results in stale template editors, as storing, iterating, detecting and closing stale editors can be error prone, so it is currently unimplemented, sorry about that. Would like to have sensible tab names and keep vieports and cursors in sync when requested, but those cannot be accomplished via the current extension API.

Developed on VS Code 1.11.0-insider on MacOS, as a personal tool, hoping something similar could be implemented properly with VS Code internals. Multiline strings could be focused in on many different host languages. It could be implemented as a side-by-side view similar to diff view, or as dimmed/highlighted layers on top of each other. For simplicity, the mapping is currently character-to-character, including line breaks. Also simple transformations, such as dealing with escapes, stripping whitespace or expanding whitespace with autoformatting, could be live mapped, but they may be best left for build tools and extensions working with template literals and template languages in question, and focus the feature on character-to-character document parts only.

MIT License. Feel free to use the code however you wish. You can find the code inside the extension package, TypeScript sources are included. There is no repo yet, but in the meantime you can send your greetings and bug reports via User Reviews on [Code Marketplace](https://marketplace.visualstudio.com/items?itemName=plievone.vscode-template-literal-editor).
