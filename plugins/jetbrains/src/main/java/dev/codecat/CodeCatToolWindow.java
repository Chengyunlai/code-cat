package dev.codecat;

import com.google.gson.*;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.*;
import com.intellij.ui.content.ContentFactory;
import com.intellij.ui.jcef.*;
import com.intellij.openapi.util.Disposer;
import javax.swing.*;

/** The IDE owns navigation and debugging; the local engine owns conversation state. */
public final class CodeCatToolWindow implements ToolWindowFactory {
  public void createToolWindowContent(Project project, ToolWindow window) {
    if (!JBCefApp.isSupported()) {
      window.getContentManager().addContent(ContentFactory.getInstance().createContent(
        new JLabel("Code Cat 需要支持 JCEF 的 JetBrains Runtime。"), "", false));
      return;
    }
    Host host = new Host(project);
    var content = ContentFactory.getInstance().createContent(host.browser.getComponent(), "", false);
    content.setDisposer(host);
    window.getContentManager().addContent(content);
  }
  static final class Host implements Disposable {
    final Project project;
    final JBCefBrowser browser = new JBCefBrowser();
    final JBCefJSQuery query = JBCefJSQuery.create((JBCefBrowserBase) browser);
    final EngineProcess engine;
    final IdeActions actions;
    Host(Project project) {
      this.project = project;
      Disposer.register(this, browser);
      Disposer.register(this, query);
      actions = new IdeActions(project, this);
      engine = new EngineProcess(project, this::receive);
      query.addHandler(raw -> {
        try {
          JsonObject request = JsonParser.parseString(raw).getAsJsonObject();
          if ("configureModel".equals(request.get("type").getAsString())) {
            ApplicationManager.getApplication().invokeLater(() -> actions.configure());
          } else engine.send(request);
        } catch (Exception error) { showError("操作未完成，请检查本地引擎是否已启动。"); }
        return null;
      });
      try {
        String html = new String(getClass().getResourceAsStream("/codecat.html").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        String bridge = "window.acquireVsCodeApi=()=>({postMessage:(message)=>{" + query.inject("JSON.stringify(message)") + "},getState:()=>null,setState:()=>{}});";
        html = html.replace("/* CODECAT_HOST_BRIDGE */", bridge).replace("<body>", "<body data-host=\"jetbrains\">");
        java.awt.Color background=com.intellij.openapi.editor.colors.EditorColorsManager.getInstance().getGlobalScheme().getDefaultBackground();
        java.awt.Color foreground=com.intellij.openapi.editor.colors.EditorColorsManager.getInstance().getGlobalScheme().getDefaultForeground();
        if(background!=null && foreground!=null) {
          String bg=String.format("#%06x",background.getRGB()&0xffffff);
          String fg=String.format("#%06x",foreground.getRGB()&0xffffff);
          boolean dark=background.getRed()+background.getGreen()+background.getBlue()<384;
          String colors=":root{--vscode-editor-background:"+bg+";--vscode-foreground:"+fg+";";
          if(dark)colors+="--vscode-list-hoverBackground:#353942;--vscode-codeCat-accentHover:#adcaff;--vscode-input-background:#2b2f36;--vscode-descriptionForeground:#b7bbc5;--vscode-widget-border:#4a4d55;--vscode-codeCat-accent:#91b7ff;--vscode-codeCat-onAccent:#17233b;--vscode-codeCat-inference:#c4afff;--vscode-codeCat-observed:#7cd8b2;--vscode-codeCat-uncertainty:#e7bd77;";
          html=html.replace("</head>","<style>"+colors+"}</style></head>");
        }
        browser.loadHTML(html);
        engine.start();

      } catch (Exception error) { showError("无法启动 Code Cat。请在更多 → 配置模型中设置 Node.js 的绝对路径。"); }
    }
    void receive(JsonObject message) {
      ApplicationManager.getApplication().invokeLater(() -> {
        if (project.isDisposed()) return;
        String method = message.get("method").getAsString();
        if ("view".equals(method)) browser.getCefBrowser().executeJavaScript("window.postMessage(" + message.get("params") + ", '*')", browser.getCefBrowser().getURL(), 0);
        else if ("host".equals(method)) actions.handle(message.getAsJsonObject("params"));
        else if ("error".equals(method)) showError(message.getAsJsonObject("params").get("message").getAsString());
        else if ("hello".equals(method)) { actions.configureEngine(); actions.observe(); }
      });
    }
    void showError(String message) { ApplicationManager.getApplication().invokeLater(() -> com.intellij.openapi.ui.Messages.showWarningDialog(project, message, "Code Cat")); }
    public void dispose() { engine.close(); }
  }
}
