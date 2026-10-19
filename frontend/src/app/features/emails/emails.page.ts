import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { httpError } from '../../core/auth.service';
import { EmailUser } from '../../core/models';
import { PageHeader, SaveBar } from '../../shared/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, SaveBar],
  templateUrl: './emails.page.html'
})
export class EmailsPage implements OnInit {
  private http = inject(HttpClient);

  users = signal<EmailUser[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);
  saving = signal(false);
  query = signal('');
  /** Filter departemen (nama departemen; '' = semua). */
  deptName = signal('');
  /** Perubahan belum disimpan: id -> email (string mentah). */
  private edits = signal<Map<number, string>>(new Map());

  /** Daftar nama departemen (untuk filter), diurutkan; "Tanpa Departemen" paling bawah. */
  deptNames = computed(() => {
    const names = [...new Set(this.users().map((u) => u.departmentName ?? 'Tanpa Departemen'))];
    return names.sort((a, b) =>
      a === 'Tanpa Departemen' ? 1 : b === 'Tanpa Departemen' ? -1 : a.localeCompare(b)
    );
  });

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const dept = this.deptName();
    return this.users().filter((u) => {
      const uDept = u.departmentName ?? 'Tanpa Departemen';
      if (dept && uDept !== dept) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  });

  /** Kelompok per departemen, urut nama departemen. */
  grouped = computed(() => {
    const map = new Map<string, EmailUser[]>();
    for (const u of this.filtered()) {
      const key = u.departmentName ?? 'Tanpa Departemen';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === 'Tanpa Departemen' ? 1 : b === 'Tanpa Departemen' ? -1 : a.localeCompare(b)))
      .map(([dept, list]) => ({
        dept,
        users: list,
        filled: list.filter((u) => u.email).length
      }));
  });

  filledCount = computed(() => this.users().filter((u) => u.email).length);
  dirtyCount = computed(() => this.edits().size);

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.http.get<EmailUser[]>('/api/emails'));
      this.users.set(list);
      this.edits.set(new Map());
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.loading.set(false);
    }
  }

  emailOf(u: EmailUser): string {
    return this.edits().get(u.id) ?? u.email;
  }

  isDirty(u: EmailUser): boolean {
    return this.edits().has(u.id);
  }

  onEdit(u: EmailUser, ev: Event) {
    const value = (ev.target as HTMLInputElement).value;
    this.edits.update((map) => {
      const next = new Map(map);
      if (value === u.email) next.delete(u.id);
      else next.set(u.id, value);
      return next;
    });
  }

  revert() {
    this.edits.set(new Map());
  }

  async save() {
    const edits = [...this.edits().entries()];
    if (!edits.length) return;
    const invalid = edits.find(([, email]) => email.trim() && !EMAIL_RE.test(email.trim()));
    if (invalid) {
      this.error.set('Ada format email yang tidak valid — periksa lagi sebelum menyimpan.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await Promise.all(
        edits.map(([id, email]) => firstValueFrom(this.http.put(`/api/emails/${id}`, { email: email.trim() })))
      );
      this.notice.set(`${edits.length} email tersimpan`);
      await this.load();
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.saving.set(false);
    }
  }

  clearNotice() { this.notice.set(null); }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.dirtyCount()) {
      e.preventDefault();
      if (!this.saving()) this.save();
    }
  }
}
