import { SessionState, SourceLocation } from "../domain/model";

export function shouldShowDebugEvidence(
  state: SessionState,
  hasBreakpoint: (location: SourceLocation) => boolean,
): boolean {
  if (state.pauses.length > 0) {
    return true;
  }
  return (
    state.route?.nodes
      .slice(0, state.revealedRouteNodeCount)
      .some((node) => hasBreakpoint(node.location)) ?? false
  );
}
