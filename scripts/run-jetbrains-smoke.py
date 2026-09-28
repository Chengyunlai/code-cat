"""Isolated real JetBrains TS breakpoint smoke. Uses no user IDE settings or model key."""
import pathlib, os, shutil, subprocess, time, json
root=pathlib.Path(__file__).resolve().parents[1]
ide=pathlib.Path(os.environ.get('CODE_CAT_JETBRAINS_HOME','/Applications/WebStorm.app/Contents'))
product=json.loads((ide/'Resources/product-info.json').read_text())
branch=product['buildNumber'].split('.')[0].split('-')[-1]
is_pycharm=product['productCode']=='PY'
app_name='pycharm' if is_pycharm else 'webstorm'
target=f'{app_name}-{branch}'
sandbox=root/'.vscode-test'/target
for name in ('config','system','plugins','log','project'):(sandbox/name).mkdir(parents=True,exist_ok=True)
result=sandbox/'result.txt';result.unlink(missing_ok=True)
shutil.rmtree(sandbox/'project/.idea',ignore_errors=True)
shutil.rmtree(sandbox/'system/code-cat',ignore_errors=True)
subprocess.run(['python3',str(root/'scripts/build-jetbrains.py')],env={**os.environ,'CODE_CAT_JETBRAINS_SMOKE':'1'},check=True)
shutil.copytree(root/'plugins/jetbrains/build'/target/'code-cat',sandbox/'plugins/code-cat',dirs_exist_ok=True)
shutil.copyfile(root/'examples/stage-04-shared-core/user_code/inventory.ts',sandbox/'project/main.ts')
subprocess.run([str(root/'node_modules/.bin/tsc'),str(sandbox/'project/main.ts'),'--sourceMap','--target','es2022','--skipLibCheck','--types','node'],cwd=root,check=True)
opts=(ide/f'bin/{app_name}.vmoptions').read_text()
for key,folder in [('idea.config.path','config'),('idea.system.path','system'),('idea.plugins.path','plugins'),('idea.log.path','log')]:opts+=f'\n-D{key}={sandbox/folder}'
opts+='\n-Didea.trust.all.projects=true\n-Djb.consents.confirmation.enabled=false\n-Didea.initially.ask.config=false\n-Dide.show.tips.on.startup.default.value=false\n-Dcodecat.smoke.result='+str(result)+'\n-Dcodecat.smoke.node='+shutil.which('node')+'\n-Dcodecat.smoke.pycharm='+str(is_pycharm).lower()+'\n'
(sandbox/f'{app_name}.vmoptions').write_text(opts)
process=None
try:
 with (sandbox/'launch.log').open('w') as log:
  process=subprocess.Popen([str(ide/'MacOS'/app_name),str(sandbox/'project')],env={**os.environ,('PYCHARM_VM_OPTIONS' if is_pycharm else 'WEBIDE_VM_OPTIONS'):str(sandbox/f'{app_name}.vmoptions')},stdout=log,stderr=subprocess.STDOUT)
  deadline=time.monotonic()+50
  while time.monotonic()<deadline:
   if result.exists():
    text=result.read_text()
    if not text.startswith('PASS'):raise RuntimeError(text)
    if is_pycharm:
     print(text);break
    files=list((sandbox/'system/code-cat').glob('*.json'))
    if any('已记录观察：main.ts:3' in p.read_text() for p in files):
     print(text+'; shared engine persisted observation.');break
   time.sleep(.2)
  else:raise RuntimeError(f'{app_name} smoke timed out; inspect {sandbox}/log/idea.log')
finally:
 if process and process.poll() is None:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill()
 # Always leave the distributable free of the test startup activity.
 subprocess.run(['python3',str(root/'scripts/build-jetbrains.py')],env={**os.environ,'CODE_CAT_JETBRAINS_SMOKE':'0'},check=True)
