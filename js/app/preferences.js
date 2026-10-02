globalThis[Symbol.for("nook.app.modules")].register("preferences", (app) => {
  "use strict";

  // UI preferences, responsive control state, and their local persistence.
  const { api, elements, ui, constants } = app;
  const {
    FILTER_STORAGE_KEY,
    MOTION,
    NOTE_PREVIEW_LINES_DEFAULT,
    NOTE_PREVIEW_LINES_STORAGE_KEY,
    NOTE_DETAIL_FONT_SIZE_DEFAULT,
    NOTE_DETAIL_FONT_SIZE_MAX,
    NOTE_DETAIL_FONT_SIZE_MIN,
    NOTE_DETAIL_FONT_SIZE_STORAGE_KEY,
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
  let sidebarCollapseFinishTimer = 0;
  let sidebarExpandStartTimer = 0;
  let sidebarExpandRevealTimer = 0;
  let sidebarExpandFinishTimer = 0;
  let themePickerCloseTimer = 0;
  const THEME_LABELS = Object.fromEntries(THEMES.map(mode => [mode, app.theme.describe(mode).label]));
  const THEME_STYLESHEET_FILES = Object.fromEntries(THEMES.map(mode => [mode, app.theme.describe(mode).file]));

  // These core utilities are resolved only when an interaction occurs, after
  // every installer has completed.
  const pluralize = (...args) => api.pluralize(...args);
  const usesMacKeyboardShortcuts = (...args) => api.usesMacKeyboardShortcuts(...args);
  const scheduleTagFilterLayout = (...args) => api.scheduleTagFilterLayout?.(...args);
  const syncResponsivePagination = (...args) => api.syncResponsivePagination(...args);

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

  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function resolveAutoTheme() {
    return app.theme.resolve("auto");
  }

  function clearAutoThemeTimer() {
    // No-op for backward compatibility with events.js
  }

  function scheduleAutoTheme() {
    // No-op for backward compatibility with events.js
  }

  function refreshAutoTheme() {
    if (ui.theme === "auto" && document.documentElement.dataset.theme !== resolveAutoTheme()) {
      syncThemeUI();
    }
  }

  // Automatically refresh when the system theme changes
  systemThemeQuery.addEventListener("change", refreshAutoTheme);

  function syncThemePickerUI(mode, resolvedTheme) {
    elements.themeSelect.value = mode;
    elements.themePickerCurrentPreview.dataset.themePreview = mode === "auto" ? "auto" : resolvedTheme;
    elements.themePickerCurrentLabel.textContent = THEME_LABELS[mode] || THEME_LABELS.light;
    elements.themePickerCurrentMeta.hidden = mode !== "auto";
    elements.themePickerCurrentMeta.textContent = mode === "auto"
      ? `Follows system · ${THEME_LABELS[resolvedTheme]}`
      : "";
    const currentLabel = mode === "auto"
      ? `Auto (${THEME_LABELS[resolvedTheme]})`
      : THEME_LABELS[mode] || THEME_LABELS.light;
    elements.themePickerTrigger.setAttribute("aria-label", `Theme: ${currentLabel}. Choose a theme.`);
    elements.themePickerOptions.forEach((option) => {
      const optionTheme = option.dataset.themeOption;
      const selected = optionTheme === mode;
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  }

  function enhanceThemePicker() {
    if (elements.themePicker.classList.contains("is-enhanced")) return;
    elements.themePicker.classList.add("is-enhanced");
    elements.themeSelect.hidden = true;
    elements.themeSelect.tabIndex = -1;
    elements.themeSelect.setAttribute("aria-hidden", "true");
    elements.themePickerTrigger.hidden = false;
  }

  function clearThemePickerClosingState() {
    if (themePickerCloseTimer) {
      window.clearTimeout(themePickerCloseTimer);
      themePickerCloseTimer = 0;
    }
    elements.themePickerMenu.classList.remove("is-closing");
  }

  function releaseThemePickerGeometry() {
    clearThemePickerClosingState();
    elements.organizeDialog.style.removeProperty("--theme-picker-dialog-height");
    elements.organizeDialog.style.removeProperty("--theme-picker-panel-gutter");
  }

  function openThemePicker() {
    const isClosing = elements.themePickerMenu.classList.contains("is-closing");
    if ((!elements.themePickerMenu.hidden && !isClosing) || elements.themePickerTrigger.disabled) return;
    clearThemePickerClosingState();
    const panelBounds = elements.displayPanel.getBoundingClientRect();
    const panelIntroBounds = elements.displayPanel
      .querySelector(".organize-panel__intro")
      ?.getBoundingClientRect();
    const panelStyle = window.getComputedStyle(elements.displayPanel);
    const panelScrollbarGutter = panelIntroBounds
      ? Math.max(0, panelBounds.right - panelIntroBounds.right - parseFloat(panelStyle.paddingRight))
      : 0;
    elements.organizeDialog.style.setProperty(
      "--theme-picker-dialog-height",
      `${elements.organizeDialog.getBoundingClientRect().height}px`,
    );
    elements.organizeDialog.style.setProperty(
      "--theme-picker-panel-gutter",
      `${panelScrollbarGutter}px`,
    );
    elements.themePickerMenu.hidden = false;
    elements.themePicker.classList.add("is-open");
    elements.themePickerTrigger.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => {
      const selected = elements.themePickerOptions.find(
        (option) => option.getAttribute("aria-selected") === "true",
      );
      (selected || elements.themePickerOptions[0])?.focus({ preventScroll: true });
    });
  }

  function closeThemePicker({ focusTrigger = false } = {}) {
    if (elements.themePickerMenu.hidden) {
      releaseThemePickerGeometry();
      return;
    }
    if (elements.themePickerMenu.classList.contains("is-closing")) {
      if (focusTrigger) elements.themePickerTrigger.focus({ preventScroll: true });
      return;
    }
    elements.themePickerMenu.classList.add("is-closing");
    elements.themePicker.classList.remove("is-open");
    elements.themePickerTrigger.setAttribute("aria-expanded", "false");
    const finishClosing = () => {
      elements.themePickerMenu.hidden = true;
      releaseThemePickerGeometry();
    };
    if (prefersReducedMotion()) finishClosing();
    else {
      themePickerCloseTimer = window.setTimeout(
        finishClosing,
        MOTION.short,
      );
    }
    if (focusTrigger) elements.themePickerTrigger.focus({ preventScroll: true });
  }

  function toggleThemePicker() {
    if (elements.themePickerMenu.hidden || elements.themePickerMenu.classList.contains("is-closing")) {
      openThemePicker();
    }
    else closeThemePicker({ focusTrigger: true });
  }

  function setThemePickerValue(theme) {
    if (!THEMES.includes(theme)) return;
    closeThemePicker({ focusTrigger: true });
    window.requestAnimationFrame(() => setTheme(theme));
  }

  function handleThemePickerTriggerKeydown(event) {
    if (event.key === "Escape" && !elements.themePickerMenu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeThemePicker({ focusTrigger: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", " ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    openThemePicker();
  }

  function handleThemePickerMenuClick(event) {
    const option = event.target.closest("[data-theme-option]");
    if (option && elements.themePickerMenu.contains(option)) {
      setThemePickerValue(option.dataset.themeOption);
    }
  }

  function handleThemePickerMenuKeydown(event) {
    const options = elements.themePickerOptions;
    const selectedIndex = options.findIndex(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    const activeIndex = options.indexOf(document.activeElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(selectedIndex, 0);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeThemePicker({ focusTrigger: true });
      return;
    }
    if (event.key === "Tab") {
      closeThemePicker();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.activeElement?.click();
      return;
    }
    let nextIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else return;
    event.preventDefault();
    options[nextIndex].focus({ preventScroll: true });
  }

  function handleThemePickerDocumentPointerdown(event) {
    if (!elements.themePicker.contains(event.target)) closeThemePicker();
  }

  function syncThemeUI() {
    const mode = ui.theme;
    const theme = mode === "auto" ? resolveAutoTheme() : mode;
    const themeFile = THEME_STYLESHEET_FILES[theme] || THEME_STYLESHEET_FILES.light;
    const themeHref = `css/themes/${themeFile}.css`;
    if (elements.themeStylesheet?.getAttribute("href") !== themeHref) {
      elements.themeStylesheet?.setAttribute("href", themeHref);
    }
    if (elements.themeStylesheet) elements.themeStylesheet.dataset.themeStylesheet = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;
    syncThemePickerUI(mode, theme);

    const label = THEME_LABELS[mode] || THEME_LABELS.light;
    const nextLabel = THEME_LABELS[getNextTheme(mode)];
    const currentLabel = mode === "auto" ? `Auto (${THEME_LABELS[theme]})` : label;
    elements.themeToggle.setAttribute(
      "aria-label",
      `Current theme: ${currentLabel}. Switch to ${nextLabel}`,
    );
    elements.themeToggle.removeAttribute("title");
    if (elements.mobileTheme) {
      const description = elements.themeToggle.getAttribute("aria-label");
      elements.mobileTheme.setAttribute("aria-label", description);
      elements.mobileTheme.title = description;
    }
    elements.themeToggleLabel.textContent = label;
    if (elements.themeToggleTooltipText) {
      elements.themeToggleTooltipText.textContent = mode === "auto"
        ? `Auto · Follows system theme (switch to ${nextLabel})`
        : `Theme: ${label} (switch to ${nextLabel})`;
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.content = app.theme.describe(theme).color;
    }
    scheduleTagFilterLayout();
  }

  function setTheme(theme, { animate = true, persist = true } = {}) {
    if (!THEMES.includes(theme) || theme === ui.theme) return;
    ui.theme = theme;
    const applyTheme = () => {
      syncThemeUI();
      if (ui.topbarActionsPinned) syncPinnedTopbarControlMetrics();
      if (!persist) return;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, ui.theme);
      } catch {
        // The theme still works for this session when browser privacy settings block localStorage.
      }
    };
    const hasPinnedHeader = ui.topbarActionsPinned || ui.toolbarPinned;
    if (animate && !hasPinnedHeader) {
      runUiViewTransition("theme", applyTheme);
      return;
    }

    // Root view-transition snapshots duplicate fixed-position controls while
    // both pinned header rows are visible. Apply the palette directly in that
    // state so the live controls keep their measured position and dimensions.
    if (hasPinnedHeader) {
      uiViewTransition?.skipTransition?.();
      delete document.documentElement.dataset.uiTransition;
    }
    applyTheme();
  }

  // The workspace may borrow sidebar space without changing the saved preference.
  let sidebarWorkspaceCollapsed = false;
  let sidePaneExpandedByUser = false;

  function syncSidePaneSidebar() {
    if (!ui.dualPaneOpen) sidePaneExpandedByUser = false;
    const collapsed = ui.dualPaneOpen && !sidePaneExpandedByUser &&
      window.matchMedia("(min-width: 960px) and (max-width: 1200px)").matches;
    if (collapsed !== sidebarWorkspaceCollapsed) {
      clearSidebarCollapseChoreography();
      clearSidebarExpandChoreography();
      sidebarWorkspaceCollapsed = collapsed;
    }
    syncSidebarUI();
  }

  function syncSidebarUI() {
    const isCollapsed = ui.sidebarCollapsed || sidebarWorkspaceCollapsed;
    const isMobileHeader = window.matchMedia("(max-width: 820px)").matches;
    document.documentElement.dataset.sidebarCollapsed = String(isCollapsed);
    elements.appShell.classList.toggle("is-sidebar-collapsed", isCollapsed);
    if (elements.sidebarBody) {
      if (isMobileHeader) {
        elements.sidebarBody.setAttribute("aria-hidden", String(isCollapsed));
      } else {
        elements.sidebarBody.removeAttribute("aria-hidden");
      }
    }
    if (elements.sidebarToggle) {
      const shortcutModifier = usesMacKeyboardShortcuts() ? "⌘\\" : "Ctrl+\\";
      const actionLabel = `${isCollapsed ? "Expand" : "Collapse"} ${isMobileHeader ? "app header" : "sidebar"}`;
      elements.sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
      elements.sidebarToggle.setAttribute("aria-label", actionLabel);
      elements.sidebarToggleTooltipText.textContent = actionLabel;
      elements.sidebarToggleShortcut.textContent = shortcutModifier;
    }
    if (isCollapsed) window.requestAnimationFrame(positionSidebarToggleTooltip);
    scheduleTagFilterLayout();
  }

  function positionSidebarToggleTooltip() {
    if (!(ui.sidebarCollapsed || sidebarWorkspaceCollapsed) || !elements.sidebarToggle || !elements.sidebarToggleTooltip) return;
    const toggleBounds = elements.sidebarToggle.getBoundingClientRect();
    elements.sidebarToggleTooltip.style.setProperty(
      "--sidebar-toggle-tooltip-left",
      `${Math.round(toggleBounds.right + 8)}px`,
    );
    elements.sidebarToggleTooltip.style.setProperty(
      "--sidebar-toggle-tooltip-top",
      `${Math.round(toggleBounds.top + toggleBounds.height / 2)}px`,
    );
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
    if (sidebarCollapseFinishTimer) {
      window.clearTimeout(sidebarCollapseFinishTimer);
      sidebarCollapseFinishTimer = 0;
    }
    elements.appShell.classList.remove("is-sidebar-collapsing");
    elements.appShell.classList.remove("is-sidebar-resizing");
  }

  function canStageSidebarTransition() {
    return !prefersReducedMotion() && window.matchMedia("(min-width: 821px)").matches;
  }

  function clearSidebarExpandChoreography() {
    if (sidebarExpandStartTimer) {
      window.clearTimeout(sidebarExpandStartTimer);
      sidebarExpandStartTimer = 0;
    }
    if (sidebarExpandRevealTimer) {
      window.clearTimeout(sidebarExpandRevealTimer);
      sidebarExpandRevealTimer = 0;
    }
    if (sidebarExpandFinishTimer) {
      window.clearTimeout(sidebarExpandFinishTimer);
      sidebarExpandFinishTimer = 0;
    }
    elements.appShell.classList.remove("is-sidebar-expanding");
    elements.appShell.classList.remove("is-sidebar-resizing");
  }

  function toggleSidebar(collapsed = !(ui.sidebarCollapsed || sidebarWorkspaceCollapsed)) {
    if (ui.dualPaneOpen) sidePaneExpandedByUser = !collapsed;
    sidebarWorkspaceCollapsed = false;
    // Persist explicit user intent even if workspace resizing interrupts animation.
    persistSidebarCollapsedState(collapsed);
    const isCollapseInFlight = Boolean(
      sidebarCollapseStartTimer || sidebarCollapseRevealTimer || sidebarCollapseFinishTimer
    );
    const isExpandInFlight = Boolean(
      sidebarExpandStartTimer || sidebarExpandRevealTimer || sidebarExpandFinishTimer
    );
    const isTransitionInFlight = isCollapseInFlight || isExpandInFlight;
    if (ui.sidebarCollapsed === collapsed && !isTransitionInFlight) { syncSidebarUI(); return; }

    const isDomCollapsed = elements.appShell.classList.contains("is-sidebar-collapsed");
    uiViewTransition?.skipTransition?.();
    delete document.documentElement.dataset.uiTransition;

    if (collapsed) {
      ui.sidebarCollapsed = true;
      clearSidebarExpandChoreography();

      if (!canStageSidebarTransition() || isDomCollapsed) {
        clearSidebarCollapseChoreography();
        syncSidebarUI();
        persistSidebarCollapsedState(true);
        return;
      }

      clearSidebarCollapseChoreography();
      elements.appShell.classList.add("is-sidebar-collapsing", "is-sidebar-resizing");
      sidebarCollapseStartTimer = window.setTimeout(() => {
        sidebarCollapseStartTimer = 0;
        syncSidebarUI();
        persistSidebarCollapsedState(true);
        sidebarCollapseRevealTimer = window.setTimeout(() => {
          sidebarCollapseRevealTimer = 0;
          elements.appShell.classList.remove("is-sidebar-collapsing");
        }, MOTION.short);
        sidebarCollapseFinishTimer = window.setTimeout(() => {
          sidebarCollapseFinishTimer = 0;
          elements.appShell.classList.remove("is-sidebar-resizing");
          positionSidebarToggleTooltip();
        }, MOTION.medium);
      }, MOTION.micro);
      return;
    }

    clearSidebarCollapseChoreography();
    ui.sidebarCollapsed = false;
    if (!canStageSidebarTransition() || !isDomCollapsed) {
      clearSidebarExpandChoreography();
      syncSidebarUI();
      persistSidebarCollapsedState(false);
      return;
    }

    // Mirror collapse: fade the current rail, expand it, then reveal full content.
    clearSidebarExpandChoreography();
    elements.appShell.classList.add("is-sidebar-expanding", "is-sidebar-resizing");
    sidebarExpandStartTimer = window.setTimeout(() => {
      sidebarExpandStartTimer = 0;
      syncSidebarUI();
      persistSidebarCollapsedState(false);
      sidebarExpandRevealTimer = window.setTimeout(() => {
        sidebarExpandRevealTimer = 0;
        elements.appShell.classList.remove("is-sidebar-expanding");
      }, MOTION.short);
      sidebarExpandFinishTimer = window.setTimeout(() => {
        sidebarExpandFinishTimer = 0;
        elements.appShell.classList.remove("is-sidebar-resizing");
      }, MOTION.medium);
    }, MOTION.micro);
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
    elements.toolbar.classList.remove("is-unpinning");
    elements.appShell.style.removeProperty("--pinned-actions-height");
    elements.appShell.style.removeProperty("--pinned-actions-width");
    elements.appShell.style.removeProperty("--pinned-toolbar-left");
    elements.appShell.style.removeProperty("--pinned-controls-right");
  }

  function setToolbarPinned(pinned) {
    if (pinned === ui.toolbarPinned) return;

    if (pinned) {
      const toolbarSlotBounds = elements.toolbarSlot.getBoundingClientRect();
      elements.toolbarSlot.style.height = `${toolbarSlotBounds.height}px`;
    }

    ui.toolbarPinned = pinned;
    elements.toolbar.classList.toggle("is-pinned", pinned);
    elements.toolbar.classList.remove("is-unpinning");

    if (pinned) {
      syncPinnedTopbarControlMetrics();
      return;
    }

    elements.toolbarSlot.style.removeProperty("height");
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
    if (window.matchMedia("(max-width: 820px)").matches) {
      window.clearTimeout(ui.topbarActionsUnpinTimer);
      finishTopbarActionsUnpin();
      setToolbarPinned(false);
      return;
    }
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
    scheduleTagFilterLayout();
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
      ["compact", elements.compactView || elements.focusView],
      ["comfortable", elements.comfortableView],
      ["grid", elements.gridView],
    ];
    elements.notesList.classList.remove("notes-list--focus", "notes-list--comfortable", "notes-list--compact", "notes-list--grid");
    elements.notesList.classList.add(`notes-list--${ui.viewMode}`);
    viewButtons.forEach(([mode, button]) => {
      const isActive = mode === ui.viewMode;
      button?.classList.toggle("is-active", isActive);
      button?.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setViewMode(mode) {
    const targetMode = mode === "focus" ? "compact" : mode;
    if (!["compact", "comfortable", "grid"].includes(targetMode)) return;
    if (targetMode === ui.viewMode) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewModeListAnimation?.cancel();
    viewModeListAnimation = null;

    ui.viewMode = targetMode;
    syncViewModeUI();

    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, targetMode);
    } catch {
      // The layout still works when browser privacy settings block localStorage.
    }

    syncResponsivePagination();

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

  function syncNotePreviewLinesUI() {
    const label = `${ui.notePreviewLines} lines`;
    document.documentElement.style.setProperty("--note-card-preview-lines", String(ui.notePreviewLines));
    elements.notePreviewLines.value = String(ui.notePreviewLines);
    elements.notePreviewLines.setAttribute("aria-valuetext", label);
    elements.notePreviewLinesValue.value = label;
    elements.notePreviewLinesValue.textContent = label;
  }

  function setNotePreviewLines(value, { persist = true } = {}) {
    const nextValue = api.normalizeNotePreviewLines(value);
    if (nextValue === ui.notePreviewLines) return;

    ui.notePreviewLines = nextValue;
    syncNotePreviewLinesUI();

    if (!persist) return;
    try {
      if (nextValue === NOTE_PREVIEW_LINES_DEFAULT) {
        window.localStorage.removeItem(NOTE_PREVIEW_LINES_STORAGE_KEY);
      } else {
        window.localStorage.setItem(NOTE_PREVIEW_LINES_STORAGE_KEY, String(nextValue));
      }
    } catch {
      // The preview length still works for this session when localStorage is unavailable.
    }
  }

  function syncNoteDetailFontSizeUI() {
    document.documentElement.style.setProperty("--note-detail-font-size", `${ui.noteDetailFontSize / 16}rem`);
    elements.noteFontSizeTrigger.title = `Note text size: ${ui.noteDetailFontSize} px. Applies to all open notes.`;
    elements.noteFontSizeControls.forEach((control) => {
      const decrease = control.querySelector('[data-note-font-size-action="decrease"]');
      const increase = control.querySelector('[data-note-font-size-action="increase"]');
      const value = control.querySelector("[data-note-font-size-value]");
      const reset = control.querySelector('[data-note-font-size-action="reset"]');
      const atMinimum = ui.noteDetailFontSize === NOTE_DETAIL_FONT_SIZE_MIN;
      const atMaximum = ui.noteDetailFontSize === NOTE_DETAIL_FONT_SIZE_MAX;
      // Keep a button reachable when a click takes it to a limit. The handler
      // guards aria-disabled actions while keyboard focus stays in place.
      decrease.setAttribute("aria-disabled", String(atMinimum));
      increase.setAttribute("aria-disabled", String(atMaximum));
      decrease.title = atMinimum ? "Minimum note text size: 14 px" : "Decrease note text size";
      increase.title = atMaximum ? "Maximum note text size: 18 px" : "Increase note text size";
      value.textContent = `${ui.noteDetailFontSize} px`;
      if (value === reset) {
        value.title = "Reset note text size to 16 px";
        value.setAttribute("aria-label", `Note text size: ${ui.noteDetailFontSize} pixels. Reset to 16 pixels.`);
      } else {
        reset.setAttribute("aria-disabled", String(ui.noteDetailFontSize === NOTE_DETAIL_FONT_SIZE_DEFAULT));
      }
    });
  }

  function positionNoteFontSizePopover(event) {
    const panel = elements.noteFontSizePopover;
    const opening = event?.type === "beforetoggle" && event.newState === "open";
    // Measure its real height after opening, then reveal it above the footer.
    // This avoids a frame at the wrong edge before native popover layout runs.
    if (opening) {
      panel.classList.add("is-positioning");
      return;
    }
    if (!panel.matches(":popover-open")) {
      panel.classList.remove("is-positioning");
      return;
    }
    const trigger = elements.noteFontSizeTrigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(gap, Math.min(trigger.left, window.innerWidth - bounds.width - gap));
    const above = trigger.top - bounds.height - gap;
    const below = trigger.bottom + gap;
    const top = above >= gap ? above
      : below + bounds.height <= window.innerHeight - gap ? below
      : Math.max(gap, Math.min(above, window.innerHeight - bounds.height - gap));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.classList.remove("is-positioning");
  }

  function closeNoteFontSizePopover() {
    if (elements.noteFontSizePopover.matches(":popover-open")) elements.noteFontSizePopover.hidePopover();
    elements.noteFontSizePopover.classList.remove("is-positioning");
  }

  function setNoteDetailFontSize(value, { persist = true } = {}) {
    const nextValue = api.normalizeNoteDetailFontSize(value);
    if (nextValue === ui.noteDetailFontSize) return;
    ui.noteDetailFontSize = nextValue;
    syncNoteDetailFontSizeUI();
    api.scheduleNoteEditorScrollMap(elements.noteContent);
    api.scheduleNoteEditorScrollMap(elements.secondaryNoteContentEditor);
    api.refreshSplitSelection();
    if (!persist) return;
    try {
      if (nextValue === NOTE_DETAIL_FONT_SIZE_DEFAULT) {
        window.localStorage.removeItem(NOTE_DETAIL_FONT_SIZE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(NOTE_DETAIL_FONT_SIZE_STORAGE_KEY, String(nextValue));
      }
    } catch {
      // The selected size still applies for this session if storage is blocked.
    }
  }

  function handleNoteFontSizeClick(event) {
    const button = event.target.closest("[data-note-font-size-action]");
    if (!button || button.getAttribute("aria-disabled") === "true") return;
    const action = button.dataset.noteFontSizeAction;
    const nextValue = action === "reset"
      ? NOTE_DETAIL_FONT_SIZE_DEFAULT
      : ui.noteDetailFontSize + (action === "increase" ? 1 : -1);
    if (nextValue === ui.noteDetailFontSize) return;
    setNoteDetailFontSize(nextValue);
    const limit = ui.noteDetailFontSize === NOTE_DETAIL_FONT_SIZE_MIN ? " Minimum size."
      : ui.noteDetailFontSize === NOTE_DETAIL_FONT_SIZE_MAX ? " Maximum size." : "";
    button.closest("[data-note-font-size-control]").querySelector("[data-note-font-size-status]")
      .textContent = `Note text size: ${ui.noteDetailFontSize} pixels.${limit}`;
  }

  Object.assign(api, {
    getNextTheme,
    prefersReducedMotion,
    runUiViewTransition,
    enhanceThemePicker,
    openThemePicker,
    closeThemePicker,
    toggleThemePicker,
    setThemePickerValue,
    handleThemePickerTriggerKeydown,
    handleThemePickerMenuClick,
    handleThemePickerMenuKeydown,
    handleThemePickerDocumentPointerdown,
    syncThemeUI,
    clearAutoThemeTimer,
    refreshAutoTheme,
    setTheme,
    syncSidebarUI,
    syncSidePaneSidebar,
    positionSidebarToggleTooltip,
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
    syncNotePreviewLinesUI,
    setNotePreviewLines,
    syncNoteDetailFontSizeUI,
    setNoteDetailFontSize,
    handleNoteFontSizeClick,
    positionNoteFontSizePopover,
    closeNoteFontSizePopover,
  });
});
