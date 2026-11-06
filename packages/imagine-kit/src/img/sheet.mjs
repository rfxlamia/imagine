export const SHEET_MAX = 4;
export const SHEET_MIN_FILL = 0.01;
export const SHEET_EDGE_PX = 2;
export const SHEET_EDGE_MAX = 0.02;

// Grid layout for n poses: n=1 -> 1x1, n=2 -> 2x1, n=3,4 -> 2x2.
export function sheetLayout(n) {
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3 || n === 4) return { cols: 2, rows: 2 };
  throw new Error(`sheetLayout: unsupported pose count ${n}`);
}

// Pure alpha analysis on raw grayscale alpha channel (1 byte per pixel).
// A pixel is opaque when alpha >= 128.
export function checkCellAlpha(buf, w, h, { k, id } = {}) {
  const total = w * h;
  if (total === 0 || buf.length < total) {
    return { fill: 0, edge: 0, problem: "buffer too short" };
  }
  let opaqueCount = 0;
  let edgeOpaqueCount = 0;
  let edgeTotalCount = 0;

  for (let y = 0; y < h; y++) {
    const isEdgeY = y < SHEET_EDGE_PX || y >= h - SHEET_EDGE_PX;
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const isEdge = isEdgeY || x < SHEET_EDGE_PX || x >= w - SHEET_EDGE_PX;
      if (isEdge) edgeTotalCount++;
      const alpha = buf[rowOffset + x];
      if (alpha >= 128) {
        opaqueCount++;
        if (isEdge) edgeOpaqueCount++;
      }
    }
  }

  const fill = opaqueCount / total;
  const edge = edgeTotalCount > 0 ? edgeOpaqueCount / edgeTotalCount : 0;

  let problem = null;
  const prefix = k !== undefined && id !== undefined ? `cell ${k} (${id}) ` : "";
  if (fill < SHEET_MIN_FILL) {
    problem = `${prefix}is empty after background removal`;
  } else if (edge > SHEET_EDGE_MAX) {
    problem = `${prefix}touches the cell edge`;
  }

  return { fill, edge, problem };
}
