import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Department } from '../../core/models';

interface NavItem {
  path: string;
  label: string;
  roles: string[] | null;
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css'
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);
  private http = inject(HttpClient);

  /** Menu mobile terbuka/tutup */
  menuOpen = signal(false);

  toggleMenu() { this.menuOpen.update((v) => !v); }
  closeMenu() { if (this.menuOpen()) this.menuOpen.set(false); }

  private departments = signal<Department[]>([]);

  readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', roles: null },
    { path: '/input', label: 'Input Data', roles: ['USER', 'FA_INPUT', 'MR'] },
    { path: '/targets', label: 'Target Tahunan', roles: ['USER', 'FA_INPUT', 'MR'] },
    { path: '/monitoring', label: 'Monitoring', roles: ['FA', 'FA_READONLY', 'FA_INPUT', 'MR'] },
    { path: '/detail', label: 'Detail Idea', roles: null },
    { path: '/laporan', label: 'Laporan', roles: ['FA', 'FA_READONLY', 'FA_INPUT', 'MR'] }
  ];

  ngOnInit() {
    firstValueFrom(this.http.get<Department[]>('/api/departments'))
      .then((d) => this.departments.set(d))
      .catch(() => {});
  }

  visibleItems() {
    const role = this.auth.user()?.role;
    return this.navItems.filter((i) => !i.roles || role && i.roles.includes(role));
  }

  roleLabel(): string {
    const user = this.auth.user();
    if (!user) return '';
    if (user.role === 'FA') return 'Financial Accounting';
    const name = user.departmentName || this.departments().find((d) => d.id === user.departmentId)?.name || '';
    return name ? `Dept ${name}` : 'User Departemen';
  }
}
