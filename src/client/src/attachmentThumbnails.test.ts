// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_THUMBNAIL_MAX_EDGE, createImageThumbnail, thumbnailDimensions, type AttachmentThumbnailCanvas } from "./attachmentThumbnails";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("thumbnailDimensions", () => {
  it("bounds the longest edge while preserving aspect ratio", () => {
    expect(thumbnailDimensions(4000, 3000)).toEqual({ width: 96, height: 72 });
    expect(thumbnailDimensions(3000, 4000)).toEqual({ width: 72, height: 96 });
  });

  it("leaves images at or under the limit untouched", () => {
    expect(thumbnailDimensions(64, 48)).toEqual({ width: 64, height: 48 });
    expect(thumbnailDimensions(96, 96)).toEqual({ width: 96, height: 96 });
  });

  it("honors a custom max edge and never emits zero dimensions", () => {
    expect(thumbnailDimensions(200, 10, 40)).toEqual({ width: 40, height: 2 });
    expect(thumbnailDimensions(10000, 1)).toEqual({ width: 96, height: 1 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => thumbnailDimensions(0, 100)).toThrow();
    expect(() => thumbnailDimensions(Number.NaN, 100)).toThrow();
    expect(() => thumbnailDimensions(100, -5)).toThrow();
  });
});

describe("createImageThumbnail", () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(_value: string) {
      this.onload?.();
    }
  }

  function fakeCanvas(drawImage: ((image: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) => void) | null): AttachmentThumbnailCanvas {
    const width = { value: 0 };
    const height = { value: 0 };
    return {
      get width() { return width.value; },
      set width(next: number) { width.value = next; },
      get height() { return height.value; },
      set height(next: number) { height.value = next; },
      get2d: () => (drawImage === null ? null : { drawImage }),
      toDataUrl: (type: string) => `data:${type};base64,THUMB`,
    };
  }

  it("downscales the decoded image and returns the thumbnail payload", async () => {
    const drawImage = vi.fn();
    const canvas = fakeCanvas(drawImage);
    vi.stubGlobal("Image", FakeImage);

    await expect(createImageThumbnail("cGF5bG9hZA==", "image/jpeg", undefined, () => canvas)).resolves.toBe("THUMB");

    expect(canvas.width).toBe(96);
    expect(canvas.height).toBe(72);
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it("rejects when the image cannot be decoded", async () => {
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onerror?.();
      }
    });

    await expect(createImageThumbnail("broken", "image/png")).rejects.toThrow("Failed to decode image");
  });

  it("rejects when the canvas 2D context is unavailable", async () => {
    vi.stubGlobal("Image", FakeImage);

    await expect(createImageThumbnail("cGF5bG9hZA==", "image/png", undefined, () => fakeCanvas(null))).rejects.toThrow("Canvas 2D context unavailable");
  });

  it("exposes the configured max edge", () => {
    expect(ATTACHMENT_THUMBNAIL_MAX_EDGE).toBe(96);
  });
});
