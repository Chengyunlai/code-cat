package dev.codecat;
import com.intellij.openapi.startup.StartupActivity;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.DumbService;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.execution.RunManager;
import com.intellij.execution.ProgramRunnerUtil;
import com.intellij.execution.executors.DefaultDebugExecutor;
import com.intellij.xdebugger.*;
import com.jetbrains.nodejs.run.*;
import java.nio.file.*;

/** Included only in the isolated smoke build, never in the distributed plugin. */
public class SmokeStartup implements StartupActivity.DumbAware {
 public void runActivity(Project project) {
  DumbService.getInstance(project).runWhenSmart(() -> ApplicationManager.getApplication().invokeLater(() -> {
   try {
    String root=project.getBasePath();
    com.intellij.ide.util.PropertiesComponent.getInstance(project).setValue("codecat.node",System.getProperty("codecat.smoke.node"));
    var host=new CodeCatToolWindow.Host(project);
    com.intellij.openapi.util.Disposer.register(project,host);
    var window=new javax.swing.JFrame("Code Cat · isolated validation");
    window.setContentPane(host.browser.getComponent());window.setSize(850,750);window.setVisible(true);
    com.intellij.openapi.util.Disposer.register(project,()->window.dispose());
    project.getMessageBus().connect(project).subscribe(XDebuggerManager.TOPIC,new XDebuggerManagerListener(){
     public void processStarted(XDebugProcess process){process.getSession().addSessionListener(new XDebugSessionListener(){public void sessionPaused(){
      var position=process.getSession().getTopFramePosition();
      if(position!=null && position.getFile().getName().equals("main.ts")) {
       var probe=host.query;
       final javax.swing.Timer[] timer=new javax.swing.Timer[1];
       probe.addHandler(raw -> {
        var data=com.google.gson.JsonParser.parseString(raw).getAsJsonObject();
        if(!data.has("smokeText"))return null;
        String text=data.get("smokeText").getAsString();
        try{Files.writeString(Path.of(System.getProperty("codecat.smoke.result")+".ui.txt"),text);}catch(Exception ignored){}
        if(text.contains("main.ts:3")) ApplicationManager.getApplication().invokeLater(() -> {
         timer[0].stop();
         try{Files.writeString(Path.of(System.getProperty("codecat.smoke.result")),"PASS real WebStorm TS pause and JCEF evidence rendering: "+position.getFile().getPath()+":"+(position.getLine()+1));}catch(Exception e){throw new RuntimeException(e);}
         process.getSession().resume();
        });
        return null;
       });
       timer[0]=new javax.swing.Timer(200,event -> host.browser.getCefBrowser().executeJavaScript(probe.inject("JSON.stringify({type:'renderedState',smokeText:document.body.innerText})"),host.browser.getCefBrowser().getURL(),0));
       timer[0].start();
      }
     }},project);}
    });
    var file=LocalFileSystem.getInstance().refreshAndFindFileByPath(root+"/main.ts");
    ApplicationManager.getApplication().runWriteAction(()->XDebuggerUtil.getInstance().toggleLineBreakpoint(project,file,2));
    var factory=NodeJsRunConfigurationType.getInstance();
    var settings=RunManager.getInstance(project).createConfiguration("Code Cat TS smoke",factory);
    var config=(NodeJsRunConfiguration)settings.getConfiguration();
    config.setMainScriptFilePath(root+"/other.js");config.setWorkingDirectory(root);config.setNodeInterpreter(System.getProperty("codecat.smoke.node"));
    RunManager.getInstance(project).setTemporaryConfiguration(settings);
    if(DebugLaunch.matches(settings,Path.of(root+"/main.ts")))throw new AssertionError("Different entry must not silently match");
    var targetSettings=DebugLaunch.copyForTarget(project,settings,Path.of(root+"/main.js"));
    if(!DebugLaunch.matches(targetSettings,Path.of(root+"/main.js")))throw new AssertionError("Copied entry must match");
    if(!DebugLaunch.entry(settings).endsWith("other.js"))throw new AssertionError("Original configuration must remain unchanged");
    RunManager.getInstance(project).setTemporaryConfiguration(targetSettings);
    DebugLaunch.start(project,Path.of(root+"/main.js"));
   }catch(Throwable e){try{Files.writeString(Path.of(System.getProperty("codecat.smoke.result")),"FAIL "+e);}catch(Exception ignored){}}
  }));
 }
}
