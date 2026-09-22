// Inspect exactly the source evidence the JetBrains engine would send to a model.
// Usage: node inspect-project.cjs /path/to/project defineCapability
const fs = require('node:fs');
const { FileProject } = require('../../../packages/engine/dist/project');
const root = fs.realpathSync(process.argv[2] || __dirname);
const question = process.argv.slice(3).join(' ') || 'reserve';
new FileProject(root).promptContext(question).then(console.log).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
