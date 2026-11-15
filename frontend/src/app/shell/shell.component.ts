import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoDirective } from '@jsverse/transloco';
import { TopBarComponent } from './top-bar.component';

/**
 * The signed-in app: the shared top bar (see TopBarComponent: a ☰ menu on the phone, no bottom bar) and the
 * page. In the recipe editor (routes with `data.editor`) the bar has no new-recipe action.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TranslocoDirective, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.component.scss',
  host: { '[class.editing]': 'editing()' },
  template: `
    <ng-container *transloco="let t">
      <app-top-bar [editing]="editing()" />
      <main><router-outlet /></main>
    </ng-container>
  `,
})
export class ShellComponent {
  private readonly router = inject(Router);
  /** True on the recipe editor routes (`data.editor`). */
  protected readonly editing = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.onEditor()),
    ),
    { initialValue: this.onEditor() },
  );

  private onEditor(): boolean {
    let r: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (r?.firstChild) r = r.firstChild;
    return !!r?.data['editor'];
  }
}
