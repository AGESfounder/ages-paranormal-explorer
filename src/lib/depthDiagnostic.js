// Depth-camera diagnostic tracker — captures the peak gate state during a
// native depth session (Anomaly Camera or SIEG) so the builder can investigate
// when the depth camera fails to acknowledge figures that are clearly there.
//
// One tracker per session. The frontend calls createDepthDiagTracker at session
// start, updateDepthDiag on every depth frame, and finalizeDepthDiag at session
// end to produce the record written to the DepthCameraDiagnostic entity.

export function createDepthDiagTracker(tool, sessionId, { protrusion, minHeight } = {}) {
  return {
    tool,
    sessionId,
    protrusion: protrusion ?? null,
    minHeight: minHeight ?? null,
    peakPose: 0,
    peakForm: 0,
    peakFigure: 0,
    maxHeight: 0,
    frameCount: 0,
    errorMessage: null,
  };
}

export function updateDepthDiag(tracker, { poseCount, formCount, figureCount, bodyHeight }) {
  if (!tracker) return;
  tracker.frameCount += 1;
  tracker.peakPose = Math.max(tracker.peakPose, poseCount || 0);
  tracker.peakForm = Math.max(tracker.peakForm, formCount || 0);
  tracker.peakFigure = Math.max(tracker.peakFigure, figureCount || 0);
  if (bodyHeight > 0) tracker.maxHeight = Math.max(tracker.maxHeight, bodyHeight);
}

export function setDepthDiagError(tracker, message) {
  if (tracker) tracker.errorMessage = message;
}

export function finalizeDepthDiag(tracker) {
  if (!tracker) return null;
  let outcome;
  let failureReason;
  if (tracker.errorMessage) {
    outcome = 'error';
    failureReason = tracker.errorMessage;
  } else if (tracker.frameCount === 0) {
    outcome = 'no_frames';
    failureReason = 'No depth frames received — the depth sensor never delivered data.';
  } else if (tracker.peakFigure > 0) {
    outcome = 'figures_detected';
    failureReason = null;
  } else if (tracker.peakPose === 0) {
    outcome = 'no_figures';
    failureReason = 'No body pose found — Vision never detected a human shape. The subject may need more light, or may be partially out of frame.';
  } else if (tracker.peakForm === 0) {
    outcome = 'no_figures';
    failureReason = 'No depth form found — ARKit found no connected depth form standing out from the background. The subject may be too close to the wall.';
  } else {
    outcome = 'no_figures';
    failureReason = 'Pose and form not overlapping — a body pose and a depth form were found but never overlapped in the same frame.';
  }
  return {
    tool: tracker.tool,
    session_id: tracker.sessionId,
    outcome,
    peak_pose_count: tracker.peakPose,
    peak_form_count: tracker.peakForm,
    peak_figure_count: tracker.peakFigure,
    max_body_height: tracker.maxHeight || null,
    protrusion: tracker.protrusion,
    min_height: tracker.minHeight,
    frame_count: tracker.frameCount,
    failure_reason: failureReason,
    occurred_at: new Date().toISOString(),
  };
}