// Shared IR/anomaly figure-detection logic used by the SLS Camera and the
// Yes/No/IDK, Alphabet, and Term Sweepers' camera triggers. Detects
// humanoid-shaped skin-tone regions in a frame and returns bounding boxes.
//
// Sensitivity levels (1–4) adjust detection strictness for different lighting:
//   1 = Daylight (least sensitive — bright/outdoor use)
//   2 = Indoor
//   3 = Dim
//   4 = Dark   (most sensitive — night investigations; the original default)

export const JOINT_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3],
  [2, 5], [5, 6], [6, 7],
  [2, 8], [8, 9], [9, 10],
  [3, 11], [11, 12], [12, 13],
  [3, 14], [14, 15], [15, 16],
];

export const BASE_SKELETON = [
  [0.5, 0.0],   [0.5, 0.13],  [0.5, 0.25],  [0.5, 0.55],  [0.5, 1.0],
  [0.35, 0.25], [0.22, 0.42], [0.12, 0.58],
  [0.65, 0.25], [0.78, 0.42], [0.88, 0.58],
  [0.40, 0.55], [0.38, 0.75], [0.36, 0.98],
  [0.60, 0.55], [0.62, 0.75], [0.64, 0.98],
];

// Per-level detection parameters. Higher levels = more permissive (darker envs).
// rMinusG = red-green saturation gap (skin has strong red dominance over green;
// warm-toned walls/wood have a much smaller gap — this is the key daylight filter).
const PRESETS = {
  1: { skinThreshold: 800, minBoxH: 40, minBoxW: 22, minR: 80, minG: 50, minB: 30, rMinusB: 25, rMinusG: 18, maxR: 245, maxG: 220 },
  2: { skinThreshold: 500, minBoxH: 30, minBoxW: 18, minR: 55, minG: 35, minB: 22, rMinusB: 16, rMinusG: 12, maxR: 250, maxG: 230 },
  3: { skinThreshold: 190, minBoxH: 17, minBoxW: 10, minR: 16, minG: 11, minB: 8,  rMinusB: 3,  rMinusG: 0,  maxR: 254, maxG: 242 },
  4: { skinThreshold: 150, minBoxH: 15, minBoxW: 8,  minR: 12, minG: 8,  minB: 5,  rMinusB: 2,  rMinusG: 0,  maxR: 255, maxG: 245 },
};

export function detectFigures(imageData, width, height, sensitivity = 4) {
  const p = PRESETS[sensitivity] || PRESETS[4];
  const isSkin = (r, g, b) =>
    r > p.minR && g > p.minG && b > p.minB && r >= g && r > b &&
    (r - b) > p.rMinusB && (r - g) > p.rMinusG && r < p.maxR && g < p.maxG;

  const data = imageData.data;
  const regions = [];
  const visited = new Uint8Array(width * height);
  const MAX_REGION_PIXELS = 3000;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      if (isSkin(r, g, b) && !visited[y * width + x]) {
        const queue = [[x, y]];
        let head = 0;
        let minX = x, maxX = x, minY = y, maxY = y, pixelCount = 0;
        const pixels = new Set();
        while (head < queue.length) {
          const [cx, cy] = queue[head++];
          const vi = cy * width + cx;
          if (visited[vi]) continue;
          visited[vi] = 1;
          pixelCount++;
          pixels.add(vi);
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          if (pixelCount >= MAX_REGION_PIXELS) break;
          for (const [nx, ny] of [[cx - 4, cy], [cx + 4, cy], [cx, cy - 4], [cx, cy + 4]]) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = (ny * width + nx) * 4;
            const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
            if (isSkin(nr, ng, nb)) queue.push([nx, ny]);
          }
        }
        if (pixelCount > p.skinThreshold) {
          const bw = maxX - minX, bh = maxY - minY;
          if (bh > p.minBoxH && bw > p.minBoxW) regions.push({ x: minX, y: minY, w: bw, h: bh, count: pixelCount, pixels });
        }
      }
    }
  }

  const merged = [];
  const used = new Set();
  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let r = { ...regions[i], pixels: new Set(regions[i].pixels) };
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const a = r, b = regions[j];
      if (!(a.x + a.w < b.x - 20 || b.x + b.w < a.x - 20 || a.y + a.h < b.y - 20 || b.y + b.h < a.y - 20)) {
        const nx = Math.min(a.x, b.x), ny = Math.min(a.y, b.y);
        r = { x: nx, y: ny, w: Math.max(a.x + a.w, b.x + b.w) - nx, h: Math.max(a.y + a.h, b.y + b.h) - ny, count: (a.count || 0) + (b.count || 0), pixels: a.pixels };
        for (const px of b.pixels) r.pixels.add(px);
        used.add(j);
      }
    }
    merged.push(r);
  }
  return merged;
}