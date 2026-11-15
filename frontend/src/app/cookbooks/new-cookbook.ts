import { Dialog } from '@angular/cdk/dialog';
import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { openSheet } from '../shared/sheet';
import { CookbookApi } from './cookbook.api';
import { CookbookInput } from './cookbook.model';
import { CookbookFormDialog } from './cookbook-form.dialog';

/** "+ New cookbook": opens the form sheet and, once the cookbook is created, opens it. */
@Injectable({ providedIn: 'root' })
export class NewCookbookFlow {
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);

  async start(): Promise<void> {
    const created: { id: string | null } = { id: null };
    const result = await openSheet(this.dialog, this.injector, CookbookFormDialog, {
      label: this.i18n.translate('cookbooks.newTitle'),
      data: {
        submit: async (input: CookbookInput) => (created.id = (await this.api.create(input)).id),
      },
    });
    if (result === true && created.id) {
      await this.router.navigateByUrl(`/cookbooks/${created.id}`);
    }
  }
}
