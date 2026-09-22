const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {FileProject}=require('../../packages/engine/dist/project');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'codecat-retrieval-'));
 try{
  await fs.mkdir(path.join(root,'src'),{recursive:true});
  await fs.mkdir(path.join(root,'examples'),{recursive:true});
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@agent-boot/core'}));
  for(let i=0;i<8;i++)await fs.writeFile(path.join(root,`examples/usage-${i}.ts`),'import { defineCapability } from "@agent-boot/core";\ndefineCapability({});\n');
  await fs.writeFile(path.join(root,'src/definition.ts'),'// unrelated preamble\n'.repeat(160)+'export function defineCapability<T>(value: T) {\n  const implementationEvidence = "local implementation";\n  return value;\n}\n');
  const result=await new FileProject(root).promptContext('我想了解一下：defineCapability');
  assert.ok(result.includes('@agent-boot/core => .'));
  assert.ok(result.includes('161: export function defineCapability'));
  assert.ok(result.includes('implementationEvidence'));
  assert.ok(result.indexOf('src/definition.ts:\n') < result.indexOf('examples/usage-0.ts:\n'));
  assert.ok(result.includes('NOT proof'));
  console.log('Retrieval passed: local package identity, exact declaration before 8 examples, body beyond line 160, partial coverage notice.');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
