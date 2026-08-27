import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  private http = inject(HttpClient);

  private departments = signal<Department[]>([]);

  readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', roles: null },
    { path: '/input', label: 'Input Data', roles: ['USER', 'MR'] },
    { path: '/targets', label: 'Target Tahunan', roles: ['USER', 'MR'] },
    { path: '/monitoring', label: 'Monitoring', roles: ['FA', 'MR'] },
    { path: '/detail', label: 'Detail Idea', roles: null },
    { path: '/laporan', label: 'Laporan', roles: ['MR'] }
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
    if (user.role === 'MR') return 'Manajer Regional';
    if (user.role === 'FA') return 'Financial Accounting';
    const dept = this.departments().find((d) => d.id === user.departmentId);
    return dept ? `Dept ${dept.name}` : 'User Departemen';
  }
}
