# Marketplace submission · Code Cat JetBrains preview

Use the built `build/code-cat-jetbrains-0.2.3-preview.zip`. Publish as a **free** plugin by the individual developer vendor; use the MIT license in the repository and the public source URL `https://github.com/Chengyunlai/code-cat`. This file is a submission worksheet, not evidence that Marketplace has accepted or published the plugin.

The English listing description and change notes are in `src/main/resources/META-INF/plugin.xml`. Add these resources in the Marketplace form if requested:

- Source: `https://github.com/Chengyunlai/code-cat`
- Documentation: `https://github.com/Chengyunlai/code-cat/blob/main/plugins/jetbrains/README.md`
- Privacy notice: `https://github.com/Chengyunlai/code-cat/blob/main/plugins/jetbrains/PRIVACY.md`
- Issue tracker: `https://github.com/Chengyunlai/code-cat/issues`
- License: MIT, `https://github.com/Chengyunlai/code-cat/blob/main/LICENSE`

Choose a preview/beta release channel if Marketplace offers it. The plugin declares build `251.*` and the NodeJS plugin dependency. Only WebStorm 2025.1.3 has been exercised end to end. Users need Node.js 20+ and their own model API key; local runtime is not bundled. The JetBrains host currently captures the pause location and source, not variables or a complete call stack. Do not describe it as verified across all JetBrains IDEs.
