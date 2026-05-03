# Map MCP Tool Surface (v0.1)

> The contract for the Map MCP server. Companion to [campaign-state-schema.md](./campaign-state-schema.md) and [mcp-setup.md](./mcp-setup.md).

---

## Design philosophy

1. **The Map MCP owns spatial state.** Positions, terrain, visibility — all live in the map server's in-memory store, not in the campaign SQLite database. The only bridge is `npc_instances.map_token_id`, a handle the Combat Director uses to correlate state-MCP combatants with map tokens.

2. **Grid-based, not freeform.** 5ft squares. Tokens occupy one or more cells (Medium = 1, Large = 2x2, etc). This keeps distance/AoE calculations simple and deterministic.

3. **Events flow out via WebSocket.** Every state change emits an event on the WebSocket bus. The renderer subscribes and updates in real-time. The MCP tools are the only write path.

4. **Snapshots to disk per fight.** Map state is ephemeral (in-memory) during combat. At combat end, it's serialized to `<campaign>/maps/<combat_id>.json` for replay/reference.

---

## Data model

### Map
```typescript
interface BattleMap {
  id: string;           // matches combat_id from state MCP
  name: string;
  width: number;        // grid cells
  height: number;
  cell_size: 5;         // always 5ft
  terrain: TerrainCell[];
  tokens: MapToken[];
}
```

### Terrain
```typescript
interface TerrainCell {
  x: number;
  y: number;
  type: "open" | "difficult" | "wall" | "water" | "pit" | "elevation";
  elevation?: number;   // 0 = ground level, 1 = 5ft up, etc.
  cover?: "none" | "half" | "three_quarter" | "full";
  notes?: string;       // "lava", "magical darkness", etc.
}
```

### Token
```typescript
interface MapToken {
  id: string;           // unique token ID (this is what npc_instances.map_token_id stores)
  label: string;        // display name
  x: number;
  y: number;
  size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
  color: string;        // hex color for the token circle
  icon?: string;        // optional asset path
  actor_kind: "pc" | "npc_instance";
  actor_id: number;     // ID in the state MCP
  visible: boolean;     // false = hidden from players (invisible, lurking)
  conditions: string[]; // visual indicators
}
```

---

## MCP Tools

### Map lifecycle

| Tool | Args | Description |
|------|------|-------------|
| `create_map` | `{name, width, height, combat_id}` | Create a new battle map for a combat encounter. Returns map ID. |
| `get_map` | `{}` | Get the current active map state (all terrain + tokens). |
| `clear_map` | `{}` | Remove all tokens and terrain from the active map. |
| `save_map` | `{path?}` | Snapshot current map to disk (auto-called at combat end). |

### Token management

| Tool | Args | Description |
|------|------|-------------|
| `place_token` | `{label, x, y, size, color, actor_kind, actor_id, visible?}` | Place a token on the map. Returns token ID. |
| `move_token` | `{token_id, x, y}` | Move a token to a new position. Validates the cell isn't a wall. |
| `remove_token` | `{token_id}` | Remove a token from the map (death, flee, etc). |
| `set_token_visibility` | `{token_id, visible}` | Show/hide a token (for invisible creatures). |
| `update_token_conditions` | `{token_id, conditions}` | Update visual condition indicators on a token. |

### Terrain

| Tool | Args | Description |
|------|------|-------------|
| `set_terrain` | `{cells: [{x, y, type, cover?, elevation?, notes?}]}` | Set terrain for one or more cells. Batch operation for efficiency. |
| `set_terrain_rect` | `{x, y, width, height, type, cover?}` | Fill a rectangle with terrain type (quick wall/water placement). |

### Spatial queries (used by Combat Director)

| Tool | Args | Description |
|------|------|-------------|
| `measure_distance` | `{from_token, to_token}` | Distance in feet between two tokens (Chebyshev/5e diagonal). |
| `get_visible` | `{from_token}` | List of tokens visible from a position (basic LoS through walls). |
| `query_in_range` | `{from_token, range_ft}` | All tokens within range (for AoE targeting, opportunity attacks). |
| `apply_aoe` | `{shape, origin_x, origin_y, size_ft, direction?}` | Mark cells affected by an AoE. Shape: circle, cone, line, cube. Returns affected token IDs. |

---

## WebSocket events

The Map MCP runs a WebSocket server alongside the MCP stdio transport. The renderer connects to this WebSocket to receive real-time updates.

### Event format
```typescript
interface MapEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}
```

### Event types

| Event | Payload | Trigger |
|-------|---------|---------|
| `map_created` | `{map}` | `create_map` |
| `token_placed` | `{token}` | `place_token` |
| `token_moved` | `{token_id, from: {x,y}, to: {x,y}}` | `move_token` |
| `token_removed` | `{token_id}` | `remove_token` |
| `token_visibility_changed` | `{token_id, visible}` | `set_token_visibility` |
| `token_conditions_changed` | `{token_id, conditions}` | `update_token_conditions` |
| `terrain_changed` | `{cells}` | `set_terrain` / `set_terrain_rect` |
| `aoe_applied` | `{shape, cells, affected_tokens}` | `apply_aoe` |
| `map_cleared` | `{}` | `clear_map` |
| `combat_state_update` | `{round, current_turn, initiative}` | Forwarded from state MCP events |

The renderer also receives HUD data events forwarded from the state MCP event bus:

| Event | Payload | Purpose |
|-------|---------|---------|
| `narration_text` | `{text, intensity}` | Narration to display on the TV |
| `initiative_update` | `{order, current_index}` | Update initiative bar |
| `party_status_update` | `{pcs: [{name, hp, max_hp, conditions}]}` | Update HP bars |

---

## Spatial math

### Distance (5e rules)
- Adjacent = 5ft
- Diagonal = 5ft (first), 10ft (second), alternating — OR use simple Chebyshev (every diagonal = 5ft) for speed. **Default: Chebyshev.**
- Distance = `max(|dx|, |dy|) * 5`

### Line of Sight
- Trace a line from center of source cell to center of target cell.
- If the line crosses a `wall` cell, LoS is blocked.
- `full` cover also blocks LoS; `half` and `three_quarter` do not block but grant AC bonus.
- Implementation: Bresenham's line algorithm over the grid.

### AoE shapes
- **Circle (sphere):** All cells within radius from origin.
- **Cone:** 53-degree cone from origin in a direction. Uses the template from 5e DMG.
- **Line:** 1-cell-wide line from origin to max range.
- **Cube:** Square area centered on a point.

---

## Integration with State MCP

The Map MCP does NOT write to the campaign database. The Combat Director bridges the two:

1. `start_combat` (state MCP) → `create_map` (map MCP)
2. `add_combatant` (state MCP) → `place_token` (map MCP), linking via `map_token_id`
3. During combat, the Combat Director calls spatial queries on the map MCP and HP/condition tools on the state MCP
4. `end_combat` (state MCP) → `save_map` (map MCP)

The map MCP emits events; the TV display subscribes.
