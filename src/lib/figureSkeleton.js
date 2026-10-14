// The body skeleton, drawn from the joints the native depth module confirms.
//
// Joints arrive named — nose, neck, lShoulder … rAnkle — and measured 0-1 from the
// top-left of the frame the investigator is looking at, so the same bones draw
// straight onto the Anomaly Camera's canvas and onto SIEG's camera pane: the caller
// only supplies the mapping for its own pane.
//
// A bone is drawn only when both of its joints were confirmed, so a partly visible
// body shows the limbs that were really found rather than a guessed frame.

export const SKELETON_BONES = [
  ['nose', 'neck'],
  ['neck', 'lShoulder'], ['neck', 'rShoulder'],
  ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'],
  ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
  ['lShoulder', 'lHip'], ['rShoulder', 'rHip'], ['lHip', 'rHip'],
  ['lHip', 'lKnee'], ['lKnee', 'lAnkle'],
  ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
];

export function hasSkeleton(figure) {
  return !!figure?.joints && Object.keys(figure.joints).length > 0;
}

// Draws a confirmed skeleton through `project`, which maps a normalised point to
// pane pixels. Stroked twice — a wide soft halo under a solid line — so the bones
// stay legible against the depth image.
export function drawFigureSkeleton(ctx, joints, project) {
  if (!joints) return;
  const segments = [];
  SKELETON_BONES.forEach(([a, b]) => {
    const pa = joints[a];
    const pb = joints[b];
    if (!pa || !pb) return;
    segments.push([project(pa), project(pb)]);
  });
  if (!segments.length) return;

  ctx.beginPath();
  segments.forEach(([p1, p2]) => { ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); });
  ctx.strokeStyle = 'rgba(51, 224, 255, 0.28)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#33e0ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Joints as nodes, so the shape reads as a body rather than a set of lines.
  ctx.fillStyle = '#33e0ff';
  Object.values(joints).forEach((joint) => {
    const p = project(joint);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2, 0, Math.PI * 2);
    ctx.fill();
  });
}