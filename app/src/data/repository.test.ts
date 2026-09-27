import { beforeAll, describe, expect, it } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { repository } from "./repository"

const timestamp = "2026-09-01T10:00:00.000Z"

function seedVersion2Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("personal-notes", 2)
    request.onupgradeneeded = () => {
      const database = request.result
      const notes = database.createObjectStore("notes", { keyPath: "id" })
      notes.createIndex("by-type-id", "typeId")
      notes.createIndex("by-tag-ids", "tagIds", { multiEntry: true })
      notes.createIndex("by-created-at", "createdAt")
      notes.createIndex("by-updated-at", "updatedAt")
      const types = database.createObjectStore("types", { keyPath: "id" })
      types.createIndex("by-normalized-name", "normalizedName", { unique: true })
      const tags = database.createObjectStore("tags", { keyPath: "id" })
      tags.createIndex("by-normalized-name", "normalizedName", { unique: true })
      database.createObjectStore("meta", { keyPath: "key" })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(["notes", "types", "tags"], "readwrite")
      transaction.objectStore("types").put({
        id: "type-general",
        name: "General",
        normalizedName: "general",
        color: "slate",
        isFallback: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      transaction.objectStore("tags").put({
        id: "tag-v2",
        name: "Existing",
        normalizedName: "existing",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      transaction.objectStore("notes").put({
        id: "note-v2",
        title: "Version 2 note",
        content: "Preserve this v2 content.",
        typeId: "type-general",
        tagIds: ["tag-v2"],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    }
  })
}

const generalType = {
  id: "type-general",
  name: "General",
  color: "slate",
  createdAt: timestamp,
  updatedAt: timestamp,
}

function makeBackup(schemaVersion: 1 | 2, useLegacyTypesKey = false) {
  const data = {
    ...(useLegacyTypesKey ? { types: [generalType] } : { noteTypes: [generalType] }),
    tags: [],
    notes: [{
      id: `note-v${schemaVersion}-backup`,
      title: `Version ${schemaVersion} backup note`,
      content: "Older backup content.",
      typeId: "type-general",
      tagIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  }
  return { format: "personal-notes-backup", schemaVersion, data }
}

describe("typed IndexedDB repository adapter", () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    })
    await seedVersion2Database()
    await repository.initialize()
  })

  it("upgrades an existing v2 database in place and preserves its note", async () => {
    const migrated = await repository.getNote("note-v2")
    expect(migrated).toMatchObject({
      id: "note-v2",
      content: "Preserve this v2 content.",
      isPinned: false,
      deletedAt: null,
      revision: 1,
    })

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("personal-notes")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(database.version).toBe(3)
    expect(database.objectStoreNames.contains("noteVersions")).toBe(true)
    database.close()
  })

  it("keeps compare-and-save, no-op, and history restore semantics", async () => {
    const saved = await repository.saveNote({
      id: "note-v2",
      title: "Version 2 note",
      content: "Updated once.",
      typeId: "type-general",
      tagIds: ["tag-v2"],
      expectedRevision: 1,
    })
    expect(saved.revision).toBe(2)

    await expect(repository.saveNote({
      id: "note-v2",
      title: "Stale save",
      content: "Must not win.",
      typeId: "type-general",
      tagIds: ["tag-v2"],
      expectedRevision: 1,
    })).rejects.toMatchObject({
      code: "NOTE_CONFLICT",
      latestNote: expect.objectContaining({ revision: 2, content: "Updated once." }),
    })

    const noOp = await repository.saveNote({
      id: "note-v2",
      title: "Version 2 note",
      content: "Updated once.",
      typeId: "type-general",
      tagIds: ["tag-v2"],
      expectedRevision: 2,
    })
    expect(noOp.revision).toBe(2)
    expect(await repository.listNoteVersions("note-v2")).toHaveLength(1)

    const restored = await repository.restoreNoteVersion("note-v2", 1, { expectedRevision: 2 })
    expect(restored).toMatchObject({ revision: 3, content: "Preserve this v2 content." })
    expect((await repository.listNoteVersions("note-v2")).map(({ revision }) => revision)).toEqual([2, 1])
  })

  it("exports and imports v3 history, accepts v1/v2 backups, and rejects invalid replacement atomically", async () => {
    const version3Backup = await repository.buildExport() as {
      schemaVersion: number
      data: { noteVersions: Array<{ revision: number }> }
    }
    expect(version3Backup.schemaVersion).toBe(3)
    expect(version3Backup.data.noteVersions.map(({ revision }) => revision)).toEqual([1, 2])
    expect(repository.inspectBackup(version3Backup).counts.noteVersions).toBe(2)

    await repository.importBackup(version3Backup)
    expect(await repository.getNote("note-v2")).toMatchObject({ revision: 3 })
    expect(await repository.listNoteVersions("note-v2")).toHaveLength(2)

    const version1Backup = makeBackup(1)
    expect(repository.inspectBackup(version1Backup)).toMatchObject({ schemaVersion: 1, counts: { notes: 1 } })
    await repository.importBackup(version1Backup)
    expect(await repository.getNote("note-v1-backup")).toMatchObject({ revision: 1 })
    expect(await repository.getSnapshot({ includeHistory: true })).toMatchObject({ noteVersions: [] })

    const version2Backup = makeBackup(2, true)
    expect(repository.inspectBackup(version2Backup)).toMatchObject({ schemaVersion: 2, counts: { notes: 1 } })
    await repository.importBackup(version2Backup)
    expect(await repository.getNote("note-v2-backup")).toMatchObject({ revision: 1 })

    const beforeInvalidImport = await repository.getSnapshot({ includeHistory: true })
    const invalidBackup = {
      ...makeBackup(2),
      data: {
        ...makeBackup(2).data,
        notes: [{ ...makeBackup(2).data.notes[0], typeId: "missing-type" }],
      },
    }
    expect(() => repository.inspectBackup(invalidBackup)).toThrow(/references a missing note type/)
    await expect(repository.importBackup(invalidBackup)).rejects.toThrow(/references a missing note type/)
    expect(await repository.getSnapshot({ includeHistory: true })).toEqual(beforeInvalidImport)
  })
})
