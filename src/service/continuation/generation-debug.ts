import { logAgentSession_ACU, updateAgentSession_ACU } from './agent/agent-session-log';

const stages_ACU = {
  page_ready: 'Trang đã nhận chỉ dẫn viết', page_discarded: 'Trang không bàn giao chỉ dẫn',
  page_handoff: 'Trang gọi cổng gửi', send_returned: 'Cổng gửi đã trả về',
  bridge_entered: 'Cầu tạo đã nhận chỉ dẫn', host_turn_recording: 'Đăng ký lượt chờ',
  host_turn_recorded: 'Lượt chờ đã đăng ký', input_writing: 'Ghi vào ô nhập của máy chủ',
  input_written: 'Chỉ dẫn đầy đủ đã được ghi', host_call: 'Gọi máy chủ tạo',
  host_dispatched: 'Lệnh gọi máy chủ đã được gửi (chưa có nghĩa là tạo thành công)',
  host_resolved: 'Promise tạo của máy chủ đã kết thúc', host_rejected: 'Lệnh gọi tạo của máy chủ thất bại',
  generation_started: 'Đã nhận và xác nhận GENERATION_STARTED',
  generation_ignored: 'Sự kiện tạo không được lượt này xác nhận', after_commands: 'Đã đến GENERATION_AFTER_COMMANDS',
  plot_start: 'Bắt đầu xử lý cốt truyện trước khi gửi', plot_result: 'Xử lý cốt truyện đã trả về',
  plot_skip: 'Xử lý cốt truyện đã bị bỏ qua', plot_blocked: 'Xử lý cốt truyện chặn việc gửi',
  ended_signal: 'Đã nhận GENERATION_ENDED', body_resolved: 'Đã định vị tầng chính văn tương ứng',
  confirm_start: 'Bắt đầu xác nhận chính văn', confirmed: 'Xác nhận chính văn hoàn tất',
  result_rejected: 'Chính văn không qua xác nhận', binding_failed: 'Gắn chuỗi tạo thất bại',
  stopped: 'Việc tạo lượt này đã dừng', failed: 'Bàn giao bất thường',
  logical_entered: 'Cổng gửi Tầng 0 đã nhận chỉ dẫn', logical_loading: 'Lắp ráp thời gian chạy Tầng 0',
  logical_preparing: 'Chuẩn bị cốt truyện và chính văn Tầng 0', logical_recorded: 'Lượt chờ logic đã đăng ký',
  logical_published: 'Chính văn logic đã phát hành',
} as const;
export type ContinuationDebugStage_ACU = keyof typeof stages_ACU;
export interface ContinuationDebugFields_ACU {
  mode?: 'host' | 'logical'; reason?: string; errorType?: string;
  chars?: number; seq?: number; messageIndex?: number; elapsedMs?: number;
  phase?: string; access?: string;
  expectedLength?: number; assignedLength?: number; actualLength?: number;
  sent?: boolean; claimed?: boolean; quietLike?: boolean; dryRun?: boolean;
  automatic?: boolean; plan?: boolean; recall?: boolean; freshIntent?: boolean;
}
const reasons_ACU = new Set([
  'page_unmounted', 'page_scope_changed', 'action_replaced', 'user_stopped',
  'chat_mismatch', 'snapshot_missing', 'input_unavailable', 'empty_instruction',
  'control_unavailable', 'assignment_mismatch', 'input_changed_value', 'control_replaced', 'exception',
  'host_unavailable', 'api', 'window', 'none', 'event_filtered', 'sequence_conflict',
  'no_reply', 'unsafe', 'not_tail', 'empty_body', 'missing_tags', 'short_body',
  'disabled_or_ineligible', 'already_processed', 'busy', 'planned', 'failed', 'skipped',
  'aborted', 'loop_retry', 'no_match', 'no_input', 'vector_only', 'pending_snapshot',
]);
const errorTypes_ACU = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'AbortError', 'unknown']);
export const CONTINUATION_DEBUG_WAIT_MS_ACU = 15_000;
let nextTrace_ACU = 1;
/** 仅输出白名单错误类别，不读取第三方异常的 message、stack 或载荷。 */
export function continuationDebugErrorType_ACU(error: unknown): string {
  try {
    const name = error instanceof Error ? error.name : '';
    return errorTypes_ACU.has(name) ? name : 'unknown';
  } catch { return 'unknown'; }
}

