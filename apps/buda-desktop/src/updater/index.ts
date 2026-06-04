/**
 * Auto-updater module for Buda Desktop.
 *
 * Checks https://github.com/buda-ai/buda/releases for the latest `latest.json`
 * and prompts the user to upgrade when a newer version is available.
 *
 * Trigger timing mirrors the notification system:
 * - On app launch (after a short delay to avoid blocking startup)
 * - Periodically while the app is running (default: every 30 minutes)
 */

import { check, Update } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

/** How long to wait after app launch before the first update check (ms). */
const INITIAL_DELAY_MS = 5_000;

/** Interval between periodic update checks (ms). */
const CHECK_INTERVAL_MS = 30 * 60 * 1_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Perform a single update check. If an update is available, prompt the user
 * and, upon confirmation, download + install + relaunch the app.
 *
 * @returns `true` if an update was found (regardless of whether user accepted).
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
    return false;
  }

  console.info(
    `[updater] Update available: ${update.version} (current: ${update.currentVersion})`,
  );

  const shouldUpdate = await ask(
    `发现新版本 ${update.version}，是否立即升级？\n\n${update.body ?? ""}`,
    {
      title: "Buda Desktop 升级",
      kind: "info",
      okLabel: "立即升级",
      cancelLabel: "稍后再说",
    },
  );

  if (!shouldUpdate) {
    console.info("[updater] User declined update.");
    return true;
  }

  try {
    await update.downloadAndInstall();
  } catch (err) {
    console.error("[updater] Failed to download/install update:", err);
    await ask("升级失败，请稍后重试或手动下载最新版本。", {
      title: "升级失败",
      kind: "error",
      okLabel: "确定",
    });
    return true;
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

/**
 * Start the auto-update lifecycle.
 * Should be called once during app initialization (similar to notification init).
 *
 * 1. Schedules the first check after {@link INITIAL_DELAY_MS}.
 * 2. Sets up a periodic check every {@link CHECK_INTERVAL_MS}.
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
