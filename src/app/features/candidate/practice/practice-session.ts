import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
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
import { InterviewAvatar } from '../../../shared/avatar/interview-avatar';
import { RadarChart, RadarPoint } from '../../../shared/charts/radar-chart';
import { AnswerStatusPipe, JobCategoryPipe, SessionStatusPipe } from '../../../shared/pipes';
import { createCountdown } from '../../../shared/timing/countdown';
import { Spinner } from '../../../shared/ui/spinner';
import { AudioRecorder, RecordedAudio } from './audio-recorder';
import { DeliveryMetricsPanel } from './delivery-metrics';

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
    DeliveryMetricsPanel,
    InterviewAvatar,
    RadarChart,
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

  /** Avatar đang đọc → khoá MỌI nút ghi âm trên trang (không chỉ câu đang đọc). */
  readonly avatarSpeaking = signal(false);
  /** Có mic nào đang mở không → khoá ngược lại phía avatar (cấm nghe lại giữa lúc ghi). */
  readonly recordingActive = signal(false);
  private avatarRef = viewChild(InterviewAvatar);

  /**
   * F2 — câu đã hết giờ mà ứng viên chưa ghi gì: khoá vĩnh viễn trong phiên xem này.
   *
   * State phía CLIENT, nên F5/reload là đồng hồ chạy lại. CHẤP NHẬN CÓ CHỦ Ý: B2C là *luyện tập*,
   * không phải thi — chống reload là bài toán của B2B (đã có proctoring). Ép chặt hơn ở đây sẽ phải
   * trả giá bằng state server cho một luồng mà gian lận không có ý nghĩa gì.
   */
  private readonly lockedIds = signal<ReadonlySet<string>>(new Set());
  isLocked(qid: string): boolean {
    return this.lockedIds().has(qid);
  }

  /**
   * Câu avatar sẽ đọc + câu đang tính giờ: câu chưa trả lời đầu tiên CHƯA BỊ KHOÁ.
   *
   * ⚠ Điều kiện `!isLocked` là bắt buộc, không phải cho đẹp: câu bị khoá vĩnh viễn không có answer,
   * nên nếu chỉ lọc `!q.answer` thì con trỏ đứng mãi ở câu vừa khoá ⇒ đồng hồ không bao giờ sang câu
   * kế và cả buổi luyện chết đứng sau câu đầu tiên hết giờ.
   */
  readonly currentQuestionId = computed(() => {
    if (this.generating() || this.scored()) return null;
    const locked = this.lockedIds();
    return this.questions().find((q) => !q.answer && !locked.has(q.id))?.id ?? null;
  });

  /** F2 — đồng hồ đếm ngược của câu hiện tại; đứng yên khi avatar đang đọc đề. */
  readonly countdown = createCountdown({
    paused: () => this.avatarSpeaking(),
    onExpire: () => this.onTimeUp(),
  });

  /**
   * B2C render MỘT recorder cho MỖI câu chưa trả lời (khác B2B chỉ có 1) → `viewChild` số ít sẽ luôn
   * trả cái ĐẦU TIÊN trong DOM, trùng câu hiện tại chỉ do may mắn thứ tự. Phải lấy theo index.
   */
  private recorders = viewChildren(AudioRecorder);
  private currentRecorder(): AudioRecorder | undefined {
    const qid = this.currentQuestionId();
    if (!qid) return undefined;
    const idx = this.questions()
      .filter((q) => !q.answer)
      .findIndex((q) => q.id === qid);
    return idx >= 0 ? this.recorders()[idx] : undefined;
  }

  /** Câu đang chờ bản ghi để tự nộp (hết giờ lúc đang ghi → `stop()` bất đồng bộ). */
  private autoUploadQid: string | null = null;
  /** Câu mà đồng hồ đã được khởi động — tránh poll 4s reset đồng hồ về đầu. */
  private timerStartedFor: string | null = null;

  constructor() {
    effect(() => {
      const qid = this.currentQuestionId();
      // `refresh()` chạy mỗi 4s → effect này chạy lại liên tục. Chỉ (re)start khi ĐỔI câu, nếu không
      // đồng hồ bị đặt lại về đầu mỗi vòng poll và không bao giờ hết giờ.
      if (qid === this.timerStartedFor) return;
      this.timerStartedFor = qid;

      if (!qid) {
        this.countdown.stop();
        return;
      }
      const q = this.questions().find((x) => x.id === qid);
      this.countdown.start(q?.timeLimitSec ?? 0);
    });
  }

  /**
   * Hết giờ. Đang ghi → `stop()` rồi để `onRecorded` nộp (MediaRecorder.stop() BẤT ĐỒNG BỘ, blob chưa
   * có ở đây nên upload thẳng sẽ nộp rỗng). Đã có bản ghi → nộp luôn. Chưa ghi gì → khoá câu.
   */
  private onTimeUp(): void {
    const qid = this.currentQuestionId();
    if (!qid) return;

    const rec = this.currentRecorder();
    if (rec?.recording()) {
      this.autoUploadQid = qid;
      rec.stop();
      return;
    }

    const q = this.questions().find((x) => x.id === qid);
    if (q && this.recordings.has(qid)) {
      this.upload(q);
      return;
    }

    this.lockedIds.update((s) => new Set(s).add(qid));
    this.notify.warn('Hết giờ — câu này đã bị khoá, mời bạn sang câu tiếp theo.');
  }

  /**
   * F14 (FR08) — dữ liệu radar: điểm của người luyện + (nếu có) mốc đối chiếu chồng lên.
   *
   * Ghép mốc theo `criterionId` chứ không theo thứ tự mảng — hai mảng do BE dựng độc lập, dựa
   * vào vị trí là kiểu lỗi im lặng (mốc gắn nhầm trục, biểu đồ vẫn vẽ đẹp).
   */
  readonly radarPoints = computed<RadarPoint[]>(() => {
    const r = this.result();
    if (!r) return [];
    const targets = new Map(
      (r.benchmark?.criteria ?? []).map((b) => [b.criterionId, b.targetPercentage]),
    );
    return r.criteriaScores.map((c) => ({
      name: c.name,
      percentage: c.percentage,
      threshold: targets.get(c.criterionId) ?? null,
    }));
  });

  /**
   * Radar dưới 3 trục là hình thoi/đường thẳng — vô nghĩa về mặt đọc hiểu. Ít tiêu chí thì các
   * thanh ngang bên dưới đã nói đủ, khỏi vẽ.
   */
  readonly showRadar = computed(() => this.radarPoints().length >= 3);

  /** Mốc của 1 tiêu chí (hiện cạnh thanh ngang, cho cả ca radar không vẽ). */
  targetOf(criterionId: string): number | null {
    const b = this.result()?.benchmark;
    return b?.criteria.find((x) => x.criterionId === criterionId)?.targetPercentage ?? null;
  }

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
    this.destroyRef.onDestroy(() => {
      this.stopPoll();
      this.countdown.stop();
    });
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
    // Hết giờ lúc đang ghi: đây mới là thời điểm blob thực sự sẵn sàng để nộp.
    if (this.autoUploadQid === qid) {
      this.autoUploadQid = null;
      const q = this.questions().find((x) => x.id === qid);
      if (q) this.upload(q);
    }
  }

  /**
   * Ứng viên bấm ghi âm → tắt tiếng avatar NGAY, đồng bộ, trước khi mic kịp mở.
   * Nút đã bị `[disabled]` lúc avatar nói, đây là chốt thứ hai cho mọi đường gọi khác.
   */
  onRecorderStart(): void {
    this.avatarRef()?.stopSpeaking();
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
        const msg = res.nextAction
          ? ADAPTIVE_ACTION_MESSAGE[res.nextAction]
          : 'Đã nộp câu trả lời.';
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
