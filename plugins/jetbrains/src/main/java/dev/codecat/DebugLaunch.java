package dev.codecat;

import com.intellij.execution.RunManager;
import com.intellij.execution.RunnerAndConfigurationSettings;
import com.intellij.execution.ProgramRunnerUtil;
import com.intellij.execution.executors.DefaultDebugExecutor;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.Messages;
import java.nio.file.Path;

/** A selected run configuration is not evidence that it executes the requested file. */
final class DebugLaunch {
  static String entry(RunnerAndConfigurationSettings settings) {
    if(settings==null)return null;
    try {
      // Optional NodeJS plugin: use its public getter without making every IDE depend on NodeJS.
      Object value=settings.getConfiguration().getClass().getMethod("getMainScriptFilePath").invoke(settings.getConfiguration());
      return value instanceof String text && !text.isBlank()?text:null;
    }catch(ReflectiveOperationException ignored){return null;}
  }
  static boolean matches(RunnerAndConfigurationSettings settings,Path target) {
    String entry=entry(settings);
    if(entry==null||entry.isBlank())return false;
    try{return Path.of(entry).toRealPath().equals(target.toRealPath());}catch(Exception ignored){return false;}
  }
  static void start(Project project,Path target) throws Exception {
    RunManager manager=RunManager.getInstance(project);
    var selected=manager.getSelectedConfiguration();
    if(matches(selected,target)){run(selected);return;}
    var matching=manager.getAllSettings().stream().filter(setting->matches(setting,target)).toList();
    if(matching.size()==1){run(matching.get(0));return;}
    String current=entry(selected);
    String detail=current==null?"当前配置的执行入口无法确认。":"当前运行入口：\n"+current;
    String[] options=current!=null?new String[]{"调试目标文件", "选择已有配置", "仅放置断点"}:new String[]{"选择已有配置", "仅放置断点"};
    int choice=Messages.showDialog(project,"断点目标：\n"+target+"\n\n"+detail+"\n\n调试目标文件将沿用当前 Node 配置的解释器、加载器和参数。库文件应通过调用它的入口调试。","Code Cat · 选择调试入口",options,options.length-1,Messages.getQuestionIcon());
    if(current!=null && choice==0) {
      var settings=copyForTarget(project,selected,target);
      manager.setTemporaryConfiguration(settings);
      run(settings);
    } else if(choice==(current!=null?1:0)) {
      var settings=manager.getAllSettings();
      String[] labels=settings.stream().map(item->item.getName()+" — "+(entry(item)==null?item.getType().getDisplayName():entry(item))).toArray(String[]::new);
      if(labels.length==0){Messages.showInfoMessage(project,"断点已放置。请先创建能够调用该位置的 Debug 运行配置。","Code Cat");return;}
      int index=Messages.showChooseDialog(project,"选择会经过目标断点的运行入口","Code Cat",null,labels,labels[0]);
      if(index>=0)run(settings.get(index));
    }
  }
  static RunnerAndConfigurationSettings copyForTarget(Project project,RunnerAndConfigurationSettings selected,Path target) throws Exception {
      String current=entry(selected);
      if(current==null)throw new IllegalArgumentException("无法复制未知入口配置");
      var configuration=selected.getConfiguration().clone();
      configuration.setName("Code Cat · "+Path.of(project.getBasePath()).relativize(target));
      configuration.getClass().getMethod("setMainScriptFilePath",String.class).invoke(configuration,target.toString());
      String directory=(String)configuration.getClass().getMethod("getWorkingDirectory").invoke(configuration);
      if(directory!=null && Path.of(directory).normalize().equals(Path.of(current).getParent().normalize()))
        configuration.getClass().getMethod("setWorkingDirectory",String.class).invoke(configuration,target.getParent().toString());
      var settings=RunManager.getInstance(project).createConfiguration(configuration,configuration.getFactory());
      return settings;
  }
  private static void run(RunnerAndConfigurationSettings settings) {ProgramRunnerUtil.executeConfiguration(settings,DefaultDebugExecutor.getDebugExecutorInstance());}
}
