// The movement tier of the depth figure scan.
//
// A depth form plus a body pose already confirms a person-shaped body in the room.
// Movement makes that confirmation stronger: a tracked body whose skeleton actually
// travels between frames is doing something a static object cannot, so the figure is
// reported as MOVEMENT CONFIRMED on top of the base detection. The two tiers are
// additive — a form that stands perfectly still is still a figure, and a figure that
// moves is the same figure with its stronger label.
//
// Movement is measured from the joints the native module already reports, by
// comparing one body against itself in the previous frame (matched by the track id
// the sensor assigned): the mean joint travel per frame, as a fraction of the
// frame's height. Frames arrive about eight times a second, the cadence the pose
// reader runs at, so a wave moves the wrist a large fraction of the frame while an
// idle body only jitters.
//
// Nothing here is a paranormal claim: movement says the body in view is moving, not
// what it is. The investigator is in the room and knows whether they are the one
// moving.

// Mean joint travel per frame (as a fraction of frame height) that counts as
// movement. A wave clears this several times over; an idle body's jitter does not.
export const MOVEMENT_THRESHOLD = 0.012;
// How long a measured movement keeps the figure's movement confirmation up, so the
// label does not blink off between two frames of the same movement.
export const MOVEMENT_WINDOW_MS = 900;
// A body's travel is only judged when this many joints were confirmed in both
// frames: a couple of joints can agree by chance.
const MIN_SHARED_JOINTS = 3;

// Mean travel of the joints present in both readings. NaN when too few joints were
// seen twice — an unmeasurable frame is not a quiet one.
export function jointTravel(previousJoints, joints) {
  if (!previousJoints || !joints) return NaN;
  let total = 0;
  let shared = 0;
  for (const name of Object.keys(joints)) {
    const before = previousJoints[name];
    const after = joints[name];
    if (!before || !after) continue;
    total += Math.hypot(after[0] - before[0], after[1] - before[1]);
    shared += 1;
  }
  return shared >= MIN_SHARED_JOINTS ? total / shared : NaN;
}

// Each figure carries its own movement state, so the measurement always compares one
// body with itself rather than with whatever else is in view. The joints it is
// compared against travel with it, which is what lets the drawing show where a limb
// just was.
export function annotateFigureMotion(figures, previousFigures, now = Date.now()) {
  const tracked = new Map((previousFigures || [])
    .filter((figure) => figure.trackId != null)
    .map((figure) => [figure.trackId, figure]));
  return (figures || []).map((figure) => {
    const before = figure.trackId != null ? tracked.get(figure.trackId) : null;
    const motion = jointTravel(before?.joints, figure.joints);
    const movedNow = Number.isFinite(motion) && motion >= MOVEMENT_THRESHOLD;
    const lastMoveAt = movedNow ? now : (Number.isFinite(before?.lastMoveAt) ? before.lastMoveAt : 0);
    return {
      ...figure,
      previousJoints: before?.joints || null,
      motion,
      movedNow,
      lastMoveAt,
      movingUntil: lastMoveAt ? lastMoveAt + MOVEMENT_WINDOW_MS : 0,
    };
  });
}

// Whether this figure is still movement-confirmed, judged at paint time so the label
// expires on its own even if no further frame arrives.
export function figureIsMoving(figure, now = Date.now()) {
  return (figure?.movingUntil || 0) > now;
}

export function movingFigureCount(figures, now = Date.now()) {
  return (figures || []).filter((figure) => figureIsMoving(figure, now)).length;
}