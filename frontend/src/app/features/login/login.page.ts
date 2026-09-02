import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, httpError } from '../../core/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './login.page.html'
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  username = signal('');
  password = signal('');
  showPassword = signal(false);
  error = signal<string | null>(null);
  loading = signal(false);

  async submit(ev: Event) {
    ev.preventDefault();
    this.error.set(null);
    if (!this.username().trim() || !this.password()) {
      this.error.set('Username dan password wajib diisi');
      return;
    }
    this.loading.set(true);
    try {
      const res = await new Promise<{ token: string; user: import('../../core/models').User }>((resolve, reject) =>
        this.auth.login(this.username().trim(), this.password()).subscribe({ next: resolve, error: reject })
      );
      this.auth.user.set(res.user);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl && returnUrl !== '/login' ? returnUrl : '/dashboard');
    } catch (err) {
      this.error.set(httpError(err as import('@angular/common/http').HttpErrorResponse));
    } finally {
      this.loading.set(false);
    }
  }
}
