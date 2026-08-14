import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PiSessionService, type PiAgentSession } from "./piSessionService.js";
import { CapturingSessionEventHub, fakeRuntime, fakeSessionManager, runtimeCreator, sessionGateway, sessionRecord, sessionRef, testModel } from "./piSessionService.testSupport.js";
import * as attachmentService from "./attachmentService.js";

const TEST_AGENT_DIR = "/tmp/pi-web-test-agent";

// 1x1 transparent PNG. Valid enough for pi's resizeImage to accept it, so the
// inline images array is populated like a real user attachment would be.
const PNG_1PX_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function imageAttachment(name = "shot.png"): { kind: "image"; mimeType: string; data: string; name: string } {
  return { kind: "image", mimeType: "image/png", data: PNG_1PX_BASE64, name };
}

function nonVisionModel(): NonNullable<PiAgentSession["model"]> {
  return { ...testModel(), input: ["text"] };
}

function visionModel() {
  return testModel();
}

function singlePromptCall(calls: { text: string; options: unknown }[]): { text: string; options: unknown } {
  const call = calls[0];
  if (call === undefined) throw new Error("expected exactly one prompt call");
  return call;
}

describe("PiSessionService image attachments for non-vision models", () => {
  let workspace: string;

  beforeEach(async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    workspace = await mkdtemp(join(tmpdir(), "pi-web-image-attachments-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(workspace, { recursive: true, force: true });
  });

  function buildService(fake: ReturnType<typeof fakeRuntime>, hub = new CapturingSessionEventHub()) {
    return new PiSessionService(hub, {
      agentDir: TEST_AGENT_DIR,
      modelRuntime: fake.session.modelRuntime,
      createAgentRuntime: runtimeCreator(fake.runtime),
      sessionManager: sessionGateway([sessionRecord(fake.session.sessionId, workspace)]),
      heartbeatIntervalMs: 60_000,
    });
  }

  it("saves attachments and appends path notes for non-vision models", async () => {
    const fake = fakeRuntime("img-non-vision", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const hub = new CapturingSessionEventHub();
    const service = buildService(fake, hub);

    await service.prompt(sessionRef("img-non-vision", workspace), "What is in this image?", undefined, [imageAttachment()]);

    // Prompt text sent to the model carries the note with the relative path.
    expect(fake.calls.prompt).toHaveLength(1);
    const sent = singlePromptCall(fake.calls.prompt);
    expect(sent.text).toContain("analyze_image");
    expect(sent.text).toContain(".pi-web/attachments/attachment-");
    expect(sent.text).toContain("shot.png");
    expect(sent.text).toContain("What is in this image?");

    // The file actually landed in the workspace attachment folder.
    const saved = await readdir(join(workspace, ".pi-web", "attachments"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain("shot.png");

    // The UI echo keeps the plain text + image blocks; no note leaks to the UI.
    const echo = hub.sessionEvents.find(({ event }) => event.type === "message.append");
    expect(echo).toBeDefined();
    const content = JSON.stringify(echo?.event);
    expect(JSON.stringify(content)).not.toContain("analyze_image");
    expect(content).toContain("What is in this image?");
    expect(content).toContain("image/png");

    await service.dispose();
  });

  it("lists every path when multiple images are attached", async () => {
    const fake = fakeRuntime("img-multi", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const service = buildService(fake);

    await service.prompt(sessionRef("img-multi", workspace), "Compare these", undefined, [
      imageAttachment("one.png"),
      imageAttachment("two.png"),
    ]);

    expect(fake.calls.prompt).toHaveLength(1);
    const sent = singlePromptCall(fake.calls.prompt);
    expect(sent.text).toContain("one.png");
    expect(sent.text).toContain("two.png");
    const saved = await readdir(join(workspace, ".pi-web", "attachments"));
    expect(saved).toHaveLength(2);
    await service.dispose();
  });

  it("leaves vision models completely untouched", async () => {
    const fake = fakeRuntime("img-vision", {
      model: visionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const service = buildService(fake);

    await service.prompt(sessionRef("img-vision", workspace), "What is in this image?", undefined, [imageAttachment()]);

    expect(fake.calls.prompt).toHaveLength(1);
    expect(singlePromptCall(fake.calls.prompt).text).toBe("What is in this image?");
    await expect(readdir(join(workspace, ".pi-web"))).rejects.toThrow();
    await service.dispose();
  });

  it("leaves plain-text prompts untouched for non-vision models", async () => {
    const fake = fakeRuntime("img-none", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const service = buildService(fake);

    await service.prompt(sessionRef("img-none", workspace), "Just text");

    expect(fake.calls.prompt).toEqual([{ text: "Just text", options: undefined }]);
    await expect(readdir(join(workspace, ".pi-web"))).rejects.toThrow();
    await service.dispose();
  });

  it("falls back to plain prompt text when saving attachments fails", async () => {
    const fake = fakeRuntime("img-save-fail", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const service = buildService(fake);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(attachmentService, "saveAttachmentsToWorkspace").mockRejectedValue(new Error("disk full"));

    await expect(service.prompt(sessionRef("img-save-fail", workspace), "Read this image", undefined, [imageAttachment()])).resolves.toBeUndefined();

    expect(fake.calls.prompt).toHaveLength(1);
    expect(singlePromptCall(fake.calls.prompt).text).toBe("Read this image");
    expect(warn).toHaveBeenCalled();
    await service.dispose();
  });
});
