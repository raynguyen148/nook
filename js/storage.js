(() => {
  "use strict";

  const DB_NAME = "personal-notes";
  const DB_VERSION = 4;
  const LEGACY_STORAGE_KEY = "ray-interview-practice-library-v1";
  const BOOTSTRAP_META_KEY = "bootstrap-v1";
  const TAG_PREFIX_MIGRATION_META_KEY = "tag-prefix-removal-v1";
  const MUTATION_META_KEY = "last-library-mutation-v1";
  const FALLBACK_TYPE_ID = "type-general";
  const MAX_RECORDS_PER_IMPORT = 10000;
  const MAX_TITLE_LENGTH = 160;
  const MAX_NAME_LENGTH = 48;
  const MAX_CONTENT_LENGTH = 50000;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_IMAGE_LIBRARY_BYTES = 50 * 1024 * 1024;
  const IMAGE_TOTALS_KEY = "image-totals-v1";
  const IMAGE_PASTE_GRACE_MS = 5 * 60 * 1000;
  const HISTORY_RETENTION_LIMIT = 50;
  const HISTORY_MAX_CONTENT_BYTES = 5 * 1024 * 1024;
  const MAX_NOTE_VERSIONS_PER_IMPORT = MAX_RECORDS_PER_IMPORT * HISTORY_RETENTION_LIMIT;
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
    noteVersions: "noteVersions",
    attachments: "attachments",
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

  function migrateNotesToV3(database, transaction) {
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
        revision: normalizeRevision(note.revision),
      });
      cursor.continue();
    };
  }

  function createStores(database, transaction) {
    if (!database.objectStoreNames.contains(STORE.attachments)) {
      database.createObjectStore(STORE.attachments, { keyPath: "id" });
    }
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

    if (!database.objectStoreNames.contains(STORE.noteVersions)) {
      const noteVersions = database.createObjectStore(STORE.noteVersions, { keyPath: "id" });
      noteVersions.createIndex("by-note-id", "noteId");
    } else if (transaction) {
      const noteVersions = transaction.objectStore(STORE.noteVersions);
      if (!noteVersions.indexNames.contains("by-note-id")) {
        noteVersions.createIndex("by-note-id", "noteId");
      }
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
        createStores(request.result, request.transaction);
        if (event.oldVersion < 3) migrateNotesToV3(request.result, request.transaction);
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
    return value.replace(/\r\n/g, "\n");
  }

  function requireId(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} needs a valid id.`);
    }
    return value.trim();
  }

  // Scan conservatively, including literal/code references: retaining an extra
  // image is safer than breaking a draft or a historical Markdown reference.
  function attachmentIds(content) {
    return [...new Set(String(content || "").match(/nook-asset:[a-zA-Z0-9_-]{1,100}(?![a-zA-Z0-9_-])/g) || [])]
      .map((reference) => reference.slice(11));
  }

  function imageMime(bytes) {
    const starts = (...values) => values.every((value, index) => bytes[index] === value);
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (bytes.length >= 24 && starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
    if (bytes.length >= 4 && starts(255, 216, 255)) return "image/jpeg";
    if (bytes.length >= 13 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
    if (bytes.length >= 16 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (bytes[0] === 60 || bytes[0] === 239 || bytes[0] <= 32) {
      let source;
      try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* Report unsupported files below. */ }
      if (source?.trimStart().startsWith("<")) { validateSvg(source); return "image/svg+xml"; }
    }
    throw new Error("Choose a PNG, JPEG, GIF, WebP, or static SVG image.");
  }

  function validateSvg(source) {
    const fail = () => { throw new Error("This SVG contains unsupported or external content. Use a static, self-contained SVG or export it as PNG."); };
    // No document embedding: even accepted SVG is displayed only through <img>.
    // Reject active elements, entities, processing instructions, external URLs,
    // and CSS escapes rather than rewriting or executing untrusted SVG content.
    if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source)) fail();
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") fail();
    const allowed = new Set(("svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc clipPath mask pattern marker linearGradient radialGradient stop style filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence view").split(" "));
    function safeCss(value) {
      if (/[\\@]/.test(value) || /\/\*/.test(value)) fail();
      for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
        if (!/^\s*['"]?#[a-zA-Z0-9_.:-]+['"]?\s*$/.test(match[1])) fail();
      }
    }
    const nodes = [...document.querySelectorAll("*")];
    if (nodes.length > 10000) fail();
    nodes.forEach((node) => {
      if (node.namespaceURI !== "http://www.w3.org/2000/svg" || !allowed.has(node.localName)) fail();
      if (node.localName === "style") safeCss(node.textContent);
      for (const attribute of node.attributes) {
        if (/^on/i.test(attribute.localName) || ["src", "base"].includes(attribute.localName)) fail();
        if (attribute.localName === "href" && !/^#[a-zA-Z0-9_.:-]+$/.test(attribute.value)) fail();
        if (!attribute.name.startsWith("xmlns")) safeCss(attribute.value);
      }
    });
  }

  async function validateAttachment(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Error("Each image must be nonempty and 10 MB or smaller.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return new Blob([bytes], { type: imageMime(bytes) });
  }

  function sameAttachment(left, right) {
    return left.mimeType === right.mimeType && left.bytes.length === right.bytes.length &&
      left.bytes.every((value, index) => value === right.bytes[index]);
  }

  function imageTotals(attachments) {
    return { count: attachments.length, bytes: attachments.reduce((total, item) => total + item.bytes.length, 0) };
  }

  function writeImageTotals(stores, attachments) {
    const totals = imageTotals(attachments);
    if (totals.count > MAX_RECORDS_PER_IMPORT) throw new Error("Local images exceed the 10,000-image limit.");
    if (totals.bytes > MAX_IMAGE_LIBRARY_BYTES) throw new Error("Local images exceed 50 MB. Remove unused images before adding more.");
    stores.meta.put({ key: IMAGE_TOTALS_KEY, value: totals });
  }

  async function addAttachment(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Error("Each image must be nonempty and 10 MB or smaller.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = imageMime(bytes);
    const digest = globalThis.crypto?.subtle
      ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)) : null;
    const id = digest ? `image-${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}` : newId("image");
    const attachment = { id, name: String(file.name || "Pasted image").slice(0, 160), mimeType, bytes,
      createdAt: nowIso(), protectedUntil: Date.now() + IMAGE_PASTE_GRACE_MS };
    return runAtomicMutation({
      read: (stores) => [
        { key: "existing", request: stores.attachments.get(id) },
        { key: "totals", request: stores.meta.get(IMAGE_TOTALS_KEY) },
      ],
      apply: (records, stores) => {
        if (records.existing) {
          if (!sameAttachment(records.existing, attachment)) throw new Error("Image identity collision. This image was not inserted.");
          stores.attachments.put({ ...records.existing, protectedUntil: attachment.protectedUntil });
          return { result: { id, name: attachment.name }, changed: false };
        }
        const totals = records.totals?.value || { count: 0, bytes: 0 };
        if (totals.count >= MAX_RECORDS_PER_IMPORT) throw new Error("Local images exceed the 10,000-image limit.");
        if (totals.bytes + bytes.length > MAX_IMAGE_LIBRARY_BYTES) throw new Error("Local images exceed 50 MB. Remove unused images before adding more.");
        stores.attachments.put(attachment);
        stores.meta.put({ key: IMAGE_TOTALS_KEY, value: { count: totals.count + 1, bytes: totals.bytes + bytes.length } });
        return { result: { id, name: attachment.name } };
      },
    });
  }

  async function getAttachment(id) {
    const database = await openDatabase();
    const transaction = database.transaction([STORE.attachments], "readonly");
    const record = await requestResult(transaction.objectStore(STORE.attachments).get(requireId(id, "Image")));
    await transactionDone(transaction);
    return record ? new Blob([record.bytes], { type: record.mimeType }) : null;
  }

  function recoveryImageIds() {
    const ids = new Set();
    try {
      const storage = globalThis.localStorage;
      if (!storage) throw new Error();
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith("nook:editor-draft:v2:") && key !== "nook:note-editor-draft") continue;
        // Keep even expired records until the recovery owner removes them.
        const record = JSON.parse(storage.getItem(key));
        if (typeof record?.draft?.content !== "string") throw new Error();
        [record.draft.content, record.committedSnapshot?.content].forEach((content) => attachmentIds(content).forEach((id) => ids.add(id)));
      }
    } catch {
      throw new Error("Draft recovery could not be checked. Images were kept; allow browser storage and try again.");
    }
    return ids;
  }

  async function protectDraftAttachments(key, contents, savedAt) {
    if (typeof key !== "string" || !key.startsWith("nook:editor-draft:v2:") || !Number.isFinite(Date.parse(savedAt))) return;
    const ids = [...new Set(contents.flatMap(attachmentIds))];
    const metadataKey = `image-draft:${key}`;
    return runAtomicMutation({
      read: (stores) => [{ key: "previous", request: stores.meta.get(metadataKey) }],
      apply: (records, stores) => {
        if (records.previous?.value.savedAt > savedAt) return { changed: false };
        if (ids.length) stores.meta.put({ key: metadataKey, value: { ids, savedAt, expiresAt: Date.parse(savedAt) + 30 * 24 * 60 * 60 * 1000 } });
        else stores.meta.delete(metadataKey);
        return { changed: false };
      },
    });
  }

  async function inspectUnusedAttachments({ protectedContents = () => [], candidates = null, remove = false } = {}) {
    // All note mutations and image writes share this transaction scope. Recheck
    // current notes, history, and all-tab recovery at commit, not just preview.
    return runAtomicMutation({
      read: (stores) => ["notes", "noteVersions", "attachments", "meta"].map((key) => ({ key, request: stores[key].getAll() })),
      apply: (records, stores) => {
        const referenced = protectedDraftImageIds(records.meta);
        [...records.notes, ...records.noteVersions, ...protectedContents().map((content) => ({ content }))]
          .forEach((item) => attachmentIds(item.content).forEach((id) => referenced.add(id)));
        const allowed = candidates ? new Set(candidates) : null;
        const unused = records.attachments.filter((item) => !referenced.has(item.id) && item.protectedUntil <= Date.now() && (!allowed || allowed.has(item.id)));
        if (remove && !allowed) throw new Error("Inspect unused images before removing them.");
        if (remove) {
          unused.forEach((item) => stores.attachments.delete(item.id));
          const removed = new Set(unused.map((item) => item.id));
          writeImageTotals(stores, records.attachments.filter((item) => !removed.has(item.id)));
        }
        return { result: { ...imageTotals(records.attachments), unusedCount: unused.length,
          unusedBytes: imageTotals(unused).bytes, candidates: unused.map((item) => item.id) }, changed: remove && unused.length > 0 };
      },
    });
  }

  function protectedDraftImageIds(metadata) {
    const ids = recoveryImageIds();
    metadata.filter((item) => item.key.startsWith("image-draft:") && item.value.expiresAt > Date.now())
      .forEach((item) => item.value.ids.forEach((id) => ids.add(id)));
    return ids;
  }

  function encodeImage(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return globalThis.btoa(binary);
  }

  function normalizeImportedAttachments(items) {
    if (!Array.isArray(items) || items.length > MAX_RECORDS_PER_IMPORT) throw new Error("Backup images are invalid.");
    let total = 0;
    const attachments = items.map((item) => {
      if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || typeof item.data !== "string" ||
          item.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || item.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) {
        throw new Error("A backup image is invalid or exceeds 10 MB.");
      }
      const binary = globalThis.atob(item.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("A backup image exceeds 10 MB or is empty.");
      total += bytes.length;
      if (total > MAX_IMAGE_LIBRARY_BYTES) throw new Error("Backup images exceed 50 MB.");
      const mimeType = imageMime(bytes);
      if (mimeType !== item.mimeType) throw new Error("A backup image has an invalid format.");
      return { id: item.id, bytes, mimeType, name: String(item.name || "Image").slice(0, 160),
        createdAt: normalizeDate(item.createdAt, nowIso()), protectedUntil: 0 };
    });
    uniqueIds(attachments, "Image");
    return attachments;
  }

  function mapIncomingAttachments(current, incoming) {
    const existing = new Map(current.map((item) => [item.id, item]));
    const used = new Set([...existing.keys(), ...incoming.map((item) => item.id)]);
    const mapping = new Map();
    const additions = [];
    incoming.forEach((item) => {
      const match = existing.get(item.id);
      let id = item.id;
      if (match && !sameAttachment(match, item)) {
        do { id = newId("image"); } while (used.has(id));
      }
      used.add(id);
      mapping.set(item.id, id);
      if (!match || id !== item.id) additions.push({ ...item, id });
    });
    const content = (value) => value.replace(/nook-asset:([a-zA-Z0-9_-]{1,100})(?![a-zA-Z0-9_-])/g,
      (reference, id) => mapping.has(id) ? `nook-asset:${mapping.get(id)}` : reference);
    return { additions, content, ids: new Set(mapping.values()) };
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

  function normalizeRevision(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  }

  function requireRevision(value, label = "Note revision") {
    if (value == null) return 1;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive integer.`);
    }
    return value;
  }

  function normalizeDeletedAt(value) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  function normalizeNoteRecord(note) {
    return {
      ...note,
      tagIds: Array.isArray(note.tagIds) ? [...note.tagIds] : [],
      isPinned: note.isPinned === true,
      deletedAt: normalizeDeletedAt(note.deletedAt),
      revision: normalizeRevision(note.revision),
    };
  }

  function versionId(noteId, revision) {
    return `${noteId}::${revision}`;
  }

  function utf8ByteLength(value) {
    if (typeof globalThis.TextEncoder === "function") {
      return new globalThis.TextEncoder().encode(value).byteLength;
    }
    return new Blob([value]).size;
  }

  function normalizeHistoryRecord(version) {
    const updatedAt = normalizeDate(version.updatedAt, nowIso());
    return {
      id: versionId(version.noteId, normalizeRevision(version.revision)),
      noteId: version.noteId,
      revision: normalizeRevision(version.revision),
      title: version.title,
      content: typeof version.content === "string" ? version.content.replace(/\r\n/g, "\n") : "",
      typeId: version.typeId,
      tagIds: Array.isArray(version.tagIds) ? [...new Set(version.tagIds)] : [],
      createdAt: normalizeDate(version.createdAt, updatedAt),
      updatedAt,
      isPinned: version.isPinned === true,
      deletedAt: normalizeDeletedAt(version.deletedAt),
      archivedAt: normalizeDate(version.archivedAt, updatedAt),
    };
  }

  function historySnapshot(note, archivedAt = nowIso()) {
    return normalizeHistoryRecord({ ...note, noteId: note.id, archivedAt });
  }

  function sameIdSet(left, right) {
    if (left.length !== right.length) return false;
    const leftIds = [...new Set(left)].sort();
    const rightIds = [...new Set(right)].sort();
    return leftIds.every((id, index) => id === rightIds[index]);
  }

  function sameEditorFields(left, right) {
    return (
      left.title === right.title &&
      left.content === right.content &&
      left.typeId === right.typeId &&
      sameIdSet(left.tagIds, right.tagIds)
    );
  }

  function trimHistory(stores, noteId, versions) {
    const normalizedVersions = versions
      .filter((version) => version.noteId === noteId)
      .map(normalizeHistoryRecord)
      .sort((left, right) => right.revision - left.revision || right.archivedAt.localeCompare(left.archivedAt));
    const keptIds = new Set();
    let contentBytes = 0;
    let keptCount = 0;

    normalizedVersions.forEach((version) => {
      const bytes = utf8ByteLength(version.content);
      if (
        keptCount >= HISTORY_RETENTION_LIMIT ||
        contentBytes + bytes > HISTORY_MAX_CONTENT_BYTES
      ) {
        stores.noteVersions.delete(version.id);
        return;
      }
      keptIds.add(version.id);
      keptCount += 1;
      contentBytes += bytes;
    });

    versions
      .filter((version) => version.noteId === noteId && !keptIds.has(version.id))
      .forEach((version) => stores.noteVersions.delete(version.id));

    return normalizedVersions.filter(({ id }) => keptIds.has(id));
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

  async function getSnapshot({ includeHistory = false, includeAttachments = false } = {}) {
    const database = await openDatabase();
    const storeNames = [STORE.notes, STORE.types, STORE.tags, STORE.meta];
    if (includeHistory) storeNames.push(STORE.noteVersions);
    if (includeAttachments) storeNames.push(STORE.attachments);
    const transaction = database.transaction(storeNames, "readonly");
    const notesRequest = transaction.objectStore(STORE.notes).getAll();
    const typesRequest = transaction.objectStore(STORE.types).getAll();
    const tagsRequest = transaction.objectStore(STORE.tags).getAll();
    const requests = [
      requestResult(notesRequest),
      requestResult(typesRequest),
      requestResult(tagsRequest),
      requestResult(transaction.objectStore(STORE.meta).get(MUTATION_META_KEY)),
    ];
    requests.push(includeHistory ? requestResult(transaction.objectStore(STORE.noteVersions).getAll()) : []);
    requests.push(includeAttachments ? requestResult(transaction.objectStore(STORE.attachments).getAll()) : []);
    const [notes, types, tags, mutation, noteVersions, attachments] = await Promise.all(requests);
    await transactionDone(transaction);
    return sortSnapshot({
      notes: notes.map(normalizeNoteRecord),
      types,
      tags,
      noteVersions: includeHistory ? noteVersions.map(normalizeHistoryRecord) : [],
      mutationId: mutation?.value || "",
      attachments,
    });
  }

  async function getNote(id) {
    const noteId = requireId(id, "Note");
    const database = await openDatabase();
    const transaction = database.transaction([STORE.notes], "readonly");
    const note = await requestResult(transaction.objectStore(STORE.notes).get(noteId));
    await transactionDone(transaction);
    return note ? normalizeNoteRecord(note) : null;
  }

  function assertSnapshotShape(snapshot) {
    if (
      !snapshot ||
      !Array.isArray(snapshot.notes) ||
      !Array.isArray(snapshot.types) ||
      !Array.isArray(snapshot.tags) ||
      !Array.isArray(snapshot.noteVersions)
    ) {
      throw new Error("The note library has an invalid data shape.");
    }
  }

  const MUTATION_STORE_NAMES = [
    STORE.notes,
    STORE.types,
    STORE.tags,
    STORE.noteVersions,
    STORE.meta,
    STORE.attachments,
  ];

  async function runAtomicMutation({ read, apply }) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = database.transaction(MUTATION_STORE_NAMES, "readwrite");
      } catch (error) {
        reject(error);
        return;
      }

      const stores = {
        notes: transaction.objectStore(STORE.notes),
        types: transaction.objectStore(STORE.types),
        tags: transaction.objectStore(STORE.tags),
        noteVersions: transaction.objectStore(STORE.noteVersions),
        meta: transaction.objectStore(STORE.meta),
        attachments: transaction.objectStore(STORE.attachments),
      };
      const records = {};
      let pendingReads = 0;
      let callbackResult;
      let callbackError;
      let applyCompleted = false;

      function finishApply() {
        try {
          const outcome = apply(records, stores) || {};
          callbackResult = outcome.result;
          if (outcome.changed !== false) {
            stores.meta.put({ key: MUTATION_META_KEY, value: newId("mutation") });
          }
          applyCompleted = true;
        } catch (error) {
          abortWith(error);
        }
      }

      function abortWith(error) {
        callbackError = error instanceof Error ? error : new Error(String(error));
        try {
          transaction.abort();
        } catch {
          // The transaction may already have been aborted by IndexedDB.
        }
      }

      transaction.oncomplete = () => {
        if (applyCompleted) resolve(callbackResult);
        else reject(callbackError || new Error("The local library transaction did not complete."));
      };
      transaction.onabort = () =>
        reject(callbackError || transaction.error || new Error("The local library transaction was aborted."));
      transaction.onerror = () => {
        // onabort reports the final error after IndexedDB rolls back the transaction.
      };

      let readEntries;
      let readFailed = false;
      try {
        readEntries = read(stores) || [];
      } catch (error) {
        abortWith(error);
        readEntries = [];
        readFailed = true;
      }

      if (readFailed) return;
      pendingReads = readEntries.length;
      if (!pendingReads) {
        finishApply();
      } else {
        readEntries.forEach(({ key, request }) => {
          if (!request) {
            records[key] = undefined;
            pendingReads -= 1;
            if (!pendingReads) finishApply();
            return;
          }
          request.onerror = () => {
            callbackError = request.error || new Error("Could not read the local library.");
          };
          request.onsuccess = () => {
            records[key] = request.result;
            pendingReads -= 1;
            if (!pendingReads) finishApply();
          };
        });
      }

    });
  }

  // Every mutation keeps the shared transaction scope for coherent concurrent
  // writes, while callers can limit reads to the stores their operation needs.
  async function mutateLibrary(callback, { readStores = [STORE.notes, STORE.types, STORE.tags, STORE.meta] } = {}) {
    const names = [...new Set(readStores)];
    return runAtomicMutation({
      read: (stores) => names.map((name) => ({ key: name, request: stores[name].getAll() })),
      apply: (records, stores) => ({
        result: callback(
          {
            notes: records[STORE.notes] || [],
            types: records[STORE.types] || [],
            tags: records[STORE.tags] || [],
            noteVersions: records[STORE.noteVersions] || [],
            meta: records[STORE.meta] || [],
            attachments: records[STORE.attachments] || [],
          },
          stores,
        ),
      }),
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
        revision: 1,
      });
    });

    return { notes, types, tags, noteVersions: [] };
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
        revision: requireRevision(item.revision),
      };
    });

    uniqueIds(notes.map(({ id }) => id), "note");
    return notes;
  }

  function normalizeImportedNoteVersions(items, notes) {
    if (!Array.isArray(items)) throw new Error("Backup is missing its note history.");
    if (items.length > MAX_NOTE_VERSIONS_PER_IMPORT) {
      throw new Error("Backup contains too many note history versions.");
    }

    const notesById = new Map(notes.map((note) => [note.id, note]));
    const versions = items.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Every note history version must be an object.");
      const noteId = requireId(item.noteId, "Note history note");
      const currentNote = notesById.get(noteId);
      if (!currentNote) throw new Error("Note history references a missing note.");
      const revision = requireRevision(item.revision, "Note history revision");
      if (revision >= currentNote.revision) {
        throw new Error("Note history revision must be older than the current note.");
      }
      const title = requireText(item.title, "Note history title", MAX_TITLE_LENGTH);
      const content = normalizeContent(item.content);
      const typeId = requireId(item.typeId, "Note history note type");
      if (!Array.isArray(item.tagIds) || item.tagIds.some((tagId) => typeof tagId !== "string")) {
        throw new Error(`Note history for “${title}” has invalid tags.`);
      }
      const tagIds = [...new Set(item.tagIds.map((tagId) => tagId.trim()).filter(Boolean))];
      const createdAt = normalizeDate(item.createdAt, currentNote.createdAt);
      const updatedAt = normalizeDate(item.updatedAt, createdAt);
      const version = {
        id: versionId(noteId, revision),
        noteId,
        revision,
        title,
        content,
        typeId,
        tagIds,
        createdAt,
        updatedAt,
        isPinned: item.isPinned === true,
        deletedAt: normalizeDeletedAt(item.deletedAt),
        archivedAt: normalizeDate(item.archivedAt, updatedAt),
      };
      return version;
    });

    uniqueIds(versions.map(({ id }) => id), "note history version");
    const retained = [];
    const versionsByNote = new Map();
    versions.forEach((version) => {
      const noteVersions = versionsByNote.get(version.noteId) || [];
      noteVersions.push(version);
      versionsByNote.set(version.noteId, noteVersions);
    });
    versionsByNote.forEach((noteVersions) => {
      let contentBytes = 0;
      let retainedCount = 0;
      noteVersions
        .sort((left, right) => right.revision - left.revision || right.archivedAt.localeCompare(left.archivedAt))
        .forEach((version) => {
          const bytes = utf8ByteLength(version.content);
          if (
            retainedCount < HISTORY_RETENTION_LIMIT &&
            contentBytes + bytes <= HISTORY_MAX_CONTENT_BYTES
          ) {
            retained.push(version);
            retainedCount += 1;
            contentBytes += bytes;
          }
        });
    });
    return retained;
  }

  function parseBackup(value) {
    if (value && Array.isArray(value.interviewQuestions) && Array.isArray(value.protoblocNotes)) {
      return { snapshot: legacyToSnapshot(value), format: "legacy", schemaVersion: 0 };
    }

    if (
      !value ||
      value.format !== "personal-notes-backup" ||
      ![1, 2, 3, 4].includes(value.schemaVersion)
    ) {
      throw new Error("Choose a Personal Notes backup or a supported legacy library JSON file.");
    }

    const data = value.data;
    if (!data || typeof data !== "object") throw new Error("Backup data is missing.");
    const types = normalizeImportedTypes(data.noteTypes ?? data.types);
    const tags = normalizeImportedTags(data.tags);
    const notes = normalizeImportedNotes(data.notes, types, tags);
    const noteVersions = value.schemaVersion >= 3
      ? normalizeImportedNoteVersions(data.noteVersions, notes)
      : [];
    const attachments = value.schemaVersion >= 4 ? normalizeImportedAttachments(data.attachments) : [];
    if (value.schemaVersion >= 4) {
      const ids = new Set(attachments.map((item) => item.id));
      const missing = data.missingAttachments ?? [];
      if (!Array.isArray(missing) || missing.length > MAX_RECORDS_PER_IMPORT ||
          missing.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ids.has(id))) {
        throw new Error("The backup has invalid missing-image references.");
      }
      missing.forEach((id) => ids.add(id));
      if ([...notes, ...noteVersions].some((note) => attachmentIds(note.content).some((id) => !ids.has(id)))) {
        throw new Error("The backup is missing an image referenced by a note or saved version.");
      }
    }
    return {
      snapshot: { notes, types, tags, noteVersions, attachments },
      format: "personal-notes",
      schemaVersion: value.schemaVersion,
    };
  }

  async function replaceSnapshot(snapshot, source) {
    assertSnapshotShape(snapshot);
    await mutateLibrary((current, stores) => {
      // Replacement removes the prior library, but keeps binary data needed by
      // incoming notes, all-tab recovery, and image insertions still in flight.
      const mapped = mapIncomingAttachments(current.attachments, snapshot.attachments || []);
      const now = Date.now();
      const mayRemoveImages = current.attachments.some((item) => !mapped.ids.has(item.id) && item.protectedUntil <= now);
      const draftIds = mayRemoveImages ? protectedDraftImageIds(current.meta) : new Set();
      const retained = current.attachments.filter((item) => mapped.ids.has(item.id) ||
        draftIds.has(item.id) || item.protectedUntil > now);
      if (imageTotals([...retained, ...mapped.additions]).bytes > MAX_IMAGE_LIBRARY_BYTES) {
        throw new Error("This backup and images protected for drafts or recent insertions exceed 50 MB. Save or discard recovery drafts, or wait for recent insertions to finish, then try again.");
      }
      writeImageTotals(stores, [...retained, ...mapped.additions]);
      const retainedIds = new Set(retained.map((item) => item.id));
      current.attachments.forEach((item) => { if (!retainedIds.has(item.id)) stores.attachments.delete(item.id); });
      mapped.additions.forEach((item) => stores.attachments.put(item));
      stores.notes.clear();
      stores.types.clear();
      stores.tags.clear();
      stores.noteVersions.clear();
      snapshot.types.forEach((item) => stores.types.put(item));
      snapshot.tags.forEach((item) => stores.tags.put(item));
      snapshot.notes.forEach((item) => stores.notes.put({ ...item, content: mapped.content(item.content) }));
      snapshot.noteVersions.forEach((item) => stores.noteVersions.put({ ...item, content: mapped.content(item.content) }));
      stores.meta.put({
        key: BOOTSTRAP_META_KEY,
        value: { source, completedAt: nowIso() },
      });
    }, { readStores: [STORE.attachments, STORE.meta] });
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
      initialSnapshot = { notes: [], types: createDefaultTypes(createdAt), tags: [], noteVersions: [] };
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

  function createNoteConflictError(latestNote) {
    const error = new Error("This note changed in another tab. Review the latest version before saving.");
    error.code = "NOTE_CONFLICT";
    error.latestNote = latestNote ? normalizeNoteRecord(latestNote) : null;
    return error;
  }

  function validateExpectedRevision(value) {
    if (value == null) return null;
    return requireRevision(value, "Expected note revision");
  }

  function commitNoteMutation(existing, changes, history, stores) {
    const timestamp = nowIso();
    const archived = historySnapshot(existing, timestamp);
    stores.noteVersions.put(archived);
    history.push(archived);
    trimHistory(stores, existing.id, history);
    const next = normalizeNoteRecord({
      ...existing,
      ...changes,
      tagIds: changes.tagIds ? [...changes.tagIds] : [...existing.tagIds],
      revision: normalizeRevision(existing.revision) + 1,
      updatedAt: timestamp,
    });
    stores.notes.put(next);
    return next;
  }

  async function mutateNote(id, mutate, expectedRevision = null) {
    const noteId = requireId(id, "Note");
    const expected = validateExpectedRevision(expectedRevision);
    return runAtomicMutation({
      read: (stores) => [
        { key: "existing", request: stores.notes.get(noteId) },
        {
          key: "history",
          request: stores.noteVersions.index("by-note-id").getAll(noteId),
        },
      ],
      apply: (records, stores) => {
        const existing = records.existing ? normalizeNoteRecord(records.existing) : null;
        if (!existing) {
          if (expected != null) throw createNoteConflictError(null);
          throw new Error("This note no longer exists.");
        }
        if (expected != null && existing.revision !== expected) {
          throw createNoteConflictError(existing);
        }
        const changes = mutate(existing);
        if (!changes) return { result: existing, changed: false };
        const history = (records.history || []).map(normalizeHistoryRecord);
        return { result: commitNoteMutation(existing, changes, history, stores) };
      },
    });
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
    const expectedRevision = validateExpectedRevision(input.expectedRevision);
    if (!editingId && expectedRevision != null) {
      throw new Error("Expected note revision requires an existing note.");
    }

    return runAtomicMutation({
      read: (stores) => {
        const entries = [
          { key: "existing", request: editingId ? stores.notes.get(editingId) : null },
          { key: "type", request: stores.types.get(typeId) },
        ];
        tagIds.forEach((tagId, index) => {
          entries.push({ key: `tag-${index}`, request: stores.tags.get(tagId) });
        });
        if (editingId) {
          entries.push({
            key: "history",
            request: stores.noteVersions.index("by-note-id").getAll(editingId),
          });
        }
        return entries;
      },
      apply: (records, stores) => {
        const existing = records.existing ? normalizeNoteRecord(records.existing) : null;
        if (editingId && !existing) {
          if (expectedRevision != null) throw createNoteConflictError(null);
          throw new Error("This note no longer exists.");
        }
        if (expectedRevision != null && (existing.revision !== expectedRevision ||
          (input.expectedSnapshot && !sameEditorFields(existing, input.expectedSnapshot)))) {
          throw createNoteConflictError(existing);
        }
        if (!records.type) throw new Error("Choose a valid note type.");
        if (tagIds.some((tagId, index) => !records[`tag-${index}`] || records[`tag-${index}`].id !== tagId)) {
          throw new Error("One or more selected tags no longer exist.");
        }

        const candidate = {
          id: existing?.id || newId("note"),
          title,
          content,
          typeId,
          tagIds,
          createdAt: existing?.createdAt || nowIso(),
          updatedAt: existing?.updatedAt || nowIso(),
          isPinned: existing?.isPinned === true,
          deletedAt: existing?.deletedAt || null,
          revision: existing?.revision || 1,
        };
        if (existing && sameEditorFields(existing, candidate)) {
          return { result: existing, changed: false };
        }

        if (existing) {
          const history = (records.history || []).map(normalizeHistoryRecord);
          return { result: commitNoteMutation(existing, candidate, history, stores) };
        }

        const note = normalizeNoteRecord(candidate);
        stores.notes.put(note);
        return { result: note };
      },
    });
  }

  async function deleteNote(id) {
    await mutateNote(id, (existing) => existing.deletedAt ? null : { deletedAt: nowIso() });
  }

  async function restoreNote(id) {
    return mutateNote(id, (existing) => existing.deletedAt ? { deletedAt: null } : null);
  }

  async function permanentlyDeleteNote(id) {
    const noteId = requireId(id, "Note");
    await runAtomicMutation({
      read: (stores) => [
        { key: "existing", request: stores.notes.get(noteId) },
        { key: "history", request: stores.noteVersions.index("by-note-id").getAll(noteId) },
      ],
      apply: (records, stores) => {
        const existing = records.existing ? normalizeNoteRecord(records.existing) : null;
        if (!existing) throw new Error("This note no longer exists.");
        if (!existing.deletedAt) throw new Error("Only notes in Trash can be permanently deleted.");
        stores.notes.delete(noteId);
        (records.history || []).forEach((version) => stores.noteVersions.delete(version.id));
        return { result: undefined };
      },
    });
  }

  async function emptyTrash() {
    return mutateLibrary((snapshot, stores) => {
      const trashedNotes = snapshot.notes.filter((note) => note.deletedAt);
      const trashedIds = new Set(trashedNotes.map(({ id }) => id));
      trashedNotes.forEach(({ id }) => stores.notes.delete(id));
      snapshot.noteVersions
        .filter(({ noteId }) => trashedIds.has(noteId))
        .forEach(({ id }) => stores.noteVersions.delete(id));
      return trashedNotes.length;
    }, { readStores: [STORE.notes, STORE.noteVersions] });
  }

  async function setNotePinned(id, isPinned) {
    if (typeof isPinned !== "boolean") throw new Error("Note pin state is invalid.");
    return mutateNote(id, (existing) => existing.isPinned === isPinned ? null : { isPinned });
  }

  function sortHistoryVersions(versions) {
    return versions
      .map(normalizeHistoryRecord)
      .sort((left, right) => right.revision - left.revision || right.archivedAt.localeCompare(left.archivedAt));
  }

  async function listNoteVersions(id, { limit = HISTORY_RETENTION_LIMIT } = {}) {
    const noteId = requireId(id, "Note");
    if (!Number.isInteger(limit) || limit < 1) throw new Error("History limit must be a positive integer.");
    const database = await openDatabase();
    const transaction = database.transaction([STORE.noteVersions], "readonly");
    const versions = await requestResult(
      transaction.objectStore(STORE.noteVersions).index("by-note-id").getAll(noteId),
    );
    await transactionDone(transaction);
    return sortHistoryVersions(versions).slice(0, Math.min(limit, HISTORY_RETENTION_LIMIT));
  }

  async function getNoteVersion(id, revision) {
    const noteId = requireId(id, "Note");
    const version = requireRevision(revision, "Note history revision");
    const database = await openDatabase();
    const transaction = database.transaction([STORE.noteVersions], "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE.noteVersions).get(versionId(noteId, version)),
    );
    await transactionDone(transaction);
    return result ? normalizeHistoryRecord(result) : null;
  }

  async function restoreNoteVersion(id, revision, { expectedRevision = null } = {}) {
    const noteId = requireId(id, "Note");
    const targetRevision = requireRevision(revision, "Note history revision");
    const expected = validateExpectedRevision(expectedRevision);
    return runAtomicMutation({
      read: (stores) => {
        const entries = [
          { key: "existing", request: stores.notes.get(noteId) },
          { key: "version", request: stores.noteVersions.get(versionId(noteId, targetRevision)) },
          { key: "history", request: stores.noteVersions.index("by-note-id").getAll(noteId) },
          { key: "types", request: stores.types.getAll() },
          { key: "tags", request: stores.tags.getAll() },
        ];
        return entries;
      },
      apply: (records, stores) => {
        const existing = records.existing ? normalizeNoteRecord(records.existing) : null;
        if (!existing) {
          if (expected != null) throw createNoteConflictError(null);
          throw new Error("This note no longer exists.");
        }
        if (expected != null && existing.revision !== expected) {
          throw createNoteConflictError(existing);
        }
        if (!records.version || records.version.noteId !== noteId) {
          throw new Error("This note history version no longer exists.");
        }
        const version = normalizeHistoryRecord(records.version);
        const history = (records.history || []).map(normalizeHistoryRecord);
        const typeIds = new Set((records.types || []).map(({ id }) => id));
        const tagIds = new Set((records.tags || []).map(({ id }) => id));
        if (!typeIds.has(version.typeId) || version.tagIds.some((tagId) => !tagIds.has(tagId))) {
          throw new Error("This history version references a deleted note type or tag.");
        }
        return {
          result: commitNoteMutation(existing, {
            title: version.title,
            content: version.content,
            typeId: version.typeId,
            tagIds: version.tagIds,
            isPinned: version.isPinned,
            deletedAt: version.deletedAt,
          }, history, stores),
        };
      },
    });
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
      const history = snapshot.noteVersions.map(normalizeHistoryRecord);
      affectedNotes.forEach((note) =>
        commitNoteMutation(normalizeNoteRecord(note), { typeId: FALLBACK_TYPE_ID }, history, stores),
      );
      stores.types.delete(typeId);
      return affectedNotes.length;
    }, { readStores: [STORE.notes, STORE.types, STORE.noteVersions] });
  }

  async function addTag(input, { reuseExisting = false } = {}) {
    const name = requireTagName(input.name);
    return mutateLibrary((snapshot, stores) => {
      const existing = snapshot.tags.find((tag) => tag.normalizedName === normalizedName(name));
      if (reuseExisting && existing) return existing;
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
      const history = snapshot.noteVersions.map(normalizeHistoryRecord);
      affectedNotes.forEach((note) =>
        commitNoteMutation(
          normalizeNoteRecord(note),
          { tagIds: note.tagIds.filter((itemId) => itemId !== tagId) },
          history,
          stores,
        ),
      );
      stores.tags.delete(tagId);
      return affectedNotes.length;
    }, { readStores: [STORE.notes, STORE.tags, STORE.noteVersions] });
  }

  async function buildExport({ noteIds = null } = {}) {
    const snapshot = await getSnapshot({ includeHistory: true, includeAttachments: true });
    if (noteIds !== null) {
      const ids = new Set(noteIds.map((id) => requireId(id, "Note")));
      snapshot.notes = snapshot.notes.filter((note) => ids.has(note.id));
      if (snapshot.notes.length !== ids.size) throw new Error("Some selected notes no longer exist. Select them again.");
      snapshot.noteVersions = snapshot.noteVersions.filter((version) => ids.has(version.noteId));
    }
    const referenced = new Set([...snapshot.notes, ...snapshot.noteVersions].flatMap((note) => attachmentIds(note.content)));
    const attachments = snapshot.attachments.filter((item) => referenced.has(item.id));
    const available = new Set(attachments.map((item) => item.id));
    return {
      format: "personal-notes-backup",
      schemaVersion: 4,
      exportedAt: nowIso(),
      data: {
        noteTypes: snapshot.types,
        tags: snapshot.tags,
        notes: snapshot.notes,
        noteVersions: snapshot.noteVersions,
        attachments: attachments.map(({ id, name, mimeType, bytes, createdAt }) => ({ id, name, mimeType, createdAt, data: encodeImage(bytes) })),
        // Preserve source-only Markdown imports and literal references without
        // making a missing image prevent backing up the rest of the library.
        missingAttachments: [...referenced].filter((id) => !available.has(id)),
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
      noteVersions: parsed.snapshot.noteVersions.length,
      attachments: (parsed.snapshot.attachments || []).length,
    } };
  }

  function assertImportCapacity(snapshot, additions) {
    for (const name of ["notes", "types", "tags"]) {
      if (snapshot[name].length + additions[name].length > MAX_RECORDS_PER_IMPORT) {
        throw new Error(`This import would exceed ${MAX_RECORDS_PER_IMPORT} ${name}. Export or reduce the selection first.`);
      }
    }
  }

  // Merge only adds records. An ID collision is kept locally or imported under
  // a new ID, so an open editor and its revision history are never replaced.
  function planBackupMerge(current, incoming, conflictPolicy) {
    if (!["copy", "skip"].includes(conflictPolicy)) throw new Error("Choose how to handle conflicting notes.");
    const mappedImages = mapIncomingAttachments(current.attachments || [], incoming.attachments || []);
    const additions = { notes: [], types: [], tags: [], noteVersions: [], attachments: [] };
    const typeMap = new Map();
    const tagMap = new Map();
    for (const [name, mapping, prefix] of [["types", typeMap, "type"], ["tags", tagMap, "tag"]]) {
      const byName = new Map(current[name].map((item) => [item.normalizedName, item]));
      const usedIds = new Set(current[name].map((item) => item.id));
      incoming[name].forEach((item) => {
        const match = name === "types" && item.id === FALLBACK_TYPE_ID
          ? current.types.find((type) => type.id === FALLBACK_TYPE_ID)
          : byName.get(item.normalizedName);
        const id = match?.id || (usedIds.has(item.id) ? newId(prefix) : item.id);
        mapping.set(item.id, id);
        usedIds.add(id);
        if (!match) additions[name].push({ ...item, id });
      });
    }
    const existingNotes = new Map(current.notes.map((note) => [note.id, normalizeNoteRecord(note)]));
    const usedNoteIds = new Set([...existingNotes.keys(), ...incoming.notes.map((note) => note.id)]);
    const noteMap = new Map();
    const rows = [];
    const counts = { added: 0, copied: 0, skipped: 0, identical: 0 };
    incoming.notes.forEach((note) => {
      const mapped = { ...note, content: mappedImages.content(note.content), typeId: typeMap.get(note.typeId), tagIds: note.tagIds.map((id) => tagMap.get(id)) };
      const existing = existingNotes.get(note.id);
      let status = "add";
      if (existing && sameEditorFields(existing, mapped) && existing.isPinned === mapped.isPinned && existing.deletedAt === mapped.deletedAt) {
        status = "identical";
        counts.identical += 1;
      } else if (existing && conflictPolicy === "skip") {
        status = "skip";
        counts.skipped += 1;
      } else {
        if (existing) {
          status = "copy";
          do { mapped.id = newId("note"); } while (usedNoteIds.has(mapped.id));
          counts.copied += 1;
        } else counts.added += 1;
        usedNoteIds.add(mapped.id);
        noteMap.set(note.id, mapped.id);
        additions.notes.push(mapped);
      }
      rows.push({ title: note.title, status });
    });
    const missingTypeMap = new Map();
    const missingTagMap = new Map();
    function mapHistoricalId(id, mapping, missing, prefix) {
      if (mapping.has(id)) return mapping.get(id);
      if (!missing.has(id)) missing.set(id, newId(prefix));
      return missing.get(id);
    }
    incoming.noteVersions.forEach((version) => {
      const noteId = noteMap.get(version.noteId);
      if (!noteId) return;
      additions.noteVersions.push({
        ...version, content: mappedImages.content(version.content), noteId, id: versionId(noteId, version.revision),
        typeId: mapHistoricalId(version.typeId, typeMap, missingTypeMap, "missing-type"),
        tagIds: version.tagIds.map((id) => mapHistoricalId(id, tagMap, missingTagMap, "missing-tag")),
      });
    });
    const needed = new Set([...additions.notes, ...additions.noteVersions].flatMap((note) => attachmentIds(note.content)));
    additions.attachments = mappedImages.additions.filter((item) => needed.has(item.id));
    if (imageTotals([...(current.attachments || []), ...additions.attachments]).bytes > MAX_IMAGE_LIBRARY_BYTES) throw new Error("Local images would exceed 50 MB. Remove unused images before importing.");
    assertImportCapacity(current, additions);
    return { additions, counts, rows };
  }

  async function inspectBackupMerge(value, { conflictPolicy = "copy" } = {}) {
    const parsed = parseBackup(value);
    const current = await getSnapshot({ includeAttachments: true });
    const plan = planBackupMerge(current, parsed.snapshot, conflictPolicy);
    return { counts: plan.counts, rows: plan.rows, mutationId: current.mutationId };
  }

  async function mergeBackup(value, { conflictPolicy = "copy", expectedMutationId } = {}) {
    const parsed = parseBackup(value);
    return mutateLibrary((current, stores) => {
      const mutationId = current.meta.find((item) => item.key === MUTATION_META_KEY)?.value || "";
      if (expectedMutationId !== undefined && mutationId !== expectedMutationId) {
        throw new Error("The library changed after preview. Inspect the file again before importing.");
      }
      const plan = planBackupMerge(current, parsed.snapshot, conflictPolicy);
      for (const name of ["types", "tags", "notes", "noteVersions", "attachments"]) {
        plan.additions[name].forEach((item) => stores[name].put(item));
      }
      writeImageTotals(stores, [...current.attachments, ...plan.additions.attachments]);
      return plan.counts;
    }, { readStores: [STORE.notes, STORE.types, STORE.tags, STORE.meta, STORE.attachments] });
  }

  function inspectMarkdownFiles(files) {
    if (!Array.isArray(files) || !files.length || files.length > MAX_RECORDS_PER_IMPORT) {
      throw new Error("Choose between 1 and 10,000 Markdown files.");
    }
    return files.map((file) => {
      if (typeof file.name !== "string" || !/\.(?:md|markdown)$/i.test(file.name)) {
        throw new Error("Choose .md or .markdown files only.");
      }
      return {
        title: requireText(file.name.replace(/\.(?:md|markdown)$/i, ""), "Note title", MAX_TITLE_LENGTH),
        content: normalizeContent(file.content),
      };
    });
  }

  async function importMarkdownFiles(files, { typeId = FALLBACK_TYPE_ID, tagIds = [] } = {}) {
    const imported = inspectMarkdownFiles(files);
    const selectedType = requireId(typeId, "Note type");
    if (!Array.isArray(tagIds)) throw new Error("Choose valid tags.");
    const selectedTags = [...new Set(tagIds.map((id) => requireId(id, "Tag")))];
    return mutateLibrary((snapshot, stores) => {
      if (!snapshot.types.some((type) => type.id === selectedType)) throw new Error("Choose a valid note type.");
      if (selectedTags.some((id) => !snapshot.tags.some((tag) => tag.id === id))) throw new Error("A selected tag no longer exists.");
      assertImportCapacity(snapshot, { notes: imported, types: [], tags: [] });
      const timestamp = nowIso();
      const notes = imported.map((note) => ({ ...note, id: newId("note"), typeId: selectedType,
        tagIds: selectedTags, createdAt: timestamp, updatedAt: timestamp, revision: 1, deletedAt: null, isPinned: false }));
      notes.forEach((note) => stores.notes.put(note));
      return notes;
    });
  }

  async function updateNotesBatch(selection, changes) {
    if (!Array.isArray(selection) || !selection.length || selection.length > MAX_RECORDS_PER_IMPORT) throw new Error("Select notes first.");
    const ids = selection.map((item) => requireId(item.id, "Note"));
    uniqueIds(ids, "selected note");
    selection.forEach((item) => {
      if (item.expectedRevision == null) throw new Error("Selected notes need their expected revisions.");
      requireRevision(item.expectedRevision);
    });
    if (!changes || !["type", "add-tag", "remove-tag", "trash", "restore"].includes(changes.action)) throw new Error("Choose a batch action.");
    return runAtomicMutation({
      read: (stores) => {
        const entries = [
          { key: "type", request: changes.action === "type" ? stores.types.get(requireId(changes.typeId, "Note type")) : null },
          { key: "tag", request: changes.action.endsWith("tag") ? stores.tags.get(requireId(changes.tagId, "Tag")) : null },
        ];
        ids.forEach((id, index) => entries.push(
          { key: `note-${index}`, request: stores.notes.get(id) },
          { key: `history-${index}`, request: stores.noteVersions.index("by-note-id").getAll(id) },
        ));
        return entries;
      },
      apply: (records, stores) => {
        if (changes.action === "type" && !records.type) throw new Error("This note type no longer exists.");
        if (changes.action.endsWith("tag") && !records.tag) throw new Error("This tag no longer exists.");
        const notes = ids.map((id, index) => {
          const note = records[`note-${index}`];
          if (!note || note.revision !== selection[index].expectedRevision ||
            (selection[index].expectedSnapshot && !sameEditorFields(note, selection[index].expectedSnapshot))) {
            throw new Error("A selected note changed elsewhere. Select the notes again; nothing was changed.");
          }
          if (changes.action !== "restore" && note.deletedAt) throw new Error("A selected note is in Trash. Select notes again.");
          return normalizeNoteRecord(note);
        });
        let changed = 0;
        notes.forEach((note, index) => {
          let next;
          if (changes.action === "type" && note.typeId !== changes.typeId) next = { typeId: changes.typeId };
          if (changes.action === "add-tag" && !note.tagIds.includes(changes.tagId)) next = { tagIds: [...note.tagIds, changes.tagId] };
          if (changes.action === "remove-tag" && note.tagIds.includes(changes.tagId)) next = { tagIds: note.tagIds.filter((id) => id !== changes.tagId) };
          if (changes.action === "trash") next = { deletedAt: nowIso() };
          if (changes.action === "restore" && note.deletedAt) next = { deletedAt: null };
          if (!next) return;
          commitNoteMutation(note, next, records[`history-${index}`] || [], stores);
          changed += 1;
        });
        return { result: { changed }, changed: changed > 0 };
      },
    });
  }

  // Templates are ordinary, backup-compatible notes carrying the template tag.
  async function createTemplateNote(input) {
    const title = requireText(input.title, "Note title", MAX_TITLE_LENGTH);
    const content = normalizeContent(input.content);
    return mutateLibrary((snapshot, stores) => {
      if (!snapshot.types.some((type) => type.id === input.typeId)) throw new Error("Choose a valid note type.");
      let tag = snapshot.tags.find((item) => item.normalizedName === "template");
      const timestamp = nowIso();
      if (!tag) tag = { id: newId("tag"), name: "template", normalizedName: "template", createdAt: timestamp, updatedAt: timestamp };
      const tags = [...new Set([...(input.tagIds || []).filter((id) => snapshot.tags.some((item) => item.id === id)), tag.id])];
      const note = { id: newId("note"), title, content, typeId: input.typeId, tagIds: tags,
        createdAt: timestamp, updatedAt: timestamp, revision: 1, deletedAt: null, isPinned: false };
      assertImportCapacity(snapshot, { notes: [note], types: [], tags: snapshot.tags.some((item) => item.id === tag.id) ? [] : [tag] });
      stores.tags.put(tag);
      stores.notes.put(note);
      return note;
    });
  }

  async function getOrCreateDailyNote(date, { content = "## Focus\n\n- [ ] \n\n## Notes\n\n\n## Reflection\n\n" } = {}) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error("Choose a valid calendar date.");
    }
    content = normalizeContent(content);
    return mutateLibrary((snapshot, stores) => {
      let tag = snapshot.tags.find((item) => item.normalizedName === "daily-note");
      const title = `Daily · ${date}`;
      const dailyId = `note-daily-${date}`;
      const existing = snapshot.notes.find((note) => note.id === dailyId) ||
        (tag && snapshot.notes.find((note) => !note.deletedAt && note.title === title && note.tagIds.includes(tag.id)));
      if (existing?.deletedAt) throw new Error("This Daily note is in Trash. Restore it before opening today's note.");
      if (existing) return normalizeNoteRecord(existing);
      const timestamp = nowIso();
      if (!tag) tag = { id: newId("tag"), name: "daily-note", normalizedName: "daily-note", createdAt: timestamp, updatedAt: timestamp };
      const note = { id: dailyId, title, content, typeId: FALLBACK_TYPE_ID, tagIds: [tag.id],
        createdAt: timestamp, updatedAt: timestamp, revision: 1, deletedAt: null, isPinned: false };
      assertImportCapacity(snapshot, { notes: [note], types: [], tags: snapshot.tags.some((item) => item.id === tag.id) ? [] : [tag] });
      stores.tags.put(tag);
      stores.notes.put(note);
      return note;
    });
  }

  async function resetLibrary() {
    const resetAt = nowIso();
    const defaultTypes = createDefaultTypes(resetAt);
    return mutateLibrary((snapshot, stores) => {
      const counts = {
        notes: snapshot.notes.length,
        trashedNotes: snapshot.notes.filter((note) => note.deletedAt).length,
        types: snapshot.types.length,
        tags: snapshot.tags.length,
        noteVersions: snapshot.noteVersions.length,
        attachments: snapshot.attachments.length,
      };
      stores.notes.clear();
      stores.types.clear();
      stores.tags.clear();
      stores.noteVersions.clear();
      stores.attachments.clear();
      stores.meta.clear();
      defaultTypes.forEach((type) => stores.types.put(type));
      stores.meta.put({
        key: BOOTSTRAP_META_KEY,
        value: { source: "library-reset", completedAt: resetAt },
      });
      return counts;
    }, { readStores: [STORE.notes, STORE.types, STORE.tags, STORE.noteVersions, STORE.meta, STORE.attachments] });
  }

  function inspectBackup(value) {
    const parsed = parseBackup(value);
    return {
      format: parsed.format,
      schemaVersion: parsed.schemaVersion,
      counts: {
        notes: parsed.snapshot.notes.length,
        types: parsed.snapshot.types.length,
        tags: parsed.snapshot.tags.length,
        noteVersions: parsed.snapshot.noteVersions.length,
        attachments: (parsed.snapshot.attachments || []).length,
      },
    };
  }

  globalThis.PersonalNotesStorage = Object.freeze({
    FALLBACK_TYPE_ID,
    TYPE_COLORS,
    HISTORY_RETENTION_LIMIT,
    HISTORY_MAX_CONTENT_BYTES,
    MAX_CONTENT_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_IMAGE_BYTES,
    attachmentIds,
    addAttachment,
    validateAttachment,
    getAttachment,
    inspectUnusedAttachments,
    protectDraftAttachments,
    initialize,
    getSnapshot,
    getNote,
    saveNote,
    deleteNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    setNotePinned,
    listNoteVersions,
    getNoteVersion,
    restoreNoteVersion,
    addType,
    updateType,
    deleteType,
    addTag,
    updateTag,
    deleteTag,
    buildExport,
    inspectBackup,
    importBackup,
    inspectBackupMerge,
    mergeBackup,
    inspectMarkdownFiles,
    importMarkdownFiles,
    updateNotesBatch,
    createTemplateNote,
    getOrCreateDailyNote,
    resetLibrary,
  });
})();
