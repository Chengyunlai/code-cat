import * as vscode from "vscode";
import { AiTutor as CoreTutor } from "../../packages/core/dist/ai/aiTutor";
import { ProjectIndex } from "../project/projectIndex";
import { ModelProviderService } from "./modelProviderService";
export { TutorGuidanceError } from "../../packages/core/dist/ai/aiTutor";
export type { TutorGuidanceCode, TutorQuestionResult } from "../../packages/core/dist/ai/aiTutor";

/** Bind the teaching core to VS Code's project and document services. */
export class AiTutor extends CoreTutor {
  constructor(index: ProjectIndex, provider: ModelProviderService) {
    super({
      readinessIssue: () => index.readinessIssue(),
      promptContext: question => index.promptContext(question),
      resolveFile: candidate => index.resolveFile(candidate),
      readSourceFile: async file => await vscode.workspace.openTextDocument(file),
    }, provider);
  }
}
