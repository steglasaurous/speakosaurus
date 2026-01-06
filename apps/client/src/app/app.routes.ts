import { Route } from '@angular/router';
import { UserListComponent } from './components/user-list/user-list.component';
import { UserDetailComponent } from './components/user-detail/user-detail.component';
import { SettingsComponent } from './components/settings/settings.component';
import { TwitchCallbackComponent } from './components/twitch-callback/twitch-callback.component';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: '/users',
    pathMatch: 'full',
  },
  {
    path: 'users',
    component: UserListComponent,
  },
  {
    path: 'users/:twitchUserId',
    component: UserDetailComponent,
  },
  {
    path: 'settings',
    component: SettingsComponent,
  },
  {
    path: 'twitch-callback',
    component: TwitchCallbackComponent,
  },
];
