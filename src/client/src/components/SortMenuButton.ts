import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { actionMenuPanelStyle } from "./actionMenu";

export interface SortMenuOption {
  value: string;
  label: string;
}

/**
 * Compact heading control that picks one of several list orderings. The
 * trigger shows the current choice; the panel lists every option as a
 * menuitemradio with a checkmark on the selected one.
 */
@customElement("sort-menu-button")
export class SortMenuButton extends LitElement {
  @property({ attribute: false }) label = "";
  @property({ attribute: false }) options: SortMenuOption[] = [];
  @property({ attribute: false }) selected?: string;
  @property({ attribute: false }) onSelect?: (value: string) => void;

  @state() private open = false;
  @state() private menuStyle = "";

  private readonly onDocumentClick = (event: MouseEvent) => {
    if (event.composedPath().includes(this)) return;
    this.open = false;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.onDocumentClick);
    super.disconnectedCallback();
  }

  private toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open) {
      this.open = false;
      return;
    }
    this.menuStyle = actionMenuPanelStyle(event.currentTarget, { constrainTo: "viewport" });
    this.open = true;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.open = false;
  }

  private choose(value: string): void {
    this.open = false;
    if (value === this.selected) return;
    this.onSelect?.(value);
  }

  private renderSelectedLabel(): string {
    return this.options.find((option) => option.value === this.selected)?.label ?? this.label;
  }

  override render() {
    return html`
      <div class="sort-menu">
        <button
          class="sort-menu-toggle"
          title=${this.label}
          aria-label=${this.label}
          aria-haspopup="menu"
          aria-expanded=${String(this.open)}
          @click=${(event: MouseEvent) => { this.toggle(event); }}
          @keydown=${(event: KeyboardEvent) => { this.handleKeydown(event); }}
        ><span class="sort-menu-label">${this.renderSelectedLabel()}</span><span class="sort-caret" aria-hidden="true">▾</span></button>
        ${this.open ? html`
          <div class="sort-menu-panel" role="menu" aria-label=${this.label} style=${this.menuStyle} @click=${(event: MouseEvent) => { event.stopPropagation(); }}>
            ${this.options.map((option) => html`
              <button
                role="menuitemradio"
                aria-checked=${String(option.value === this.selected)}
                @click=${() => { this.choose(option.value); }}
              ><span class="sort-check" aria-hidden="true">${option.value === this.selected ? "✓" : ""}</span><span>${option.label}</span></button>
            `)}
          </div>
        ` : null}
      </div>
    `;
  }

  static override styles = css`
    .sort-menu { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; }
    .sort-menu-toggle { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--pi-muted); font: inherit; font-size: 11px; line-height: 1; cursor: pointer; }
    .sort-menu-toggle:hover, .sort-menu-toggle[aria-expanded="true"] { color: var(--pi-text); background: var(--pi-surface-hover); }
    .sort-menu-label { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sort-caret { font-size: 10px; }
    .sort-menu-panel { position: fixed; z-index: 50; box-sizing: border-box; min-width: 140px; overflow: auto; padding: 4px; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 8px 24px var(--pi-shadow); }
    .sort-menu-panel button { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px; border: 0; background: transparent; color: var(--pi-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; border-radius: 5px; }
    .sort-menu-panel button:hover { background: var(--pi-selection-bg); }
    .sort-check { width: 14px; flex: 0 0 auto; color: var(--pi-accent); }
  `;
}
