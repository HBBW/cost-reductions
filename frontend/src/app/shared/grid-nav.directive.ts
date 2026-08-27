import { Directive, ElementRef, HostListener, input } from '@angular/core';

/**
 * Navigasi grid ala Excel untuk sel <input data-row data-col> di dalam host:
 *   Enter / panah sesuai arah -> sel berikutnya yang tidak terkunci
 *   Tab                       -> native (urutan DOM)
 * Fokus selalu select-all agar langsung bisa menimpa nilai.
 */
@Directive({
  selector: '[gridNav]'
})
export class GridNavDirective {
  /** 'down' untuk grid vertikal (12 bulan per baris), 'right' untuk grid satu baris (target). */
  gridNavDirection = input<'down' | 'right'>('down');

  constructor(private el: ElementRef<HTMLElement>) {}

  private cell(row: number, col: number): HTMLInputElement | null {
    return this.el.nativeElement.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`
    );
  }

  private move(target: HTMLElement, delta: number) {
    const row = Number(target.getAttribute('data-row'));
    const col = Number(target.getAttribute('data-col'));
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;

    const vertical = this.gridNavDirection() === 'down';
    let pos = (vertical ? row : col) + delta;
    while ((vertical && pos >= 0) || (!vertical && pos >= 0 && pos < 24)) {
      const next = vertical ? this.cell(pos, col) : this.cell(row, pos);
      if (!next) break; // melewati ujung grid
      if (!next.disabled && !next.readOnly) {
        next.focus();
        break;
      }
      pos += delta;
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-row') == null) return;

    const forward = this.gridNavDirection() === 'down' ? event.key === 'Enter' || event.key === 'ArrowDown'
      : event.key === 'Enter' || event.key === 'ArrowRight';
    const backward = this.gridNavDirection() === 'down' ? event.key === 'ArrowUp'
      : event.key === 'ArrowLeft';

    if (forward) {
      event.preventDefault();
      this.move(target, 1);
    } else if (backward) {
      event.preventDefault();
      this.move(target, -1);
    }
  }

  @HostListener('focusin', ['$event'])
  onFocusin(event: FocusEvent) {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === 'number') {
      target.select();
    }
  }
}
