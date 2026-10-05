declare module "js-aruco2" {
  export namespace AR {
    type Point = { x: number; y: number };
    type Marker = { id: number; corners: Point[]; hammingDistance: number };
    class Dictionary {
      constructor(name: string);
      codeList: string[];
      generateSVG(id: number): string;
    }
    class Detector {
      constructor(options: { dictionaryName: string });
      detect(image: {
        width: number;
        height: number;
        data: Uint8ClampedArray;
      }): Marker[];
    }
  }
}
