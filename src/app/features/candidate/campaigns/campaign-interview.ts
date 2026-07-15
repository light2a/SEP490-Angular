import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { PracticeApi } from '../../../core/api/practice.api';
import { CampaignQuestion, StartInterviewResult } from '../../../core/models';
import { NotifyService } from '../../../core/notify.service';
import { AudioRecorder, RecordedAudio } from '../practice/audio-recorder';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Trang thi phỏng vấn B2B: hỏi từng câu một, ghi âm (tái dùng AudioRecorder), đếm ngược
 * theo `timeLimitSec` từng câu, upload qua endpoint Interview chung (PracticeApi), nộp bài cuối cùng.
 *
 * Hợp đồng cho agent proctoring (SEC):
 *  - selector `app-campaign-interview`, input route-bound `campaignId`.
 *  - `faceEnrollRequired` (signal public) — từ response POST /campaign/{id}/start.
 *  - `sessionId` (computed public) — dùng cho CampaignApi.reportFlag/faceEnroll/faceCheck.
 */
@Component({
  selector: 'app-campaign-interview',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressBarModule,
    AudioRecorder,
    Spinner,
  ],
  templateUrl: './campaign-interview.html',
  styleUrl: './campaign-interview.scss',
})
export class CampaignInterview implements OnInit {
  private campaignApi = inject(CampaignApi);
  private practiceApi = inject(PracticeApi);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly campaignId = input.required<string>();

  /** Kết quả start (session + câu hỏi). */
  readonly session = signal<StartInterviewResult | null>(null);
  /** Cờ cho agent proctoring: campaign yêu cầu face-enroll trước khi thi. */
  readonly faceEnrollRequired = signal(false);
  readonly sessionId = computed(() => this.session()?.sessionId ?? null);

  readonly loading = signal(true);
  /** Lỗi chặn cả trang (402 org hết credit / 409 completed-closed / lỗi khác lúc start). */
  readonly fatalError = signal<string | null>(null);

  readonly questions = computed<CampaignQuestion[]>(() =>
    [...(this.session()?.questions ?? [])].sort((a, b) => a.orderNo - b.orderNo),
  );
  readonly currentIndex = signal(0);
  readonly current = computed<CampaignQuestion | null>(
    () => this.questions()[this.currentIndex()] ?? null,
  );
  /** Hết câu → màn tổng kết trước khi nộp. */
  readonly reviewStage = computed(
    () => !this.loading() && !!this.session() && this.currentIndex() >= this.questions().length,
  );

