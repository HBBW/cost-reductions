import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  user = signal<User | null>(null);
  private loadPromise: Promise<User | null> | null = null;

  /** Ambil profil dari server sekali (untuk guard refresh halaman). */
  ensureLoaded(): Promise<User | null> {
    if (this.user()) return Promise.resolve(this.user());
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(this.http.get<{ user: User }>('/api/auth/me'))
        .then((r) => { this.user.set(r.user); return r.user; })
        .catch(() => { this.user.set(null); return null; })
        .finally(() => { setTimeout(() => (this.loadPromise = null)); });
    }
    return this.loadPromise;
  }

  login(username: string, password: string) {
    return this.http.post<{ token: string; user: User }>('/api/auth/login', { username, password });
  }

  async logout() {
    try { await firstValueFrom(this.http.post('/api/auth/logout', {})); } catch { /* abaikan */ }
    this.user.set(null);
    await this.router.navigate(['/login']);
  }
}

export function httpError(err: HttpErrorResponse): string {
  return err.error?.message || `Terjadi kesalahan (${err.status})`;
}
