# Code Cat JetBrains preview: privacy notice

Code Cat is a local IDE plugin. It does not require a Code Cat account and does not send telemetry to a Code Cat server. This notice covers the JetBrains preview, not the independent privacy practices of your model provider or JetBrains.

When you ask an AI question, Code Cat may send your question, relevant project source excerpts, recent conversation, and selected debugger pause context to the model endpoint you configure. The current JetBrains preview sends the paused location and nearby source; it does not capture debugger variables or a complete call stack. Review the configured provider's terms and privacy policy before using it with confidential code. Do not send secrets in prompts or source that your provider may not receive.

Your model API key is stored in JetBrains PasswordSafe. The model protocol, base URL, model name, and Node.js path are stored in the IDE's project properties. Conversation history and captured source excerpts are stored in the IDE's local system directory under `code-cat/`, with the state file created with owner-only permissions where supported. The key is passed to Code Cat's local Node.js child process through standard input and held in memory for requests; it is not written to the conversation file. Code Cat does not run a local network server. Model requests go to the HTTPS endpoint you configure (or a local endpoint if explicitly configured).

To remove locally saved data, delete the project's Code Cat state file under the IDE system directory and clear the Code Cat credential in JetBrains PasswordSafe. The IDE and your configured model provider may retain their own logs or request data under their respective policies.

Source: [Code Cat on GitHub](https://github.com/Chengyunlai/code-cat). Privacy questions and bug reports: [GitHub issues](https://github.com/Chengyunlai/code-cat/issues).
