# Template Literal Editor for VS Code

Open ES6 template literals and other configurable multi-line strings or heredocs in any language in a synced editor, with language support (HTML, CSS, SQL, shell, markdown etc).

Instructions:
- Install extension to VS Code.
- Open a JavaScript or TypeScript file, or a file in some other language if customized via "templateLiteralEditor.regexes" configuration. Many languages have a starter configuration included.
- Place cursor inside any template literal string and press Ctrl+Enter.
- Select language (defaults to html). Remembers the last selection as default.
- Outermost template literal range opens in the selected language in a side-by-side view, synced with the original. Multiple cursors and undo work as usual, and saving the template results in saving of the original document.
- Enjoy syntax highlighting, completions, formatting, commenting, snippets, your preferred editing extensions, etc!
- When you edit the original document the template editor is kept in sync. If template boundaries are modified or a sync error happens, then the template literal editor is closed for safety.
- Ctrl+Enter in the literal editor closes it and keeps the cursor position. Also ordinary close or "Revert And Close Editor" action should work without unnecessary save dialogs. There's also a Ctrl+Shift+Backspace shortcut to close all literal editors quickly, from any editor.

## Releases

See [changelog](https://marketplace.visualstudio.com/items/plievone.vscode-template-literal-editor/changelog).

## Notes

This proof-of-concept-turned-into-useful-extension uses only public extension APIs and could be made a bit more polished if implemented in VS Code proper. There might be some unsupported edge cases (duplicating editors and moving them around, changing encodings and line endings) and yet unknown plugin interactions, but otherwise it is already a robust and helpful tool for reading and editing templates in different languages.

Ctrl+Enter currently creates untitled documents in the selected language. Would like to have sensible tab names and keep viewports and cursors in a line-by-line sync when requested, but those cannot be accomplished via the current extension API. Otherwise the extension manages to workaround most API limits by a mix of custom flags, throttling, delays, and cursor commands when needed. There may be some visual glitches, such as tab flicker when editors need to be refocused when commanded to close, but the extension tries to minimize interruptions by restoring focus and cursor positions when possible. Reloading VS Code closes all template editors to avoid stale editors.

Developed on VS Code 1.11.0-insider on MacOS, as a personal tool, hoping something similar could be implemented with VS Code internals. Multiline strings could be focused in from many different host languages. It could be implemented as a side-by-side view similar to diff view, or as dimmed/highlighted layers on top of each other. For simplicity, the mapping is currently character-to-character, including line breaks. Also simple transformations, such as dealing with base indentation and escapes, stripping whitespace or expanding whitespace with autoformatting, could be live mapped, but they may be best left for build tools and extensions working with template literals and template languages in question, and focus the literal editing feature on character-to-character document parts only.

## Contributing

MIT license. Feel free to use the code however you wish. You can find the code inside the extension package, TypeScript sources are included. Public repository for pull requests and issue reporting is on GitHub [plievone/vscode-template-literal-editor](https://github.com/plievone/vscode-template-literal-editor). You can also send in your notes and greetings via User Reviews on [Code Marketplace](https://marketplace.visualstudio.com/items?itemName=plievone.vscode-template-literal-editor).

[![Installs](https://vsmarketplacebadge.apphb.com/installs/plievone.vscode-template-literal-editor.svg)](https://marketplace.visualstudio.com/items?itemName=plievone.vscode-template-literal-editor) [![Ratings](https://vsmarketplacebadge.apphb.com/rating/plievone.vscode-template-literal-editor.svg)](https://marketplace.visualstudio.com/items?itemName=plievone.vscode-template-literal-editor)
