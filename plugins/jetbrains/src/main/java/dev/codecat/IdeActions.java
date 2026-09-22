package dev.codecat;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.fileEditor.OpenFileDescriptor;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.ui.Messages;
import com.intellij.ide.passwordSafe.PasswordSafe;
import com.intellij.credentialStore.CredentialAttributes;
import com.intellij.credentialStore.Credentials;
import com.intellij.xdebugger.*;
import com.intellij.xdebugger.breakpoints.XLineBreakpoint;
import java.nio.file.Path;
import java.util.*;
import javax.swing.*;

final class IdeActions {
  private final Project project;
  private final CodeCatToolWindow.Host host;
  private final Set<XDebugSession> observed=Collections.newSetFromMap(new IdentityHashMap<>());
  private XDebugSession live;
  private boolean observing;
  private final Set<Object> ownedBreakpoints=Collections.newSetFromMap(new IdentityHashMap<>());
  IdeActions(Project project, CodeCatToolWindow.Host host) {this.project=project;this.host=host;}
  private CredentialAttributes credentials() {return new CredentialAttributes("Code Cat:"+project.getLocationHash());}
  void configure() {
    var properties=PropertiesComponent.getInstance(project);
    JTextField node=new JTextField(properties.getValue("codecat.node","node"));
    JTextField base=new JTextField(properties.getValue("codecat.base","https://ark.cn-beijing.volces.com/api/coding/v3"));
    JTextField model=new JTextField(properties.getValue("codecat.model",""));
    JComboBox<String> transport=new JComboBox<>(new String[]{"openai-chat","openai-responses","anthropic","gemini"});
    transport.setSelectedItem(properties.getValue("codecat.transport","openai-chat"));
    JPasswordField key=new JPasswordField();
    JPanel panel=new JPanel(new java.awt.GridLayout(0,1,4,4));
    panel.add(new JLabel("Node.js 可执行文件（推荐绝对路径）"));panel.add(node);
    panel.add(new JLabel("接口协议"));panel.add(transport);
    panel.add(new JLabel("Base URL"));panel.add(base);
    panel.add(new JLabel("模型名称"));panel.add(model);
    panel.add(new JLabel("API Key（留空保留，保存在系统密码库）"));panel.add(key);
    if(JOptionPane.showConfirmDialog(host.browser.getComponent(),panel,"配置 Code Cat",JOptionPane.OK_CANCEL_OPTION)!=JOptionPane.OK_OPTION)return;
    properties.setValue("codecat.node",node.getText().trim());properties.setValue("codecat.base",base.getText().trim());
    properties.setValue("codecat.model",model.getText().trim());properties.setValue("codecat.transport",(String)transport.getSelectedItem());
    char[] password=key.getPassword();
    String newSecret=password.length>0?new String(password):null;Arrays.fill(password,'\0');
    ApplicationManager.getApplication().executeOnPooledThread(() -> {
      try {
        if(newSecret!=null)PasswordSafe.getInstance().set(credentials(),new Credentials("api-key",newSecret));
        host.engine.close();host.engine.start();
      }catch(Exception error){host.showError("启动失败，请检查 Node.js 路径。需要 Node.js 20 或更高版本。");}
    });
  }
  void configureEngine() {
    var p=PropertiesComponent.getInstance(project);
    ApplicationManager.getApplication().executeOnPooledThread(() -> {
      String key=PasswordSafe.getInstance().getPassword(credentials());
      if(key==null)return;
      JsonObject config=new JsonObject();config.addProperty("transport",p.getValue("codecat.transport","openai-chat"));
      config.addProperty("baseUrl",p.getValue("codecat.base","https://ark.cn-beijing.volces.com/api/coding/v3"));
      config.addProperty("model",p.getValue("codecat.model",""));config.addProperty("apiKey",key);
      JsonObject request=new JsonObject();request.addProperty("method","configure");request.add("params",config);host.engine.send(request);
    });
  }
  void handle(JsonObject message) {
    try {
      switch(message.get("action").getAsString()) {
        case "configureModel":configure();break;
        case "openSource":location(message,false,false);break;
        case "breakpoint":location(message,true,false);break;
        case "startDebug":location(message,true,true);break;
        case "copyCode":com.intellij.openapi.ide.CopyPasteManager.getInstance().setContents(new java.awt.datatransfer.StringSelection(message.get("code").getAsString()));break;
        case "debugCommand":
          if(live==null || !live.isSuspended() || !id(live).equals(message.get("sessionId").getAsString()))return;
          switch(message.get("command").getAsString()){case "continue":live.resume();break;case "stepInto":live.stepInto();break;case "stepOver":live.stepOver(false);break;}break;
        case "history":
          JsonArray conversations=message.getAsJsonArray("conversations");
          String[] labels=new String[conversations.size()+1];labels[0]="＋ 新会话";for(int i=1;i<labels.length;i++)labels[i]=conversations.get(i-1).getAsJsonObject().get("title").getAsString();
          int choice=Messages.showChooseDialog(project,"选择要继续的会话","Code Cat",null,labels,labels.length>0?labels[0]:null);
          if(choice>=0){JsonObject request=new JsonObject();request.addProperty("type",choice==0?"newConversation":"switchConversation");if(choice>0)request.addProperty("id",conversations.get(choice-1).getAsJsonObject().get("id").getAsString());host.engine.send(request);}break;
      }
    }catch(Exception error){host.showError("操作未完成："+error.getMessage());}
  }
  private void location(JsonObject message,boolean breakpoint,boolean start) throws Exception {
    JsonObject location=message.getAsJsonObject("location");
    Path root=Path.of(project.getBasePath()).toRealPath();Path file=Path.of(location.get("path").getAsString()).toRealPath();
    if(!file.startsWith(root))throw new IllegalArgumentException("源码不在当前项目中");
    var virtual=LocalFileSystem.getInstance().refreshAndFindFileByNioFile(file);if(virtual==null)return;
    int line=location.get("line").getAsInt()-1;if(line<0)return;
    new OpenFileDescriptor(project,virtual,line,0).navigate(true);
    if(breakpoint) {
      var manager=XDebuggerManager.getInstance(project).getBreakpointManager();
      var existing=Arrays.stream(manager.getAllBreakpoints()).filter(value -> value instanceof XLineBreakpoint<?> b && b.getFileUrl().equals(virtual.getUrl()) && b.getLine()==line).findFirst();
      ApplicationManager.getApplication().runWriteAction(() -> {
        if(existing.isEmpty()) {
          XDebuggerUtil.getInstance().toggleLineBreakpoint(project,virtual,line);
          for(var value:manager.getAllBreakpoints())if(value instanceof XLineBreakpoint<?> b && b.getFileUrl().equals(virtual.getUrl()) && b.getLine()==line)ownedBreakpoints.add(value);
        } else if(!start && ownedBreakpoints.remove(existing.get())) manager.removeBreakpoint(existing.get());
      });
      syncBreakpoints();
    }
    if(start && (live==null || live.isStopped())) {
      DebugLaunch.start(project,file);
    }
  }
  private void syncBreakpoints() {
    JsonArray values=new JsonArray();
    for(var value:XDebuggerManager.getInstance(project).getBreakpointManager().getAllBreakpoints())if(value instanceof XLineBreakpoint<?> b && b.getSourcePosition()!=null){
      JsonObject item=new JsonObject();item.addProperty("path",b.getSourcePosition().getFile().getPath());item.addProperty("line",b.getLine()+1);item.addProperty("managed",ownedBreakpoints.contains(value));values.add(item);
    }
    JsonObject message=new JsonObject();message.addProperty("method","breakpoints");message.add("params",values);host.engine.send(message);
  }
  void observe() {
    if(observing){if(live!=null && live.isSuspended())capture(live);syncBreakpoints();return;}
    observing=true;
    project.getMessageBus().connect(host).subscribe(XDebuggerManager.TOPIC,new XDebuggerManagerListener(){public void processStarted(XDebugProcess process){attach(process.getSession());}});
    for(var session:XDebuggerManager.getInstance(project).getDebugSessions())attach(session);
  }
  private void attach(XDebugSession session) {
    if(!observed.add(session))return;
    live=session;
    sendState("started",session);
    session.addSessionListener(new XDebugSessionListener(){
      public void sessionPaused(){capture(session);}
      public void sessionResumed(){sendState("running",session);}
      public void sessionStopped(){sendState("ended",session);observed.remove(session);if(live==session)live=null;}
    },host);
    if(session.isSuspended())capture(session);
  }
  private String id(XDebugSession session){return Integer.toHexString(System.identityHashCode(session));}
  private void sendState(String method,XDebugSession session){JsonObject message=new JsonObject();message.addProperty("method",method);message.addProperty("sessionId",id(session));host.engine.send(message);}
  private void capture(XDebugSession session) {
    live=session;
    var position=session.getTopFramePosition();if(position==null)return;
    JsonObject location=new JsonObject();location.addProperty("path",position.getFile().getPath());location.addProperty("line",position.getLine()+1);location.addProperty("column",1);
    JsonObject frame=new JsonObject();frame.addProperty("id",1);frame.addProperty("name",session.getSessionName());frame.add("location",location);
    JsonArray frames=new JsonArray();frames.add(frame);
    JsonObject params=new JsonObject();params.addProperty("sessionId",id(session));params.add("frames",frames);params.add("variables",new JsonArray());
    params.addProperty("captureNote","JetBrains 预览版仅采集真实暂停位置和对应源码；变量与完整调用栈尚未接入，不能据此推断运行时值。");
    JsonObject message=new JsonObject();message.addProperty("method","observe");message.add("params",params);host.engine.send(message);
  }
}
