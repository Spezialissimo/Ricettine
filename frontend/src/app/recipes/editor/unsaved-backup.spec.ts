import { TestBed } from '@angular/core/testing';
import { emptyInput } from './editor-store.testing';
import { BACKUP_TTL_MS, UnsavedBackup, backupKey } from './unsaved-backup';

describe('UnsavedBackup', () => {
  let backup: UnsavedBackup;
  beforeEach(() => {
    localStorage.clear();
    backup = TestBed.inject(UnsavedBackup);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stores the working copy under ricettine.unsaved.{recipeId} with its base version and time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    backup.write('r1', 'u1', emptyInput({ title: 'Pie', version: 4 }));
    expect(backupKey('r1')).toBe('ricettine.unsaved.r1');
    const raw = JSON.parse(localStorage.getItem('ricettine.unsaved.r1')!);
    expect(raw).toEqual({ input: emptyInput({ title: 'Pie', version: 4 }), baseVersion: 4, savedAt: 1234, userId: 'u1' });
    expect(backup.read('r1', 'u1')).toEqual(raw);
  });

  it('never hands one user the backup of another', () => {
    backup.write('r1', 'u1', emptyInput({ title: 'Mine' }));
    expect(backup.read('r1', 'u2')).toBeNull();
    backup.clear('r1', 'u2'); // not theirs to delete either
    expect(backup.read('r1', 'u1')?.input.title).toBe('Mine');
    backup.clear('r1', 'u1');
    expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
  });

  it('ignores unreadable or malformed entries', () => {
    localStorage.setItem('ricettine.unsaved.r1', '{not json');
    expect(backup.read('r1', 'u1')).toBeNull();
    localStorage.setItem('ricettine.unsaved.r1', JSON.stringify({ userId: 'u1', baseVersion: 'x' }));
    expect(backup.read('r1', 'u1')).toBeNull();
  });

  it('a backup expires 7 days after its last write: ignored and deleted on read', () => {
    expect(BACKUP_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now - BACKUP_TTL_MS + 60_000);
    backup.write('r1', 'u1', emptyInput({ title: 'Fresh enough' }));
    spy.mockReturnValue(now);
    expect(backup.read('r1', 'u1')?.input.title).toBe('Fresh enough');
    spy.mockReturnValue(now + 60_001);
    expect(backup.read('r1', 'u1')).toBeNull();
    expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
  });

  it("clearAllFor removes every backup of that user and nothing else", () => {
    backup.write('r1', 'u1', emptyInput());
    backup.write('r2', 'u1', emptyInput());
    backup.write('r3', 'u2', emptyInput());
    localStorage.setItem('other.key', 'keep');
    backup.clearAllFor('u1');
    expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
    expect(localStorage.getItem('ricettine.unsaved.r2')).toBeNull();
    expect(backup.read('r3', 'u2')).not.toBeNull();
    expect(localStorage.getItem('other.key')).toBe('keep');
  });

  it('does nothing (and never throws) when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => backup.write('r1', 'u1', emptyInput())).not.toThrow();
    expect(backup.read('r1', 'u1')).toBeNull();
    expect(() => backup.clear('r1', 'u1')).not.toThrow();
    expect(() => backup.clearAllFor('u1')).not.toThrow();
  });
});
