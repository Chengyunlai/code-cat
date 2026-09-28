"""Build against an installed IDE SDK, without changing its installation."""
import os, pathlib, subprocess, shutil, zipfile, json
root=pathlib.Path(__file__).resolve().parents[1]
ide=pathlib.Path(os.environ.get('CODE_CAT_JETBRAINS_HOME','/Applications/WebStorm.app/Contents'))
product=json.loads((ide/'Resources/product-info.json').read_text())
branch=product['buildNumber'].split('.')[0].split('-')[-1]
if branch not in ('251','261'): raise RuntimeError(f'Unverified JetBrains build branch: {branch}')
target=('pycharm' if product['productCode']=='PY' else 'webstorm')+'-'+branch
build_root=root/'plugins/jetbrains/build'
build=build_root/target
if build.exists(): shutil.rmtree(build)
classes=build/'classes'; classes.mkdir(parents=True)
classpath=os.pathsep.join(str(p) for folder in ('lib','plugins') for p in (ide/folder).rglob('*.jar'))
java=ide/'jbr/Contents/Home/bin/javac'
sources=list((root/'plugins/jetbrains/src/main/java').rglob('*.java'))
smoke=os.environ.get('CODE_CAT_JETBRAINS_SMOKE')=='1'
if smoke:sources.append(root/'test/jetbrains'/('PyCharmSmokeStartup.java' if target.startswith('pycharm') else 'SmokeStartup.java'))
subprocess.run([str(java),'-encoding','UTF-8','--release','21','-cp',classpath,'-d',str(classes),*[str(p) for p in sources]],check=True)
shutil.copytree(root/'plugins/jetbrains/src/main/resources',classes,dirs_exist_ok=True)
if smoke:
 descriptor=classes/'META-INF/plugin.xml'
 smoke_class='PyCharmSmokeStartup' if target.startswith('pycharm') else 'SmokeStartup'
 text=descriptor.read_text().replace('<toolWindow ', f'<postStartupActivity implementation="dev.codecat.{smoke_class}"/><toolWindow ')
 descriptor.write_text(text)
descriptor=classes/'META-INF/plugin.xml'
descriptor_text=descriptor.read_text().replace('since-build="251" until-build="251.*"',f'since-build="{branch}" until-build="{branch}.*"')
if target.startswith('webstorm'):descriptor_text=descriptor_text.replace('<depends>com.intellij.modules.platform</depends>','<depends>com.intellij.modules.platform</depends>\n  <depends>NodeJS</depends>')
descriptor.write_text(descriptor_text)
html=subprocess.check_output(['node','-e',"let h=require('./packages/ui/dist/runtimeMapHtml').createRuntimeMapHtml({cspSource: ''});process.stdout.write(h.replace(/(<script nonce=\"[^\"]+\">)/,'$1/* CODECAT_HOST_BRIDGE */'));"],cwd=root)
(classes/'codecat.html').write_bytes(html)
plugin=build/'code-cat';(plugin/'lib').mkdir(parents=True)
shutil.copy2(root/'LICENSE',plugin/'LICENSE')
with zipfile.ZipFile(plugin/'lib/code-cat.jar','w',zipfile.ZIP_DEFLATED) as jar:
 for p in classes.rglob('*'):
  if p.is_file():jar.write(p,p.relative_to(classes))
for name in ('core','engine'):
 shutil.copytree(root/f'packages/{name}/dist',plugin/f'packages/{name}/dist')
archive=build_root/f'code-cat-jetbrains-0.2.7-preview-{target}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as output:
 for p in plugin.rglob('*'):
  if p.is_file():output.write(p,p.relative_to(build))
print(archive)
