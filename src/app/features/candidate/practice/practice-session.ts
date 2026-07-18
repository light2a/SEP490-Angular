import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { PracticeApi } from '../../../core/api/practice.api';
import { NotifyService } from '../../../core/notify.service';
import {
  ADAPTIVE_ACTION_MESSAGE,
  AnswerScore,
  PracticeSession as SessionData,
  QUESTION_KIND_LABEL,
  QuestionResponse,
  UploadAnswerResult,
} from '../../../core/models';
import { AnswerStatusPipe, JobCategoryPipe, SessionStatusPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';
import { AudioRecorder, RecordedAudio } from './audio-recorder';

const POLL_STATUS = ['GeneratingQuestions', 'Scoring', 'Completed'];
const ANSWER_PENDING = ['Uploaded', 'Transcribing', 'Scoring'];

@Component({
  selector: 'app-practice-session',
  imports: [
    RouterLink,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
    AudioRecorder,
    Spinner,
    SessionStatusPipe,
    AnswerStatusPipe,
    JobCategoryPipe,
  ],
  templateUrl: './practice-session.html',
  styleUrl: './practice-session.scss',
})
export class PracticeSession implements OnInit {
  private api = inject(PracticeApi);
  private notify = inject(NotifyService);
  private destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<string>();
  readonly session = signal<SessionData | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly uploadingQid = signal<string | null>(null);
  /** Phỏng vấn THÍCH ỨNG (INT-17): AI báo đã hỏi xong → gợi ý nộp bài. */
  readonly interviewComplete = signal(false);

  private recordings = new Map<string, RecordedAudio>();
  private pollTimer?: ReturnType<typeof setInterval>;

  readonly status = computed(() => this.session()?.status ?? null);
  readonly result = computed(() => this.session()?.result ?? null);
  readonly questions = computed<QuestionResponse[]>(() => this.session()?.questions ?? []);
  readonly answeredCount = computed(() => this.questions().filter((q) => q.answer).length);
  readonly generating = computed(() => this.status() === 'GeneratingQuestions');
  readonly scored = computed(() => this.status() === 'Scored');

  /**
   * Dự phòng cho buổi chấm TRƯỚC 2026-07-18: hồi đó điểm per-answer không mang tên tiêu chí nên
   * breakdown dưới từng câu hiện trơ "Điểm tiêu chí". Tên khi ấy chỉ có ở `result.criteriaScores[]`
   * (cùng response) → tra ngược theo id.
   */
  private readonly criterionNames = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.result()?.criteriaScores ?? []) map.set(c.criterionId, c.name);
    return map;
  });

  /**
   * Ưu tiên `criterionName` BE trả kèm — đúng cả khi buổi CHƯA chấm xong (`result` còn null, nên
   * bảng tra ở trên rỗng). Không có thì mới tra ngược, cuối cùng mới lùi về nhãn chung.
   */
  criterionName(sc: AnswerScore): string {
    return sc.criterionName || this.criterionNames().get(sc.criterionId) || 'Điểm tiêu chí';
  }

  ngOnInit(): void {
    this.load();
    this.destroyRef.onDestroy(() => this.stopPoll());
  }

  private load(): void {
    this.loading.set(true);
    this.api.get(this.sessionId()).subscribe({
      next: (s) => {
        this.session.set(s);
        this.loading.set(false);
        this.syncPoll();
      },
      error: () => this.loading.set(false),
    });
  }

  private refresh(): void {
    this.api.get(this.sessionId()).subscribe({
      next: (s) => {
        this.session.set(s);
        this.syncPoll();
      },
    });
  }

  private shouldPoll(): boolean {
    const s = this.session();
    if (!s) return false;
    if (POLL_STATUS.includes(s.status)) return true;
    return s.questions.some((q) => q.answer && ANSWER_PENDING.includes(q.answer.status));
  }
  private syncPoll(): void {
    if (this.shouldPoll()) {
      if (!this.pollTimer) this.pollTimer = setInterval(() => this.refresh(), 4000);
    } else {
      this.stopPoll();
    }
  }
  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** INT-17: nhãn badge cho câu thích ứng (Seed → null, không hiện badge). */
  kindBadge(q: QuestionResponse): string | null {
    return q.kind && q.kind !== 'Seed' ? QUESTION_KIND_LABEL[q.kind] : null;
  }

  onRecorded(qid: string, rec: RecordedAudio): void {
    this.recordings.set(qid, rec);
  }
  hasRecording(qid: string): boolean {
    return this.recordings.has(qid);
  }

  upload(q: QuestionResponse): void {
    const rec = this.recordings.get(q.id);
    if (!rec) {
      this.notify.warn('Hãy ghi âm câu trả lời trước khi nộp.');
      return;
    }
    this.uploadingQid.set(q.id);
    this.api.uploadAnswer(this.sessionId(), q.id, rec.blob, rec.durationSec).subscribe({
      next: (res: UploadAnswerResult) => {
        this.uploadingQid.set(null);
        this.recordings.delete(q.id);
        // Phỏng vấn THÍCH ỨNG (INT-17): nếu backend trả action → hiển thị ngữ cảnh câu kế; end → gợi ý nộp.
        // `refresh()` (GET session) đã kéo về câu hỏi thích ứng mới (list tự lớn dần) — không cần poll thêm.
        this.interviewComplete.set(res.interviewComplete === true);
        const msg = res.nextAction ? ADAPTIVE_ACTION_MESSAGE[res.nextAction] : 'Đã nộp câu trả lời.';
        this.notify.success(msg);
        this.refresh();
      },
      error: (e) => {
        this.uploadingQid.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Nộp câu trả lời thất bại.');
      },
    });
  }

  submit(): void {
    this.submitting.set(true);
    this.api.submit(this.sessionId()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.notify.success('Đã nộp bài, đang chấm điểm...');
        this.refresh();
      },
      error: (e) => {
        this.submitting.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Nộp bài thất bại (cần ≥ 1 câu trả lời).');
      },
    });
  }
}
