import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Gym Log', loadComponent: () => import('./home/home').then((m) => m.Home) },
  { path: 'log', title: 'Log', loadComponent: () => import('./log/log').then((m) => m.Log) },
  { path: 'book', title: 'Log book', loadComponent: () => import('./book/book').then((m) => m.Book) },
  { path: 'progress', title: 'Progress', loadComponent: () => import('./progress/progress').then((m) => m.Progress) },
  // Old tab paths, kept so installed shortcuts and bookmarks still land somewhere sensible.
  { path: 'history', redirectTo: '/book?view=list' },
  { path: 'calendar', redirectTo: '/book' },
  { path: '**', redirectTo: '' },
];
