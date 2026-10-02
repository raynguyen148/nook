(() => {
  "use strict";

  // Legacy draft compatibility and browser-local backup health.
  globalThis[Symbol.for("nook.app.modules")].register("local-state", (app) => {

    const { api, elements } = app;
    const DRAFT_RECOVERY_STORAGE_KEY = "nook:note-editor-draft";
    const BACKUP_HEALTH_STORAGE_KEY = "nook:backup-health";
    const DRAFT_RECOVERY_VERSION = 1;
    const BACKUP_REMINDER_AGE_MS = 10 * 24 * 60 * 60 * 1000;
    const nowIso = (...args) => api.nowIso(...args);
    const isValidTimestamp = (...args) => api.isValidTimestamp(...args);

    function clearStoredNoteDraft() {
      try {
        window.localStorage.removeItem(DRAFT_RECOVERY_STORAGE_KEY);
      } catch {
        // Saving and closing notes still works when localStorage is unavailable.
      }
    }

    function getStoredNoteDraft() {
      try {
        const raw = window.localStorage.getItem(DRAFT_RECOVERY_STORAGE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        const draft = value?.draft;
        if (
          value?.version !== DRAFT_RECOVERY_VERSION ||
          !isValidTimestamp(value.savedAt) ||
          !draft ||
          typeof draft.id !== "string" ||
          typeof draft.title !== "string" ||
          typeof draft.typeId !== "string" ||
          !Array.isArray(draft.tagIds) ||
          draft.tagIds.some((tagId) => typeof tagId !== "string") ||
          typeof draft.content !== "string"
        ) {
          clearStoredNoteDraft();
          return null;
        }
        return {
          savedAt: value.savedAt,
          draft: {
            id: draft.id,
            title: draft.title,
            typeId: draft.typeId,
            tagIds: [...new Set(draft.tagIds)].sort(),
            content: draft.content,
          },
        };
      } catch {
        return null;
      }
    }

    function createDefaultBackupHealth() {
      return {
        trackingStartedAt: nowIso(),
        lastDownloadRequestedAt: "",
      };
    }

    function getStoredBackupHealth() {
      const fallback = createDefaultBackupHealth();
      try {
        const raw = window.localStorage.getItem(BACKUP_HEALTH_STORAGE_KEY);
        if (!raw) return fallback;
        const value = JSON.parse(raw);
        if (!isValidTimestamp(value?.trackingStartedAt)) return fallback;
        return {
          trackingStartedAt: value.trackingStartedAt,
          lastDownloadRequestedAt: isValidTimestamp(value.lastDownloadRequestedAt)
            ? value.lastDownloadRequestedAt
            : (isValidTimestamp(value.lastExportedAt) ? value.lastExportedAt : ""),
        };
      } catch {
        return fallback;
      }
    }

    function storeBackupHealth(value) {
      try {
        window.localStorage.setItem(BACKUP_HEALTH_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // A missing reminder must not block local note work.
      }
    }

    function backupHealthReferenceDate(health) {
      return new Date(health.lastDownloadRequestedAt || health.trackingStartedAt);
    }

    function backupAgeInDays(health) {
      const referenceDate = backupHealthReferenceDate(health);
      return Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / 86400000));
    }

    function formatBackupStatus(message) {
      return `Local · ${message}`;
    }

    function backupHealthMessage(health, daysSinceReference) {
      const hasDownloadRequest = Boolean(health.lastDownloadRequestedAt);
      if (!hasDownloadRequest) return formatBackupStatus("No backup yet");
      if (daysSinceReference === 0) return formatBackupStatus("Backup requested today");
      if (daysSinceReference >= BACKUP_REMINDER_AGE_MS / 86400000) {
        return formatBackupStatus(`Backup due (${daysSinceReference}d)`);
      }
      return formatBackupStatus(`Backup requested ${daysSinceReference}d ago`);
    }

    function backupHealthDescription(health, daysSinceReference) {
      const hasDownloadRequest = Boolean(health.lastDownloadRequestedAt);
      const dayLabel = `${daysSinceReference} ${daysSinceReference === 1 ? "day" : "days"}`;
      if (!hasDownloadRequest) {
        return "Notes are stored only in this browser. No backup download has been requested yet.";
      }
      if (daysSinceReference === 0) {
        return "Notes are stored locally. A backup download was requested today.";
      }
      if (daysSinceReference >= BACKUP_REMINDER_AGE_MS / 86400000) {
        return `Notes are stored locally. No backup download has been requested for ${dayLabel}; export a backup soon.`;
      }
      return `Notes are stored locally. A backup download was requested ${dayLabel} ago.`;
    }

    function syncBackupHealth() {
      const health = getStoredBackupHealth();
      const daysSinceReference = backupAgeInDays(health);
      const dueToAge = daysSinceReference >= BACKUP_REMINDER_AGE_MS / 86400000;
      const hasDownloadRequest = Boolean(health.lastDownloadRequestedAt);
      const status = !hasDownloadRequest ? "never" : dueToAge ? "warning" : "good";
      const statusClass = `status-dot--backup-${status}`;
      elements.backupHealth.dataset.state = status;
      elements.backupHealthDot.className = `status-dot ${statusClass}`;
      elements.backupHealthMessage.textContent = backupHealthMessage(health, daysSinceReference);
      const description = backupHealthDescription(health, daysSinceReference);
      elements.backupHealth.title = description;
      elements.backupHealth.setAttribute("aria-label", description);
    }

    function recordBackupExport() {
      const timestamp = nowIso();
      storeBackupHealth({
        trackingStartedAt: timestamp,
        lastDownloadRequestedAt: timestamp,
      });
      syncBackupHealth();
    }

    Object.assign(api, {
      clearStoredNoteDraft,
      getStoredNoteDraft,
      createDefaultBackupHealth,
      getStoredBackupHealth,
      storeBackupHealth,
      backupHealthReferenceDate,
      backupAgeInDays,
      formatBackupStatus,
      backupHealthMessage,
      syncBackupHealth,
      recordBackupExport,
    });
  });
})();
