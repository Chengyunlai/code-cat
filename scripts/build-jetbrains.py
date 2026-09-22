"""Build against an installed 2025.1 IDE SDK, without changing its installation."""
import os, pathlib, subprocess, shutil, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
ide=pathlib.Path(os.environ.get('CODE_CAT_JETBRAINS_HOME','/Applications/WebStorm.app/Contents'))
build=root/'plugins/jetbrains/build'
if build.exists(): shutil.rmtree(build)
classes=build/'classes'; classes.mkdir(parents=True)
classpath=os.pathsep.join(str(p) for folder in ('lib','plugins') for p in (ide/folder).rglob('*.jar'))
java=ide/'jbr/Contents/Home/bin/javac'
sources=list((root/'plugins/jetbrains/src/main/java').rglob('*.java'))
smoke=os.environ.get('CODE_CAT_JETBRAINS_SMOKE')=='1'
if smoke:sources.append(root/'test/jetbrains/SmokeStartup.java')
subprocess.run([str(java),'-encoding','UTF-8','--release','21','-cp',classpath,'-d',str(classes),*[str(p) for p in sources]],check=True)
shutil.copytree(root/'plugins/jetbrains/src/main/resources',classes,dirs_exist_ok=True)
if smoke:
 descriptor=classes/'META-INF/plugin.xml'
 text=descriptor.read_text().replace('<depends>com.intellij.modules.lang</depends>','<depends>com.intellij.modules.lang</depends><depends>NodeJS</depends>').replace('<toolWindow ', '<postStartupActivity implementation="dev.codecat.SmokeStartup"/><toolWindow ')
 descriptor.write_text(text)
html=subprocess.check_output(['node','-e',"let h=require('./packages/ui/dist/runtimeMapHtml').createRuntimeMapHtml({cspSource: ''});process.stdout.write(h.replace(/(<script nonce=\"[^\"]+\">)/,'$1/* CODECAT_HOST_BRIDGE */'));"],cwd=root)
(classes/'codecat.html').write_bytes(html)
plugin=build/'code-cat';(plugin/'lib').mkdir(parents=True)
with zipfile.ZipFile(plugin/'lib/code-cat.jar','w',zipfile.ZIP_DEFLATED) as jar:
 for p in classes.rglob('*'):
  if p.is_file():jar.write(p,p.relative_to(classes))
for name in ('core','engine'):
 shutil.copytree(root/f'packages/{name}/dist',plugin/f'packages/{name}/dist')
archive=build/'code-cat-jetbrains-0.2.3-preview.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as output:
 for p in plugin.rglob('*'):
  if p.is_file():output.write(p,p.relative_to(build))
print(archive)
