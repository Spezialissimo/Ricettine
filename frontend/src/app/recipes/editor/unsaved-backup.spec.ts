import { TestBed } from '@angular/core/testing';
import { emptyInput } from './editor-store.testing';
import { BACKUP_TTL_MS, UnsavedBackup, backupKey } from './unsaved-backup';

describe('UnsavedBackup', () => {
  let backup: UnsavedBackup;
  const raw = () => JSON.parse(localStorage.getItem('ricettine.unsaved.r1') ?? 'null');
  beforeEach(() => {
    localStorage.clear();
    backup = TestBed.inject(UnsavedBackup);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stores one entry per writer (tab) under ricettine.unsaved.{recipeId}', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    backup.write('r1', 'tabA', 'u1', emptyInput({ title: 'Pie', version: 4 }), { '0.0': 'abc' });
    expect(backupKey('r1')).toBe('ricettine.unsaved.r1');
    expect(raw()).toEqual({
      tabA: { input: emptyInput({ title: 'Pie', version: 4 }), baseVersion: 4, savedAt: 1234, userId: 'u1', amountTexts: { '0.0': 'abc' } },
    });
    expect(backup.read('r1', 'u1')).toEqual({ writerId: 'tabA', ...raw().tabA });
  });

  it('two tabs keep separate entries: write and clear touch only their own; read gives the newest', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);
    backup.write('r1', 'tabB', 'u1', emptyInput({ title: 'B' }));
    now.mockReturnValue(200);
    backup.write('r1', 'tabA', 'u1', emptyInput({ title: 'A' }));
    expect(backup.read('r1', 'u1')?.input.title).toBe('A');
    backup.clear('r1', 'tabA');
    expect(backup.read('r1', 'u1')).toMatchObject({ writerId: 'tabB', input: { title: 'B' } });
    backup.clear('r1', 'tabB');
    expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
  });

  it('never hands one user the backup of another', () => {
    backup.write('r1', 'tab1', 'u1', emptyInput({ title: 'Mine' }));
    expect(backup.read('r1', 'u2')).toBeNull();
    expect(backup.read('r1', 'u1')?.input.title).toBe('Mine');
  });

  it('ignores unreadable or malformed entries', () => {
    localStorage.setItem('ricettine.unsaved.r1', '{not json');
    expect(backup.read('r1', 'u1')).toBeNull();
    localStorage.setItem('ricettine.unsaved.r1', JSON.stringify({ t: { userId: 'u1', baseVersion: 'x' } }));
    expect(backup.read('r1', 'u1')).toBeNull();
  });

  it('an entry expires 7 days after its last write: ignored and deleted on read (per entry)', () => {
    expect(BACKUP_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now - BACKUP_TTL_MS - 1);
    backup.write('r1', 'old', 'u1', emptyInput({ title: 'Old' }));
    spy.mockReturnValue(now - BACKUP_TTL_MS + 60_000);
    backup.write('r1', 'young', 'u1', emptyInput({ title: 'Young' }));
    spy.mockReturnValue(now);
    expect(backup.read('r1', 'u1')?.input.title).toBe('Young');
    expect(Object.keys(raw())).toEqual(['young']);
    spy.mockReturnValue(now + 60_001);
    expect(backup.read('r1', 'u1')).toBeNull();
    expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
  });

  it("a failed write (quota) removes this tab's outdated entry instead of leaving it looking current", () => {
    backup.write('r1', 'tabA', 'u1', emptyInput({ title: 'first' }));
    backup.write('r1', 'tabB', 'u1', emptyInput({ title: 'other tab' }));
    const real = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (calls++ === 0) throw new DOMException('quota', 'QuotaExceededError'); // the big write fails, the shrink works
      real.call(this, k, v);
    });
    backup.write('r1', 'tabA', 'u1', emptyInput({ title: 'first, and a lot more' }));
    expect(Object.keys(raw())).toEqual(['tabB']);
    expect(backup.read('r1', 'u1')?.input.title).toBe('other tab');
  });

  it('does nothing (and never throws) when storage is unavailable', () => {
    for (const m of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    }
    expect(() => backup.write('r1', 't', 'u1', emptyInput())).not.toThrow();
    expect(backup.read('r1', 'u1')).toBeNull();
    expect(() => backup.clear('r1', 't')).not.toThrow();
  });
});
