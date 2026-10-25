import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { Peak, TYPE_COLOR, TYPE_INK, est1rm, fmtDate, fmtWeight } from '../lifts';
import { SessionStore } from '../session-store';
import { Theme } from '../theme';
import { CountUp } from '../shared/count-up';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);

const DAY = 86_400_000;

/** Chart.js paints on canvas, so it can't use the CSS tokens; these mirror them. */
const CHART_INK = {
  dark: { tick: '#7a7a7a', grid: '#ffffff0d', tip: '#232323', tipBorder: '#ffffff14', tipText: '#f2f2f2', peak: '#e0e0e0' },
  light: { tick: '#6b6b6b', grid: '#0000000f', tip: '#ffffff', tipBorder: '#00000014', tipText: '#111111', peak: '#111111' },
};

@Component({
  selector: 'app-progress',
  imports: [FormsModule, CountUp],
  templateUrl: './progress.html',
})
export class Progress {
  protected readonly store = inject(SessionStore);
  private readonly theme = inject(Theme);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart<'line', { x: number; y: number }[]>;

  protected readonly typeColor = TYPE_COLOR;
  protected readonly typeInk = TYPE_INK;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtWeight = fmtWeight;
  protected readonly est1rm = est1rm;

  protected readonly filter = signal('');
  protected readonly trackedCount = computed(() => this.store.peaks().length);
  private readonly picked = signal<string | null>(null);

  /** Most-logged first. */
  private readonly allPeaks = computed(() =>
    [...this.store.peaks()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
  );

  protected readonly matches = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return q ? this.allPeaks().filter((p) => p.name.toLowerCase().includes(q)) : this.allPeaks();
  });

  /** The picked lift, else the most-logged one. */
  protected readonly selected = computed<Peak | undefined>(() => {
    const key = this.picked();
    const all = this.allPeaks();
    return all.find((p) => p.key === key) ?? all[0];
  });

  protected readonly points = computed(() => {
    const p = this.selected();
    return p ? (this.store.history().get(p.key)?.points ?? []) : [];
  });

  protected readonly summary = computed(() => {
    const pts = this.points();
    if (!pts.length) return null;
    const first = pts[0].top;
    const last = pts.at(-1)!.top;
    return { first, last, change: last.w - first.w, since: pts[0].date };
  });

  private drawnKey?: string;

  protected readonly pickerOpen = signal(false);
  protected readonly showAll = signal(false);
  protected readonly newestFirst = computed(() => [...this.points()].reverse());

  constructor() {
    effect(() => this.draw());
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  protected shortMonth(iso: string) {
    return fmtDate(iso).split(' ')[1];
  }

  protected pick(key: string) {
    this.picked.set(key);
    this.pickerOpen.set(false);
    this.showAll.set(false);
    this.filter.set('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private draw() {
    const pts = this.points();
    const peak = this.selected();
    const color = peak ? TYPE_COLOR[peak.type] : '#888888';
    const data = pts.map((p) => ({ x: dayValue(p.date), y: p.top.w }));
    const isPeak = (i: number) => !!peak && pts[i].date === peak.date && pts[i].top === peak.best;
    const tickFont = { family: 'Geist Mono Variable', size: 10 };
    const ink = CHART_INK[this.theme.resolved()];

    if (!this.chart) {
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'line',
        data: { datasets: [{ data: [] }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 650, easing: 'easeOutQuart', delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * 18 : 0) },
          layout: { padding: { top: 8, right: 8 } },
          interaction: { mode: 'nearest', intersect: false },
          scales: {
            x: {
              type: 'linear',
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#7a7a7a', font: { family: 'Geist Variable', size: 11 }, maxTicksLimit: 5, callback: (v) => shortDate(Number(v)) },
            },
            y: {
              grid: { color: '#ffffff0d' },
              border: { display: false },
              grace: '8%',
              ticks: { color: '#7a7a7a', font: tickFont, maxTicksLimit: 5 },
            },
          },
          plugins: {
            tooltip: {
              backgroundColor: '#232323',
              borderColor: '#ffffff14',
              borderWidth: 1,
              cornerRadius: 10,
              padding: 10,
              titleFont: { family: 'Geist Variable', weight: 500 },
              bodyFont: { family: 'Geist Mono Variable', size: 13 },
              displayColors: false,
              callbacks: {
                title: (items) => shortDate(items[0].parsed.x ?? 0),
                label: (item) => {
                  const p = this.points()[item.dataIndex];
                  return p ? `${fmtWeight(p.top.w)} × ${p.top.r}${p.top.note ? ` (${p.top.note})` : ''}` : '';
                },
              },
            },
          },
        },
      });
    }

    const ds = this.chart.data.datasets[0];
    Object.assign(ds, {
      data,
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: pts.map((_, i) => (isPeak(i) ? 5 : 3)),
      pointBackgroundColor: pts.map((_, i) => (isPeak(i) ? ink.peak : color)),
      pointBorderWidth: 0,
    });
    const opts = this.chart.options;
    const [xs_, ys_] = [opts.scales!['x']!, opts.scales!['y']!];
    xs_.ticks!.color = ink.tick;
    ys_.ticks!.color = ink.tick;
    ys_.grid!.color = ink.grid;
    Object.assign(opts.plugins!.tooltip!, { backgroundColor: ink.tip, borderColor: ink.tipBorder, titleColor: ink.tipText, bodyColor: ink.tipText });
    const xs = data.map((d) => d.x);
    const x = this.chart.options.scales!['x']!;
    x.min = xs.length ? Math.min(...xs) - 2 : undefined;
    x.max = xs.length ? Math.max(...xs) + 2 : undefined;
    // A different lift redraws from the baseline so the line rises in; reduced motion skips it.
    if (peak?.key !== this.drawnKey && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.drawnKey = peak?.key;
      this.chart.reset();
    }
    this.chart.update();
  }
}

/** Whole days since epoch, so the x axis is evenly spaced in time. */
function dayValue(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

function shortDate(day: number): string {
  return new Date(day * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
