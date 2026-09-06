import { emptyProgress, phrases, review, validateProgress, type Progress, type Rating } from '@tausend/engine';
import * as idb from './idb.ts';
import { course } from './course.ts';

const wordIds = new Set([...course.words.map((word) => word.id), ...phrases.map(p => p.id)]);

const KEY = 'progress:de';

/**
 * The learner's state.
 *
 * Everything lives on the device. There is no account and no sync in the MVP —
 * a language trainer that cannot work on a plane has failed at its one job,
 * and adding a backend later is easier than removing one.
 */
export class ProgressStore {
  current = $state<Progress>(emptyProgress());
  ready = $state(false);

  storageError = $state('');
  busy = $state(false);
  private loadPromise: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private loadFailed = false;

  load(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return this.loadPromise ??= this.read();
  }

  private async read() {
    try {
      const stored = await idb.get<unknown>(KEY);
      if (stored !== undefined) this.current = validateProgress(stored, wordIds);
    } catch {
      this.loadFailed = true;
      this.storageError = 'Your saved progress could not be loaded. Practice will not be saved. Export any new progress before leaving.';
    }
    this.ready = true;
  }

  private enqueue(operation: () => Promise<unknown>): Promise<void> {
    const pending = this.writes.then(async () => {
      try {
        await operation();
        this.storageError = '';
      } catch (error) {
        this.storageError = 'Your progress could not be saved. Export a backup before leaving or reloading.';
        throw error;
      }
    });
    this.writes = pending.catch(() => {});
    return pending;
  }

  record(key: string, rating: Rating, now = new Date()) {
    if (!this.ready || this.busy) return;
    this.current = review(this.current, key, rating, now);
    // Never overwrite unread progress with a fresh session after a failed load.
    if (this.loadFailed) return;
    const snapshot = $state.snapshot(this.current);
    void this.enqueue(() => idb.set(KEY, snapshot)).catch(() => {});
  }

  async restore(value: Progress) {
    if (!this.ready || this.busy) throw new Error('Please wait for progress to finish loading.');
    const snapshot = validateProgress(value, wordIds);
    this.busy = true;
    try {
      await this.enqueue(() => idb.set(KEY, snapshot));
      this.current = snapshot;
      this.loadFailed = false;
    } finally {
      this.busy = false;
    }
  }

  async reset() {
    if (!this.ready || this.busy) throw new Error('Please wait for progress to finish loading.');
    this.busy = true;
    try {
      await this.enqueue(() => idb.del(KEY));
      this.current = emptyProgress();
      this.loadFailed = false;
    } finally {
      this.busy = false;
    }
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
