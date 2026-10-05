// Golden ARUCO_MIP_36h12 codes, frozen independently of the runtime generator.
// Source: js-aruco2 2.0.0 dictionary, IDs 0–40 (40 tests unregistered IDs).
const codes = [
  0xd2b63a09d, 0x6001134e5, 0x1206fbe72, 0xff8ad6cb4, 0x85da9bc49, 0xb461afe9c,
  0x6db51fe13, 0x5248c541f, 0x8f34503, 0x8ea462ece, 0xeac2be76d, 0x1af615c44,
  0xb48a49f27, 0x2e4e1283b, 0x78b1f2fa8, 0x27d34f57e, 0x89222fff1, 0x4c1669406,
  0xbf49b3511, 0xdc191cd5d, 0x11d7c3f85, 0x16a130e35, 0xe29f27eff, 0x428d8ae0c,
  0x90d548477, 0x2319cbc93, 0xc3b0c3dfc, 0x424bccc9, 0x2a081d630, 0x762743d96,
  0xd0645bf19, 0xf38d7fd60, 0xc6cbf9a10, 0x3c1be7c65, 0x276f75e63, 0x4490a3f63,
  0xda60acd52, 0x3cc68df59, 0xab46f9dae, 0x88d533d78, 0xb6d62ec21,
];

// Render actual dictionary bits to RGBA pixels; detection still runs the complete
// grayscale -> threshold -> contours -> homography -> dictionary decoder pipeline.
export function scene(cards: { id: number; turns: number }[], cell = 12) {
  const tile = cell * 12;
  const columns = Math.min(cards.length || 1, 5);
  const width = columns * tile,
    height = Math.max(1, Math.ceil(cards.length / columns)) * tile;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  cards.forEach(({ id, turns }, index) => {
    const bits = codes[id].toString(2).padStart(36, "0");
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const white =
          row > 0 &&
          row < 7 &&
          col > 0 &&
          col < 7 &&
          bits[(row - 1) * 6 + col - 1] === "1";
        let x = col,
          y = row;
        for (let r = 0; r < turns; r++) [x, y] = [7 - y, x];
        const left = (index % columns) * tile + (x + 2) * cell;
        const top = Math.floor(index / columns) * tile + (y + 2) * cell;
        for (let dy = 0; dy < cell; dy++)
          for (let dx = 0; dx < cell; dx++) {
            const p = ((top + dy) * width + left + dx) * 4;
            data[p] = data[p + 1] = data[p + 2] = white ? 255 : 0;
          }
      }
  });
  return { width, height, data };
}
