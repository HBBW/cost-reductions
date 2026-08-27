import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { httpError } from '../../core/auth.service';
import { CellStatus, CompletenessDept, CompletenessResponse, MetaInfo } from '../../core/models';
import { MONTHS_ID } from '../../core/format';
import { PageHeader, YearSelect } from '../../shared/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect],
  templateUrl: './monitoring.page.html'
})
export class MonitoringPage implements OnInit {
  private http = inject(HttpClient);

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  data = signal<CompletenessResponse | null>(null);
  error = signal<string | null>(null);

  monthLabels = MONTHS_ID.map((m) => m.slice(0, 3));

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta')).then((meta) => this.years.set(meta.years));
    this.load();
  }

  setYear(y: number) { this.year.set(y); this.load(); }

  async load() {
    this.error.set(null);
    try {
      const resp = await firstValueFrom(this.http.get<CompletenessResponse>(`/api/dashboard/completeness?year=${this.year()}`));
      this.data.set(resp);
    } catch (err) {
      this.error.set(httpError(err as never));
    }
  }

  cellClass(status: CellStatus): string {
    switch (status) {
      case 'OK': return 'bg-forest';
      case 'MISSING': return 'border-2 border-rust bg-surface';
      case 'CURRENT': return 'border border-dashed border-ochre bg-ochre-tint';
      case 'UPCOMING': return 'border border-hairline';
      default: return 'border border-dotted border-faint';
    }
  }

  markerClass(status: CellStatus): string {
    return this.cellClass(status);
  }

  cellTitle(d: CompletenessDept, c: { month: number; status: CellStatus; filled: number; total: number; missingIdeas: string[] }): string {
    const bulan = `${MONTHS_ID[c.month - 1]} ${this.year()}`;
    switch (c.status) {
      case 'OK': return `${bulan}: lengkap (${c.total} idea)`;
      case 'MISSING': return `${bulan}: BELUM — ${c.filled}/${c.total} terisi. Belum diisi: ${c.missingIdeas.join(', ') || '-'}`;
      case 'CURRENT': return `${bulan}: periode berjalan — ${c.filled}/${c.total} idea sudah diisi`;
      case 'UPCOMING': return `${bulan}: belum dimulai`;
      default: return `${bulan}: belum ada idea aktif`;
    }
  }

  filledCount(d: CompletenessDept): number {
    return d.months.filter((m) => m.status === 'OK').length;
  }

  totalCells(d: CompletenessDept): number {
    return d.months.filter((m) => m.status !== 'UPCOMING' && m.status !== 'NO_IDEA').length;
  }

  targetColTitle(): string {
    return 'Target tahunan: ✓ = 12 bulan terisi, − = belum lengkap';
  }
}
