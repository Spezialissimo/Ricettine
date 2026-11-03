import { Routes } from '@angular/router';
import { setupGuard } from './core/auth.guards';

// Screens (login, setup, settings, admin...) are added by Tasks 9/10, using
// authGuard / adminGuard / guestGuard from core/auth.guards.
export const routes: Routes = [{ path: '', canActivateChild: [setupGuard], children: [] }];
