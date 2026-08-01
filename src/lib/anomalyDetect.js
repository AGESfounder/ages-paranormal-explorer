// Shared IR/anomaly figure-detection logic used by the SLS Camera and the
// Yes/No/IDK Sweeper's camera trigger. Detects humanoid-shaped skin-tone
// regions in a frame and returns bounding boxes.

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

export function detectFigures(imageData, width, height) {
  const data = imageData.data;
  const regions = [];
  const visited = new Uint8Array(width * height);
  const SKIN_THRESHOLD = 1800;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const isSkin = r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 10 && r < 255 && g < 230;

      if (isSkin && !visited[y / 4 * Math.floor(width / 4) + x / 4]) {
        const queue = [[x, y]];
        let minX = x, maxX = x, minY = y, maxY = y, pixelCount = 0;
        while (queue.length > 0) {
          const [cx, cy] = queue.shift();
          const vi = cy / 4 * Math.floor(width / 4) + cx / 4;
          if (visited[vi]) continue;
          visited[vi] = 1;
          pixelCount++;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [nx, ny] of [[cx - 4, cy], [cx + 4, cy], [cx, cy - 4], [cx, cy + 4]]) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = (ny * width + nx) * 4;
            const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
            if (nr > 60 && ng > 40 && nb > 20 && nr > ng && nr > nb && (nr - ng) > 10 && nr < 255 && ng < 230) queue.push([nx, ny]);
          }
        }
        if (pixelCount > SKIN_THRESHOLD) {
          const bw = maxX - minX, bh = maxY - minY;
          if (bh > bw * 0.8 && bh > 40 && bw > 15) regions.push({ x: minX, y: minY, w: bw, h: bh, count: pixelCount });
        }
      }
    }
  }

  const merged = [];
  const used = new Set();
  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let r = { ...regions[i] };
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const a = r, b = regions[j];
      if (!(a.x + a.w < b.x - 20 || b.x + b.w < a.x - 20 || a.y + a.h < b.y - 20 || b.y + b.h < a.y - 20)) {
        const nx = Math.min(a.x, b.x), ny = Math.min(a.y, b.y);
        r = { x: nx, y: ny, w: Math.max(a.x + a.w, b.x + b.w) - nx, h: Math.max(a.y + a.h, b.y + b.h) - ny, count: (a.count || 0) + (b.count || 0) };
        used.add(j);
      }
    }
    merged.push(r);
  }
  return merged;
}