import { AR } from "js-aruco2";

export const DICTIONARY = "ARUCO_MIP_36h12";
export const CARD_COUNT = 20;
export const ANSWERS = ["A", "B", "C", "D"] as const;
export type Answer = (typeof ANSWERS)[number];
export type Detection = {
  markerId: number;
  rotation: number;
  answer: Answer;
  corners: AR.Point[];
};

// Canonical corner 0 -> 1 follows the top edge of the printed marker.
// A up = 0°, B up = clockwise 90°, C up = 180°, D up = 270°.
export function orientation(
  corners: AR.Point[],
): { rotation: number; answer: Answer } | null {
  const degrees =
    ((Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) *
      180) /
      Math.PI +
      360) %
    360;
  const quadrant = Math.round(degrees / 90) % 4;
  const delta = Math.abs(((degrees - quadrant * 90 + 540) % 360) - 180);
  if (delta > 25) return null; // Ignore diagonal cards rather than guessing an answer.
  return { rotation: quadrant * 90, answer: ANSWERS[quadrant] };
}

export function createDecoder() {
  const detector = new AR.Detector({ dictionaryName: DICTIONARY });
  return (image: {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }): Detection[] =>
    detector.detect(image).flatMap((marker) => {
      const direction = orientation(marker.corners);
      return marker.id < CARD_COUNT && marker.hammingDistance === 0 && direction
        ? [{ markerId: marker.id, corners: marker.corners, ...direction }]
        : [];
    });
}

export function markerSvg(id: number) {
  if (!Number.isInteger(id) || id < 0 || id >= CARD_COUNT)
    throw new Error("圖卡 ID 超出範圍");
  return new AR.Dictionary(DICTIONARY).generateSVG(id);
}

// Three consecutive observations reduce accidental changes while turning a card.
export class StableDetections {
  private seen = new Map<number, { answer: Answer; count: number }>();
  update(detections: Detection[]) {
    const ids = new Set(detections.map((d) => d.markerId));
    for (const id of this.seen.keys()) if (!ids.has(id)) this.seen.delete(id);
    return detections.filter((d) => {
      const previous = this.seen.get(d.markerId);
      const count = previous?.answer === d.answer ? previous.count + 1 : 1;
      this.seen.set(d.markerId, { answer: d.answer, count });
      return count >= 3;
    });
  }
}
