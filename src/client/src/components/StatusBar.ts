import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SessionActivity, SessionStatus } from "../api";
import { chatActivityPresentation } from "../chatActivity";
import { formatCost, formatTokenCount } from "../utils/format";
import { renderSessionWarningIcon, statusBarStyles } from "./shared";

export interface StatusBarWarningControlContent {
  countText: string;
  accessibleLabel: string;
}

export function statusBarWarningControlContent(count: number, expanded: boolean): StatusBarWarningControlContent | undefined {
  if (!Number.isInteger(count) || count <= 0) return undefined;
  const warningText = `${String(count)} ${count === 1 ? "warning" : "warnings"}`;
  return {
    countText: String(count),
    accessibleLabel: expanded ? `Minimise ${warningText}` : `Show ${warningText} in the warning area`,
  };
}

@customElement("status-bar")
export class StatusBar extends LitElement {
  @property({ attribute: false }) status?: SessionStatus;
  @property({ attribute: false }) activity?: SessionActivity;
  @property({ type: Boolean }) sending = false;
  @property({ type: Number }) warningCount = 0;
  @property({ type: Boolean }) warningsExpanded = false;
  @property({ attribute: false }) onToggleWarnings?: () => void;

  private readonly handleToggleWarnings = (): void => {
    this.onToggleWarnings?.();
  };

  override render() {
    const status = this.status;
    if (status === undefined) return html`<div class="bar muted">No session status yet</div>`;
    const context = status.contextUsage;
    const contextText = context
      ? context.percent == null
        ? `context ${formatTokenCount(context.contextWindow)}`
        : `${context.percent.toFixed(1)}%/${formatTokenCount(context.contextWindow)}`
      : "context unknown";
    const tokens = status.tokens;
    const warningControl = statusBarWarningControlContent(this.warningCount, this.warningsExpanded);
    const activity = chatActivityPresentation(this.activity, status, this.sending);
    return html`
      <div class="bar">
        <div class="bar-inner">
          <div class="status-left">
            ${activity === undefined ? null : html`
              <span class=${activity.active ? "activity active" : "activity"} role="status" aria-live="polite">
                <span class="dot" aria-hidden="true"></span>
                <span class="activity-text">${activity.text}</span>
              </span>
            `}
            ${warningControl === undefined || this.onToggleWarnings === undefined ? null : html`
              <button
                type="button"
                class="warning-toggle"
                title=${warningControl.accessibleLabel}
                aria-label=${warningControl.accessibleLabel}
                aria-expanded=${String(this.warningsExpanded)}
                @click=${this.handleToggleWarnings}
              >
                ${renderSessionWarningIcon("warning", "warning-toggle-icon")}
                <span>${warningControl.countText}</span>
              </button>
            `}
          </div>
          <span>↑${formatTokenCount(tokens.input)}</span>
          <span>↓${formatTokenCount(tokens.output)}</span>
          <span class="context">${contextText}</span>
          <span>${formatCost(status.cost)}</span>
          ${status.pendingMessageCount > 0 ? html`<span>${String(status.pendingMessageCount)} queued</span>` : null}
        </div>
      </div>
    `;
  }

  static override styles = statusBarStyles;
}
