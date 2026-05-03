/**
 * In-memory map state store.
 *
 * Holds the active battle map and provides mutation methods.
 * Every mutation emits an event via the provided callback.
 * The MCP tools are thin wrappers around these methods.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type {
  BattleMap,
  MapToken,
  TerrainCell,
  TokenSize,
  TerrainType,
  CoverType,
  MapEvent,
  AoeShape,
} from "./types.js";
import { cellKey } from "./types.js";
import {
  tokenDistance,
  hasLineOfSight,
  getVisibleTokens,
  getTokensInRange,
  calculateAoe,
} from "./spatial.js";

export type EventEmitter = (event: MapEvent) => void;

function emit(emitter: EventEmitter, type: string, payload: Record<string, unknown>): void {
  emitter({ type, timestamp: new Date().toISOString(), payload });
}

export class MapStore {
  private map: BattleMap | null = null;
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  // ── Map lifecycle ──

  createMap(name: string, width: number, height: number, combatId: string): BattleMap {
    this.map = {
      id: combatId,
      name,
      width,
      height,
      cell_size: 5,
      terrain: new Map(),
      tokens: new Map(),
    };
    emit(this.emitter, "map_created", { map: this.serializeMap() });
    return this.map;
  }

  getMap(): BattleMap | null {
    return this.map;
  }

  clearMap(): void {
    if (!this.map) return;
    this.map.terrain.clear();
    this.map.tokens.clear();
    emit(this.emitter, "map_cleared", {});
  }

  saveMap(campaignDir?: string): string | null {
    if (!this.map || !campaignDir) return null;
    const mapsDir = join(campaignDir, "maps");
    if (!existsSync(mapsDir)) mkdirSync(mapsDir, { recursive: true });
    const path = join(mapsDir, `${this.map.id}.json`);
    writeFileSync(path, JSON.stringify(this.serializeMap(), null, 2));
    return path;
  }

  // ── Tokens ──

  placeToken(opts: {
    label: string;
    x: number;
    y: number;
    size: TokenSize;
    color: string;
    actor_kind: "pc" | "npc_instance";
    actor_id: number;
    visible?: boolean;
    icon?: string;
  }): MapToken {
    if (!this.map) throw new Error("No active map");
    this.validateBounds(opts.x, opts.y);

    const token: MapToken = {
      id: randomUUID().slice(0, 8),
      label: opts.label,
      x: opts.x,
      y: opts.y,
      size: opts.size,
      color: opts.color,
      icon: opts.icon,
      actor_kind: opts.actor_kind,
      actor_id: opts.actor_id,
      visible: opts.visible ?? true,
      conditions: [],
    };
    this.map.tokens.set(token.id, token);
    emit(this.emitter, "token_placed", { token });
    return token;
  }

  moveToken(tokenId: string, x: number, y: number): MapToken {
    if (!this.map) throw new Error("No active map");
    const token = this.map.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);
    this.validateBounds(x, y);

    // Check the destination isn't a wall
    const terrain = this.map.terrain.get(cellKey(x, y));
    if (terrain?.type === "wall") {
      throw new Error(`Cannot move to wall at (${x}, ${y})`);
    }

    const from = { x: token.x, y: token.y };
    token.x = x;
    token.y = y;
    emit(this.emitter, "token_moved", { token_id: tokenId, from, to: { x, y } });
    return token;
  }

  removeToken(tokenId: string): boolean {
    if (!this.map) return false;
    const removed = this.map.tokens.delete(tokenId);
    if (removed) {
      emit(this.emitter, "token_removed", { token_id: tokenId });
    }
    return removed;
  }

  setTokenVisibility(tokenId: string, visible: boolean): MapToken {
    if (!this.map) throw new Error("No active map");
    const token = this.map.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);
    token.visible = visible;
    emit(this.emitter, "token_visibility_changed", { token_id: tokenId, visible });
    return token;
  }

  updateTokenConditions(tokenId: string, conditions: string[]): MapToken {
    if (!this.map) throw new Error("No active map");
    const token = this.map.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);
    token.conditions = conditions;
    emit(this.emitter, "token_conditions_changed", { token_id: tokenId, conditions });
    return token;
  }

  // ── Terrain ──

  setTerrain(cells: Array<{
    x: number;
    y: number;
    type: TerrainType;
    cover?: CoverType;
    elevation?: number;
    notes?: string;
  }>): void {
    if (!this.map) throw new Error("No active map");
    const updated: TerrainCell[] = [];
    for (const c of cells) {
      this.validateBounds(c.x, c.y);
      const cell: TerrainCell = {
        x: c.x,
        y: c.y,
        type: c.type,
        cover: c.cover,
        elevation: c.elevation,
        notes: c.notes,
      };
      this.map.terrain.set(cellKey(c.x, c.y), cell);
      updated.push(cell);
    }
    emit(this.emitter, "terrain_changed", { cells: updated });
  }

  setTerrainRect(
    x: number, y: number,
    width: number, height: number,
    type: TerrainType,
    cover?: CoverType,
  ): void {
    const cells: Array<{ x: number; y: number; type: TerrainType; cover?: CoverType }> = [];
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        cells.push({ x: x + dx, y: y + dy, type, cover });
      }
    }
    this.setTerrain(cells);
  }

  // ── Spatial queries ──

  measureDistance(tokenA: string, tokenB: string): number {
    if (!this.map) throw new Error("No active map");
    const a = this.map.tokens.get(tokenA);
    const b = this.map.tokens.get(tokenB);
    if (!a || !b) throw new Error("Token not found");
    return tokenDistance(a, b);
  }

  getVisible(fromTokenId: string): MapToken[] {
    if (!this.map) throw new Error("No active map");
    const from = this.map.tokens.get(fromTokenId);
    if (!from) throw new Error("Token not found");
    return getVisibleTokens(this.map, from);
  }

  queryInRange(fromTokenId: string, rangeFt: number): MapToken[] {
    if (!this.map) throw new Error("No active map");
    const from = this.map.tokens.get(fromTokenId);
    if (!from) throw new Error("Token not found");
    return getTokensInRange(this.map, from, rangeFt);
  }

  applyAoe(
    shape: AoeShape,
    originX: number,
    originY: number,
    sizeFt: number,
    direction?: number,
  ): { cells: Array<{ x: number; y: number }>; affectedTokens: MapToken[] } {
    if (!this.map) throw new Error("No active map");
    const result = calculateAoe(this.map, shape, originX, originY, sizeFt, direction);
    emit(this.emitter, "aoe_applied", {
      shape,
      origin: { x: originX, y: originY },
      size_ft: sizeFt,
      direction,
      cells: result.cells,
      affected_token_ids: result.affectedTokens.map((t) => t.id),
    });
    return result;
  }

  // ── Helpers ──

  getToken(id: string): MapToken | undefined {
    return this.map?.tokens.get(id);
  }

  findTokenByActor(actorKind: string, actorId: number): MapToken | undefined {
    if (!this.map) return undefined;
    for (const token of this.map.tokens.values()) {
      if (token.actor_kind === actorKind && token.actor_id === actorId) return token;
    }
    return undefined;
  }

  /** Forward an external event (from state MCP) to WebSocket subscribers. */
  forwardEvent(type: string, payload: Record<string, unknown>): void {
    emit(this.emitter, type, payload);
  }

  private validateBounds(x: number, y: number): void {
    if (!this.map) throw new Error("No active map");
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      throw new Error(`Position (${x}, ${y}) is out of bounds (${this.map.width}x${this.map.height})`);
    }
  }

  private serializeMap(): Record<string, unknown> {
    if (!this.map) return {};
    return {
      id: this.map.id,
      name: this.map.name,
      width: this.map.width,
      height: this.map.height,
      cell_size: this.map.cell_size,
      terrain: Array.from(this.map.terrain.values()),
      tokens: Array.from(this.map.tokens.values()),
    };
  }
}
