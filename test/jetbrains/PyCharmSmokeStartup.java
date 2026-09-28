package dev.codecat;

import com.intellij.openapi.startup.StartupActivity;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.DumbService;
import java.nio.file.Files;
import java.nio.file.Path;

/** Included only in the isolated PyCharm smoke build. */
public class PyCharmSmokeStartup implements StartupActivity.DumbAware {
  public void runActivity(Project project) {
    DumbService.getInstance(project).runWhenSmart(() -> ApplicationManager.getApplication().invokeLater(() -> {
      try {
        var host=new CodeCatToolWindow.Host(project);
        com.intellij.openapi.util.Disposer.register(project,host);
        var window=new javax.swing.JFrame("Code Cat · PyCharm validation");
        window.setContentPane(host.browser.getComponent());window.setSize(850,750);window.setVisible(true);
        com.intellij.openapi.util.Disposer.register(project,()->window.dispose());
        var ready=new com.google.gson.JsonObject();ready.addProperty("type","ready");host.engine.send(ready);
        Files.writeString(Path.of(System.getProperty("codecat.smoke.result")),"PASS PyCharm plugin loaded and engine accepted ready");
      }catch(Throwable error){try{Files.writeString(Path.of(System.getProperty("codecat.smoke.result")),"FAIL "+error);}catch(Exception ignored){}}
    }));
  }
}
