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
import java.util.function.Consumer;

/** A private stdio child. No HTTP listener; credentials are never command arguments. */
final class EngineProcess implements AutoCloseable {
  private final Project project;
  private final Consumer<JsonObject> receiver;
  private Process process;
  private Writer writer;
  EngineProcess(Project project, Consumer<JsonObject> receiver) { this.project=project; this.receiver=receiver; }
  synchronized void start() throws IOException {
    if (process != null && process.isAlive()) return;
    String node = PropertiesComponent.getInstance(project).getValue("codecat.node", "node");
    Path plugin = PluginManagerCore.getPlugin(PluginId.getId("dev.codecat")).getPluginPath();
    Path state = Path.of(PathManager.getSystemPath(), "code-cat", project.getLocationHash()+".json");
    process = new ProcessBuilder(node, plugin.resolve("packages/engine/dist/main.js").toString(), project.getBasePath(), state.toString()).start();
    writer = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8);
    Process child=process;
    Thread reader = new Thread(() -> {
      try (var lines = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
        String line;
        while ((line=lines.readLine())!=null) receiver.accept(JsonParser.parseString(line).getAsJsonObject());
      } catch (Exception ignored) { /* The host owns user-facing errors, never log model credentials. */ }
    }, "Code Cat engine");
    reader.setDaemon(true); reader.start();
    // Drain bounded diagnostic output without exposing prompts or credentials in IDE logs.
    Thread errors=new Thread(() -> {try {child.getErrorStream().transferTo(OutputStream.nullOutputStream());}catch(IOException ignored){}},"Code Cat diagnostics");
    errors.setDaemon(true); errors.start();
  }
  synchronized void send(JsonObject message) {
    if (process==null || !process.isAlive()) throw new IllegalStateException("Engine unavailable");
    try { writer.write(message.toString()+"\n"); writer.flush(); } catch(IOException error) {throw new IllegalStateException("Engine unavailable",error);}
  }
  public synchronized void close() {
    if(process!=null) {try {writer.close();}catch(Exception ignored){} process.destroy();process=null;}
  }
}
