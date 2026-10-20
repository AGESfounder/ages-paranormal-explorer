// The body skeleton, drawn from the joints the native depth module confirms.
//
// Joints arrive named — nose, neck, lShoulder … rAnkle — and measured 0-1 from the
// top-left of the frame the investigator is looking at, so the same bones draw
// straight onto the Anomaly Camera's canvas and onto SIEG's camera pane: the caller
// only supplies the mapping for its own pane.
//
// A bone is drawn only when both of its joints were confirmed, so a partly visible
// body shows the limbs that were really found rather than a guessed frame.
//
// A body the movement tier has confirmed is drawn lit — a brighter line, bigger
// joints, and a short trail from where each moving limb just was — so the movement
// itself is visible, in the live view and in the recorded evidence alike.

import { MOVEMENT_THRESHOLD } from '@/lib/figureMotion';

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
export function drawFigureSkeleton(ctx, joints, project, { moving = false, previousJoints = null } = {}) {
  if (!joints) return;
  if (moving && previousJoints) drawMovementTrails(ctx, joints, previousJoints, project);
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
  ctx.strokeStyle = moving ? 'rgba(51, 224, 255, 0.5)' : 'rgba(51, 224, 255, 0.28)';
  ctx.lineWidth = moving ? 8 : 6;
  ctx.stroke();
  ctx.strokeStyle = moving ? '#eafeff' : '#33e0ff';
  ctx.lineWidth = moving ? 3.5 : 2.5;
  ctx.stroke();

  // Joints as nodes, so the shape reads as a body rather than a set of lines.
  ctx.fillStyle = moving ? '#eafeff' : '#33e0ff';
  Object.values(joints).forEach((joint) => {
    const p = project(joint);
    ctx.beginPath();
    ctx.arc(p[0], p[1], moving ? 2.9 : 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Where each moving limb just was: a thin line from a joint's previous position to
// the one it is at now, drawn only for the joints that actually travelled.
function drawMovementTrails(ctx, joints, previousJoints, project) {
  ctx.beginPath();
  let trails = false;
  Object.keys(joints).forEach((name) => {
    const before = previousJoints[name];
    const after = joints[name];
    if (!before || !after) return;
    if (Math.hypot(after[0] - before[0], after[1] - before[1]) < MOVEMENT_THRESHOLD) return;
    const from = project(before);
    const to = project(after);
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    trails = true;
  });
  if (!trails) return;
  ctx.strokeStyle = 'rgba(51, 224, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
}