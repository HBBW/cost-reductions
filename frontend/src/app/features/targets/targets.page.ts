import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, httpError } from '../../core/auth.service';
import { Department, MetaInfo, TargetIdeaEntry, TargetsIdeasResponse } from '../../core/models';
import { fmtNum, parseRupiahInput, rupiahFmt } from '../../core/format';
import { PageHeader, SaveBar, YearSelect } from '../../shared/ui';
import { GridNavDirective } from '../../shared/grid-nav.directive';

interface DeptIdeaGroup {
  dept: string;
  items: { idea: TargetIdeaEntry; index: number }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect, SaveBar, GridNavDirective],
  templateUrl: './targets.page.html'
})
export class TargetsPage implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  fmt = (v: number | null | undefined) => fmtNum(v, 0);
  rupiahFmt = rupiahFmt;
  parseRupiahInput = parseRupiahInput;
  MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  departments = signal<Department[]>([]);
  selectedDeptId = signal<string | null>(null);

  ideas = signal<TargetIdeaEntry[]>([]);
  baseline = signal<TargetIdeaEntry[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  /** Set bulan yang pernah diketik ("${i}-${m}") — agar nilai 0 tetap ikut disimpan. */
  private touched = signal<Set<string>>(new Set());

  isMR = this.auth.user()?.role === 'MR';

  deptName = computed(() => {
    const id = this.isMR ? this.selectedDeptId() : (this.auth.user()?.departmentId ?? null);
    return this.departments().find((d) => d.id === id)?.name ?? '';
  });

  /** True bila tanggal hari ini sudah melewati 19 Februari tahun berjalan (target terkunci). */
  targetLocked = computed(() => {
    const now = new Date();
    const lockDate = new Date(now.getFullYear(), 1, 19); // 19 Feb
    return now.getTime() > lockDate.getTime();
  });

  /** MR boleh tetap edit walau terkunci; role lain terkunci. */
  editable = computed(() => !this.targetLocked() || this.isMR);

  dirtyCount = computed(() => {
    const cur = this.ideas();
    const base = this.baseline();
    const touchedSet = this.touched();
    let n = 0;
    for (let i = 0; i < cur.length; i++) {
      for (let m = 1; m <= 12; m++) {
        if (cur[i]?.months[m] !== base[i]?.months[m]) n++;
        else if (touchedSet.has(`${i}-${m}`)) n++;
      }
    }
    return n;
  });

  /** Grup idea per departemen. */
  grouped = computed<DeptIdeaGroup[]>(() => {
    const list = this.ideas();
    const map = new Map<string, { idea: TargetIdeaEntry; index: number }[]>();
    list.forEach((idea, index) => {
      if (!map.has(idea.departmentName)) map.set(idea.departmentName, []);
      map.get(idea.departmentName)!.push({ idea, index });
    });
    return [...map.entries()].map(([dept, items]) => ({ dept, items }));
  });

  ideaTotal(idea: TargetIdeaEntry): number {
    return Object.values(idea.months).reduce((a, b) => a + b, 0);
  }

  deptTotal(items: { idea: TargetIdeaEntry }[]): number {
    return items.reduce((s, { idea }) => s + this.ideaTotal(idea), 0);
  }

  get totalAll(): number {
    return this.ideas().reduce((s, i) => s + this.ideaTotal(i), 0);
  }

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta'))
      .then((meta) => this.years.set(this.buildYears(meta.years)))
      .catch(() => {});
    this.initDepartments();
  }

  private initDepartments() {
    if (this.isMR) {
      firstValueFrom(this.http.get<Department[]>('/api/departments'))
        .then((d) => {
          this.departments.set(d);
          this.loadIdeas();
        })
        .catch(() => { this.loadIdeas(); });
    } else {
      this.loadIdeas();
    }
  }

  /** Tahun yang bisa dipilih: meta-years + rentang beberapa tahun untuk MR/FA agar bisa input data takhta dan yang belum ada ide-nya. */
  private buildYears(metaYears: number[]): number[] {
    const role = this.auth.user()?.role;
    const ys = [...metaYears];
    if (role === 'MR' || role === 'FA' || role === 'FA_INPUT') {
      const now = new Date().getFullYear();
      for (let y = now - 5; y <= now + 2; y++) {
        if (!ys.includes(y)) ys.push(y);
      }
    }
    return ys.sort((a, b) => b - a);
  }

  setYear(y: number) { this.year.set(y); this.loadIdeas(); }
  setDept(id: string) { this.selectedDeptId.set(id ? id : null); this.loadIdeas(); }

  loadIdeas() {
    this.loading.set(true);
    this.error.set(null);
    const p = new URLSearchParams({ year: String(this.year()) });
    const dept = this.isMR ? this.selectedDeptId() : (this.auth.user()?.departmentId ?? null);
    if (dept) p.set('department_id', dept);

    firstValueFrom(this.http.get<TargetsIdeasResponse>(`/api/targets/ideas?${p}`))
      .then((resp) => {
        const mapped: TargetIdeaEntry[] = resp.ideas.map((i) => ({ ...i, months: { ...i.months } }));
        this.ideas.set(mapped);
        this.baseline.set(mapped.map((i) => ({ ...i, months: { ...i.months } })));
        this.touched.set(new Set());
      })
      .catch((err) => this.error.set(httpError(err as never)))
      .finally(() => this.loading.set(false));
  }

  onMonth(index: number, month: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const raw = (el.value || '').trim();
    const v = parseRupiahInput(el.value);
    this.ideas.update((rows) => rows.map((r, i) => i === index ? { ...r, months: { ...r.months, [month]: v } } : r));
    this.touched.update((s) => { const next = new Set(s); next.add(`${index}-${month}`); return next; });
    // Tampilkan "0" bila memang diketik nol; biarkan kosong bila input dikosongkan
    el.value = raw === '' ? '' : rupiahFmt.format(v);
  }

  isDirtyMonth(index: number, month: number): boolean {
    const cur = this.ideas()[index];
    const base = this.baseline()[index];
    const touchedSet = this.touched();
    return cur && base && (cur.months[month] !== base.months[month] || touchedSet.has(`${index}-${month}`));
  }

  revertRows() {
    this.ideas.set(this.baseline().map((i) => ({ ...i, months: { ...i.months } })));
    this.touched.set(new Set());
  }

  async saveAll() {
    if (!this.dirtyCount()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const cur = this.ideas();
      const base = this.baseline();
      const touchedSet = this.touched();
      for (let i = 0; i < cur.length; i++) {
        const changed = Object.entries(cur[i].months)
          .filter(([m, v]) => v !== base[i]?.months[Number(m)] || touchedSet.has(`${i}-${Number(m)}`))
          .map(([m, v]) => ({ month: Number(m), amount: v }));
        if (changed.length) {
          await firstValueFrom(this.http.put(`/api/targets/ideas/${cur[i].id}`, { rows: changed }));
        }
      }
      await this.loadIdeas();
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.saving.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.dirtyCount() && !this.saving()) {
      e.preventDefault();
      this.saveAll();
    }
  }
}