import { registerSW } from 'virtual:pwa-register';

/**
 * How often an open tab asks whether a newer build has been deployed.
 *
 * Every navigation is answered from the precache, so the service worker is the
 * only route a new build can take into a tab that is already open. Browsers
 * re-check `sw.js` on a schedule of their own, which for an installed app that
 * is never fully closed can mean days on a stale build.
 */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Flicking between apps should not turn into a burst of update requests. */
const MIN_GAP_MS = 60 * 1000;

export type UpdateWatcher = {
  /**
   * Reloads if a new build is waiting and the moment allows it. Call this after
   * anything that changes whether a reload would interrupt the learner.
   */
  applyIfReady: () => void;
  stop: () => void;
};

/**
 * Keeps an open tab on the newest deployed build: polls for a new service
 * worker and reloads once it has taken over.
 *
 * @param canReload whether reloading right now is acceptable. A waiting update
 *   is held back until it is, so a round in progress is never cut short.
 */
export function watchForUpdates(canReload: () => boolean): UpdateWatcher {
  let waiting = false;
  let lastCheck = Date.now();
  let requestUpdate: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const applyIfReady = () => {
    if (!waiting || !canReload()) return;
    waiting = false;
    location.reload();
  };

  const check = () => {
    if (!requestUpdate || Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();
    requestUpdate();
  };

  const onVisibility = () => {
    if (document.hidden) return;
    check();
    applyIfReady();
  };

  registerSW({
    immediate: true,
    // Left alone, `autoUpdate` reloads the moment the new worker activates.
    // Taking the reload over is what lets it wait for a safe moment.
    onNeedReload: () => {
      waiting = true;
      applyIfReady();
    },
    onRegisteredSW: (_scriptUrl, registration) => {
      if (!registration) return;
      requestUpdate = () => void registration.update().catch(() => {});
      timer = setInterval(check, CHECK_EVERY_MS);
    }
  });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', check);

  return {
    applyIfReady,
    stop() {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', check);
    }
  };
}
