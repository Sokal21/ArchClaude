/**
 * Spatial math for the battle map.
 *
 * All calculations use 5ft grid cells. Distance uses Chebyshev metric
 * (every diagonal = 5ft) for speed, matching common 5e table play.
 * LoS uses Bresenham's line to check for wall intersections.
 */

import type { BattleMap, MapToken, TerrainCell, AoeShape } from "./types.js";
import { cellKey } from "./types.js";

/** Chebyshev distance in feet between two grid positions. */
export function distanceFt(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 5;
}

/** Distance between two tokens (center to center). */
export function tokenDistance(a: MapToken, b: MapToken): number {
  return distanceFt(a.x, a.y, b.x, b.y);
}

/**
 * Bresenham's line algorithm — returns all cells the line passes through.
 * Used for LoS calculation.
 */
export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    cells.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }

  return cells;
}

/**
 * Check line of sight between two positions.
 * LoS is blocked if any cell along the line is a wall or has full cover.
 * Does not count the source or target cells themselves.
 */
export function hasLineOfSight(
  map: BattleMap,
  x1: number, y1: number,
  x2: number, y2: number,
): boolean {
  const line = bresenhamLine(x1, y1, x2, y2);
  // Skip first (source) and last (target) cells
  for (let i = 1; i < line.length - 1; i++) {
    const cell = map.terrain.get(cellKey(line[i].x, line[i].y));
    if (cell && (cell.type === "wall" || cell.cover === "full")) {
      return false;
    }
  }
  return true;
}

/** Get all tokens visible from a given position. */
export function getVisibleTokens(map: BattleMap, fromToken: MapToken): MapToken[] {
  const visible: MapToken[] = [];
  for (const token of map.tokens.values()) {
    if (token.id === fromToken.id) continue;
    if (!token.visible) continue; // invisible creatures aren't seen
    if (hasLineOfSight(map, fromToken.x, fromToken.y, token.x, token.y)) {
      visible.push(token);
    }
  }
  return visible;
}

/** Get all tokens within a range (in feet) from a token. */
export function getTokensInRange(map: BattleMap, fromToken: MapToken, rangeFt: number): MapToken[] {
  return Array.from(map.tokens.values()).filter((t) => {
    if (t.id === fromToken.id) return false;
    return tokenDistance(fromToken, t) <= rangeFt;
  });
}

/**
 * Calculate cells affected by an AoE.
 * Returns cell positions and any tokens caught in the area.
 */
export function calculateAoe(
  map: BattleMap,
  shape: AoeShape,
  originX: number,
  originY: number,
  sizeFt: number,
  direction?: number, // degrees, 0 = north, for cones
): { cells: Array<{ x: number; y: number }>; affectedTokens: MapToken[] } {
  const radiusCells = sizeFt / 5;
  const cells: Array<{ x: number; y: number }> = [];

  switch (shape) {
    case "circle": {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
          if (distanceFt(0, 0, dx, dy) <= sizeFt) {
            const x = originX + dx;
            const y = originY + dy;
            if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
              cells.push({ x, y });
            }
          }
        }
      }
      break;
    }
    case "cube": {
      const halfCells = Math.floor(radiusCells / 2);
      for (let dx = -halfCells; dx <= halfCells; dx++) {
        for (let dy = -halfCells; dy <= halfCells; dy++) {
          const x = originX + dx;
          const y = originY + dy;
          if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
            cells.push({ x, y });
          }
        }
      }
      break;
    }
    case "line": {
      // Line from origin in the given direction
      const dirRad = ((direction ?? 0) * Math.PI) / 180;
      const dx = Math.round(Math.sin(dirRad));
      const dy = -Math.round(Math.cos(dirRad));
      let cx = originX;
      let cy = originY;
      for (let i = 0; i < radiusCells; i++) {
        if (cx >= 0 && cx < map.width && cy >= 0 && cy < map.height) {
          cells.push({ x: cx, y: cy });
        }
        cx += dx;
        cy += dy;
      }
      break;
    }
    case "cone": {
      // 53-degree cone approximation: for each row out from origin,
      // the cone width increases by ~1 cell per row
      const dirRad = ((direction ?? 0) * Math.PI) / 180;
      const dx = Math.sin(dirRad);
      const dy = -Math.cos(dirRad);
      // Perpendicular direction
      const px = -dy;
      const py = dx;

      for (let dist = 0; dist <= radiusCells; dist++) {
        const halfWidth = Math.floor(dist / 2);
        const centerX = originX + Math.round(dx * dist);
        const centerY = originY + Math.round(dy * dist);
        for (let w = -halfWidth; w <= halfWidth; w++) {
          const x = centerX + Math.round(px * w);
          const y = centerY + Math.round(py * w);
          if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
            cells.push({ x, y });
          }
        }
      }
      break;
    }
  }

  // Find tokens in affected cells
  const cellSet = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const affectedTokens = Array.from(map.tokens.values()).filter((t) =>
    cellSet.has(cellKey(t.x, t.y)),
  );

  return { cells, affectedTokens };
}
