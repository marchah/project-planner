import { logException, logInfo } from './common/logger';
import { settings } from './common/settings';
import { getServices } from './services';

// Advances the research queue on an interval, one tick at a time. Returns a stop function.
export function startResearchWorker(): () => void {
  const { researchService } = getServices();
  if (!researchService.isResearchEnabled()) {
    logInfo('research is off (HERMES_API_URL is not set)', { tag: 'RESEARCH' });
    return () => undefined;
  }
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    researchService
      .tickResearch(new Date())
      .catch((error: unknown) => {
        logException(error, { tag: 'RESEARCH' });
      })
      .finally(() => {
        ticking = false;
      });
  }, settings.RESEARCH_POLL_INTERVAL_MS);
  timer.unref();
  logInfo(
    `research worker started: provider ${settings.HERMES_PROVIDER ?? "Hermes' default"}, research on capture ${settings.RESEARCH_ON_CAPTURE ? 'on' : 'off'}`,
    { tag: 'RESEARCH' },
  );
  return () => clearInterval(timer);
}
