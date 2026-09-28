package dev.codecat;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.intellij.ide.plugins.PluginManagerCore;
import com.intellij.openapi.extensions.PluginId;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.application.PathManager;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.function.Consumer;

/** A private stdio child. No HTTP listener; credentials are never command arguments. */
final class EngineProcess implements AutoCloseable {
  private final Project project;
  private final Consumer<JsonObject> receiver;
  private final Consumer<String> failure;
  private Process process;
  private Writer writer;
  private volatile String diagnostic="";
  private volatile boolean closed;
  private boolean failureReported;
  EngineProcess(Project project, Consumer<JsonObject> receiver, Consumer<String> failure) {
    this.project=project;this.receiver=receiver;this.failure=failure;
  }
  synchronized void start() throws IOException {
    if (process != null && process.isAlive()) return;
    closed=false;failureReported=false;diagnostic="";
    String node = resolveNode();
    var descriptor=PluginManagerCore.getPlugin(PluginId.getId("dev.codecat"));
    if (descriptor==null) throw new IOException("找不到 Code Cat 插件目录");
    Path plugin=descriptor.getPluginPath();
    Path engine=plugin.resolve("packages/engine/dist/main.js");
    if (!Files.isRegularFile(engine)) throw new IOException("插件内缺少本地引擎："+engine);
    String basePath=project.getBasePath();
    if (basePath==null || basePath.isBlank()) throw new IOException("当前项目没有可用路径");
    Path state=Path.of(PathManager.getSystemPath(),"code-cat",project.getLocationHash()+".json");
    process=new ProcessBuilder(node,engine.toString(),basePath,state.toString()).start();
    writer = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
    Process child=process;
    Thread reader = new Thread(() -> {
      try (var lines = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
        String line;
        while ((line=lines.readLine())!=null) {
          try { receiver.accept(JsonParser.parseString(line).getAsJsonObject()); }
          catch (RuntimeException error) { report("引擎返回了无法识别的消息"); }
        }
      } catch (IOException error) { if (!closed) report("读取本地引擎消息失败："+error.getMessage()); }
    }, "Code Cat engine");
    reader.setDaemon(true); reader.start();
    // Drain bounded diagnostic output without exposing prompts or credentials in IDE logs.
    Thread errors=new Thread(() -> {try (var stream=new BufferedReader(new InputStreamReader(child.getErrorStream(),StandardCharsets.UTF_8))) {
      String line;while((line=stream.readLine())!=null)diagnostic=line.length()>240?line.substring(0,240):line;
    }catch(IOException ignored){}},"Code Cat diagnostics");
    errors.setDaemon(true); errors.start();
    Thread watcher=new Thread(() -> {
      try {
        int exitCode=child.waitFor();
        if (!closed && exitCode!=0) report("本地引擎已退出（代码 "+exitCode+"）"+(diagnostic.isBlank()?"":"："+diagnostic));
      } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    },"Code Cat engine watcher");
    watcher.setDaemon(true); watcher.start();
  }
  private String resolveNode() throws IOException {
    PropertiesComponent properties=PropertiesComponent.getInstance(project);
    String saved=properties.getValue("codecat.node", "");
    String override=System.getenv("CODECAT_NODE");
    LinkedHashSet<Path> candidates=new LinkedHashSet<>();
    if(saved!=null && !saved.isBlank() && !saved.equals("node")) candidates.add(Path.of(saved));
    if(override!=null && !override.isBlank()) candidates.add(Path.of(override));
    String executable=System.getProperty("os.name"," ").toLowerCase(Locale.ROOT).contains("win")?"node.exe":"node";
    String path=System.getenv("PATH");
    if(path!=null) for(String directory:path.split(java.util.regex.Pattern.quote(File.pathSeparator)))
      if(!directory.isBlank()) candidates.add(Path.of(directory,executable));
    String home=System.getProperty("user.home");
    if(home!=null) {
      Path nvm=Path.of(home,".nvm","versions","node");
      if(Files.isDirectory(nvm)) try(var versions=Files.list(nvm)) {
        versions.filter(Files::isDirectory).sorted((left,right)->compareVersions(right.getFileName().toString(),left.getFileName().toString()))
          .forEach(version->candidates.add(version.resolve("bin/node")));
      } catch(IOException ignored) { }
      candidates.add(Path.of(home,".volta","bin",executable));
      candidates.add(Path.of(home,".asdf","shims",executable));
    }
    if(!executable.equals("node.exe")) {
      candidates.add(Path.of("/opt/homebrew/bin/node"));
      candidates.add(Path.of("/usr/local/bin/node"));
    }
    for(Path candidate:candidates) {
      if(candidate.getNameCount()>1 && (!Files.isRegularFile(candidate) || !Files.isExecutable(candidate))) continue;
      try {
        Process check=new ProcessBuilder(candidate.toString(),"--version").redirectErrorStream(true).start();
        if(!check.waitFor(3,java.util.concurrent.TimeUnit.SECONDS)){check.destroyForcibly();continue;}
        String version=new String(check.getInputStream().readAllBytes(),StandardCharsets.UTF_8).trim();
        if(check.exitValue()==0 && supportsEngine(version)) return candidate.toString();
      } catch(Exception ignored) { }
    }
    throw new IOException("未找到可用的 Node.js 20 或更高版本。请安装 Node.js 后重启 IDE；自定义安装位置可通过 CODECAT_NODE 指定。");
  }
  private static boolean supportsEngine(String version) {
    java.util.regex.Matcher match=java.util.regex.Pattern.compile("^v?(\\d+)").matcher(version);
    return match.find() && Integer.parseInt(match.group(1))>=20;
  }
  private static int compareVersions(String left,String right) {
    java.util.regex.Matcher a=java.util.regex.Pattern.compile("(\\d+)").matcher(left);
    java.util.regex.Matcher b=java.util.regex.Pattern.compile("(\\d+)").matcher(right);
    boolean hasA=a.find(),hasB=b.find();
    while(hasA || hasB) {
      int av=hasA?Integer.parseInt(a.group(1)):0;
      int bv=hasB?Integer.parseInt(b.group(1)):0;
      if(av!=bv)return Integer.compare(av,bv);
      hasA=a.find();hasB=b.find();
    }
    return left.compareTo(right);
  }
  synchronized void send(JsonObject message) {
    if (process==null) throw new IllegalStateException("引擎尚未启动");
    if (!process.isAlive()) throw new IllegalStateException("引擎已退出（代码 "+process.exitValue()+"）"+(diagnostic.isBlank()?"":"："+diagnostic));
    try { writer.write(message.toString()+"\n"); writer.flush(); }
    catch(IOException error) { throw new IllegalStateException("写入本地引擎失败："+error.getMessage(),error); }
  }
  public synchronized void close() {
    closed=true;
    if(process!=null) {try {writer.close();}catch(Exception ignored){} process.destroy();process=null;}
  }
  private synchronized void report(String message) {
    if (closed || failureReported) return;
    failureReported=true;failure.accept(message);
  }
}
