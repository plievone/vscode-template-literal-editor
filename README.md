# ES6 Template Literal Editor for VS Code

A quick proof-of-concept of opening ES6 template literals in a new editor, with language support (default html).

Instructions: 
- Install extension from VS Code Marketplace
- Open JavaScript or TypeScript file
- Place cursor inside some template literal string and press Ctrl+Enter
- Select language (defaults to html).
- Outermost template literal range opens in the selected language in a side-by-side view, synced with the original.
- Enjoy syntax highlighting, tag completion, etc!
- If you edit the original document, the subeditor becomes tainted for safety and can be closed or opened again.

This proof-of-concept uses public apis and could be made quite a bit more polished if implemented in VS Code proper. There can be all kinds of edge cases that haven't been accounted for.

Developed on VS Code 1.11.0-insider, so may break on newer versions.

MIT License. Feel free to use the code however you wish. You can find the code inside the extension package, TypeScript sources are included.

