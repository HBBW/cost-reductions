import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Department, DetailIdea, MetaInfo } from '../../core/models';
import { PageHeader, YearSelect } from '../../shared/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect],
  templateUrl: './laporan.page.html'
})
export class LaporanPage implements OnInit {
  private http = inject(HttpClient);

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  departments = signal<Department[]>([]);
  deptId = signal('');
  loading = signal(true);
  count = signal(0);

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta')).then((meta) => this.years.set(meta.years));
    firstValueFrom(this.http.get<Department[]>('/api/departments')).then((d) => this.departments.set(d));
    this.refreshCount();
  }

  setYear(y: number) { this.year.set(y); this.refreshCount(); }

setDept(id: string) { this.deptId.set(id); this.refreshCount(); }

exportUrl(kind: 'excel' | 'csv'): string {
    const p = new URLSearchParams({ year: String(this.year()) });
    if (this.deptId()) p.set('department_id', this.deptId());
    return `/api/report/export/${kind}?${p}`;
  }

  hasData(): boolean {
    return this.count() > 0;
  }

  private async refreshCount() {
    this.loading.set(true);
    try {
      const p = new URLSearchParams({ year: String(this.year()) });
      if (this.deptId()) p.set('department_id', String(this.deptId()));
      const resp = await firstValueFrom(this.http.get<{ ideas: DetailIdea[] }>(`/api/report/detail?${p}`));
      this.count.set(resp.ideas.length);
    } catch {
      this.count.set(0);
    } finally {
      this.loading.set(false);
    }
  }
}
