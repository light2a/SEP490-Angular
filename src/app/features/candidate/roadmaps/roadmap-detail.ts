import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { RoadmapApi } from '../../../core/api/roadmap.api';
import { NotifyService } from '../../../core/notify.service';
import { LessonResponse, RoadmapReport, RoadmapResponse } from '../../../core/models';
import { RadarChart, RadarPoint } from '../../../shared/charts/radar-chart';
import { JobCategoryPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-roadmap-detail',
  imports: [
    RouterLink,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatExpansionModule,
    JobCategoryPipe,
    RadarChart,
    Spinner,
  ],
  templateUrl: './roadmap-detail.html',
  styleUrl: './roadmap-detail.scss',
})
export class RoadmapDetail implements OnInit {
  private api = inject(RoadmapApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly id = input.required<string>();
  readonly roadmap = signal<RoadmapResponse | null>(null);
  readonly report = signal<RoadmapReport | null>(null);
  readonly loading = signal(true);
  readonly theories = signal<Record<string, string>>({});
  readonly startingLesson = signal<string | null>(null);

  /**
   * Trục radar = tiêu chí trong `report.radar`, ngưỡng lấy từ `levelEvaluation` khớp theo TÊN
   * (BE trả `levelEvaluation[].criterionName`, không trả criterionId nên tên là khoá nối duy nhất).
   * Tiêu chí không tìm được ngưỡng → `null`; cả bộ không có ngưỡng nào → radar chỉ vẽ 1 đa giác.
   */
  readonly radarPoints = computed<RadarPoint[]>(() => {
    const rep = this.report();
    if (!rep) return [];
    const thresholds = new Map(rep.levelEvaluation.map((le) => [le.criterionName, le.levelThreshold]));
    return rep.radar.map((c) => ({
      name: c.name,
      percentage: c.percentage,
      threshold: thresholds.get(c.name) ?? null,
    }));
  });

  ngOnInit(): void {
    this.api.get(this.id()).subscribe({
      next: (r) => {
        this.roadmap.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.report(this.id()).subscribe({ next: (rep) => this.report.set(rep), error: () => {} });
  }

  loadTheory(lesson: LessonResponse): void {
    if (this.theories()[lesson.id]) return;
    this.api.lesson(this.id(), lesson.id).subscribe({
      next: (l) =>
        this.theories.update((t) => ({ ...t, [lesson.id]: l.theoryContent ?? '(Chưa có nội dung)' })),
      error: () => this.notify.error('Không tải được lý thuyết.'),
    });
  }

  startLesson(lesson: LessonResponse): void {
    this.startingLesson.set(lesson.id);
    this.api.startLesson(this.id(), lesson.id).subscribe({
      next: (session) => {
        this.startingLesson.set(null);
        this.router.navigate(['/candidate/practice', session.id]);
      },
      error: (e: HttpErrorResponse) => {
        this.startingLesson.set(null);
        // 409 → lesson đã bắt đầu, resume session cũ.
        const sid = e?.error?.sessionId as string | undefined;
        if (e.status === 409 && sid) {
          this.router.navigate(['/candidate/practice', sid]);
          return;
        }
        if (e.status !== 402) this.notify.error(extractErrorMessage(e) ?? 'Không bắt đầu được bài luyện.');
      },
    });
  }
}
