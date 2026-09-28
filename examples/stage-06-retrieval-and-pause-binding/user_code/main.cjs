// 公开检索入口：普通 Node 即可运行，不需要安装任何 IDE。
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { extractRetrievalTerms } = require('../../../packages/core');
const { FileProject } = require('../../../packages/engine/dist/project');

/** 建一个最小项目：五个无关文件，一个权限文件。路径顺序让无关文件排在前面。 */
async function buildProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codecat-stage-06-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  for (const name of ['catalog', 'cart', 'invoice', 'order', 'payment']) {
    const symbol = `${name[0].toUpperCase()}${name.slice(1)}`;
    await fs.writeFile(
      path.join(root, `src/${name}.ts`),
      `export function load${symbol}() {\n  return "${name}";\n}\n`,
    );
  }
  await fs.writeFile(
    path.join(root, 'src/permission.ts'),
    'export function authorize(request) {\n  const permission = "admin";\n  return permission;\n}\n',
  );
  return root;
}

async function main() {
  const root = await buildProject();
  try {
    const project = new FileProject(root);
    const question = '权限是怎么检查的';

    console.log(`问题：${question}`);
    console.log(`问题里能直接提取的检索词：${JSON.stringify(extractRetrievalTerms(question))}`);

    const plain = await project.promptContext(question);
    console.log(`不带扩展词，permission.ts 进入摘录：${plain.includes('src/permission.ts:\n')}`);

    const expanded = await project.promptContext(question, ['authorize']);
    console.log(`带扩展词，permission.ts 进入摘录：${expanded.includes('src/permission.ts:\n')}`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
