import { Pipe, PipeTransform } from '@angular/core';
import {
  ANSWER_STATUS_LABEL,
  CANDIDATE_INTERVIEW_STATUS_LABEL,
  JOB_CATEGORY_LABEL,
  ORDER_STATUS_LABEL,
  PACKAGE_TYPE_LABEL,
  PackageType,
  SESSION_STATUS_LABEL,
} from '../core/models';

@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
  }
}

@Pipe({ name: 'sessionStatus' })
export class SessionStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((SESSION_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'answerStatus' })
export class AnswerStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((ANSWER_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'jobCategory' })
export class JobCategoryPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((JOB_CATEGORY_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'interviewStatus' })
export class InterviewStatusPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return v ? ((CANDIDATE_INTERVIEW_STATUS_LABEL as Record<string, string>)[v] ?? v) : '';
  }
}

@Pipe({ name: 'orderStatus' })
export class OrderStatusPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v == null ? '' : (ORDER_STATUS_LABEL[v] ?? String(v));
  }
}

@Pipe({ name: 'packageType' })
export class PackageTypePipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v == null ? '' : (PACKAGE_TYPE_LABEL[v] ?? String(v));
  }
}

/**
 * Mô tả "mua gói này được gì" (F25).
 *
 * Gói định kỳ có `interviewCredits = null` nên nếu hiển thị chung một khuôn với gói mua lẻ
 * thì nó ra "— credit": người mua thấy giá tiền mà không biết mình nhận được gì. Gói định kỳ
 * bán THỜI HẠN chứ không bán số lượt — trong thời hạn đó lượt phỏng vấn được gói tài trợ,
 * không trừ credit ví.
 */
@Pipe({ name: 'packageOffer' })
export class PackageOfferPipe implements PipeTransform {
  transform(
    p: { type: number; interviewCredits?: number | null; durationDays?: number | null } | null | undefined,
  ): string {
    if (!p) return '';
    if (p.type === PackageType.Subscription) {
      return p.durationDays
        ? `Không giới hạn lượt trong ${p.durationDays} ngày`
        : 'Gói định kỳ (chưa cấu hình thời hạn)';
    }
    return p.interviewCredits != null ? `${p.interviewCredits} credit` : '—';
  }
}
