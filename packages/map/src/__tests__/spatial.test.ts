import { describe, it, expect, beforeEach } from "vitest";
import { MapStore } from "../map-store.js";
import type { MapEvent } from "../types.js";

let store: MapStore;
let events: MapEvent[];

beforeEach(() => {
  events = [];
  store = new MapStore((e) => events.push(e));
  store.createMap("Test Arena", 20, 20, "combat-1");
});

describe("MapStore basics", () => {
  it("creates a map and emits event", () => {
    expect(store.getMap()).not.toBeNull();
    expect(events[0].type).toBe("map_created");
  });

  it("places and moves tokens", () => {
    const token = store.placeToken({
      label: "Goblin 1",
      x: 5, y: 5,
      size: "small",
      color: "#cc0000",
      actor_kind: "npc_instance",
      actor_id: 1,
    });
    expect(token.id).toBeDefined();
    expect(token.x).toBe(5);

    store.moveToken(token.id, 7, 5);
    const moved = store.getToken(token.id)!;
    expect(moved.x).toBe(7);
    expect(events.find((e) => e.type === "token_moved")).toBeDefined();
  });

  it("prevents moving into walls", () => {
    store.setTerrain([{ x: 3, y: 3, type: "wall" }]);
    const token = store.placeToken({
      label: "PC", x: 2, y: 3,
      size: "medium", color: "#0000cc",
      actor_kind: "pc", actor_id: 1,
    });
    expect(() => store.moveToken(token.id, 3, 3)).toThrow("wall");
  });

  it("removes tokens", () => {
    const token = store.placeToken({
      label: "Temp", x: 0, y: 0,
      size: "medium", color: "#000",
      actor_kind: "npc_instance", actor_id: 2,
    });
    expect(store.removeToken(token.id)).toBe(true);
    expect(store.getToken(token.id)).toBeUndefined();
  });

  it("validates bounds", () => {
    expect(() => store.placeToken({
      label: "OOB", x: 25, y: 0,
      size: "medium", color: "#000",
      actor_kind: "pc", actor_id: 1,
    })).toThrow("out of bounds");
  });

  it("finds token by actor", () => {
    store.placeToken({
      label: "Tharivol", x: 10, y: 10,
      size: "medium", color: "#00cc00",
      actor_kind: "pc", actor_id: 42,
    });
    const found = store.findTokenByActor("pc", 42);
    expect(found?.label).toBe("Tharivol");
  });
});

describe("spatial queries", () => {
  it("measures distance (Chebyshev)", () => {
    const a = store.placeToken({
      label: "A", x: 0, y: 0,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    const b = store.placeToken({
      label: "B", x: 3, y: 4,
      size: "medium", color: "#0f0",
      actor_kind: "npc_instance", actor_id: 1,
    });
    // Chebyshev: max(3, 4) * 5 = 20
    expect(store.measureDistance(a.id, b.id)).toBe(20);
  });

  it("checks line of sight through walls", () => {
    const a = store.placeToken({
      label: "A", x: 0, y: 5,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    const b = store.placeToken({
      label: "B", x: 10, y: 5,
      size: "medium", color: "#0f0",
      actor_kind: "npc_instance", actor_id: 1,
    });

    // No wall — should see each other
    let visible = store.getVisible(a.id);
    expect(visible.some((t) => t.id === b.id)).toBe(true);

    // Add wall between them
    store.setTerrain([{ x: 5, y: 5, type: "wall" }]);
    visible = store.getVisible(a.id);
    expect(visible.some((t) => t.id === b.id)).toBe(false);
  });

  it("queries tokens in range", () => {
    const center = store.placeToken({
      label: "Center", x: 10, y: 10,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    store.placeToken({
      label: "Close", x: 11, y: 10,
      size: "medium", color: "#0f0",
      actor_kind: "npc_instance", actor_id: 1,
    });
    store.placeToken({
      label: "Far", x: 18, y: 10,
      size: "medium", color: "#00f",
      actor_kind: "npc_instance", actor_id: 2,
    });

    const inRange = store.queryInRange(center.id, 15); // 15ft
    expect(inRange).toHaveLength(1);
    expect(inRange[0].label).toBe("Close");

    const allInRange = store.queryInRange(center.id, 50);
    expect(allInRange).toHaveLength(2);
  });
});

describe("AoE", () => {
  it("circle AoE hits tokens in radius", () => {
    store.placeToken({
      label: "Target", x: 5, y: 5,
      size: "medium", color: "#f00",
      actor_kind: "npc_instance", actor_id: 1,
    });
    store.placeToken({
      label: "Safe", x: 15, y: 15,
      size: "medium", color: "#0f0",
      actor_kind: "npc_instance", actor_id: 2,
    });

    const result = store.applyAoe("circle", 5, 5, 10); // 10ft radius
    expect(result.affectedTokens).toHaveLength(1);
    expect(result.affectedTokens[0].label).toBe("Target");
    expect(result.cells.length).toBeGreaterThan(0);
  });

  it("terrain rect fills area", () => {
    store.setTerrainRect(2, 2, 3, 3, "wall");
    const map = store.getMap()!;
    expect(map.terrain.size).toBe(9);
  });
});

describe("visibility and conditions", () => {
  it("hidden tokens are not visible to others", () => {
    const observer = store.placeToken({
      label: "Observer", x: 0, y: 0,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    const hidden = store.placeToken({
      label: "Lurker", x: 2, y: 2,
      size: "medium", color: "#000",
      actor_kind: "npc_instance", actor_id: 1,
      visible: false,
    });

    const visible = store.getVisible(observer.id);
    expect(visible.some((t) => t.id === hidden.id)).toBe(false);

    store.setTokenVisibility(hidden.id, true);
    const nowVisible = store.getVisible(observer.id);
    expect(nowVisible.some((t) => t.id === hidden.id)).toBe(true);
  });

  it("updates token conditions", () => {
    const token = store.placeToken({
      label: "Test", x: 0, y: 0,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    store.updateTokenConditions(token.id, ["poisoned", "prone"]);
    expect(store.getToken(token.id)!.conditions).toEqual(["poisoned", "prone"]);
  });
});

describe("event emission", () => {
  it("emits events for all mutations", () => {
    events = []; // reset after createMap
    store.createMap("New", 10, 10, "c2");

    const token = store.placeToken({
      label: "T", x: 0, y: 0,
      size: "medium", color: "#f00",
      actor_kind: "pc", actor_id: 1,
    });
    store.moveToken(token.id, 1, 1);
    store.setTerrain([{ x: 5, y: 5, type: "wall" }]);
    store.removeToken(token.id);
    store.clearMap();

    const types = events.map((e) => e.type);
    expect(types).toContain("map_created");
    expect(types).toContain("token_placed");
    expect(types).toContain("token_moved");
    expect(types).toContain("terrain_changed");
    expect(types).toContain("token_removed");
    expect(types).toContain("map_cleared");
  });
});
