(() => {
  "use strict";

  const DB_NAME = "personal-notes";
  const DB_VERSION = 2;
  const LEGACY_STORAGE_KEY = "ray-interview-practice-library-v1";
  const BOOTSTRAP_META_KEY = "bootstrap-v1";
  const TAG_PREFIX_MIGRATION_META_KEY = "tag-prefix-removal-v1";
  const MUTATION_META_KEY = "last-library-mutation-v1";
  const FALLBACK_TYPE_ID = "type-general";
  const MAX_RECORDS_PER_IMPORT = 10000;
  const MAX_TITLE_LENGTH = 160;
  const MAX_NAME_LENGTH = 48;
  const MAX_CONTENT_LENGTH = 50000;
  const TYPE_COLORS = [
    "indigo",
    "blue",
    "sky",
    "cyan",
    "teal",
    "emerald",
    "green",
    "lime",
    "amber",
    "orange",
    "red",
    "rose",
    "pink",
    "violet",
    "purple",
    "slate",
  ];
  const STORE = Object.freeze({
    notes: "notes",
    types: "types",
    tags: "tags",
    meta: "meta",
  });

  const DEFAULT_TYPE_DEFINITIONS = [
    { id: FALLBACK_TYPE_ID, name: "General", color: "slate", isFallback: true },
    { id: "type-meeting", name: "Meeting", color: "sky" },
    { id: "type-learning", name: "Learning", color: "violet" },
    { id: "type-research", name: "Research", color: "emerald" },
    { id: "type-project", name: "Project", color: "indigo" },
    { id: "type-personal", name: "Personal", color: "rose" },
  ];

  let databasePromise;

  function nowIso() {
    return new Date().toISOString();
  }

  function newId(prefix) {
    const randomPart =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomPart}`;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database request failed."));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error || new Error("Database transaction was aborted."));
      transaction.onerror = () => {
        // The abort handler gives the final failure reason.
      };
    });
  }

  function migrateNotesToV2(database, transaction) {
    if (!database.objectStoreNames.contains(STORE.notes)) return;
    const request = transaction.objectStore(STORE.notes).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const note = cursor.value;
      cursor.update({
        ...note,
        isPinned: note.isPinned === true,
        deletedAt: normalizeDeletedAt(note.deletedAt),
      });
      cursor.continue();
    };
  }

  function createStores(database) {
    if (!database.objectStoreNames.contains(STORE.notes)) {
      const notes = database.createObjectStore(STORE.notes, { keyPath: "id" });
      notes.createIndex("by-type-id", "typeId");
      notes.createIndex("by-tag-ids", "tagIds", { multiEntry: true });
      notes.createIndex("by-created-at", "createdAt");
      notes.createIndex("by-updated-at", "updatedAt");
    }

    if (!database.objectStoreNames.contains(STORE.types)) {
      const types = database.createObjectStore(STORE.types, { keyPath: "id" });
      types.createIndex("by-normalized-name", "normalizedName", { unique: true });
    }

    if (!database.objectStoreNames.contains(STORE.tags)) {
      const tags = database.createObjectStore(STORE.tags, { keyPath: "id" });
      tags.createIndex("by-normalized-name", "normalizedName", { unique: true });
    }

    if (!database.objectStoreNames.contains(STORE.meta)) {
      database.createObjectStore(STORE.meta, { keyPath: "key" });
    }
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;

    const pendingOpen = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("IndexedDB is unavailable in this browser."));
        return;
      }

      let request;
      try {
        request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = (event) => {
        createStores(request.result);
        if (event.oldVersion < 2) migrateNotesToV2(request.result, request.transaction);
      };
      request.onerror = () => {
        if (databasePromise === pendingOpen) databasePromise = undefined;
        reject(request.error || new Error("Could not open IndexedDB."));
      };
      request.onblocked = () => {
        if (databasePromise === pendingOpen) databasePromise = undefined;
        reject(new Error("Nook is open in another tab and needs to update."));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (databasePromise !== pendingOpen) {
          // A blocked request was already surfaced to the caller. If it later
          // succeeds after another tab closes, do not leave an unused handle open.
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          if (databasePromise === pendingOpen) databasePromise = undefined;
        };
        resolve(database);
      };
    });

    databasePromise = pendingOpen;
    pendingOpen.catch(() => {
      if (databasePromise === pendingOpen) databasePromise = undefined;
    });
    return databasePromise;
  }

  function normalizeWhitespace(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function normalizedName(value) {
    return normalizeWhitespace(value).toLocaleLowerCase();
  }

  function requireText(value, label, maxLength) {
    if (typeof value !== "string") throw new Error(`${label} must be text.`);
    const text = normalizeWhitespace(value);
    if (!text) throw new Error(`${label} is required.`);
    if (text.length > maxLength) {
      throw new Error(`${label} must be ${maxLength} characters or fewer.`);
    }
    return text;
  }

  function stripTagPrefix(value) {
    return typeof value === "string" ? value.replace(/^\s*#+\s*/, "") : value;
  }

  function requireTagName(value) {
    return requireText(stripTagPrefix(value), "Tag name", MAX_NAME_LENGTH);
  }

  function canonicalExistingTagName(value) {
    if (typeof value !== "string") return "";
    return normalizeWhitespace(stripTagPrefix(value));
  }

  function normalizeContent(value) {
    if (value == null) return "";
    if (typeof value !== "string") throw new Error("Note content must be text.");
    if (value.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Note content must be ${MAX_CONTENT_LENGTH} characters or fewer.`);
    }
    return value.replace(/\r\n/g, "\n").trim();
  }

  function requireId(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} needs a valid id.`);
    }
    return value.trim();
  }

  function normalizeColor(value, index = 0) {
    if (TYPE_COLORS.includes(value)) return value;
    return TYPE_COLORS[index % TYPE_COLORS.length];
  }

  function normalizeDate(value, fallback) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      if (fallback) return fallback;
      throw new Error("A note timestamp is invalid.");
    }
    return new Date(value).toISOString();
  }

  function normalizeDeletedAt(value) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  function normalizeNoteRecord(note) {
    return {
      ...note,
      isPinned: note.isPinned === true,
      deletedAt: normalizeDeletedAt(note.deletedAt),
    };
  }

  function uniqueIds(values, label) {
    const ids = new Set();
    values.forEach((value) => {
      if (ids.has(value)) throw new Error(`Duplicate ${label} id found in backup.`);
      ids.add(value);
    });
  }

  function uniqueNames(values, label) {
    const names = new Set();
    values.forEach((value) => {
      if (names.has(value)) throw new Error(`Duplicate ${label} name found in backup.`);
      names.add(value);
    });
  }

  function createDefaultTypes(createdAt = nowIso()) {
    return DEFAULT_TYPE_DEFINITIONS.map((definition) => ({
      ...definition,
      normalizedName: normalizedName(definition.name),
      createdAt,
      updatedAt: createdAt,
    }));
  }

  function sortSnapshot(snapshot) {
    const byName = (left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    snapshot.types.sort((left, right) => {
      if (left.id === FALLBACK_TYPE_ID) return -1;
      if (right.id === FALLBACK_TYPE_ID) return 1;
      return byName(left, right);
    });
    snapshot.tags.sort(byName);
    return snapshot;
  }

  async function getSnapshot() {
    const database = await openDatabase();
    const transaction = database.transaction([STORE.notes, STORE.types, STORE.tags], "readonly");
    const notesRequest = transaction.objectStore(STORE.notes).getAll();
    const typesRequest = transaction.objectStore(STORE.types).getAll();
    const tagsRequest = transaction.objectStore(STORE.tags).getAll();
    const [notes, types, tags] = await Promise.all([
      requestResult(notesRequest),
      requestResult(typesRequest),
      requestResult(tagsRequest),
    ]);
    await transactionDone(transaction);
    return sortSnapshot({ notes: notes.map(normalizeNoteRecord), types, tags });
  }

  function assertSnapshotShape(snapshot) {
    if (
      !snapshot ||
      !Array.isArray(snapshot.notes) ||
      !Array.isArray(snapshot.types) ||
      !Array.isArray(snapshot.tags)
    ) {
      throw new Error("The note library has an invalid data shape.");
    }
  }

  // Every mutation keeps the shared transaction scope for coherent concurrent
  // writes, while callers can limit reads to the stores their operation needs.
  async function mutateLibrary(callback, { readStores = [STORE.notes, STORE.types, STORE.tags, STORE.meta] } = {}) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = database.transaction(
          [STORE.notes, STORE.types, STORE.tags, STORE.meta],
          "readwrite",
        );
      } catch (error) {
        reject(error);
        return;
      }

      const stores = {
        notes: transaction.objectStore(STORE.notes),
        types: transaction.objectStore(STORE.types),
        tags: transaction.objectStore(STORE.tags),
        meta: transaction.objectStore(STORE.meta),
      };
      const records = {};
      const readStoreNames = [...new Set(readStores)];
      let pendingReads = readStoreNames.length;
      let callbackResult;
      let callbackError;
      let mutationQueued = false;

      function abortWith(error) {
        callbackError = error instanceof Error ? error : new Error(String(error));
        try {
          transaction.abort();
        } catch {
          // The transaction may already have been aborted by IndexedDB.
        }
      }

      function queueMutation() {
        try {
          callbackResult = callback(
            {
              notes: records[STORE.notes] || [],
              types: records[STORE.types] || [],
              tags: records[STORE.tags] || [],
              meta: records[STORE.meta] || [],
            },
            stores,
          );
          stores.meta.put({ key: MUTATION_META_KEY, value: nowIso() });
          mutationQueued = true;
        } catch (error) {
          abortWith(error);
        }
      }

      if (!pendingReads) {
        queueMutation();
      } else {
        readStoreNames.forEach((name) => {
          const request = stores[name].getAll();
          request.onerror = () => {
            callbackError = request.error || new Error("Could not read the local library.");
          };
          request.onsuccess = () => {
            records[name] = request.result;
            pendingReads -= 1;
            if (!pendingReads) queueMutation();
          };
        });
      }

      transaction.oncomplete = () => {
        if (mutationQueued) resolve(callbackResult);
        else reject(callbackError || new Error("The local library transaction did not complete."));
      };
      transaction.onabort = () =>
        reject(callbackError || transaction.error || new Error("The local library transaction was aborted."));
      transaction.onerror = () => {
        // onabort reports the final error after IndexedDB rolls back the transaction.
      };
    });
  }

  function validateLegacyLibrary(value) {
    if (
      !value ||
      !Array.isArray(value.interviewQuestions) ||
      !Array.isArray(value.protoblocNotes)
    ) {
      throw new Error("Expected interviewQuestions and protoblocNotes arrays.");
    }

    const allItems = [...value.interviewQuestions, ...value.protoblocNotes];
    if (allItems.length > MAX_RECORDS_PER_IMPORT) {
      throw new Error("The legacy library has too many notes to import.");
    }

    allItems.forEach((item) => {
      if (!item || typeof item !== "object") {
        throw new Error("Every legacy note must be an object.");
      }
      requireText(item.question, "Legacy note title", MAX_TITLE_LENGTH);
      requireText(item.answer, "Legacy note content", MAX_CONTENT_LENGTH);
    });

    return value;
  }

  function readLegacyLibrary() {
    let raw;
    try {
      raw = globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      return { status: "unavailable", message: error.message };
    }

    if (!raw) return { status: "missing" };
    try {
      return { status: "valid", data: validateLegacyLibrary(JSON.parse(raw)) };
    } catch (error) {
      return { status: "invalid", message: error.message };
    }
  }

  function legacyToSnapshot(legacyData) {
    const source = validateLegacyLibrary(legacyData);
    const migratedAt = nowIso();
    const types = createDefaultTypes(migratedAt);
    const tagByNormalizedName = new Map();
    const tags = [];
    const notes = [];
    const items = [
      ...source.interviewQuestions.map((item) => ({ item, typeId: "type-learning", tags: ["Interview practice"] })),
      ...source.protoblocNotes.map((item) => ({
        item,
        typeId: "type-project",
        tags: [item.category, item.area].filter((value) => typeof value === "string" && value.trim()),
      })),
    ];
    const migrationStart = Date.now() - Math.max(items.length - 1, 0) * 1000;

    function getOrCreateTag(name) {
      const safeName = requireTagName(name);
      const key = normalizedName(safeName);
      if (tagByNormalizedName.has(key)) return tagByNormalizedName.get(key);
      const tag = {
        id: newId("tag"),
        name: safeName,
        normalizedName: key,
        createdAt: migratedAt,
        updatedAt: migratedAt,
      };
      tagByNormalizedName.set(key, tag);
      tags.push(tag);
      return tag;
    }

    items.forEach(({ item, typeId, tags: legacyTags }, index) => {
      const timestamp = new Date(migrationStart + index * 1000).toISOString();
      const tagIds = legacyTags.map(getOrCreateTag).map(({ id }) => id);
      notes.push({
        id: newId("note"),
        title: requireText(item.question, "Legacy note title", MAX_TITLE_LENGTH),
        content: normalizeContent(item.answer),
        typeId,
        tagIds: [...new Set(tagIds)],
        createdAt: timestamp,
        updatedAt: timestamp,
        isPinned: false,
        deletedAt: null,
      });
    });

    return { notes, types, tags };
  }

  function normalizeImportedTypes(items) {
    if (!Array.isArray(items)) throw new Error("Backup is missing its note types.");
    if (items.length > MAX_RECORDS_PER_IMPORT) {
      throw new Error("Backup contains too many note types.");
    }

    const importedAt = nowIso();
    const types = items.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error("Every note type must be an object.");
      const id = requireId(item.id, "Note type");
      const name = requireText(item.name, "Note type name", MAX_NAME_LENGTH);
      const createdAt = normalizeDate(item.createdAt, importedAt);
      return {
        id,
        name,
        normalizedName: normalizedName(name),
        color: normalizeColor(item.color, index),
        isFallback: id === FALLBACK_TYPE_ID,
        createdAt,
        updatedAt: normalizeDate(item.updatedAt, createdAt),
      };
    });

    uniqueIds(types.map(({ id }) => id), "note type");
    uniqueNames(types.map(({ normalizedName: name }) => name), "note type");

    if (!types.some(({ id }) => id === FALLBACK_TYPE_ID)) {
      throw new Error("Backup is missing the required General note type.");
    }
    return types;
  }

  function normalizeImportedTags(items) {
    if (!Array.isArray(items)) throw new Error("Backup is missing its tags.");
    if (items.length > MAX_RECORDS_PER_IMPORT) {
      throw new Error("Backup contains too many tags.");
    }

    const importedAt = nowIso();
    const tags = items.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Every tag must be an object.");
      const id = requireId(item.id, "Tag");
      const name = requireTagName(item.name);
      const createdAt = normalizeDate(item.createdAt, importedAt);
      return {
        id,
        name,
        normalizedName: normalizedName(name),
        createdAt,
        updatedAt: normalizeDate(item.updatedAt, createdAt),
      };
    });

    uniqueIds(tags.map(({ id }) => id), "tag");
    uniqueNames(tags.map(({ normalizedName: name }) => name), "tag");
    return tags;
  }

  function normalizeImportedNotes(items, types, tags) {
    if (!Array.isArray(items)) throw new Error("Backup is missing its notes.");
    if (items.length > MAX_RECORDS_PER_IMPORT) {
      throw new Error("Backup contains too many notes.");
    }

    const typeIds = new Set(types.map(({ id }) => id));
    const tagIds = new Set(tags.map(({ id }) => id));
    const importedAt = nowIso();
    const notes = items.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Every note must be an object.");
      const id = requireId(item.id, "Note");
      const title = requireText(item.title, "Note title", MAX_TITLE_LENGTH);
      const typeId = requireId(item.typeId, "Note type");
      if (!typeIds.has(typeId)) {
        throw new Error(`Note “${title}” references a missing note type.`);
      }
      if (!Array.isArray(item.tagIds) || item.tagIds.some((tagId) => typeof tagId !== "string")) {
        throw new Error(`Note “${title}” has invalid tags.`);
      }
      const uniqueTagIds = [...new Set(item.tagIds.map((tagId) => tagId.trim()).filter(Boolean))];
      if (uniqueTagIds.some((tagId) => !tagIds.has(tagId))) {
        throw new Error(`Note “${title}” references a missing tag.`);
      }
      const createdAt = normalizeDate(item.createdAt, importedAt);
      return {
        id,
        title,
        content: normalizeContent(item.content),
        typeId,
        tagIds: uniqueTagIds,
        createdAt,
        updatedAt: normalizeDate(item.updatedAt, createdAt),
        isPinned: item.isPinned === true,
        deletedAt: normalizeDeletedAt(item.deletedAt),
      };
    });

    uniqueIds(notes.map(({ id }) => id), "note");
    return notes;
  }

  function parseBackup(value) {
    if (value && Array.isArray(value.interviewQuestions) && Array.isArray(value.protoblocNotes)) {
      return { snapshot: legacyToSnapshot(value), format: "legacy" };
    }

    if (
      !value ||
      value.format !== "personal-notes-backup" ||
      ![1, 2].includes(value.schemaVersion)
    ) {
      throw new Error("Choose a Personal Notes backup or a supported legacy library JSON file.");
    }

    const data = value.data;
    if (!data || typeof data !== "object") throw new Error("Backup data is missing.");
    const types = normalizeImportedTypes(data.noteTypes ?? data.types);
    const tags = normalizeImportedTags(data.tags);
    const notes = normalizeImportedNotes(data.notes, types, tags);
    return { snapshot: { notes, types, tags }, format: "personal-notes" };
  }

  async function replaceSnapshot(snapshot, source) {
    assertSnapshotShape(snapshot);
    await mutateLibrary((current, stores) => {
      stores.notes.clear();
      stores.types.clear();
      stores.tags.clear();
      snapshot.types.forEach((item) => stores.types.put(item));
      snapshot.tags.forEach((item) => stores.tags.put(item));
      snapshot.notes.forEach((item) => stores.notes.put(item));
      stores.meta.put({
        key: BOOTSTRAP_META_KEY,
        value: { source, completedAt: nowIso() },
      });
    }, { readStores: [] });
  }

  function shouldKeepTagCandidate(candidate, existing) {
    if (candidate.isCanonical !== existing.isCanonical) return candidate.isCanonical;
    const candidateTimestamp = Date.parse(candidate.tag.createdAt);
    const existingTimestamp = Date.parse(existing.tag.createdAt);
    const candidateCreatedAt = Number.isNaN(candidateTimestamp) ? Number.MAX_SAFE_INTEGER : candidateTimestamp;
    const existingCreatedAt = Number.isNaN(existingTimestamp) ? Number.MAX_SAFE_INTEGER : existingTimestamp;
    if (candidateCreatedAt !== existingCreatedAt) return candidateCreatedAt < existingCreatedAt;
    return candidate.tag.id.localeCompare(existing.tag.id) < 0;
  }

  function migrateExistingTagPrefixes(snapshot, stores) {
    if (snapshot.meta.some(({ key }) => key === TAG_PREFIX_MIGRATION_META_KEY)) {
      return { updatedTags: 0, mergedTags: 0, remappedNotes: 0 };
    }

    const candidatesByName = new Map();
    snapshot.tags.forEach((tag) => {
      const name = canonicalExistingTagName(tag.name);
      if (!name) return;
      const normalized = normalizedName(name);
      const candidate = {
        tag,
        name,
        normalized,
        isCanonical: tag.name === name && tag.normalizedName === normalized,
      };
      const existing = candidatesByName.get(normalized);
      if (!existing || shouldKeepTagCandidate(candidate, existing)) {
        candidatesByName.set(normalized, candidate);
      }
    });

    const tagIdMap = new Map();
    let mergedTags = 0;
    snapshot.tags.forEach((tag) => {
      const name = canonicalExistingTagName(tag.name);
      if (!name) return;
      const survivor = candidatesByName.get(normalizedName(name));
      tagIdMap.set(tag.id, survivor.tag.id);
      if (tag.id !== survivor.tag.id) {
        stores.tags.delete(tag.id);
        mergedTags += 1;
      }
    });

    let updatedTags = 0;
    candidatesByName.forEach(({ tag, name, normalized }) => {
      if (tag.name === name && tag.normalizedName === normalized) return;
      stores.tags.put({ ...tag, name, normalizedName: normalized });
      updatedTags += 1;
    });

    let remappedNotes = 0;
    snapshot.notes.forEach((note) => {
      const tagIds = [...new Set(note.tagIds.map((tagId) => tagIdMap.get(tagId) || tagId))];
      const changed =
        tagIds.length !== note.tagIds.length ||
        tagIds.some((tagId, index) => tagId !== note.tagIds[index]);
      if (!changed) return;
      stores.notes.put({ ...note, tagIds });
      remappedNotes += 1;
    });

    stores.meta.put({
      key: TAG_PREFIX_MIGRATION_META_KEY,
      value: { completedAt: nowIso(), updatedTags, mergedTags, remappedNotes },
    });
    return { updatedTags, mergedTags, remappedNotes };
  }

  async function initialize() {
    await openDatabase();
    const legacy = readLegacyLibrary();
    let initialSnapshot;
    let initialMetadata;
    let notice = "";

    if (legacy.status === "valid") {
      initialSnapshot = legacyToSnapshot(legacy.data);
      initialMetadata = { source: "legacy-localstorage", completedAt: nowIso() };
    } else {
      const createdAt = nowIso();
      initialSnapshot = { notes: [], types: createDefaultTypes(createdAt), tags: [] };
      initialMetadata = { source: "new-library", completedAt: createdAt };
      if (legacy.status === "invalid") {
        notice = "We could not read the previous local library. It was left untouched; import its JSON backup if needed.";
      } else if (legacy.status === "unavailable") {
        notice = "Previous local browser data could not be checked. It was not changed.";
      }
    }

    return mutateLibrary((current, stores) => {
      const tagPrefixMigration = migrateExistingTagPrefixes(current, stores);
      const bootstrapMarker = current.meta.find(({ key }) => key === BOOTSTRAP_META_KEY);
      if (bootstrapMarker) return { migration: bootstrapMarker.value, tagPrefixMigration, notice: "" };

      if (current.notes.length || current.types.length || current.tags.length) {
        const metadata = { source: "existing-indexeddb", completedAt: nowIso() };
        stores.meta.put({ key: BOOTSTRAP_META_KEY, value: metadata });
        return { migration: metadata, tagPrefixMigration, notice: "" };
      }

      initialSnapshot.types.forEach((item) => stores.types.put(item));
      initialSnapshot.tags.forEach((item) => stores.tags.put(item));
      initialSnapshot.notes.forEach((item) => stores.notes.put(item));
      stores.meta.put({ key: BOOTSTRAP_META_KEY, value: initialMetadata });
      return { migration: initialMetadata, tagPrefixMigration, notice };
    });
  }

  function assertNameIsAvailable(records, value, label, excludeId = "") {
    const key = normalizedName(value);
    if (records.some((record) => record.id !== excludeId && record.normalizedName === key)) {
      throw new Error(`${label} “${value}” already exists.`);
    }
  }

  async function saveNote(input) {
    const editingId = input.id ? requireId(input.id, "Note") : "";
    const title = requireText(input.title, "Note title", MAX_TITLE_LENGTH);
    const typeId = requireId(input.typeId, "Note type");
    if (!Array.isArray(input.tagIds) || input.tagIds.some((tagId) => typeof tagId !== "string")) {
      throw new Error("Note tags are invalid.");
    }
    const tagIds = [...new Set(input.tagIds.map((tagId) => tagId.trim()).filter(Boolean))];
    const content = normalizeContent(input.content);

    return mutateLibrary((snapshot, stores) => {
      const existing = editingId ? snapshot.notes.find(({ id }) => id === editingId) : null;
      if (editingId && !existing) throw new Error("This note no longer exists.");
      if (!snapshot.types.some(({ id }) => id === typeId)) {
        throw new Error("Choose a valid note type.");
      }
      const availableTagIds = new Set(snapshot.tags.map(({ id }) => id));
      if (tagIds.some((tagId) => !availableTagIds.has(tagId))) {
        throw new Error("One or more selected tags no longer exist.");
      }

      const timestamp = nowIso();
      const note = {
        id: editingId || newId("note"),
        title,
        content,
        typeId,
        tagIds,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
        isPinned: existing?.isPinned === true,
        deletedAt: existing?.deletedAt || null,
      };
      stores.notes.put(note);
      return note;
    }, { readStores: [STORE.notes, STORE.types, STORE.tags] });
  }

  async function deleteNote(id) {
    const noteId = requireId(id, "Note");
    await mutateLibrary((snapshot, stores) => {
      const existing = snapshot.notes.find(({ id: itemId }) => itemId === noteId);
      if (!existing) throw new Error("This note no longer exists.");
      if (existing.deletedAt) return;
      const timestamp = nowIso();
      stores.notes.put({ ...existing, deletedAt: timestamp, updatedAt: timestamp });
    }, { readStores: [STORE.notes] });
  }

  async function restoreNote(id) {
    const noteId = requireId(id, "Note");
    return mutateLibrary((snapshot, stores) => {
      const existing = snapshot.notes.find(({ id: itemId }) => itemId === noteId);
      if (!existing) throw new Error("This note no longer exists.");
      if (!existing.deletedAt) return existing;
      const note = { ...existing, deletedAt: null, updatedAt: nowIso() };
      stores.notes.put(note);
      return note;
    }, { readStores: [STORE.notes] });
  }

  async function permanentlyDeleteNote(id) {
    const noteId = requireId(id, "Note");
    await mutateLibrary((snapshot, stores) => {
      const existing = snapshot.notes.find(({ id: itemId }) => itemId === noteId);
      if (!existing) throw new Error("This note no longer exists.");
      if (!existing.deletedAt) throw new Error("Only notes in Trash can be permanently deleted.");
      stores.notes.delete(noteId);
    }, { readStores: [STORE.notes] });
  }

  async function emptyTrash() {
    return mutateLibrary((snapshot, stores) => {
      const trashedNotes = snapshot.notes.filter((note) => note.deletedAt);
      trashedNotes.forEach(({ id }) => stores.notes.delete(id));
      return trashedNotes.length;
    }, { readStores: [STORE.notes] });
  }

  async function setNotePinned(id, isPinned) {
    const noteId = requireId(id, "Note");
    if (typeof isPinned !== "boolean") throw new Error("Note pin state is invalid.");
    return mutateLibrary((snapshot, stores) => {
      const existing = snapshot.notes.find(({ id: itemId }) => itemId === noteId);
      if (!existing) throw new Error("This note no longer exists.");
      if (existing.isPinned === isPinned) return existing;
      const note = { ...existing, isPinned, updatedAt: nowIso() };
      stores.notes.put(note);
      return note;
    }, { readStores: [STORE.notes] });
  }

  async function addType(input) {
    const name = requireText(input.name, "Note type name", MAX_NAME_LENGTH);
    return mutateLibrary((snapshot, stores) => {
      assertNameIsAvailable(snapshot.types, name, "Note type");
      const timestamp = nowIso();
      const type = {
        id: newId("type"),
        name,
        normalizedName: normalizedName(name),
        color: normalizeColor(input.color, snapshot.types.length),
        isFallback: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stores.types.put(type);
      return type;
    }, { readStores: [STORE.types] });
  }

  async function updateType(id, input) {
    const typeId = requireId(id, "Note type");
    const name = requireText(input.name, "Note type name", MAX_NAME_LENGTH);
    return mutateLibrary((snapshot, stores) => {
      const existing = snapshot.types.find(({ id: itemId }) => itemId === typeId);
      if (!existing) throw new Error("This note type no longer exists.");
      assertNameIsAvailable(snapshot.types, name, "Note type", typeId);
      const type = {
        ...existing,
        name,
        normalizedName: normalizedName(name),
        color: normalizeColor(input.color, snapshot.types.indexOf(existing)),
        updatedAt: nowIso(),
      };
      stores.types.put(type);
      return type;
    }, { readStores: [STORE.types] });
  }

  async function deleteType(id) {
    const typeId = requireId(id, "Note type");
    if (typeId === FALLBACK_TYPE_ID) {
      throw new Error("The fallback note type cannot be deleted.");
    }
    return mutateLibrary((snapshot, stores) => {
      if (!snapshot.types.some(({ id: itemId }) => itemId === typeId)) {
        throw new Error("This note type no longer exists.");
      }
      const affectedNotes = snapshot.notes.filter(({ typeId: itemTypeId }) => itemTypeId === typeId);
      const timestamp = nowIso();
      affectedNotes.forEach((note) =>
        stores.notes.put({ ...note, typeId: FALLBACK_TYPE_ID, updatedAt: timestamp }),
      );
      stores.types.delete(typeId);
      return affectedNotes.length;
    }, { readStores: [STORE.notes, STORE.types] });
  }

  async function addTag(input) {
    const name = requireTagName(input.name);
    return mutateLibrary((snapshot, stores) => {
      assertNameIsAvailable(snapshot.tags, name, "Tag");
      const timestamp = nowIso();
      const tag = {
        id: newId("tag"),
        name,
        normalizedName: normalizedName(name),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stores.tags.put(tag);
      return tag;
    }, { readStores: [STORE.tags] });
  }

  async function updateTag(id, input) {
    const tagId = requireId(id, "Tag");
    const name = requireTagName(input.name);
    return mutateLibrary((snapshot, stores) => {
      const existing = snapshot.tags.find(({ id: itemId }) => itemId === tagId);
      if (!existing) throw new Error("This tag no longer exists.");
      assertNameIsAvailable(snapshot.tags, name, "Tag", tagId);
      const tag = {
        ...existing,
        name,
        normalizedName: normalizedName(name),
        updatedAt: nowIso(),
      };
      stores.tags.put(tag);
      return tag;
    }, { readStores: [STORE.tags] });
  }

  async function deleteTag(id) {
    const tagId = requireId(id, "Tag");
    return mutateLibrary((snapshot, stores) => {
      if (!snapshot.tags.some(({ id: itemId }) => itemId === tagId)) {
        throw new Error("This tag no longer exists.");
      }
      const affectedNotes = snapshot.notes.filter(({ tagIds }) => tagIds.includes(tagId));
      const timestamp = nowIso();
      affectedNotes.forEach((note) =>
        stores.notes.put({
          ...note,
          tagIds: note.tagIds.filter((itemId) => itemId !== tagId),
          updatedAt: timestamp,
        }),
      );
      stores.tags.delete(tagId);
      return affectedNotes.length;
    }, { readStores: [STORE.notes, STORE.tags] });
  }

  async function buildExport() {
    const snapshot = await getSnapshot();
    return {
      format: "personal-notes-backup",
      schemaVersion: 2,
      exportedAt: nowIso(),
      data: {
        noteTypes: snapshot.types,
        tags: snapshot.tags,
        notes: snapshot.notes,
      },
    };
  }

  async function importBackup(value) {
    const parsed = parseBackup(value);
    await replaceSnapshot(parsed.snapshot, `import-${parsed.format}`);
    return { ...parsed, counts: {
      notes: parsed.snapshot.notes.length,
      types: parsed.snapshot.types.length,
      tags: parsed.snapshot.tags.length,
    } };
  }

  function inspectBackup(value) {
    const parsed = parseBackup(value);
    return {
      format: parsed.format,
      counts: {
        notes: parsed.snapshot.notes.length,
        types: parsed.snapshot.types.length,
        tags: parsed.snapshot.tags.length,
      },
    };
  }

  globalThis.PersonalNotesStorage = Object.freeze({
    FALLBACK_TYPE_ID,
    TYPE_COLORS,
    initialize,
    getSnapshot,
    saveNote,
    deleteNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    setNotePinned,
    addType,
    updateType,
    deleteType,
    addTag,
    updateTag,
    deleteTag,
    buildExport,
    inspectBackup,
    importBackup,
  });
})();
