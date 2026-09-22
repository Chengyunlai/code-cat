import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProjectContext, SourceDocument } from "../../core/dist";
const sourceFile = /\.(py|[cm]?[jt]s|[jt]sx)$/iu;
const excluded = new Set([".git", ".idea", ".vscode", ".venv", "node_modules", "dist", "build", "__pycache__"]);

/** Node host adapter. All paths are resolved against this project's canonical root. */
export class FileProject implements ProjectContext {
  constructor(readonly root: string) {}
  async resolveFile(candidate: string): Promise<string | undefined> {
    if (!sourceFile.test(candidate) || path.isAbsolute(candidate) || candidate.split(/[\\/]/u).includes("..")) return undefined;
    return this.validateAbsolute(path.resolve(this.root, candidate));
  }
  async validateAbsolute(file: string): Promise<string | undefined> {
    try {
      const actual = await fs.realpath(file);
      const relative = path.relative(this.root, actual);
      if (relative.startsWith("..") || path.isAbsolute(relative) || !sourceFile.test(actual)) return undefined;
      return (await fs.stat(actual)).isFile() ? actual : undefined;
    } catch { return undefined; }
  }
  async files(): Promise<string[]> {
    const result: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, {withFileTypes:true});
      const priority=(name:string)=>["src","packages","lib","apps"].includes(name)?0:["examples","test","tests","docs","local-study"].includes(name)?2:1;
      entries.sort((a,b)=>priority(a.name)-priority(b.name)||a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (result.length >= 2001) return;
        if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
        const file = path.join(directory,entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (sourceFile.test(file)) result.push(file);
      }
    };
    await walk(this.root);
    return result.sort();
  }
  async readinessIssue() {
    return (await this.files()).length ? undefined : {kind: "no-source-files" as const, message: "当前项目没有支持的 Python / TS / JS 源码。"};
  }
  async readSourceFile(file: string): Promise<SourceDocument> {
    if (!await this.validateAbsolute(file)) throw new Error("Source is outside this project or unavailable");
    const lines = (await fs.readFile(file,"utf8")).split(/\r?\n/u);
    return {languageId: file.endsWith(".py") ? "python" : "typescript", lineCount:lines.length,
      lineAt: index => ({text:lines[index] ?? ""})};
  }
  async promptContext(question: string): Promise<string> {
    const scanned = await this.files();
    const files = scanned.slice(0,2000);
    const terms: string[] = question.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/gu) ?? [];
    const rows: {text:string;score:number}[] = [];
    const packages=new Map<string,string>();
    const directories=new Set<string>([this.root]);
    for(const file of files){let dir=path.dirname(file);while(dir.startsWith(this.root)&&dir!==this.root){directories.add(dir);dir=path.dirname(dir);}}
    for(const dir of directories){try{const manifest=JSON.parse(await fs.readFile(path.join(dir,"package.json"),"utf8"));if(typeof manifest.name==="string"&&!packages.has(manifest.name))packages.set(manifest.name,path.relative(this.root,dir)||".");}catch{/* No package declaration here. */}}
    const excerpts: {file:string; text:string; score:number}[] = [];
    for (const file of files) {
      if ((await fs.stat(file)).size > 500_000) continue;
      const source = await fs.readFile(file,"utf8");
      const relative = path.relative(this.root,file);
      const lines = source.split(/\r?\n/u);
      const declarations=lines.flatMap((line,index)=>{
        const match=/^\s*(?:(?:export|default|async|public|private|static|declare|abstract)\s+)*(?:def|class|function|interface|type|const|let)\s+([\w$]+)/u.exec(line);
        if(!match)return [];
        const score=terms.includes(match[1]!.toLowerCase())?100:0;
        rows.push({text:`${relative}:${index+1} ${line.trim().slice(0,240)}`,score});
        return [{index,score}];
      }).sort((a,b)=>b.score-a.score);
      const definition=declarations.find(item=>item.score>0);
      const mention=lines.findIndex(line=>terms.some(term=>line.toLowerCase().includes(term)));
      const start=Math.max(0,(definition?.index ?? Math.max(0,mention))-3);
      excerpts.push({file:relative,score:(definition?100:0)+terms.reduce((score,term)=>score+(source.toLowerCase().includes(term)?1:0),0),text:lines.slice(start,start+85).map((line,index)=>`${start+index+1}: ${line}`).join("\n").slice(0,7000)});
    }
    return [`Local package identities (imports may refer to this repository itself):\n${[...packages].map(([name,dir])=>`${name} => ${dir}`).join("\n")}`,
      `Index coverage: ${files.length} source files; ${scanned.length>2000?"file limit reached, partial scan":"supported source scan completed"}. Excludes generated output, dependencies and symlinks; source excerpts are partial. Missing context is NOT proof that an implementation is absent.`,
      `Source files:\n${files.map(file=>path.relative(this.root,file)).join("\n")}`,
      `Symbols (declaration scan, not a complete call graph):\n${rows.sort((a,b)=>b.score-a.score).slice(0,600).map(row=>row.text).join("\n")}`,
      ...excerpts.sort((a,b)=>b.score-a.score).slice(0,4).map(item=>`${item.file}:\n${item.text}`)].join("\n\n");
  }
}
