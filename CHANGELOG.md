Changelog:

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
