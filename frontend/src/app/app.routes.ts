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
import { SettingsLayoutComponent } from './settings/settings-layout.component';
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
      // the author's own recipe, draft or published, as readers see it (from My kitchen; Edit is on the page)
      {
        path: 'recipes/:id/view',
        canActivate: [authGuard],
        title: 'titles.recipe',
        data: { via: 'own' },
        loadComponent: () =>
          import('./recipes/view/recipe-view.page').then((m) => m.RecipeViewPage),
      },
      // the author's preview from the editor: the reader's page (own header), but signed in
      {
        path: 'recipes/:id/preview',
        canActivate: [authGuard],
        title: 'titles.preview',
        data: { via: 'preview' },
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
            path: 'kitchen',
            loadComponent: () => import('./kitchen/kitchen.page').then((m) => m.KitchenPage),
            children: [
              {
                path: '',
                title: 'titles.kitchen',
                loadComponent: () =>
                  import('./kitchen/overview.page').then((m) => m.KitchenOverviewPage),
              },
              {
                path: 'recipes',
                title: 'titles.myRecipes',
                loadComponent: () =>
                  import('./recipes/my-recipes.page').then((m) => m.MyRecipesPage),
              },
              {
                path: 'cookbooks',
                title: 'titles.cookbooks',
                loadComponent: () =>
                  import('./cookbooks/my-cookbooks.page').then((m) => m.MyCookbooksPage),
              },
            ],
          },
          // Old list URLs (bookmarks, earlier links) land on the matching My kitchen tab.
          { path: 'recipes', pathMatch: 'full', redirectTo: 'kitchen/recipes' },
          { path: 'cookbooks', pathMatch: 'full', redirectTo: 'kitchen/cookbooks' },
          {
            path: 'recipes/new',
            title: 'titles.newRecipe',
            component: NewRecipePage,
            data: { editor: true },
          },
          {
            path: 'recipes/:id/edit',
            title: 'titles.editRecipe',
            // the shell hides "+ New recipe" and, on the phone, its bottom navigation while editing
            data: { editor: true },
            loadComponent: () =>
              import('./recipes/editor/recipe-editor.page').then((m) => m.RecipeEditorPage),
            canDeactivate: [leaveEditorGuard],
          },
          {
            path: 'cookbooks/:id',
            title: 'titles.cookbook',
            loadComponent: () => import('./cookbooks/cookbook.page').then((m) => m.CookbookPage),
          },
          {
            path: 'cookbooks/:id/edit',
            title: 'titles.cookbookEdit',
            data: { mode: 'edit' },
            loadComponent: () => import('./cookbooks/cookbook.page').then((m) => m.CookbookPage),
          },
          {
            path: 'cookbook-invite/:token',
            title: 'titles.cookbookInvite',
            loadComponent: () =>
              import('./cookbooks/accept-invite.page').then((m) => m.AcceptInvitePage),
          },
          {
            path: 'settings',
            component: SettingsLayoutComponent,
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'profile' },
              { path: 'profile', title: 'titles.profile', component: ProfilePage },
              {
                path: 'appearance',
                title: 'titles.appearance',
                loadComponent: () =>
                  import('./settings/appearance.page').then((m) => m.AppearancePage),
              },
              { path: 'password', title: 'titles.password', component: PasswordPage },
              { path: 'delete', title: 'titles.deleteAccount', component: DeleteAccountPage },
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
          // Admin moved into Settings; the old URLs still work.
          { path: 'admin', pathMatch: 'full', redirectTo: 'settings/admin/invites' },
          { path: 'admin/invites', redirectTo: 'settings/admin/invites' },
          { path: 'admin/users', redirectTo: 'settings/admin/users' },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
