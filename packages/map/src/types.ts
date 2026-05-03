/**
 * Map data model — matches docs/map-mcp-contract.md
 */

export type TerrainType = "open" | "difficult" | "wall" | "water" | "pit" | "elevation";
export type CoverType = "none" | "half" | "three_quarter" | "full";
export type TokenSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
export type AoeShape = "circle" | "cone" | "line" | "cube";

export interface TerrainCell {
  x: number;
  y: number;
  type: TerrainType;
  elevation?: number;
  cover?: CoverType;
  notes?: string;
}

export interface MapToken {
  id: string;
  label: string;
  x: number;
  y: number;
  size: TokenSize;
  color: string;
  icon?: string;
  actor_kind: "pc" | "npc_instance";
  actor_id: number;
  visible: boolean;
  conditions: string[];
}

export interface BattleMap {
  id: string;
  name: string;
  width: number;
  height: number;
  cell_size: 5;
  terrain: Map<string, TerrainCell>; // key: "x,y"
  tokens: Map<string, MapToken>;    // key: token id
}

export interface MapEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/** Token size to cell footprint (cells occupied per side). */
export const TOKEN_FOOTPRINT: Record<TokenSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
