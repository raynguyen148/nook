(() => {
  "use strict";
  globalThis[Symbol.for("nook.app.modules")].register("onboarding", (app) => {
    const { api, elements, library, storage } = app;
    const key = "nook:onboarding:v1";
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(key) === "seen"; } catch { /* Session-only preference. */ }

    function dismiss() {
      dismissed = true;
      try { window.localStorage.setItem(key, "seen"); } catch { /* Keep this session working. */ }
      elements.welcomeCard.classList.add("is-hidden");
    }

    function syncOnboarding() {
      // Existing libraries never acquire a first-use prompt after being emptied.
      if (library.notes.length && !dismissed) dismiss();
      elements.welcomeCard.classList.toggle("is-hidden", dismissed);
    }

    function bindOnboardingEvents() {
      elements.welcomeDismiss.addEventListener("click", dismiss);
      elements.welcomeGuide.addEventListener("click", async () => {
        elements.welcomeGuide.disabled = true;
        try {
          const note = await storage.saveNote({ title: "Welcome to Nook", typeId: storage.FALLBACK_TYPE_ID, tagIds: [],
            content: "# Your notes, in this browser\n\nNook works offline. Notes stay in this browser on this device, with no account or cloud sync.\n\n## Write and organize\n\nCreate a note, write Markdown, and use Preview or Split to read it. Add tags and choose a note type to keep the library useful. Changes save automatically; check for Saved before leaving.\n\n## Keep a backup\n\nOpen Settings → Data to export a JSON backup. Save it outside this browser. Import that backup to move your library to another browser. Clearing browser data can remove notes.\n\n## Find and recover\n\nQuick actions help find notes, templates, and today’s Daily note. Trash lets you restore deleted notes. Recover drafts helps recover interrupted edits.\n\nThis is an ordinary note. Edit it or move it to Trash whenever you like." });
          dismiss();
          await api.refreshLibrary({ broadcast: true });
          api.openNoteEditor(note, { initialMode: "preview", focusTitle: false });
        } catch (error) { api.showError(error); }
        finally { elements.welcomeGuide.disabled = false; }
      });
    }
    Object.assign(api, { syncOnboarding, bindOnboardingEvents });
  });
})();
