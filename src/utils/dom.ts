export function waitForDomIdle(
  container: HTMLElement,
  opts: { timeoutMs: number; idleMs: number }
): Promise<void> {
  return new Promise((resolve) => {
    let idleTimer: number | null = null;
    const finish = () => {
      if (idleTimer) {
        window.clearTimeout(idleTimer);
      }
      observer.disconnect();
      resolve();
    };

    const scheduleIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => finish(), opts.idleMs);
    };

    const observer = new MutationObserver(() => scheduleIdle());
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    scheduleIdle();
    window.setTimeout(() => finish(), opts.timeoutMs);
  });
}
