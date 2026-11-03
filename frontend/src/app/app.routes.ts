import { Routes } from '@angular/router';
import { LoginPage } from './auth/login.page';
import { RegisterPage } from './auth/register.page';
import { ResetPasswordPage } from './auth/reset-password.page';
import { SetupPage } from './auth/setup.page';
import { authGuard, guestGuard, setupGuard } from './core/auth.guards';
import { HomePage } from './home.page';
import { ShellComponent } from './shell/shell.component';

// Every route lives under the pathless parent so setupGuard (canActivateChild) runs for all of them.
export const routes: Routes = [
  {
    path: '',
    canActivateChild: [setupGuard],
    children: [
      { path: 'setup', component: SetupPage },
      { path: 'login', component: LoginPage, canActivate: [guestGuard] },
      { path: 'invite/:token', component: RegisterPage },
      { path: 'reset/:token', component: ResetPasswordPage },
      {
        path: '',
        component: ShellComponent,
        canActivate: [authGuard],
        children: [{ path: '', component: HomePage, pathMatch: 'full' }],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
