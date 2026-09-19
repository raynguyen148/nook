(() => {
  "use strict";

  const APP_MODULES_KEY = Symbol.for("nook.app.modules");
  const DRAFT_RECOVERY_PREFIX = "nook:editor-draft:v2:";
  const DRAFT_RECOVERY_VERSION = 2;
  const DRAFT_TAB_SESSION_KEY = "nook:editor-tab:v1";
  const DEFAULT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const DRAFT_FIELDS = Object.freeze(["id", "title", "typeId", "tagIds", "content"]);
  const SESSION_PHASES = Object.freeze({
    IDLE: "idle",
    DIRTY: "dirty",
    SAVING: "saving",
    SAVED: "saved",
    ERROR: "error",
    CONFLICT: "conflict",
    DISPOSED: "disposed",
  });

  let nextSessionNumber = 0;
  let cachedDefaultTabId = "";

  function nowIso() {
    return new Date().toISOString();
  }

  function getDefaultStorage() {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  }

  function isValidRevision(value, { allowZero = true } = {}) {
    return Number.isInteger(value) && value >= (allowZero ? 0 : 1);
  }

  function assertRevision(value, label = "revision") {
    if (!isValidRevision(value)) {
      throw new TypeError(`${label} must be a non-negative integer.`);
    }
    return value;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeTagIds(tagIds) {
    if (!Array.isArray(tagIds) || tagIds.some((tagId) => typeof tagId !== "string")) {
      throw new TypeError("Editor draft tagIds must be an array of strings.");
    }
    return [...new Set(tagIds.map((tagId) => tagId.trim()).filter(Boolean))];
  }

  function cloneDraft(value, label = "Editor draft") {
    if (!isPlainObject(value)) throw new TypeError(`${label} must be an object.`);
    DRAFT_FIELDS.forEach((field) => {
      if (field === "tagIds") return;
      if (typeof value[field] !== "string") {
        throw new TypeError(`${label}.${field} must be a string.`);
      }
    });
    return {
      id: value.id,
      title: value.title,
      typeId: value.typeId,
      tagIds: normalizeTagIds(value.tagIds),
      content: value.content,
    };
  }

  function emptyDraft() {
    return { id: "", title: "", typeId: "", tagIds: [], content: "" };
  }

  function draftKey(value) {
    return JSON.stringify(cloneDraft(value));
  }

  function draftsEqual(left, right) {
    if (!left || !right) return false;
    return draftKey(left) === draftKey(right);
  }

  function draftFromNote(note, label = "Note") {
    if (!isPlainObject(note)) throw new TypeError(`${label} must be an object.`);
    return cloneDraft({
      id: typeof note.id === "string" ? note.id : "",
      title: note.title,
      typeId: note.typeId,
      tagIds: note.tagIds,
      content: note.content,
    }, `${label} draft`);
  }

  function revisionFromNote(note, fallback = 0) {
    return isValidRevision(note?.revision, { allowZero: false })
      ? note.revision
      : fallback;
  }

  function safeError(error) {
    if (error instanceof Error) return error;
    const normalized = new Error(String(error?.message || error || "Save failed."));
    if (isPlainObject(error)) {
      Object.assign(normalized, error);
      if (typeof error.name === "string") normalized.name = error.name;
      if (typeof error.stack === "string") normalized.stack = error.stack;
    }
    return normalized;
  }

  function conflictLatest(error) {
    return error?.latestNote || error?.latest || error?.note || error?.current || null;
  }

  function makeSessionId(pane) {
    nextSessionNumber += 1;
    const normalizedPane = typeof pane === "string" && pane.trim() ? pane.trim() : "editor";
    return `${normalizedPane}-${Date.now().toString(36)}-${nextSessionNumber.toString(36)}`;
  }

  function makeTabId() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `tab-${globalThis.crypto.randomUUID()}`;
    }
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const values = new Uint32Array(4);
      globalThis.crypto.getRandomValues(values);
      return `tab-${[...values].map((value) => value.toString(36)).join("-")}`;
    }
    return `${makeSessionId("tab")}-${Math.random().toString(36).slice(2)}`;
  }

  function defaultTabId() {
    if (cachedDefaultTabId) return cachedDefaultTabId;
    let sessionStore;
    try {
      sessionStore = globalThis.sessionStorage;
    } catch {
      sessionStore = null;
    }
    if (!sessionStore) {
      cachedDefaultTabId = makeTabId();
      return cachedDefaultTabId;
    }
    try {
      const existing = sessionStore.getItem(DRAFT_TAB_SESSION_KEY);
      if (existing) {
        cachedDefaultTabId = existing;
        return cachedDefaultTabId;
      }
      const created = makeTabId();
      sessionStore.setItem(DRAFT_TAB_SESSION_KEY, created);
      cachedDefaultTabId = created;
      return cachedDefaultTabId;
    } catch {
      cachedDefaultTabId = makeTabId();
      return cachedDefaultTabId;
    }
  }

  function cloneMaybeDraft(value) {
    if (!value) return null;
    return cloneDraft(value);
  }

  function createDraftRecoveryStore({
    storage = getDefaultStorage(),
    now = () => Date.now(),
    maxAgeMs = DEFAULT_DRAFT_MAX_AGE_MS,
    tabId = "",
  } = {}) {
    const resolvedTabId = String(tabId || defaultTabId());
    const resolvedMaxAge = Number.isFinite(maxAgeMs) && maxAgeMs >= 0
      ? maxAgeMs
      : DEFAULT_DRAFT_MAX_AGE_MS;

    function normalizeIdentity(identity) {
      if (typeof identity === "string" && identity.trim()) {
        return { tabId: resolvedTabId, pane: "editor", sessionId: identity.trim() };
      }
      if (!isPlainObject(identity)) return null;
      const sessionId = identity.sessionId ?? identity.id;
      const pane = identity.pane ?? identity.kind ?? "editor";
      const identityTabId = identity.tabId ?? identity.tab ?? resolvedTabId;
      if (
        typeof sessionId !== "string" || !sessionId.trim() ||
        typeof pane !== "string" || !pane.trim() ||
        typeof identityTabId !== "string" || !identityTabId.trim()
      ) return null;
      return {
        tabId: identityTabId.trim(),
        pane: pane.trim(),
        sessionId: sessionId.trim(),
      };
    }

    function encodePart(value) {
      return encodeURIComponent(value);
    }

    function decodePart(value) {
      return decodeURIComponent(value);
    }

    function keyFor(identity) {
      const normalized = normalizeIdentity(identity);
      if (!normalized) return "";
      return `${DRAFT_RECOVERY_PREFIX}${encodePart(normalized.tabId)}:${encodePart(normalized.pane)}:${encodePart(normalized.sessionId)}`;
    }

    function identityFromKey(key) {
      if (typeof key !== "string" || !key.startsWith(DRAFT_RECOVERY_PREFIX)) return null;
      const encoded = key.slice(DRAFT_RECOVERY_PREFIX.length).split(":");
      if (encoded.length !== 3 || encoded.some((part) => !part)) return null;
      try {
        return {
          tabId: decodePart(encoded[0]),
          pane: decodePart(encoded[1]),
          sessionId: decodePart(encoded[2]),
        };
      } catch {
        return null;
      }
    }

    function clockMs() {
      const value = typeof now === "function" ? now() : Date.now();
      if (typeof value === "number") return value;
      const parsed = Date.parse(String(value));
      return Number.isNaN(parsed) ? Date.now() : parsed;
    }

    function timestampMs(value) {
      if (typeof value !== "string") return NaN;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? NaN : parsed;
    }

    function validateRecord(value, { key = "", checkAge = false } = {}) {
      if (!isPlainObject(value) || value.version !== DRAFT_RECOVERY_VERSION) return null;
      if (
        typeof value.tabId !== "string" || !value.tabId.trim() ||
        typeof value.pane !== "string" || !value.pane.trim() ||
        typeof value.sessionId !== "string" || !value.sessionId.trim()
      ) return null;
      const identity = normalizeIdentity({
        tabId: value.tabId,
        pane: value.pane,
        sessionId: value.sessionId,
      });
      if (!identity || !timestampMs(value.savedAt)) return null;
      if (!isValidRevision(value.baseRevision)) return null;
      let draft;
      try {
        draft = cloneDraft(value.draft, "Recovery draft");
      } catch {
        return null;
      }
      if (checkAge && clockMs() - timestampMs(value.savedAt) > resolvedMaxAge) return null;
      const expectedKey = keyFor(identity);
      if (key && expectedKey !== key) return null;
      return {
        key: expectedKey,
        version: DRAFT_RECOVERY_VERSION,
        tabId: identity.tabId,
        pane: identity.pane,
        sessionId: identity.sessionId,
        savedAt: value.savedAt,
        baseRevision: value.baseRevision,
        draft,
      };
    }

    function removeKey(key) {
      if (!key || !key.startsWith(DRAFT_RECOVERY_PREFIX) || typeof storage?.removeItem !== "function") return false;
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }

    function read(identity) {
      const key = keyFor(identity);
      if (!key || !storage?.getItem) return null;
      let raw;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        removeKey(key);
        return null;
      }
      const record = validateRecord(parsed, { key, checkAge: true });
      if (!record) removeKey(key);
      return record;
    }

    function write(identity, draft, { baseRevision = 0, savedAt = "" } = {}) {
      const normalizedIdentity = normalizeIdentity(identity);
      if (!normalizedIdentity || !storage?.setItem) return false;
      const key = keyFor(normalizedIdentity);
      let normalizedDraft;
      try {
        normalizedDraft = cloneDraft(draft);
        assertRevision(baseRevision, "baseRevision");
        if (!savedAt) savedAt = new Date(clockMs()).toISOString();
        if (!timestampMs(savedAt)) throw new TypeError("savedAt must be an ISO timestamp.");
      } catch {
        return false;
      }
      const record = {
        version: DRAFT_RECOVERY_VERSION,
        tabId: normalizedIdentity.tabId,
        pane: normalizedIdentity.pane,
        sessionId: normalizedIdentity.sessionId,
        savedAt,
        baseRevision,
        draft: normalizedDraft,
      };
      try {
        storage.setItem(key, JSON.stringify(record));
        return true;
      } catch {
        return false;
      }
    }

    function remove(identityOrKey) {
      const key = typeof identityOrKey === "string" && identityOrKey.startsWith(DRAFT_RECOVERY_PREFIX)
        ? identityOrKey
        : keyFor(identityOrKey);
      return removeKey(key);
    }

    function enumerate({ prune = true } = {}) {
      if (!storage || typeof storage.key !== "function") return [];
      let length;
      try {
        length = storage.length;
      } catch {
        return [];
      }
      if (typeof length !== "number") return [];
      const records = [];
      const keys = [];
      for (let index = 0; index < length; index += 1) {
        let key;
        try {
          key = storage.key(index);
        } catch {
          continue;
        }
        if (typeof key === "string" && key.startsWith(DRAFT_RECOVERY_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => {
        let raw;
        try {
          raw = storage.getItem(key);
        } catch {
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          if (prune) removeKey(key);
          return;
        }
        const record = validateRecord(parsed, { key, checkAge: true });
        if (!record) {
          if (prune) removeKey(key);
          return;
        }
        records.push(record);
      });
      return records;
    }

    function prune() {
      enumerate({ prune: true });
      return true;
    }

    return Object.freeze({
      prefix: DRAFT_RECOVERY_PREFIX,
      version: DRAFT_RECOVERY_VERSION,
      tabId: resolvedTabId,
      keyFor,
      validate: (value, options) => validateRecord(value, options),
      read,
      write,
      remove,
      enumerate,
      prune,
    });
  }

  function createEditorSession({
    storage,
    pane = "editor",
    sessionId = makeSessionId(pane),
    noteId = "",
    baseRevision = 0,
    committed = null,
    committedSnapshot = committed,
    draft = null,
    currentDraft = draft,
    recoveryStore = null,
    draftRecoveryStore = recoveryStore,
    recoveryIdentity = null,
  } = {}) {
    const saveNote = typeof storage === "function"
      ? storage
      : storage?.saveNote || storage?.save;
    if (typeof saveNote !== "function") {
      throw new TypeError("createEditorSession requires an injected storage.saveNote function.");
    }

    const normalizedPane = typeof pane === "string" && pane.trim() ? pane.trim() : "editor";
    const normalizedSessionId = String(sessionId || makeSessionId(normalizedPane));
    let token = Object.freeze({ pane: normalizedPane, sessionId: normalizedSessionId });
    let disposed = false;
    let revision = assertRevision(baseRevision, "baseRevision");
    let committedDraft = committedSnapshot == null ? null : cloneDraft(committedSnapshot, "Committed draft");
    let draftValue = currentDraft == null
      ? (committedDraft ? cloneDraft(committedDraft) : emptyDraft())
      : cloneDraft(currentDraft, "Current draft");
    if (revision === 0 && isValidRevision(committedSnapshot?.revision, { allowZero: false })) {
      revision = committedSnapshot.revision;
    }
    let noteKey = typeof noteId === "string" && noteId
      ? noteId
      : (committedDraft?.id || draftValue.id || "");
    let draftVersion = 0;
    let saveSequence = 0;
    let phase = draftsEqual(draftValue, committedDraft) ? SESSION_PHASES.SAVED : SESSION_PHASES.DIRTY;
    if (!committedDraft && !draftValue.title && !draftValue.typeId && !draftValue.content && !draftValue.tagIds.length) {
      phase = SESSION_PHASES.IDLE;
    }
    let lastError = null;
    let conflict = null;
    let activeIntent = null;
    let pendingIntent = null;
    let recovery = draftRecoveryStore;
    const identity = recoveryIdentity || {
      pane: normalizedPane,
      sessionId: normalizedSessionId,
    };

    function isCurrent(candidate = token) {
      return !disposed && candidate === token;
    }

    function isDirty() {
      if (committedDraft) return !draftsEqual(draftValue, committedDraft);
      return Boolean(
        draftValue.id ||
        draftValue.title.trim() ||
        draftValue.typeId ||
        draftValue.tagIds.length ||
        draftValue.content,
      );
    }

    function recoverySync() {
      if (!recovery) return;
      if (isDirty()) {
        recovery.write(identity, draftValue, { baseRevision: revision });
      } else {
        recovery.remove(identity);
      }
    }

    function stateSnapshot() {
      return {
        pane: normalizedPane,
        sessionId: normalizedSessionId,
        token,
        noteId: noteKey,
        baseRevision: revision,
        committedSnapshot: committedDraft ? cloneDraft(committedDraft) : null,
        currentDraft: cloneDraft(draftValue),
        draftVersion,
        saveSequence,
        phase,
        status: phase,
        dirty: isDirty(),
        saving: Boolean(activeIntent),
        conflict: conflict
          ? {
              code: conflict.code,
              deleted: conflict.deleted === true,
              latest: cloneDraft(conflict.latest),
              latestRevision: conflict.latestRevision,
              draft: cloneDraft(conflict.draft),
              attemptedDraft: cloneDraft(conflict.attemptedDraft),
              expectedRevision: conflict.expectedRevision,
              saveSequence: conflict.saveSequence,
            }
          : null,
        error: lastError,
      };
    }

    function markPhase() {
      if (disposed) {
        phase = SESSION_PHASES.DISPOSED;
        return;
      }
      if (conflict) {
        phase = SESSION_PHASES.CONFLICT;
        return;
      }
      if (activeIntent) {
        phase = SESSION_PHASES.SAVING;
        return;
      }
      if (isDirty()) {
        phase = SESSION_PHASES.DIRTY;
        return;
      }
      phase = committedDraft ? SESSION_PHASES.SAVED : SESSION_PHASES.IDLE;
    }

    function updateDraft(nextDraft, { preserveConflict = true } = {}) {
      if (disposed) return { ignored: true, state: stateSnapshot() };
      const candidate = typeof nextDraft === "function"
        ? nextDraft(cloneDraft(draftValue))
        : nextDraft;
      const normalized = cloneDraft(candidate, "Current draft");
      const changed = !draftsEqual(normalized, draftValue);
      if (changed) {
        draftValue = normalized;
        draftVersion += 1;
        lastError = null;
        if (!preserveConflict) conflict = null;
        markPhase();
        recoverySync();
      }
      return { changed, state: stateSnapshot() };
    }

    function captureIntent(options = {}) {
      const sequence = ++saveSequence;
      const capturedDraft = cloneDraft(draftValue);
      return {
        sequence,
        token,
        pane: normalizedPane,
        sessionId: normalizedSessionId,
        noteId: noteKey,
        draft: capturedDraft,
        draftVersion,
        baseRevision: revision,
        expectedRevision: isValidRevision(options.expectedRevision)
          ? options.expectedRevision
          : (capturedDraft.id ? revision : undefined),
      };
    }

    function storageInput(intent) {
      const input = {
        ...cloneDraft(intent.draft),
      };
      if (intent.expectedRevision !== undefined && input.id) input.expectedRevision = intent.expectedRevision;
      return input;
    }

    function latestFromConflictError(error, fallbackDraft) {
      const latest = conflictLatest(error);
      if (!latest) return null;
      const fallbackRevision = isValidRevision(error?.latestRevision, { allowZero: false })
        ? error.latestRevision
        : revision;
      try {
        return {
          note: latest,
          draft: draftFromNote(latest, "Conflict latest note"),
          revision: revisionFromNote(latest, fallbackRevision),
        };
      } catch {
        return {
          note: null,
          draft: cloneDraft(fallbackDraft),
          revision: fallbackRevision,
        };
      }
    }

    function makeResult(status, intent, extra = {}) {
      return {
        status,
        sequence: intent?.sequence ?? null,
        sessionId: normalizedSessionId,
        token: intent?.token || token,
        noteId: noteKey,
        draftVersion,
        dirty: isDirty(),
        ...extra,
      };
    }

    function settleWaiters(waiters, result) {
      waiters.splice(0).forEach((resolve) => resolve(result));
    }

    function executeIntent(intent, waiters = []) {
      if (disposed || !isCurrent(intent.token)) {
        const result = makeResult("stale", intent, { ignored: true });
        settleWaiters(waiters, result);
        return Promise.resolve(result);
      }

      // A queued save should capture the latest draft and revision at the
      // moment it starts. This keeps input typed during the previous save.
      if (intent.queued) {
        intent.draft = cloneDraft(draftValue);
        intent.draftVersion = draftVersion;
        intent.baseRevision = revision;
        intent.expectedRevision = intent.draft.id ? revision : undefined;
        intent.noteId = noteKey;
      }

      activeIntent = intent;
      lastError = null;
      markPhase();
      const input = storageInput(intent);
      const savePromise = Promise.resolve().then(() => saveNote.call(storage, input));
      return savePromise.then((savedValue) => {
        if (disposed || !isCurrent(intent.token)) {
          activeIntent = null;
          const result = makeResult("stale", intent, { ignored: true });
          settleWaiters(waiters, result);
          return result;
        }

        activeIntent = null;
        const savedNote = isPlainObject(savedValue) ? savedValue : input;
        const savedDraft = draftFromNote({
          ...savedNote,
          id: typeof savedNote.id === "string" ? savedNote.id : intent.draft.id,
          title: typeof savedNote.title === "string" ? savedNote.title : intent.draft.title,
          typeId: typeof savedNote.typeId === "string" ? savedNote.typeId : intent.draft.typeId,
          tagIds: Array.isArray(savedNote.tagIds) ? savedNote.tagIds : intent.draft.tagIds,
          content: typeof savedNote.content === "string" ? savedNote.content : intent.draft.content,
        }, "Saved note");
        noteKey = savedDraft.id;
        revision = revisionFromNote(savedNote, intent.draft.id ? revision + 1 : 1);
        committedDraft = savedDraft;
        conflict = null;
        lastError = null;
        const currentMatchesCapture = draftVersion === intent.draftVersion && draftsEqual(draftValue, intent.draft);
        if (currentMatchesCapture) {
          // A newly-created note receives its durable id from storage. Keep the
          // in-memory draft aligned with that committed identity so the session
          // does not become dirty immediately after a successful first save.
          draftValue = cloneDraft(savedDraft);
        }
        markPhase();
        recoverySync();
        const result = makeResult("saved", intent, {
          savedNote: { ...savedValue, ...savedDraft, revision },
          currentMatchesCapture,
        });
        settleWaiters(waiters, result);

        if (pendingIntent) {
          const queued = pendingIntent;
          pendingIntent = null;
          queued.intent.queued = true;
          executeIntent(queued.intent, queued.waiters);
        } else {
          markPhase();
        }
        return result;
      }).catch((rawError) => {
        if (disposed || !isCurrent(intent.token)) {
          activeIntent = null;
          const result = makeResult("stale", intent, { ignored: true });
          settleWaiters(waiters, result);
          return result;
        }

        activeIntent = null;
        const error = safeError(rawError);
        if (error.code === "NOTE_CONFLICT") {
          const deleted = !error.latestNote;
          const latest = latestFromConflictError(error, intent.draft) || {
            note: null,
            draft: committedDraft ? cloneDraft(committedDraft) : cloneDraft(intent.draft),
            revision,
          };
          committedDraft = latest.draft;
          revision = latest.revision;
          noteKey = latest.draft.id || noteKey;
          conflict = {
            code: "NOTE_CONFLICT",
            deleted,
            latest: latest.draft,
            latestRevision: latest.revision,
            draft: cloneDraft(draftValue),
            attemptedDraft: cloneDraft(intent.draft),
            expectedRevision: intent.expectedRevision,
            saveSequence: intent.sequence,
          };
          lastError = error;
          markPhase();
          recoverySync();
          const result = makeResult("conflict", intent, {
            error,
            latest: latest.draft,
            latestNote: latest.note ? { ...latest.note } : null,
            latestRevision: latest.revision,
            deleted,
          });
          settleWaiters(waiters, result);
          if (pendingIntent) {
            settleWaiters(pendingIntent.waiters, result);
            pendingIntent = null;
          }
          return result;
        }

        lastError = error;
        conflict = null;
        phase = SESSION_PHASES.ERROR;
        recoverySync();
        const result = makeResult("error", intent, { error });
        settleWaiters(waiters, result);
        if (pendingIntent) {
          settleWaiters(pendingIntent.waiters, result);
          pendingIntent = null;
        }
        return result;
      });
    }

    function save(options = {}) {
      if (disposed) return Promise.resolve(makeResult("stale", null, { ignored: true }));
      if (conflict && !options.force) {
        return Promise.resolve(makeResult("conflict", null, {
          error: lastError,
          latest: cloneDraft(conflict.latest),
          latestRevision: conflict.latestRevision,
          latestNote: null,
          deleted: conflict.deleted === true,
        }));
      }
      if (!options.force && !isDirty() && !activeIntent) {
        markPhase();
        return Promise.resolve(makeResult("noop", null, { skipped: true }));
      }
      const intent = captureIntent(options);
      if (activeIntent) {
        if (pendingIntent) {
          pendingIntent.intent = intent;
        } else {
          pendingIntent = { intent, waiters: [] };
        }
        intent.queued = true;
        markPhase();
        recoverySync();
        return new Promise((resolve) => {
          pendingIntent.waiters.push(resolve);
        });
      }
      return executeIntent(intent);
    }

    function resolveConflict(strategy = "keep-editing") {
      if (!conflict) return Promise.resolve(makeResult("noop", null, { skipped: true }));
      if (strategy === "view-latest" || strategy === "latest" || strategy === "discard-local") {
        if (conflict.deleted) {
          markPhase();
          return Promise.resolve(makeResult("keep-editing", null, { deleted: true }));
        }
        draftValue = cloneDraft(conflict.latest);
        committedDraft = cloneDraft(conflict.latest);
        revision = conflict.latestRevision;
        noteKey = draftValue.id;
        draftVersion += 1;
        conflict = null;
        lastError = null;
        markPhase();
        recoverySync();
        return Promise.resolve(makeResult("view-latest", null));
      }
      if (strategy === "keep-mine" || strategy === "mine" || strategy === "retry") {
        if (conflict.deleted) {
          noteKey = "";
          revision = 0;
          committedDraft = null;
          draftValue = { ...cloneDraft(draftValue), id: "" };
          draftVersion += 1;
          conflict = null;
          lastError = null;
          markPhase();
          recoverySync();
          return save({ force: true });
        }
        committedDraft = cloneDraft(conflict.latest);
        revision = conflict.latestRevision;
        noteKey = committedDraft.id || noteKey;
        conflict = null;
        lastError = null;
        markPhase();
        recoverySync();
        return save({ force: true });
      }
      markPhase();
      return Promise.resolve(makeResult("keep-editing", null));
    }

    function applyExternalSnapshot(note) {
      if (disposed) return { ignored: true, state: stateSnapshot() };
      const latest = draftFromNote(note, "External note");
      const latestRevision = revisionFromNote(note, revision);
      if (latestRevision <= revision) return { ignored: true, state: stateSnapshot() };
      if (isDirty() || activeIntent) {
        const expectedRevision = revision;
        committedDraft = latest;
        revision = latestRevision;
        noteKey = latest.id || noteKey;
        conflict = {
          code: "NOTE_CONFLICT",
          deleted: false,
          latest: cloneDraft(latest),
          latestRevision,
          draft: cloneDraft(draftValue),
          attemptedDraft: cloneDraft(draftValue),
          expectedRevision,
          saveSequence,
        };
        markPhase();
        recoverySync();
        return { conflict: true, state: stateSnapshot() };
      }
      committedDraft = latest;
      draftValue = cloneDraft(latest);
      revision = latestRevision;
      noteKey = latest.id || noteKey;
      draftVersion += 1;
      conflict = null;
      lastError = null;
      markPhase();
      recoverySync();
      return { applied: true, state: stateSnapshot() };
    }

    function dispose() {
      if (disposed) return;
      if (isDirty()) recoverySync();
      disposed = true;
      activeIntent = null;
      token = Object.freeze({ pane: normalizedPane, sessionId: `${normalizedSessionId}:disposed` });
      phase = SESSION_PHASES.DISPOSED;
      if (pendingIntent) {
        settleWaiters(
          pendingIntent.waiters,
          makeResult("stale", pendingIntent.intent, { ignored: true }),
        );
        pendingIntent = null;
      }
    }

    const session = {
      get token() { return token; },
      get pane() { return normalizedPane; },
      get sessionId() { return normalizedSessionId; },
      get noteId() { return noteKey; },
      get baseRevision() { return revision; },
      get committedSnapshot() { return committedDraft ? cloneDraft(committedDraft) : null; },
      get currentDraft() { return cloneDraft(draftValue); },
      get draftVersion() { return draftVersion; },
      get saveSequence() { return saveSequence; },
      get phase() { return phase; },
      get status() { return phase; },
      get dirty() { return isDirty(); },
      get saving() { return Boolean(activeIntent); },
      get conflict() { return stateSnapshot().conflict; },
      getState: stateSnapshot,
      isCurrent,
      isDirty,
      hasUnsavedChanges: isDirty,
      captureDraft: () => cloneDraft(draftValue),
      updateDraft,
      setDraft: updateDraft,
      save,
      retryKeepMine: () => resolveConflict("keep-mine"),
      keepMine: () => resolveConflict("keep-mine"),
      viewLatest: () => resolveConflict("view-latest"),
      keepEditing: () => resolveConflict("keep-editing"),
      resolveConflict,
      applyExternalSnapshot,
      receiveExternalSnapshot: applyExternalSnapshot,
      dispose,
    };

    recoverySync();
    return Object.freeze(session);
  }

  function clearAllDraftRecoveryRecords(storage = getDefaultStorage()) {
    const recoveryStore = createDraftRecoveryStore({ storage });
    const records = recoveryStore.enumerate({ prune: true });
    records.forEach((record) => recoveryStore.remove(record.key));
    return records.length;
  }

  const registry = globalThis[APP_MODULES_KEY];
  registry.register("editor-session", (app) => {
    Object.assign(app.api, {
      createEditorSession,
      createDraftRecoveryStore,
      clearAllDraftRecoveryRecords,
      editorSessionPhases: SESSION_PHASES,
    });
  });
})();
