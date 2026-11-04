import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { RouteReuseStrategy, TitleStrategy, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthStore } from './core/auth.store';
import { UnsavedBackup } from './recipes/editor/unsaved-backup';
import { ParamReuseStrategy } from './core/param-reuse-strategy';
import { AppTitleStrategy } from './core/page-title';
import { provideAppTransloco } from './core/i18n.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: ParamReuseStrategy },
    { provide: TitleStrategy, useExisting: AppTitleStrategy },
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([authInterceptor]),
    ),
    provideAppTransloco(),
    provideAppInitializer(() => inject(UnsavedBackup).sweep()),
    provideAppInitializer(() => inject(AuthStore).load()),
  ],
};
