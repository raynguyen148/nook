globalThis[Symbol.for("nook.app.modules")].register("preferences", (app) => {
  "use strict";

  // UI preferences, responsive control state, and their local persistence.
  const { api, elements, ui, constants } = app;
  const {
    FILTER_STORAGE_KEY,
    MOTION,
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    SORT_STORAGE_KEY,
    THEME_STORAGE_KEY,
    THEMES,
    VIEW_MODE_ANIMATION_DURATION,
    VIEW_MODE_ANIMATION_EASING,
    VIEW_MODE_STORAGE_KEY,
  } = constants;
  let viewModeListAnimation = null;
  let uiViewTransition = null;
  let sidebarCollapseStartTimer = 0;
  let sidebarCollapseRevealTimer = 0;
  let autoThemeTimer = 0;

  // These core utilities are resolved only when an interaction occurs, after
  // every installer has completed.
  const pluralize = (...args) => api.pluralize(...args);
  const usesMacKeyboardShortcuts = (...args) => api.usesMacKeyboardShortcuts(...args);

  function getNextTheme(currentTheme) {
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    return THEMES[nextIndex];
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function runUiViewTransition(kind, update) {
    if (prefersReducedMotion() || typeof document.startViewTransition !== "function") {
      update();
      return null;
    }

    uiViewTransition?.skipTransition?.();
    document.documentElement.dataset.uiTransition = kind;

    let transition;
    try {
      transition = document.startViewTransition(update);
    } catch {
      delete document.documentElement.dataset.uiTransition;
      update();
      return null;
    }

    uiViewTransition = transition;
    // Browsers may reject `ready` when rendering state changes while a page is
    // backgrounded or headless. The update still applies, so consume that
    // lifecycle rejection instead of surfacing an unhandled promise error.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).finally(() => {
      if (uiViewTransition !== transition) return;
      uiViewTransition = null;
      delete document.documentElement.dataset.uiTransition;
    });
    return transition;
  }

  function resolveAutoTheme(now = new Date()) {
    // Keep this local-time schedule aligned with the pre-paint script in index.html.
    const hour = now.getHours();
    if (hour >= 18 && hour < 21) return "warm";
    if (hour >= 21 || hour < 5) return "dark";
    return "light";
  }

  function clearAutoThemeTimer() {
    window.clearTimeout(autoThemeTimer);
    autoThemeTimer = 0;
  }

  function scheduleAutoTheme() {
    clearAutoThemeTimer();
    if (ui.theme !== "auto" || document.hidden) return;
    // Check at the next minute boundary, including after a device-clock change.
    autoThemeTimer = window.setTimeout(refreshAutoTheme, 60000 - (Date.now() % 60000));
  }

  function refreshAutoTheme() {
    if (ui.theme === "auto" && !document.hidden && document.documentElement.dataset.theme !== resolveAutoTheme()) {
      syncThemeUI();
    } else {
      scheduleAutoTheme();
    }
  }

  function syncThemeUI() {
    const mode = ui.theme;
    const theme = mode === "auto" ? resolveAutoTheme() : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;

    const themeLabels = {
      light: "Light",
      warm: "Warm",
      dark: "Dark",
      auto: "Auto",
    };

    const label = themeLabels[mode] || "Light";
    const nextLabel = themeLabels[getNextTheme(mode)];
    const currentLabel = mode === "auto" ? `Auto (${themeLabels[theme]})` : label;
    elements.themeToggle.setAttribute(
      "aria-label",
      `Current theme: ${currentLabel}. Switch to ${nextLabel} theme`,
    );
    elements.themeToggle.removeAttribute("title");
    elements.themeToggleLabel.textContent = label;
    if (elements.themeToggleTooltipText) {
      elements.themeToggleTooltipText.textContent = mode === "auto"
        ? `Auto · local time (switch to ${nextLabel})\n• Light 05:00–18:00\n• Warm 18:00–21:00\n• Dark 21:00–05:00`
        : `Theme: ${label} (switch to ${nextLabel})`;
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.content = theme === "dark" ? "#0b0f19" : (theme === "warm" ? "#a35616" : "#9e6b02");
    }
    scheduleAutoTheme();
  }

  function setTheme(theme, { animate = true, persist = true } = {}) {
    if (!THEMES.includes(theme) || theme === ui.theme) return;
    ui.theme = theme;
    const applyTheme = () => {
      syncThemeUI();
      if (!persist) return;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, ui.theme);
      } catch {
        // The theme still works for this session when browser privacy settings block localStorage.
      }
    };
    if (animate) runUiViewTransition("theme", applyTheme);
    else applyTheme();
  }

  function syncSidebarUI() {
    const isCollapsed = ui.sidebarCollapsed;
    document.documentElement.dataset.sidebarCollapsed = String(isCollapsed);
    elements.appShell.classList.toggle("is-sidebar-collapsed", isCollapsed);
    if (elements.sidebarToggle) {
      const shortcutModifier = usesMacKeyboardShortcuts() ? "⌘\\" : "Ctrl+\\";
      const actionLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
      elements.sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
      elements.sidebarToggle.setAttribute("aria-label", actionLabel);
      elements.sidebarToggle.title = `${actionLabel} (${shortcutModifier})`;
    }
  }

  function persistSidebarCollapsedState(collapsed) {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // The sidebar state still works for this session when browser privacy settings block localStorage.
    }
  }

  function clearSidebarCollapseChoreography() {
    if (sidebarCollapseStartTimer) {
      window.clearTimeout(sidebarCollapseStartTimer);
      sidebarCollapseStartTimer = 0;
    }
    if (sidebarCollapseRevealTimer) {
      window.clearTimeout(sidebarCollapseRevealTimer);
      sidebarCollapseRevealTimer = 0;
    }
    elements.appShell.classList.remove("is-sidebar-collapsing");
  }

  function canStageSidebarCollapse() {
    return !prefersReducedMotion() && window.matchMedia("(min-width: 821px)").matches;
  }

  function toggleSidebar(collapsed = !ui.sidebarCollapsed) {
    const isCollapseInFlight = Boolean(sidebarCollapseStartTimer || sidebarCollapseRevealTimer);
    if (ui.sidebarCollapsed === collapsed && !isCollapseInFlight) return;

    if (collapsed) {
      uiViewTransition?.skipTransition?.();
      delete document.documentElement.dataset.uiTransition;
      ui.sidebarCollapsed = true;

      if (!canStageSidebarCollapse()) {
        syncSidebarUI();
        persistSidebarCollapsedState(true);
        return;
      }

      clearSidebarCollapseChoreography();
      elements.appShell.classList.add("is-sidebar-collapsing");
      sidebarCollapseStartTimer = window.setTimeout(() => {
        sidebarCollapseStartTimer = 0;
        syncSidebarUI();
        persistSidebarCollapsedState(true);
        sidebarCollapseRevealTimer = window.setTimeout(() => {
          sidebarCollapseRevealTimer = 0;
          elements.appShell.classList.remove("is-sidebar-collapsing");
        }, MOTION.short);
      }, MOTION.micro);
      return;
    }

    clearSidebarCollapseChoreography();
    ui.sidebarCollapsed = collapsed;
    if (isCollapseInFlight) {
      syncSidebarUI();
      persistSidebarCollapsedState(false);
      return;
    }

    runUiViewTransition("sidebar-expand", () => {
      syncSidebarUI();
      persistSidebarCollapsedState(false);
    });
  }

  function measureTopbarActionsPinBounds() {
    if (ui.topbarActionsPinned) return;
    const actionBounds = elements.topbarActions.getBoundingClientRect();
    const toolbarBounds = elements.toolbar.getBoundingClientRect();
    const isMobileLayout = window.matchMedia("(max-width: 620px)").matches;
    ui.topbarActionsPinStart = window.scrollY + actionBounds.top;
    ui.topbarActionsPinEnd = window.scrollY + (isMobileLayout ? toolbarBounds.bottom : actionBounds.bottom);
    ui.toolbarPinStart = window.scrollY + toolbarBounds.top;
    ui.toolbarPinEnd = window.scrollY + toolbarBounds.bottom;
  }

  function finishTopbarActionsUnpin() {
    ui.topbarActionsUnpinTimer = 0;
    ui.topbarActionsPinned = false;
    elements.topbar.classList.remove("is-actions-pinned");
    elements.topbarActions.classList.remove("is-pinned", "is-unpinning");
    elements.appShell.style.removeProperty("--pinned-actions-height");
    elements.appShell.style.removeProperty("--pinned-actions-width");
    elements.appShell.style.removeProperty("--pinned-toolbar-left");
    elements.appShell.style.removeProperty("--pinned-controls-right");
  }

  function setToolbarPinned(pinned) {
    if (pinned === ui.toolbarPinned) return;
    ui.toolbarPinned = pinned;
    elements.notesPanel.classList.toggle("is-toolbar-pinned", pinned);
    elements.toolbar.classList.toggle("is-pinned", pinned);
    elements.toolbar.classList.remove("is-unpinning");

    if (pinned) {
      const toolbarBounds = elements.toolbar.getBoundingClientRect();
      elements.notesPanel.style.setProperty("--pinned-toolbar-height", `${toolbarBounds.height}px`);
      syncPinnedTopbarControlMetrics();
      return;
    }

    elements.notesPanel.style.removeProperty("--pinned-toolbar-height");
  }

  function setTopbarActionsPinned(pinned) {
    if (pinned && ui.topbarActionsUnpinTimer) {
      window.clearTimeout(ui.topbarActionsUnpinTimer);
      ui.topbarActionsUnpinTimer = 0;
      elements.topbarActions.classList.remove("is-unpinning");
      elements.toolbar.classList.remove("is-unpinning");
      return;
    }
    if (!pinned && ui.topbarActionsUnpinTimer) return;
    if (pinned === ui.topbarActionsPinned) return;

    if (pinned) {
      const actionBounds = elements.topbarActions.getBoundingClientRect();
      elements.appShell.style.setProperty("--pinned-actions-height", `${actionBounds.height}px`);
      ui.topbarActionsPinned = true;
      elements.topbar.classList.add("is-actions-pinned");
      elements.topbarActions.classList.add("is-pinned");
      syncPinnedTopbarControlMetrics();
      if (window.matchMedia("(max-width: 620px)").matches) setToolbarPinned(true);
      return;
    }

    setToolbarPinned(false);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishTopbarActionsUnpin();
      return;
    }

    elements.topbarActions.classList.add("is-unpinning");
    elements.toolbar.classList.add("is-unpinning");
    ui.topbarActionsUnpinTimer = window.setTimeout(finishTopbarActionsUnpin, MOTION.short);
  }

  function syncPinnedTopbarControlMetrics() {
    if (!ui.topbarActionsPinned) return;
    const actionBounds = elements.topbarActions.getBoundingClientRect();
    const topbarBounds = elements.topbar.getBoundingClientRect();
    elements.appShell.style.setProperty("--pinned-actions-height", `${actionBounds.height}px`);
    elements.appShell.style.setProperty("--pinned-actions-width", `${actionBounds.width}px`);
    elements.appShell.style.setProperty("--pinned-toolbar-left", `${topbarBounds.left}px`);
    elements.appShell.style.setProperty("--pinned-controls-right", `${document.documentElement.clientWidth - topbarBounds.right}px`);
  }

  function updateTopbarActionsPinning() {
    const scrollTop = window.scrollY;

    if (!ui.topbarActionsPinned) {
      measureTopbarActionsPinBounds();
      if (scrollTop <= ui.topbarActionsPinEnd) return;
      setTopbarActionsPinned(true);
    }

    if (!ui.toolbarPinned && scrollTop > ui.toolbarPinEnd) setToolbarPinned(true);
    if (ui.toolbarPinned && scrollTop <= ui.toolbarPinStart) setToolbarPinned(false);
    if (scrollTop <= ui.topbarActionsPinStart) setTopbarActionsPinned(false);
  }

  function scheduleTopbarActionsPinning() {
    if (ui.topbarActionsPinFrame) return;
    ui.topbarActionsPinFrame = window.requestAnimationFrame(() => {
      ui.topbarActionsPinFrame = 0;
      updateTopbarActionsPinning();
    });
  }

  function activeRegularFilterCount() {
    return Number(ui.typeId !== "all") + ui.tagIds.size + Number(ui.todayOnly) + Number(ui.updatedTodayOnly);
  }

  function syncMobileFilterToggle() {
    const activeCount = activeRegularFilterCount();
    elements.mobileFilterCount.textContent = String(activeCount);
    elements.mobileFilterCount.classList.toggle("is-empty", activeCount === 0);
    elements.mobileFilterToggle.classList.toggle("has-active-filters", activeCount > 0);
    elements.mobileFilterToggle.setAttribute(
      "aria-label",
      activeCount ? `Filters, ${pluralize(activeCount, "active filter")}` : "Filters",
    );
  }

  function toggleMobileFilters() {
    const willExpand = elements.regularFilterControls.classList.contains("is-mobile-collapsed");
    elements.regularFilterControls.classList.toggle("is-mobile-collapsed", !willExpand);
    elements.mobileFilterToggle.setAttribute("aria-expanded", String(willExpand));
  }

  function persistSort() {
    try {
      if (ui.sort === "created-desc") {
        window.localStorage.removeItem(SORT_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(SORT_STORAGE_KEY, ui.sort);
    } catch {
      // Sorting still works for this session when browser privacy settings block localStorage.
    }
  }

  function persistFilters() {
    try {
      if (
        ui.typeId === "all" &&
        ui.tagIds.size === 0 &&
        !ui.todayOnly &&
        !ui.updatedTodayOnly &&
        !ui.trashOnly
      ) {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          typeId: ui.typeId,
          tagIds: [...ui.tagIds],
          todayOnly: ui.todayOnly,
          updatedTodayOnly: ui.updatedTodayOnly,
          trashOnly: ui.trashOnly,
        }),
      );
    } catch {
      // Filtering still works when browser privacy settings block localStorage.
    }
  }

  function syncViewModeUI() {
    const viewButtons = [
      ["focus", elements.focusView],
      ["comfortable", elements.comfortableView],
      ["compact", elements.compactView],
    ];
    elements.notesList.classList.remove("notes-list--focus", "notes-list--comfortable", "notes-list--compact");
    elements.notesList.classList.add(`notes-list--${ui.viewMode}`);
    viewButtons.forEach(([mode, button]) => {
      const isActive = mode === ui.viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setViewMode(mode) {
    if (!["focus", "comfortable", "compact"].includes(mode)) return;
    if (mode === ui.viewMode) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewModeListAnimation?.cancel();
    viewModeListAnimation = null;

    ui.viewMode = mode;
    syncViewModeUI();

    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // The layout still works when browser privacy settings block localStorage.
    }

    if (reduceMotion) return;

    // Large column-count changes make card-level FLIP motion overlap and scale
    // text. Let the grid reflow once, then settle the final layout as one layer.
    const animation = elements.notesList.animate(
      [
        { translate: "0 4px", opacity: 0.68 },
        { translate: "none", opacity: 1 },
      ],
      {
        duration: VIEW_MODE_ANIMATION_DURATION,
        easing: VIEW_MODE_ANIMATION_EASING,
      },
    );
    viewModeListAnimation = animation;

    const clearAnimation = () => {
      if (viewModeListAnimation === animation) viewModeListAnimation = null;
    };
    animation.addEventListener("finish", clearAnimation, { once: true });
    animation.addEventListener("cancel", clearAnimation, { once: true });
  }

  Object.assign(api, {
    getNextTheme,
    prefersReducedMotion,
    runUiViewTransition,
    syncThemeUI,
    clearAutoThemeTimer,
    refreshAutoTheme,
    setTheme,
    syncSidebarUI,
    toggleSidebar,
    measureTopbarActionsPinBounds,
    finishTopbarActionsUnpin,
    setToolbarPinned,
    setTopbarActionsPinned,
    syncPinnedTopbarControlMetrics,
    updateTopbarActionsPinning,
    scheduleTopbarActionsPinning,
    activeRegularFilterCount,
    syncMobileFilterToggle,
    toggleMobileFilters,
    persistSort,
    persistFilters,
    syncViewModeUI,
    setViewMode,
  });
});
