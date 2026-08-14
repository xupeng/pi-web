/**
 * Small thumbnail generation for pending attachment previews.
 *
 * Rendering a full-size photo as an `<img src="data:...;base64,...">` decodes
 * the whole bitmap just to show a 56px chip. On memory-tight mobile browsers
 * (iOS Safari PWA) that decode spike — combined with keyboard/relayout on
 * editor focus — can blow the page's memory budget and force a browser-level
 * reload. These helpers downscale the attachment into a tiny data URL used
 * only for the chip preview; the original base64 payload still travels with
 * the prompt.
 */

export const ATTACHMENT_THUMBNAIL_MAX_EDGE = 96;

/** Pure: bound the longest edge by `maxEdge`, preserving aspect ratio. */
export function thumbnailDimensions(width: number, height: number, maxEdge = ATTACHMENT_THUMBNAIL_MAX_EDGE): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${String(width)}x${String(height)}`);
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ThumbnailDrawer {
  drawImage(image: HTMLImageElement, dx: number, dy: number, dw: number, dh: number): void;
}

export interface AttachmentThumbnailCanvas {
  width: number;
  height: number;
  get2d(): ThumbnailDrawer | null;
  toDataUrl(type: string): string;
}

export type ThumbnailCanvasFactory = () => AttachmentThumbnailCanvas;

/**
 * Adapter over `document.createElement("canvas")` exposed as a seam so tests
 * can supply a fake canvas without stubbing DOM globals.
 */
export function createThumbnailCanvas(): AttachmentThumbnailCanvas {
  const canvas = document.createElement("canvas");
  return {
    get width() { return canvas.width; },
    set width(value: number) { canvas.width = value; },
    get height() { return canvas.height; },
    set height(value: number) { canvas.height = value; },
    get2d: () => {
      const context = canvas.getContext("2d");
      return context === null ? null : { drawImage: (image, dx, dy, dw, dh) => { context.drawImage(image, dx, dy, dw, dh); } };
    },
    toDataUrl: (type) => canvas.toDataURL(type),
  };
}

/**
 * Decode a base64 image, downscale it on a canvas, and return the thumbnail as
 * a base64 data URL payload (no `data:` prefix). Rejects when the image cannot
 * be decoded or the canvas 2D context is unavailable; callers catch and fall
 * back to a non-image preview.
 */
export async function createImageThumbnail(
  base64: string,
  mimeType: string,
  maxEdge = ATTACHMENT_THUMBNAIL_MAX_EDGE,
  createCanvas: ThumbnailCanvasFactory = createThumbnailCanvas,
): Promise<string> {
  const image = await decodeImage(base64, mimeType);
  const { width, height } = thumbnailDimensions(image.naturalWidth, image.naturalHeight, maxEdge);
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const drawer = canvas.get2d();
  if (drawer === null) throw new Error("Canvas 2D context unavailable");
  drawer.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataUrl(mimeType);
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("Failed to encode thumbnail");
  return dataUrl.slice(commaIndex + 1);
}

function decodeImage(base64: string, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { resolve(image); };
    image.onerror = () => { reject(new Error("Failed to decode image")); };
    image.src = `data:${mimeType};base64,${base64}`;
  });
}
