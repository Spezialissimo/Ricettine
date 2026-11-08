import { WritableSignal, signal } from '@angular/core';
import { errorKeyOf } from '../core/api-error';

export type Invite = { id: string; createdAt: string; expiresAt: string };
export type InviteCreated = { id: string; url: string; expiresAt: string };

/**
 * The create / list / revoke state of an invite panel (admin invites, cookbook members): the
 * pending list, the link just created, a busy flag for create and an i18n error key. Pass `error`
 * to share one error line with the host's other actions.
 */
export class InviteList {
  readonly invites = signal<Invite[]>([]);
  readonly created = signal<InviteCreated | null>(null);
  readonly busy = signal(false);

  constructor(
    private readonly ops: {
      list(): Promise<Invite[]>;
      create(): Promise<InviteCreated>;
      revoke(id: string): Promise<void>;
    },
    readonly error: WritableSignal<string | null> = signal(null),
  ) {}

  async load(): Promise<void> {
    try {
      this.invites.set(await this.ops.list());
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }

  async create(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const c = await this.ops.create();
      this.created.set(c);
      this.invites.update((l) => [
        ...l,
        { id: c.id, createdAt: new Date().toISOString(), expiresAt: c.expiresAt },
      ]);
    } catch (e) {
      this.error.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    this.error.set(null);
    try {
      await this.ops.revoke(id);
      this.invites.update((l) => l.filter((i) => i.id !== id));
      if (this.created()?.id === id) this.created.set(null);
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }
}
