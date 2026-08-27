import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
        title: 'Dashboard — CR Monitor'
      },
      {
        path: 'input',
        canActivate: [roleGuard('USER', 'MR')],
        loadComponent: () => import('./features/input/input.page').then((m) => m.InputPage),
        title: 'Input Data — CR Monitor'
      },
      {
        path: 'targets',
        canActivate: [roleGuard('USER', 'MR')],
        loadComponent: () => import('./features/targets/targets.page').then((m) => m.TargetsPage),
        title: 'Target Tahunan — CR Monitor'
      },
      {
        path: 'monitoring',
        canActivate: [roleGuard('FA', 'MR')],
        loadComponent: () => import('./features/monitoring/monitoring.page').then((m) => m.MonitoringPage),
        title: 'Monitoring Status — CR Monitor'
      },
      {
        path: 'detail',
        loadComponent: () => import('./features/detail/detail.page').then((m) => m.DetailPage),
        title: 'Detail Idea — CR Monitor'
      },
      {
        path: 'laporan',
        canActivate: [roleGuard('MR')],
        loadComponent: () => import('./features/laporan/laporan.page').then((m) => m.LaporanPage),
        title: 'Laporan — CR Monitor'
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
