import type { ShapeWavesMask } from "@/components/ShapeWaves";

/** Cushn logo icon path data (24×24 viewBox, drawn with a 1.5 stroke and round caps/joins). */
export const CUSHN_ICON_PATHS = [
  "M9.46 6.7C10.99 5.02 12.74 3.45 14.4 2.97C16.38 2.4 19.22 5.22 20.4 6.7L20.4 9.24C19.51 9.24 17.55 9.48 16.87 10.43C16.51 10.94 16.12 11.61 15.71 12.34L19.06 12.26C19.73 12.26 20.28 12.56 20.4 13.05C20.65 14.12 21.06 17.9 21.15 19.37A1.29 1.29 0 0 1 18.72 19.51A1.33 1.33 0 0 1 16.28 18.49A1.29 1.29 0 0 1 14.85 15.96L14.54 14.5L13.69 16.38C13.64 16.82 10.85 19.79 9.46 21.22C9 21.53 8.51 20.88 8.33 20.5L5.98 18.45C5.51 18.1 4.47 16.99 3.74 16.53C3 16.09 2.91 15.03 2.96 14.56C3.5 14.26 4.74 13.59 5.36 13.2C5.96 12.85 6.89 11.87 7.34 11.37L9.46 6.7Z",
  "M9.46 6.7L9.01 5.02C8.92 4.65 8.69 4.39 8.32 4.33L4.27 3.45A1.33 1.33 0 0 0 3.67 5.98A1.38 1.38 0 0 0 4.82 8.6A1.75 1.75 0 0 0 8 9.98",
];

/** Cushn logo as a ready-to-use `ShapeWaves` cutout. */
export const CUSHN_ICON_MASK: ShapeWavesMask = {
  viewBox: [0, 0, 24, 24],
  paths: CUSHN_ICON_PATHS,
  mode: "stroke",
  strokeWidth: 1.5,
};
