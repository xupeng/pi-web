import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PiSessionService, type PiAgentSession } from "./piSessionService.js";
import type { SessionUiEvent } from "../../shared/apiTypes.js";
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

  it("saves attachments and references them with @ paths for non-vision models", async () => {
    const fake = fakeRuntime("img-non-vision", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const hub = new CapturingSessionEventHub();
    const service = buildService(fake, hub);

    await service.prompt(sessionRef("img-non-vision", workspace), "What is in this image?", undefined, [imageAttachment()]);

    // The model-bound text carries compact @-references resolved to absolute
    // paths, so file tools can read them regardless of the process cwd.
    expect(fake.calls.prompt).toHaveLength(1);
    const sent = singlePromptCall(fake.calls.prompt);
    expect(sent.text).toContain(`@${join(workspace, ".pi-web", "attachments", "attachment-")}`);
    expect(sent.text).toContain("shot.png");
    expect(sent.text).toContain("What is in this image?");
    expect(sent.text).not.toContain("analyze_image");
    // Images are no longer delivered inline; the folder-delivery conversion
    // replaces inline delivery with the on-disk references.
    expect(sent.options).toBeUndefined();

    // The file actually landed in the workspace attachment folder.
    const saved = await readdir(join(workspace, ".pi-web", "attachments"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain("shot.png");

    // The UI echo mirrors the "Save to .pi-web/attachments" delivery: the user
    // text followed by compact relative @-references, without image blocks.
    const echo = hub.sessionEvents.find(({ event }) => event.type === "message.append");
    expect(echo).toBeDefined();
    const content = JSON.stringify(echo?.event);
    expect(content).toContain("What is in this image?");
    expect(content).toContain("@.pi-web/attachments/attachment-");
    expect(content).not.toContain("image/png");
    // The echo is marked so the client can reconcile it against the persisted
    // absolute-path user message instead of appending a duplicate line.
    const appendEvents = hub.sessionEvents.filter(
      (entry): entry is { sessionId: string; event: Extract<SessionUiEvent, { type: "message.append" }> } => entry.event.type === "message.append",
    );
    expect(appendEvents.at(-1)?.event.echoRef).toBe(true);

    // A plain prompt without attachments echoes without the marker.
    await service.prompt(sessionRef("img-non-vision", workspace), "no attachment here");
    const plainAppend = hub.sessionEvents.filter(
      (entry): entry is { sessionId: string; event: Extract<SessionUiEvent, { type: "message.append" }> } => entry.event.type === "message.append",
    ).at(-1);
    expect(plainAppend?.event.echoRef).toBeUndefined();

    await service.dispose();
  });

  it("references every image when multiple are attached", async () => {
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
    expect(sent.text).toContain(join(workspace, ".pi-web", "attachments"));
    expect(sent.text).toContain("one.png");
    expect(sent.text).toContain("two.png");
    expect(/@\S+one\.png/.exec(sent.text)).not.toBeNull();
    expect(/@\S+two\.png/.exec(sent.text)).not.toBeNull();
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

  it("resolves folder-delivery @ references to absolute paths for the model", async () => {
    const fake = fakeRuntime("folder-abs", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const hub = new CapturingSessionEventHub();
    const service = buildService(fake, hub);

    await service.prompt(sessionRef("folder-abs", workspace), "Look at this\n\n@.pi-web/attachments/attachment-1-shot.png");

    // The model-bound text carries the absolute path so file tools can read it.
    const sent = singlePromptCall(fake.calls.prompt);
    expect(sent.text).toContain(`@${join(workspace, ".pi-web", "attachments")}/attachment-1-shot.png`);
    expect(sent.text).toContain("Look at this");

    // The echo keeps the relative reference the user already saw.
    const echo = hub.sessionEvents.find(({ event }) => event.type === "message.append");
    const content = JSON.stringify(echo?.event);
    expect(content).toContain("@.pi-web/attachments/attachment-1-shot.png");
    expect(content).not.toContain(join(workspace, ".pi-web", "attachments"));

    await service.dispose();
  });

  it("leaves non-attachment @ references untouched", async () => {
    const fake = fakeRuntime("folder-other-ref", {
      model: nonVisionModel(),
      sessionManager: fakeSessionManager(workspace),
    });
    const service = buildService(fake);

    await service.prompt(sessionRef("folder-other-ref", workspace), "see @some/other/path and @.pi-web/other/file.txt");

    expect(singlePromptCall(fake.calls.prompt).text).toBe("see @some/other/path and @.pi-web/other/file.txt");
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
