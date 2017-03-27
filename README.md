# ES6 Template Literal Editor for VS Code

A quick proof-of-concept of opening ES6 template literals in a new editor, with language support (HTML, CSS, SQL etc).

Instructions: 
- Install extension from VS Code Marketplace
- Open JavaScript or TypeScript file
- Place cursor inside some template literal string and press Ctrl+Enter
- Select language (defaults to html).
- Outermost template literal range opens in the selected language in a side-by-side view, synced with the original.
- Enjoy syntax highlighting, tag completion, etc!
- If you edit the original document, the subeditor is closed or becomes tainted for safety and can be closed or reused.

This proof-of-concept uses public extension APIs and could be made quite a bit more polished if implemented in VS Code proper. There can be all kinds of edge cases and plugin interactions that haven't been accounted for, and closing/saving should be more convenient, but otherwise it is already a helpful tool for reading and editing templates in their embedded languages.

Note that creating and closing files in multiple editors is quite poorly supported in extensions. For this extension, Ctrl+Enter currently creates untitled documents. Ctrl+Shift+Enter creates unsaved documents with filenames, which may be broken on some platforms.

Developed on VS Code 1.11.0-insider on OS X, as a personal tool, hoping something similar will be implemented in VS Code.

MIT License. Feel free to use the code however you wish. You can find the code inside the extension package, TypeScript sources are included.

