import type { SessionActivity, SessionStatus } from "./api";

/** Bottom-bar agent status text and emphasis derived from live activity/status. */
export interface ChatActivityPresentation {
  text: string;
  active: boolean;
}

/**
 * Derive the agent status shown in the bottom status bar from the live session
 * activity and status, mirroring the chat `activity-dock` semantics: sending
 * and every working state (compacting / bash / streaming / queued) report an
 * active status, while an idle session shows the last activity label or "idle".
 */
export function chatActivityPresentation(
  activity: SessionActivity | undefined,
  status: SessionStatus | undefined,
  sending: boolean,
): ChatActivityPresentation | undefined {
  if (sending) return { text: "Sending your message…", active: true };
  const statusWord = statusWordFromStatus(status);
  if (statusWord !== undefined) {
    if (activity !== undefined && activity.phase !== "idle") return { text: activityLabel(activity), active: true };
    return { text: statusWord, active: true };
  }
  if (activity === undefined) return status === undefined ? undefined : { text: "idle", active: false };
  return { text: activityLabel(activity), active: activity.phase === "active" || activity.phase === "error" };
}

function statusWordFromStatus(status: SessionStatus | undefined): string | undefined {
  if (status === undefined) return undefined;
  if (status.isCompacting) return "compacting";
  if (status.isBashRunning) return "bash";
  if (status.isStreaming) return "running";
  if (status.pendingMessageCount > 0) return "queued";
  return undefined;
}

function activityLabel(activity: SessionActivity): string {
  return activity.detail !== undefined && activity.detail !== "" ? `${activity.label}: ${activity.detail}` : activity.label;
}
