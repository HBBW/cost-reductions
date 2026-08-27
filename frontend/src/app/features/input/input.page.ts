import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, httpError } from '../../core/auth.service';
import {
  Department, IdeaListItem, IdeaMonthlyResponse, MetaInfo
} from '../../core/models';
import { MONTHS_ID, fmtNum, parseRupiahInput, rupiahFmt } from '../../core/format';
import { PageHeader, SaveBar, YearSelect } from '../../shared/ui';
import { GridNavDirective } from '../../shared/grid-nav.directive';

interface EditableRow {
  month: number;
  potentialCr: number;
  budget: number;
  actualCost: number;
  open: boolean;
}

const FIELDS = ['actualCost'] as const;
type Field = (typeof FIELDS)[number];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, YearSelect, SaveBar, GridNavDirective],
  templateUrl: './input.page.html'
})
export class InputPage implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  MONTHS_ID = MONTHS_ID;
  fmt = (v: number | null | undefined, digits = 2) => fmtNum(v, digits);
  rupiahFmt = rupiahFmt;
  parseRupiahInput = parseRupiahInput;

  year = signal(new Date().getFullYear());
  years = signal<number[]>([new Date().getFullYear()]);
  departments = signal<Department[]>([]);
  selectedDeptId = signal<string | null>(null);

  ideas = signal<IdeaListItem[]>([]);
  loading = signal(true);
  notice = signal<string | null>(null);
  error = signal<string | null>(null);

  /* Editor bulanan */
  selectedIdea = signal<IdeaListItem | null>(null);
  monthly = signal<IdeaMonthlyResponse | null>(null);
  rows = signal<EditableRow[]>([]);
  baseline = signal<EditableRow[]>([]);
  savingMonthly = signal(false);

  /* Modal tambah idea */
  modalOpen = signal(false);
  modalSaving = signal(false);
  fName = signal('');
  fBudget = signal<number>(0);
  fPotentialCr = signal<number>(0);
  fRemark = signal('');
  fDeptId = signal<string | null>(null);

  isMR = this.auth.user()?.role === 'MR';

  totalPotential = computed(() => {
    const idea = this.monthly()?.idea;
    return idea ? idea.potentialCr : 0;
  });
  totalBudget = computed(() => {
    const idea = this.monthly()?.idea;
    return idea ? idea.budget : 0;
  });
  totalCost = computed(() => this.rows().reduce((s, r) => s + r.actualCost, 0));
  totalActualCr = computed(() => Math.round((this.totalBudget() - this.totalCost()) * 100) / 100);

  /** True bila tidak ada satu pun bulan yang terbuka untuk USER. */
  allMonthsLocked = computed(() => {
    const rows = this.rows();
    return !this.isMR && rows.length > 0 && rows.every((r) => !r.open);
  });

  /** Jumlah sel yang berbeda dari baseline. */
  dirtyCount = computed(() => {
    const rows = this.rows();
    const base = this.baseline();
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      for (const f of FIELDS) {
        if (rows[i]?.[f] !== base[i]?.[f]) n++;
      }
    }
    return n;
  });

  ngOnInit() {
    firstValueFrom(this.http.get<MetaInfo>('/api/meta')).then(async (meta) => {
      this.years.set(meta.years);
    });
    if (this.isMR) {
      firstValueFrom(this.http.get<Department[]>('/api/departments')).then((d) => {
        this.departments.set(d);
        if (d.length) this.selectedDeptId.set(d[0].id);
        this.loadIdeas();
      });
    } else {
      this.loadIdeas();
    }
  }

  setYear(y: number) { this.year.set(y); this.closeEditor(); this.loadIdeas(); }
  setDept(id: string) { this.selectedDeptId.set(id); this.closeEditor(); this.loadIdeas(); }

  private params(): string {
    const p = new URLSearchParams({ year: String(this.year()) });
    const dept = this.isMR ? this.selectedDeptId() : null;
    if (dept) p.set('department_id', dept);
    return p.toString();
  }

  async loadIdeas() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.http.get<IdeaListItem[]>(`/api/ideas?${this.params()}`));
      this.ideas.set(list);
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.loading.set(false);
    }
  }

  /* ---------- Modal tambah idea ---------- */
  openCreate() {
    this.fName.set('');
    this.fBudget.set(0);
    this.fPotentialCr.set(0);
    this.fRemark.set('');
    this.fDeptId.set(this.isMR ? this.departments()[0]?.id ?? null : this.auth.user()?.departmentId ?? null);
    this.modalOpen.set(true);
  }

  closeModal() { this.modalOpen.set(false); }

  async saveIdea(ev: Event) {
    ev.preventDefault();
    if (!this.fName().trim()) return;
    this.modalSaving.set(true);
    this.error.set(null);
    const body: Record<string, unknown> = {
      name: this.fName().trim(),
      budget: 0,
      potentialCr: 0,
      remark: this.fRemark().trim() || null,
      year: this.year()
    };
    if (this.isMR) body['department_id'] = this.fDeptId();
    try {
      await firstValueFrom(this.http.post('/api/ideas', body));
      this.modalOpen.set(false);
      await this.loadIdeas();
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.modalSaving.set(false);
    }
  }

  /* ---------- Editor data bulanan ---------- */
  async openEditor(idea: IdeaListItem) {
    if (!this.confirmDiscard()) return;
    this.selectedIdea.set(idea);
    this.monthly.set(null);
    this.error.set(null);
    try {
      const resp = await firstValueFrom(this.http.get<IdeaMonthlyResponse>(`/api/ideas/${idea.id}/monthly`));
      this.monthly.set(resp);
      const editable: EditableRow[] = resp.months.map((m, i) => ({
        month: m.month,
        potentialCr: m.potentialCr,
        budget: m.budget,
        actualCost: m.actualCost,
        open: resp.lockedMonths[i]?.open ?? false
      }));
      this.rows.set(editable);
      this.baseline.set(editable.map((r) => ({ ...r })));
    } catch (err) {
      this.error.set(httpError(err as never));
    }
  }

  confirmDiscard(): boolean {
    const n = this.dirtyCount();
    return n === 0 || confirm(`Ada ${n} perubahan belum disimpan. Buang perubahan tersebut?`);
  }

  closeEditor() {
    if (!this.confirmDiscard()) return;
    this.selectedIdea.set(null);
    this.monthly.set(null);
    this.rows.set([]);
    this.baseline.set([]);
  }

  revertRows() {
    this.rows.set(this.baseline().map((r) => ({ ...r })));
  }

  rowActualCr(r: EditableRow): number {
    return Math.round((r.budget - r.actualCost) * 100) / 100;
  }

  editable(r: EditableRow): boolean {
    return this.isMR || r.open;
  }

  isCellDirty(i: number, field: Field): boolean {
    return this.rows()[i]?.[field] !== this.baseline()[i]?.[field];
  }

  onCell(index: number, field: Field, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const v = parseRupiahInput(el.value);
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: v } : r)));
    // tampilkan dengan pemisah ribuan agar tidak salah hitung nol
    el.value = v === 0 ? '' : rupiahFmt.format(v);
  }

  /** Nilai sel input dalam format ribuan ("90.000.000"). */
  fmtCell(v: number | null | undefined): string {
    return v ? rupiahFmt.format(v) : '';
  }

  /** Payload hanya sel yang benar-benar berubah & boleh diedit. */
  private changedPayload() {
    const base = this.baseline();
    return this.rows()
      .map((r, i) => ({
        month: r.month,
        include: this.editable(r) && FIELDS.some((f) => r[f] !== base[i]?.[f]),
        values: { actualCost: r.actualCost }
      }))
      .filter((x) => x.include)
      .map((x) => ({ month: x.month, ...x.values }));
  }

  async saveMonthly() {
    const idea = this.selectedIdea();
    if (!idea || !this.dirtyCount()) return;
    const payload = this.changedPayload();
    this.savingMonthly.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put(`/api/ideas/${idea.id}/monthly`, { rows: payload }));
      this.notice.set(`Data bulanan "${idea.name}" tersimpan`);
      await Promise.all([this.openEditorForce(idea), this.loadIdeas()]);
    } catch (err) {
      this.error.set(httpError(err as never));
    } finally {
      this.savingMonthly.set(false);
    }
  }

  private async openEditorForce(idea: IdeaListItem) {
    this.selectedIdea.set(idea);
    try {
      const resp = await firstValueFrom(this.http.get<IdeaMonthlyResponse>(`/api/ideas/${idea.id}/monthly`));
      this.monthly.set(resp);
      const editable: EditableRow[] = resp.months.map((m, i) => ({
        month: m.month,
        potentialCr: m.potentialCr,
        budget: m.budget,
        actualCost: m.actualCost,
        open: resp.lockedMonths[i]?.open ?? false
      }));
      this.rows.set(editable);
      this.baseline.set(editable.map((r) => ({ ...r })));
    } catch { /* biarkan state lama */ }
  }

  clearNotice() { this.notice.set(null); }

  /* Ctrl+S / Cmd+S untuk simpan */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.selectedIdea()) {
      e.preventDefault();
      if (this.dirtyCount() > 0 && !this.savingMonthly()) this.saveMonthly();
    }
  }
}
