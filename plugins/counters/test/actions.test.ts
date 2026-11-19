import { evaluate } from "initiative-plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import { tool } from "../src/plugin.js";

/** An action's `write`, by id. */
const write = (id: string): string => {
  const action = tool.actions?.find((each) => each.id === id);
  if (!action) throw new Error(`no action ${id}`);
  return action.write;
};

/** A counter as a `write` reads it: its id, name and fields. */
const counter = (id: number, fields: Record<string, number | null>) => ({
  id,
  name: `Counter ${id}`,
  count: 7,
  min: null,
  max: null,
  step: 1,
  initial_count: 0,
  color: null,
  view_mode: "number",
  ...fields,
});

describe("reset", () => {
  it("puts a counter back to its starting count", async () => {
    const item = counter(1, { initial_count: 3 });
    expect(await evaluate(write("reset"), { item, items: {} })).toEqual({ set: { count: 3 } });
  });

  it("holds the starting count within the counter's bounds", async () => {
    const below = counter(1, { initial_count: -2, min: 0 });
    const above = counter(2, { initial_count: 12, max: 10 });
    expect(await evaluate(write("reset"), { item: below, items: {} })).toEqual({ set: { count: 0 } });
    expect(await evaluate(write("reset"), { item: above, items: {} })).toEqual({ set: { count: 10 } });
  });
});

describe("reset_all", () => {
  const group = { id: 9, name: "Score", description: null };

  it("puts every counter in the group back to its starting count", async () => {
    const items = {
      counter: [counter(1, { initial_count: 0 }), counter(2, { initial_count: 20, max: 10 }), counter(3, { initial_count: 5 })],
    };
    expect(await evaluate(write("reset_all"), { item: group, items })).toEqual({
      items: {
        counter: [
          { id: 1, set: { count: 0 } },
          { id: 2, set: { count: 10 } },
          { id: 3, set: { count: 5 } },
        ],
      },
    });
  });

  it("answers a list for a group of one counter", async () => {
    const items = { counter: [counter(1, { initial_count: 4 })] };
    expect(await evaluate(write("reset_all"), { item: group, items })).toEqual({
      items: { counter: [{ id: 1, set: { count: 4 } }] },
    });
  });

  it("changes nothing in an empty group", async () => {
    expect(await evaluate(write("reset_all"), { item: group, items: { counter: [] } })).toEqual({
      items: { counter: [] },
    });
  });
});