  readonly answeredIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly answeredCount = computed(() => this.answeredIds().size);
  readonly hasRecording = signal(false);
  readonly uploading = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);

  /** Đếm ngược của câu hiện tại (giây). */
  readonly remainingSec = signal(0);
  readonly timeUp = signal(false);
  readonly timePct = computed(() => {
    const limit = this.current()?.timeLimitSec ?? 0;
    return limit > 0 ? Math.max(0, Math.round((this.remainingSec() / limit) * 100)) : 0;
  });

  private recorderRef = viewChild(AudioRecorder);
  private pendingRecording: RecordedAudio | null = null;
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.clearTimer());
    // Detail đã gọi start và truyền kết quả qua navigation state → khỏi gọi lại.
    // Reload/deep-link: state mất → tự gọi start (create-or-get, idempotent phía backend).
    const pre = (history.state as { start?: StartInterviewResult } | null)?.start;
    if (pre && pre.campaignId === this.campaignId()) {
      this.hydrate(pre);
    } else {
      this.campaignApi.start(this.campaignId()).subscribe({
        next: (res) => this.hydrate(res),
        error: (e: HttpErrorResponse) => {
          this.loading.set(false);
          if (e.status === 402) {
            this.fatalError.set(
              'Tổ chức tuyển dụng đã hết lượt phỏng vấn (credit). Vui lòng liên hệ nhà tuyển dụng.',
            );
          } else if (e.status === 409) {
            this.fatalError.set(
              extractErrorMessage(e) ??
                'Bạn đã hoàn thành phỏng vấn hoặc chiến dịch đã đóng.',
            );
          } else {
            this.fatalError.set(
              extractErrorMessage(e) ?? 'Không bắt đầu được phỏng vấn. Vui lòng thử lại sau.',
            );
          }
        },
      });
    }
  }

  /** Nạp session + đồng bộ câu đã trả lời (resume D3) từ GET session Interview. */
  private hydrate(res: StartInterviewResult): void {
    this.session.set(res);
    this.faceEnrollRequired.set(res.faceEnrollRequired);
    this.practiceApi.get(res.sessionId).subscribe({
      next: (s) => {
        if (['Completed', 'Scoring', 'Scored'].includes(s.status)) {
          this.submitted.set(true);
          this.loading.set(false);
          return;
        }
        const answered = new Set(s.questions.filter((q) => q.answer).map((q) => q.id));
        this.answeredIds.set(answered);
        const firstOpen = this.questions().findIndex((q) => !answered.has(q.id));
        this.currentIndex.set(firstOpen === -1 ? this.questions().length : firstOpen);
        this.loading.set(false);
        this.startTimer();
      },
      error: () => {
        // Best-effort: không đọc được trạng thái → thi từ câu đầu.
        this.loading.set(false);
        this.startTimer();
      },
    });
  }

  // ---- đếm ngược từng câu ----
  private startTimer(): void {
    this.clearTimer();
    const q = this.current();
    if (!q) return;
    this.timeUp.set(false);
    this.remainingSec.set(q.timeLimitSec);
    if (q.timeLimitSec <= 0) return; // không giới hạn
    this.timer = setInterval(() => {
      const left = this.remainingSec() - 1;
      this.remainingSec.set(Math.max(0, left));
      if (left <= 0) {
        this.clearTimer();
        this.onTimeUp();
      }
    }, 1000);
  }
  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Hết giờ: đang ghi → dừng (onRecorded sẽ tự nộp); có bản ghi → nộp; chưa có gì → bỏ qua câu. */
  private onTimeUp(): void {
    this.timeUp.set(true);
    const rec = this.recorderRef();
    if (rec?.recording()) {
      rec.stop();
      return; // onRecorded → auto upload vì timeUp
    }
    if (this.pendingRecording) {
      this.upload();
    } else {
      this.notify.warn('Hết giờ — câu hỏi được bỏ qua.');
      this.advance();
    }
  }

  onRecorded(rec: RecordedAudio): void {
    this.pendingRecording = rec;
    this.hasRecording.set(true);
    if (this.timeUp()) this.upload();
  }

  upload(): void {
    const q = this.current();
    const sid = this.sessionId();
    const rec = this.pendingRecording;
    if (!q || !sid || !rec) {
      this.notify.warn('Hãy ghi âm câu trả lời trước khi nộp.');
      return;
    }
    this.uploading.set(true);
    this.practiceApi.uploadAnswer(sid, q.id, rec.blob, rec.durationSec).subscribe({
      next: () => {
        this.uploading.set(false);
        this.answeredIds.update((set) => new Set(set).add(q.id));
        this.notify.success('Đã nộp câu trả lời.');
        this.advance();
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Nộp câu trả lời thất bại. Thử lại.');
      },
    });
  }

  skip(): void {
    this.advance();
  }

  private advance(): void {
    this.pendingRecording = null;
    this.hasRecording.set(false);
    this.recorderRef()?.reset();
    this.timeUp.set(false);
    this.currentIndex.update((i) => i + 1);
    if (this.currentIndex() < this.questions().length) {
      this.startTimer();
    } else {
      this.clearTimer();
    }
  }

  submit(): void {
    const sid = this.sessionId();
    if (!sid) return;
    this.submitting.set(true);
    this.practiceApi.submit(sid).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.notify.error(
          extractErrorMessage(e) ?? 'Nộp bài thất bại (cần trả lời ít nhất 1 câu).',
        );
      },
    });
  }
}
