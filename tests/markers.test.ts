import { describe, expect, it } from "vitest";
import {
  ANSWERS,
  createDecoder,
  orientation,
  StableDetections,
} from "../src/lib/markers";
import { scene } from "./fixtures/markers";

describe("full image marker decoder", () => {
  const decode = createDecoder();
  for (let id = 0; id < 20; id++)
    for (let turns = 0; turns < 4; turns++) {
      it(`reads card ${id}, clockwise ${turns * 90} degrees`, () => {
        const found = decode(scene([{ id, turns }]));
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
          markerId: id,
          rotation: turns * 90,
          answer: ANSWERS[turns],
        });
      });
    }
  it("decodes twenty differently oriented cards in the same frame", () => {
    const found = decode(
      scene(Array.from({ length: 20 }, (_, id) => ({ id, turns: id % 4 }))),
    );
    expect(found).toHaveLength(20);
    for (const card of found)
      expect(card.answer).toBe(ANSWERS[card.markerId % 4]);
  });
  it("ignores blank frames and unregistered IDs", () => {
    expect(decode(scene([]))).toEqual([]);
    expect(decode(scene([{ id: 24, turns: 0 }]))).toEqual([]);
  });
  it("rejects diagonal orientation", () => {
    expect(
      orientation([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBeNull();
  });
  it("requires consecutive stable observations, including after disappearance", () => {
    const stable = new StableDetections();
    const found = decode(scene([{ id: 0, turns: 0 }]));
    expect(stable.update(found)).toEqual([]);
    expect(stable.update(found)).toEqual([]);
    expect(stable.update(found)).toHaveLength(1);
    stable.update([]);
    expect(stable.update(found)).toEqual([]);
  });
});
