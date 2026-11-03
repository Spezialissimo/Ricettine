import { Routes } from '@angular/router';
import { LoginPage } from './auth/login.page';
import { RegisterPage } from './auth/register.page';
import { ResetPasswordPage } from './auth/reset-password.page';
import { SetupPage } from './auth/setup.page';
import { adminGuard, authGuard, guestGuard, setupGuard } from './core/auth.guards';
import { InvitesPage } from './admin/invites.page';
import { UsersPage } from './admin/users.page';
import { DeleteAccountPage } from './settings/delete-account.page';
import { PasswordPage } from './settings/password.page';
import { ProfilePage } from './settings/profile.page';
import { MyRecipesPage } from './recipes/my-recipes.page';
import { NewRecipePage } from './recipes/new-recipe.page';
import { RecipeEditorPage } from './recipes/recipe-editor.page';
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
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'recipes' },
          { path: 'recipes', component: MyRecipesPage, pathMatch: 'full' },
          { path: 'recipes/new', component: NewRecipePage },
          { path: 'recipes/:id/edit', component: RecipeEditorPage },
          { path: 'settings', pathMatch: 'full', redirectTo: 'settings/profile' },
          { path: 'settings/profile', component: ProfilePage },
          { path: 'settings/password', component: PasswordPage },
          { path: 'settings/delete', component: DeleteAccountPage },
          { path: 'admin', pathMatch: 'full', redirectTo: 'admin/invites' },
          { path: 'admin/invites', component: InvitesPage, canActivate: [adminGuard] },
          { path: 'admin/users', component: UsersPage, canActivate: [adminGuard] },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
