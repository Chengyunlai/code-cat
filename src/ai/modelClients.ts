import * as vscode from "vscode";
import { CancellationError, HttpModelRequest, requestHttpModel as requestCoreModel } from "../../packages/core/dist";
export type { HttpModelTransport, HttpModelRequest } from "../../packages/core/dist";

export async function requestHttpModel(request: HttpModelRequest, token: vscode.CancellationToken, onText?: (text: string) => void) {
  try { return await requestCoreModel(request, token, onText); }
  catch (error) {
    if (error instanceof CancellationError) throw new vscode.CancellationError();
    throw error;
  }
}
