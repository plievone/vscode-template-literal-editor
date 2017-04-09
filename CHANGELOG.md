Changelog:

- [2017-04-08] v0.5.0 - Now simply "Template Literal Editor", as any language can be enabled for literal editing via configuration. For example, default "templateLiteralEditor.regexes.coffeescript": "(\"\"\")([\\s\\S]*?)(\"\"\")" enables literal editing in CoffeeScript. Other language literal matchers can be customized for your needs, just remember that the regexp needs to be in an escaped string form and have exactly three capture groups without gaps. Matching literals with regexes is fragile and certainly won't cover all development needs, so JavaScript and TypeScript is still parsed by TypeScript parser by default as previously, to find only the proper literals and identify the outermost literal if there is nesting, commented code, etc. Enjoy!
- [2017-03-29] v0.4.1 - Added an icon to package.
- [2017-03-28] v0.4.0 - Ctrl+Backspace or Ctrl+Shift+Backspace closes open template editors quickly. Alternatively you can use "Revert and Close Editor" action.
- [2017-03-27] v0.3.2 - Fixes CHANGELOG.md link and formatting in README.md. Have a nice day!
- [2017-03-27] v0.3.1 - Adds use cases, changelog, and notes/caveats to README.md. This extension is maybe feature complete as a proof-of-concept for now until VS Code Extension API offers new opportunities. Typescript dependency is currently "^2.2.1", but it could be "next" too, if the need arises.
- [2017-03-25] v0.3.0 - Adds a 100 ms delay when reopening untitled templates (Ctrl+Enter), so reopening should work better. Templates with filenames (Ctrl+Shift+Enter) are a bit faster and easier to identify for those who can use them. Both have their caveats in terms of undo behavior, unnecessary save dialogs, stale editors when reloading, and platform support.
- [2017-03-24] v0.2.0 - Pushes extension API limits and closes stale template editors automatically by clearing them first (so save dialog does not appear), and then quickly giving them focus, so they can be closed via closeActiveEditor action. In some circumstances this may result in your keypresses diverting temporarily to wrong editor, so beware, but it can be worked with.
- [2017-03-24] v0.1.3 - Experiment with viewport scroll sync. Seems not possible from an extension, unfortunately.
- [2017-03-24] v0.1.2 - Clears stale editors so that they can be closed without a save dialog appearing. Unfortunately the empty editors can be a bit confusing now as the helpful message is gone.
- [2017-03-24] v0.1.1 - Reuses stale editors so that reopening a template won't always create a new untitled document.
- [2017-03-24] v0.1.0 - Ctrl+Enter now uses another way to create untitled documents, which may work better on some platforms. Previous way of creating named documents is now Ctrl+Shift+Enter, use which one works for you.
- [2017-03-24] v0.0.4 - Add SQL keyword to description
- [2017-03-23] v0.0.3 - Add typescript as a dependency proper
- [2017-03-23] v0.0.2 - Activate for js and ts
- [2017-03-23] v0.0.1 - Initial proof-of-concept release
