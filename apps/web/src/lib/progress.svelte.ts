import { emptyProgress, review, type Progress, type Rating } from '@tausend/engine';
import * as idb from './idb.ts';

const KEY = 'progress:de';

/**
 * The learner's state.
 *
 * Everything lives on the device. There is no account and no sync in the MVP —
 * a language trainer that cannot work on a plane has failed at its one job,
 * and adding a backend later is easier than removing one.
 */
class ProgressStore {
  current = $state<Progress>(emptyProgress());
  ready = $state(false);

  async load() {
    if (this.ready) return;
    try {
      const stored = await idb.get<Progress>(KEY);
      if (stored) this.current = stored;
    } catch {
      // A blocked or unavailable IndexedDB (private mode, old browser) must not
      // stop the session — it just means progress will not survive a reload.
    }
    this.ready = true;
  }

  private persist() {
    idb.set(KEY, $state.snapshot(this.current)).catch(() => {});
  }

  record(key: string, rating: Rating, now = new Date()) {
    this.current = review(this.current, key, rating, now);
    this.persist();
  }

  async reset() {
    this.current = emptyProgress();
    await idb.del(KEY).catch(() => {});
  }

  /** Sessions completed this week, Monday-based. The commitment, not a streak. */
  get weekDays(): number {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return this.current.activeDays.filter((d) => new Date(d + 'T00:00:00') >= monday).length;
  }

  get answeredToday(): number {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.current.answers.filter((a) => a.at >= start.getTime()).length;
  }

  get accuracy(): number {
    const recent = this.current.answers.slice(-60);
    if (!recent.length) return 0;
    return recent.filter((a) => a.correct).length / recent.length;
  }
}

export const progress = new ProgressStore();
