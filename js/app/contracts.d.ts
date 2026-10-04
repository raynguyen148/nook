export interface NoteDraft {
  id: string;
  title: string;
  typeId: string;
  tagIds: string[];
  content: string;
}

export interface SavedNote extends NoteDraft {
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  isPinned?: boolean;
}

export interface RecoverySource { key: string; savedAt: string }
export interface RecoveryRecord extends RecoverySource {
  draft: NoteDraft;
  baseRevision: number;
  committedSnapshot?: NoteDraft | null;
  conflicted?: boolean;
  sources?: RecoverySource[];
}

export type SaveResult =
  | { status: 'saved'; savedNote: SavedNote; currentMatchesCapture: boolean }
  | { status: 'conflict'; latestNote?: SavedNote; latest: NoteDraft; latestRevision: number; deleted?: boolean }
  | { status: 'error'; error: Error }
  | { status: 'noop' | 'stale' | 'conflict-kept' };

export interface SessionState {
  dirty: boolean;
  currentDraft: NoteDraft;
}

export interface EditorSession {
  readonly currentDraft: NoteDraft;
  updateDraft(draft: NoteDraft): { state: SessionState };
  save(): Promise<SaveResult>;
  keepMine(): Promise<SaveResult>;
  keepEditing(): unknown;
  dispose(): unknown;
  discardRecovery(): unknown;
  hasUnsavedChanges(): boolean;
}

export interface PaneAdapter {
  pane: 'primary' | 'secondary';
  readDraft(): NoteDraft;
  isActive(): boolean;
  onSession(session: EditorSession | null): void;
  setStatus(phase: string, label?: string): void;
  invoker(): HTMLElement | null;
}

export interface PaneController {
  readonly session: EditorSession | null;
  open(note: SavedNote | null, draft: NoteDraft, options?: { baseRevision?: number; recovery?: RecoveryRecord | null }): EditorSession;
  sync(): SessionState | null;
  save(): Promise<SaveResult>;
  dispose(options?: { discard?: boolean }): void;
  hasUnsavedChanges(): boolean;
}

export interface ThemeConfig {
  storageKey: string;
  modes: readonly string[];
  normalize(value: string | null): string;
  readMode(): string;
  resolve(mode: string): string;
  describe(mode: string): { label: string; file: string; color: string };
  glass: {
    storageKey: string; min: number; max: number; defaultValue: number;
    normalize(value: unknown): { enabled: boolean; transparency: number };
    parse(value: string | null): { enabled: boolean; transparency: number };
    read(): { enabled: boolean; transparency: number };
    apply(value: { enabled: boolean; transparency: number }): void;
  };
}

export interface AppContext {
  storage: unknown;
  theme?: ThemeConfig;
  api: {
    createEditorSession(options: {
      storage: unknown; pane: string; noteId: string; baseRevision: number;
      committed: SavedNote | null; currentDraft: NoteDraft; recoveryStore: unknown;
      recoverySources: RecoverySource[];
      initialConflict: { latest: SavedNote; expectedRevision: number } | null;
    }): EditorSession;
    createDraftRecoveryStore(): unknown;
    requestConflictResolution(options: { localDraft: NoteDraft; latestNote: NoteDraft | null; deleted: boolean; invoker: HTMLElement | null }): Promise<'keep-mine' | 'keep-editing' | 'view-latest'>;
    openConflictLatestPreview?(note: NoteDraft, invoker: HTMLElement | null): void;
    publishDraftPresence?(): void;
    createPaneController?: (adapter: PaneAdapter) => PaneController;
    getStoredTheme?: () => string;
  };
}

export interface ModuleRegistry {
  register(name: string, installer: (app: AppContext) => void): void;
}
