import { spawn } from 'node:child_process';
const projects=['packages/core','packages/ui','packages/engine','.'];
const children=projects.map(project=>spawn(process.execPath,['node_modules/typescript/bin/tsc','-p',`${project}/tsconfig.json`,'--watch'],{stdio:'inherit'}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of children)child.kill(signal);});
