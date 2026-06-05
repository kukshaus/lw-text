import type { ReactNode } from "react";
import { isMacOS, shortcutLabel } from "./shortcuts";

export interface TemplateCommandProps {
  kind: "template";
  dirty: boolean;
  saving: boolean;
  readOnly?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onRevert?: () => void;
}

export interface DataCommandProps {
  kind: "data";
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  onRevert?: () => void;
}

export type EditorCommandProps = TemplateCommandProps | DataCommandProps;

/** Undo / save / revert — lives in the main app header, not the tab row. */
export function EditorCommandBar(props: EditorCommandProps) {
  if (props.kind === "template") {
    return (
      <div className="flex items-center gap-1 border-l border-white/10 pl-3">
        {props.dirty && !props.readOnly && (
          <span className="mr-1 text-rose-400" title="Unsaved changes">
            ●
          </span>
        )}
        <ToolBtn
          onClick={props.onUndo}
          disabled={!props.canUndo || props.readOnly}
          title={`Undo (${shortcutLabel("z")})`}
          aria-label="Undo"
        >
          ↶
        </ToolBtn>
        <ToolBtn
          onClick={props.onRedo}
          disabled={!props.canRedo || props.readOnly}
          title={`Redo (${isMacOS() ? shortcutLabel("z", { shift: true }) : `${shortcutLabel("y")} / ${shortcutLabel("z", { shift: true })}`})`}
          aria-label="Redo"
        >
          ↷
        </ToolBtn>
        {!props.readOnly && (
          <>
            <ActionBtn
              onClick={props.onSave}
              disabled={props.saving || !props.dirty}
              title={`Save (${shortcutLabel("s")})`}
              primary
            >
              {props.saving ? "Saving…" : "Save"}
            </ActionBtn>
            {props.dirty && props.onRevert && (
              <ActionBtn onClick={props.onRevert} title="Revert to last saved">
                Revert
              </ActionBtn>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 border-l border-white/10 pl-3">
      {props.dirty && (
        <span className="mr-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200/90 ring-1 ring-amber-500/25">
          Unsaved
        </span>
      )}
      <ActionBtn
        onClick={props.onSave}
        disabled={!props.dirty || props.saving || !props.canSave}
        title={`Save scenario (${shortcutLabel("s")})`}
        primary
      >
        {props.saving ? "Saving…" : "Save"}
      </ActionBtn>
      {props.dirty && props.onRevert && (
        <ActionBtn onClick={props.onRevert} title="Revert scenario to last saved">
          Revert
        </ActionBtn>
      )}
    </div>
  );
}

function ToolBtn({
  children,
  disabled,
  onClick,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="grid h-8 w-8 place-items-center rounded-md text-sm text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ActionBtn({
  children,
  disabled,
  onClick,
  title,
  primary,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        primary
          ? "rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          : "rounded-md px-2.5 py-1.5 text-sm text-white/50 transition hover:bg-white/5 hover:text-white/80 disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}
