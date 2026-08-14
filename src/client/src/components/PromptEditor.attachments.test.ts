// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptAttachment } from "../api";
import { PromptEditor } from "./PromptEditor";
import { createImageThumbnail } from "../attachmentThumbnails";

vi.mock("../attachmentThumbnails", () => ({ createImageThumbnail: vi.fn() }));

function makePhotoFile(name = "photo.png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

function attachFile(editor: PromptEditor, file: File): void {
  const input = editor.renderRoot.querySelector("input.attachment-input");
  if (!(input instanceof HTMLInputElement)) throw new Error("attachment input missing");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

describe("PromptEditor attachment thumbnails", () => {
  beforeEach(() => {
    vi.mocked(createImageThumbnail).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("previews the chip with a thumbnail while sending the original payload", async () => {
    vi.mocked(createImageThumbnail).mockResolvedValue("THUMBNAIL");
    const editor = new PromptEditor();
    const sent: { text: string; attachments?: PromptAttachment[] }[] = [];
    editor.onSend = (text, _behavior, attachments) => { sent.push({ text, ...(attachments === undefined ? {} : { attachments }) }); };
    document.body.appendChild(editor);
    await editor.updateComplete;

    attachFile(editor, makePhotoFile());
    await vi.waitFor(() => { expect(createImageThumbnail).toHaveBeenCalledTimes(1); });

    const img = editor.renderRoot.querySelector(".attachment-chip img");
    if (!(img instanceof HTMLImageElement)) throw new Error("thumbnail img missing");
    expect(img.src).toBe("data:image/png;base64,THUMBNAIL");

    const sendButton = editor.renderRoot.querySelector("button.send-button");
    if (!(sendButton instanceof HTMLButtonElement)) throw new Error("send button missing");
    sendButton.click();
    await editor.updateComplete;

    expect(sent).toHaveLength(1);
    const attachments = sent[0]?.attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments?.[0]).toMatchObject({ kind: "image", mimeType: "image/png", name: "photo.png" });
    expect(typeof attachments?.[0]?.data).toBe("string");
    expect(JSON.stringify(attachments)).not.toContain("THUMBNAIL");
  });

  it("keeps the attachment and falls back to a file-style preview when thumbnail generation fails", async () => {
    vi.mocked(createImageThumbnail).mockRejectedValue(new Error("decode failed"));
    const editor = new PromptEditor();
    document.body.appendChild(editor);
    await editor.updateComplete;

    attachFile(editor, makePhotoFile());

    await vi.waitFor(() => {
      expect(editor.renderRoot.querySelector(".attachment-chip .attachment-file-preview")).not.toBeNull();
    });
    expect(editor.renderRoot.querySelector(".attachment-chip img")).toBeNull();
  });
});