function safeFields_ACU(fields: ContinuationDebugFields_ACU): string {
  const output: Record<string, string | number | boolean> = {};
  if (fields.mode === 'host' || fields.mode === 'logical') output.mode = fields.mode;
  if (fields.reason !== undefined) output.reason = reasons_ACU.has(fields.reason) ? fields.reason : 'unknown';
  if (fields.errorType !== undefined) output.errorType = errorTypes_ACU.has(fields.errorType) ? fields.errorType : 'unknown';
  if (['lookup', 'assign', 'notify', 'restore', 'verify'].includes(fields.phase ?? '')) output.phase = fields.phase!;
  if (fields.access === 'native' || fields.access === 'jquery') output.access = fields.access;
  for (const key of ['chars', 'seq', 'messageIndex', 'elapsedMs', 'expectedLength', 'assignedLength', 'actualLength'] as const) {
    const value = fields[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) output[key] = Math.floor(value);
  }
  for (const key of ['sent', 'claimed', 'quietLike', 'dryRun', 'automatic', 'plan', 'recall', 'freshIntent'] as const) {
    if (typeof fields[key] === 'boolean') output[key] = fields[key]!;
  }
  return Object.keys(output).length ? ` ${JSON.stringify(output)}` : '';
}

/** 单轮旁路诊断：一个会话卡片，计时仅提示等待，绝不取消、重发或写任务状态。 */
export class ContinuationGenerationDebug_ACU {
  private readonly number = nextTrace_ACU++;
  private readonly startedAt = Date.now();
  private entryId: number | undefined;
  private lines: string[] = [];
  private lastStage: ContinuationDebugStage_ACU = 'page_ready';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private isCurrent: () => boolean = () => true;

  setScope(isCurrent: () => boolean): void { this.isCurrent = isCurrent; }

  step(stage: ContinuationDebugStage_ACU, fields: ContinuationDebugFields_ACU = {}): void {
    if (this.closed) return;
    try {
      if (!this.isCurrent()) { this.cancel(); return; }
      this.lastStage = stage;
      this.lines.push(`+${Math.max(0, Date.now() - this.startedAt)}ms ${stage}: ${stages_ACU[stage]}${safeFields_ACU(fields)}`);
      while (this.lines.join('\n').length > 1500 && this.lines.length > 1) this.lines.shift();
      const patch = { title: `[Viết tiếp DEBUG #${this.number}] ${stages_ACU[stage]}`, detail: this.lines.join('\n'), status: 'running' as const };
      if (this.entryId === undefined) this.entryId = logAgentSession_ACU({ kind: 'handoff', ...patch });
      else updateAgentSession_ACU(this.entryId, patch);
    } catch { /* 诊断不可影响生成 */ }
  }

  watch(isCurrent: () => boolean): void {
    this.clearTimer();
    if (this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        if (this.closed || !this.isCurrent() || !isCurrent() || this.entryId === undefined) return;
        updateAgentSession_ACU(this.entryId, {
          title: `[Viết tiếp DEBUG #${this.number}] Vẫn đang chờ: ${stages_ACU[this.lastStage]}`,
          detail: `${this.lines.join('\n')}\nĐã chờ ít nhất ${CONTINUATION_DEBUG_WAIT_MS_ACU / 1000} giây; chưa quan sát thấy giai đoạn kế tiếp, không có nghĩa là tạo thất bại. Gợi ý này sẽ không tạm dừng hay gửi lại.`,
        });
      } catch { /* 作用域失效或观察失败时保持静默 */ }
    }, CONTINUATION_DEBUG_WAIT_MS_ACU);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  finish(stage: ContinuationDebugStage_ACU, fields: ContinuationDebugFields_ACU = {}, ok = true): void {
    if (this.closed) return;
    this.step(stage, fields);
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    try { if (this.entryId !== undefined) updateAgentSession_ACU(this.entryId, { ok, status: ok ? 'done' : 'failed' }); }
    catch { /* 诊断不可影响结算 */ }
  }

  cancel(): void { this.closed = true; this.clearTimer(); }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}

const traces_ACU = new WeakMap<object, ContinuationGenerationDebug_ACU>();
/** prepared 对象只作内存关联；日志中不输出聊天名、任务 ID 或指导正文。 */
export function getContinuationGenerationDebug_ACU(prepared: object): ContinuationGenerationDebug_ACU {
  let trace = traces_ACU.get(prepared);
  if (!trace) { trace = new ContinuationGenerationDebug_ACU(); traces_ACU.set(prepared, trace); }
  return trace;
}
