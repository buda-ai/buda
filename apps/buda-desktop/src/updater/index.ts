/**
 * Auto-updater module for Buda Desktop.
 *
 * Checks https://github.com/buda-ai/buda/releases for the latest `latest.json`
 * and exposes reactive state so the UI can show a red-dot badge on the upgrade
 * button when a new version is available. The user decides when to upgrade —
 * no popup is shown automatically.
 *
 * Trigger timing:
 * - On app launch (after a short delay to avoid blocking startup)
 * - Periodically while the app is running (default: every 1 hour)
 */

import { check, Update } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

/** How long to wait after app launch before the first update check (ms). */
const INITIAL_DELAY_MS = 10_000;

/** Interval between periodic update checks (ms). */
const CHECK_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

let intervalId: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Reactive update state
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  /** Whether an update is available. */
  available: boolean;
  /** New version string (e.g. "0.2.0"). */
  version: string | null;
  /** Release notes / changelog body. */
  body: string | null;
}

type UpdateListener = (info: UpdateInfo) => void;

const listeners: Set<UpdateListener> = new Set();

let currentState: UpdateInfo = { available: false, version: null, body: null };
let pendingUpdate: Update | null = null;

/**
 * Get the current update state (for initial render).
 */
export function getUpdateInfo(): UpdateInfo {
  return currentState;
}

/**
 * Subscribe to update state changes. Returns an unsubscribe function.
 * The listener is called whenever the update availability changes — use
 * this to toggle the red-dot badge in the UI.
 */
export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(currentState);
    } catch (err) {
      console.error("[updater] Listener error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Check logic (silent — no popup)
// ---------------------------------------------------------------------------

/**
 * Perform a single silent update check. Updates internal state and notifies
 * listeners so the UI can show/hide the red-dot indicator.
 *
 * @returns `true` if an update is available.
 */
export async function checkForUpdate(): Promise<boolean> {
  let update: Update | null = null;
  try {
    update = await check();
  } catch (err) {
    console.warn("[updater] Failed to check for update:", err);
    return false;
  }

  if (!update?.available) {
    console.info("[updater] App is up to date.");
    if (currentState.available) {
      currentState = { available: false, version: null, body: null };
      pendingUpdate = null;
      notifyListeners();
    }
    return false;
  }

  console.info(
    `[updater] Update available: ${update.version} (current: ${update.currentVersion})`,
  );

  pendingUpdate = update;
  currentState = {
    available: true,
    version: update.version,
    body: update.body ?? null,
  };
  notifyListeners();

  return true;
}

// ---------------------------------------------------------------------------
// User-initiated upgrade
// ---------------------------------------------------------------------------

/**
 * Perform the upgrade. Call this when the user clicks the upgrade button.
 * Shows a confirmation dialog, then downloads, installs, and relaunches.
 *
 * @returns `true` if the upgrade was initiated successfully.
 */
export async function performUpdate(): Promise<boolean> {
  if (!pendingUpdate) {
    // Re-check in case state is stale
    const found = await checkForUpdate();
    if (!found || !pendingUpdate) {
      await ask("当前已是最新版本。", {
        title: "Buda Desktop",
        kind: "info",
        okLabel: "确定",
      });
      return false;
    }
  }

  const shouldUpdate = await ask(
    `发现新版本 ${pendingUpdate.version}，是否立即升级？\n\n${pendingUpdate.body ?? ""}`,
    {
      title: "Buda Desktop 升级",
      kind: "info",
      okLabel: "立即升级",
      cancelLabel: "稍后再说",
    },
  );

  if (!shouldUpdate) {
    console.info("[updater] User declined update.");
    return false;
  }

  try {
    await pendingUpdate.downloadAndInstall();
  } catch (err) {
    console.error("[updater] Failed to download/install update:", err);
    await ask("升级失败，请稍后重试或手动下载最新版本。", {
      title: "升级失败",
      kind: "error",
      okLabel: "确定",
    });
    return false;
  }

  try {
    await relaunch();
  } catch (err) {
    console.error("[updater] Failed to relaunch:", err);
    await ask("升级已完成，请手动重启应用以使用新版本。", {
      title: "需要重启",
      kind: "info",
      okLabel: "确定",
    });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the auto-update lifecycle.
 * Should be called once during app initialization.
 *
 * 1. Schedules the first check after {@link INITIAL_DELAY_MS}.
 * 2. Sets up a periodic check every {@link CHECK_INTERVAL_MS} (1 hour).
 *
 * The checks are silent — they only update internal state. The UI subscribes
 * via {@link onUpdateAvailable} to show a red-dot badge, and the user clicks
 * the upgrade button which calls {@link performUpdate}.
 */
export function startAutoUpdate(): void {
  // First check after initial delay (avoid blocking app startup)
  setTimeout(() => {
    checkForUpdate().catch((err) =>
      console.error("[updater] Unhandled error in initial check:", err),
    );
  }, INITIAL_DELAY_MS);

  // Periodic checks
  intervalId = setInterval(() => {
    checkForUpdate().catch((err) =>
      console.error("[updater] Unhandled error in periodic check:", err),
    );
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop periodic update checks. Call during app teardown if needed.
 */
export function stopAutoUpdate(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

