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
import { FeedPage } from './feed/feed.page';
import { MyRecipesPage } from './recipes/my-recipes.page';
import { NewRecipePage } from './recipes/new-recipe.page';
import { ShellComponent } from './shell/shell.component';
import { leaveEditorGuard } from './recipes/editor/leave-editor.guard';

// Every route lives under the pathless parent so setupGuard (canActivateChild) runs for all of them.
export const routes: Routes = [
  {
    path: '',
    canActivateChild: [setupGuard],
    children: [
      { path: 'setup', title: 'titles.setup', component: SetupPage },
      { path: 'login', title: 'titles.login', component: LoginPage, canActivate: [guestGuard] },
      { path: 'invite/:token', title: 'titles.invite', component: RegisterPage },
      { path: 'reset/:token', title: 'titles.reset', component: ResetPasswordPage },
      // public: readable without an account, so outside the authGuard shell (own minimal header)
      {
        path: 'r/:token',
        loadComponent: () =>
          import('./recipes/view/recipe-view.page').then((m) => m.RecipeViewPage),
      },
      {
        path: 'c/:token',
        pathMatch: 'full',
        loadComponent: () =>
          import('./cookbooks/view/cookbook-view.page').then((m) => m.CookbookViewPage),
      },
      {
        path: 'c/:token/r/:recipeId',
        data: { via: 'cookbook' },
        loadComponent: () =>
          import('./recipes/view/recipe-view.page').then((m) => m.RecipeViewPage),
      },
      {
        path: '',
        component: ShellComponent,
        canActivate: [authGuard],
        children: [
          { path: '', pathMatch: 'full', title: 'titles.home', component: FeedPage },
          {
            path: 'u/:username',
            title: 'titles.profile',
            loadComponent: () => import('./profile/profile.page').then((m) => m.UserProfilePage),
          },
          {
            path: 'recipes',
            title: 'titles.myRecipes',
            component: MyRecipesPage,
            pathMatch: 'full',
          },
          { path: 'recipes/new', title: 'titles.newRecipe', component: NewRecipePage },
          {
            path: 'recipes/:id/edit',
            title: 'titles.editRecipe',
            loadComponent: () =>
              import('./recipes/editor/recipe-editor.page').then((m) => m.RecipeEditorPage),
            canDeactivate: [leaveEditorGuard],
          },
          {
            path: 'cookbooks',
            title: 'titles.cookbooks',
            pathMatch: 'full',
            loadComponent: () =>
              import('./cookbooks/my-cookbooks.page').then((m) => m.MyCookbooksPage),
          },
          {
            path: 'cookbooks/:id',
            title: 'titles.cookbook',
            loadComponent: () => import('./cookbooks/cookbook.page').then((m) => m.CookbookPage),
          },
          {
            path: 'cookbook-invite/:token',
            title: 'titles.cookbookInvite',
            loadComponent: () =>
              import('./cookbooks/accept-invite.page').then((m) => m.AcceptInvitePage),
          },
          { path: 'settings', pathMatch: 'full', redirectTo: 'settings/profile' },
          { path: 'settings/profile', title: 'titles.profile', component: ProfilePage },
          { path: 'settings/password', title: 'titles.password', component: PasswordPage },
          { path: 'settings/delete', title: 'titles.deleteAccount', component: DeleteAccountPage },
          { path: 'admin', pathMatch: 'full', redirectTo: 'admin/invites' },
          {
            path: 'admin/invites',
            title: 'titles.invites',
            component: InvitesPage,
            canActivate: [adminGuard],
          },
          {
            path: 'admin/users',
            title: 'titles.users',
            component: UsersPage,
            canActivate: [adminGuard],
          },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
