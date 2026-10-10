/**
 * presentation/components/plot-planning-ui.ts — 剧情规划 UI 层封装
 * 负责：规划进度任务（含中止）、根据 service 层结果弹通知
 */
import { showToastr_ACU } from '../theme/toast';
import { beginNoticeTask_ACU } from '../../shared/notice-hub';
import { abortController_ACU } from '../../service/runtime/state-manager';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { runOptimizationLogic_ACU } from '../../service/runtime/helpers-remaining';
import { logDebug_ACU } from '../../shared/utils';

let abortActivePlanning_ACU: (() => void) | null = null;

/** 与规划任务的「终止」按钮相同，只中止进行中的这次规划；没有进行中的规划时返回 false。 */
export function abortActivePlotPlanning_ACU(): boolean {
  if (!abortActivePlanning_ACU) return false;
  abortActivePlanning_ACU();
  return true;
}

/**
 * 在 presentation 层调用 runOptimizationLogic_ACU 并处理所有 UI 反馈。
 * 返回值与原 runOptimizationLogic_ACU 兼容：
 *   - string: 规划成功的最终消息
 *   - null: 关闭伪装兼容路径未取得规划结果，沿宿主原请求继续
 *   - { blocked: true, apiRetriesExhausted?: boolean }: 任务失败，停止正文发送
 *   - { skipped: true, reason: string }: 未执行规划，保留不适用与忙碌的区别
 *   - { aborted: true, manual: true, restoreText: string }: 用户中止
 */
export async function runOptimizationLogicWithUI_ACU(userMessage: any, options: any = {}) {
  let manuallyAborted = false;
  const unmaskedCompatibility = options.unmaskedCompatibility === true;
  const abort = () => {
    if (manuallyAborted) return;
    manuallyAborted = true;
    logDebug_ACU('[剧情推进] 用户点击了中止按钮。');
    if (abortController_ACU) {
      abortController_ACU.abort();
      logDebug_ACU('[剧情推进] 用户手动中止了规划任务。');
    }
    task.end({ kind: 'info', text: 'Tác vụ quy hoạch đã bị người dùng hủy.' });
  };
  // 1. 登记带中止按钮的规划任务；中止只作用于本次规划
  const task = beginNoticeTask_ACU('Quy hoạch cốt truyện', {
    detail: 'Đang đọc ký ức trước đây và phân tích, vui lòng chờ...',
    action: { label: 'Dừng', variant: 'danger', run: abort },
  });
  abortActivePlanning_ACU = abort;

  // 2. 调用 service 层纯函数
  let result: Awaited<ReturnType<typeof runOptimizationLogic_ACU>>;
  try {
    result = await runOptimizationLogic_ACU(userMessage, {
      ...options,
      reportWarning: (text: string) => showToastr_ACU('warning', text, 'Đẩy cốt truyện'),
    });
  } catch {
    if (manuallyAborted) {
      return { aborted: true, manual: true, restoreText: String(userMessage || '') };
    }
    showToastr_ACU('error', unmaskedCompatibility ? 'Lỗi xử lý tác vụ cốt truyện, giữ chỉ thị gốc và tiếp tục gửi.' : 'Lỗi xử lý tác vụ cốt truyện, đã dừng gửi nội dung chính.', 'Đẩy cốt truyện');
    if (unmaskedCompatibility) return null;
    return { blocked: true };
  } finally {
    // 3. 结束进度任务
    task.end();
    if (abortActivePlanning_ACU === abort) abortActivePlanning_ACU = null;
  }

  // 4. 根据结果做 UI 通知
  if (manuallyAborted) return { aborted: true, manual: true, restoreText: String(userMessage || '') };
  if (!result) {
    return unmaskedCompatibility ? null : { blocked: true };
  }

  // 跳过的情况（retrying / inflight / disabled）—— 不弹 toast，静默返回
  if (result.skipped) {
    if (unmaskedCompatibility) return result.reason === 'inflight' ? { skipped: true } : null;
    return { skipped: true, reason: result.reason };
  }

  // 用户中止
  if (result.aborted) {
    return { aborted: true, manual: result.manual, restoreText: result.restoreText };
  }

  // 关闭伪装沿 spv8.9.2 返回 null；其余路径保留任务失败阻断。
  if (!result.success) {
    if (unmaskedCompatibility) {
      if (['stage_failure', 'all_failed', 'no_tasks', 'exception', 'api_retries_exhausted'].includes(result.errorType || '')) {
        showToastr_ACU('error', result.errorMessage || 'Quy hoạch cốt truyện thất bại.', 'Quy hoạch thất bại', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
      }
      return null;
    }
    if (result.errorType === 'no_tasks') return { skipped: true, reason: 'no_tasks' };
    const errorMsg = result.errorMessage || 'Tác vụ cốt truyện không trả về kết quả hợp lệ, đã dừng gửi nội dung chính.';
    showToastr_ACU('error', errorMsg, 'Quy hoạch thất bại', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    return { blocked: true, apiRetriesExhausted: result.apiRetriesExhausted === true };
  }

  // 成功：弹结果 toast
  if (result.aggregatedTagNames && result.aggregatedTagNames.length > 0) {
    showToastr_ACU('info', `Đã gộp thành công nội dung các thẻ [${result.aggregatedTagNames.join(', ')}] và chèn vào.`, 'Trích thẻ');
  }

  if (result.hasPartialFailure) {
    if (unmaskedCompatibility) {
      showToastr_ACU('warning', `Quy hoạch cốt truyện hoàn tất, ${result.successCount}/${result.enabledTaskCount} tác vụ thành công.`, 'Thành công một phần', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLAN_OK });
      return result.finalMessage;
    }
    showToastr_ACU('error', 'Không phải mọi tác vụ cốt truyện đều đạt nghiệm thu, đã dừng gửi nội dung chính.', 'Quy hoạch thất bại');
    return { blocked: true };
  } else {
    showToastr_ACU(
      'success',
      `Quy hoạch cốt truyện thành công, hoàn tất ${result.successCount} tác vụ.`,
      'Quy hoạch thành công',
      { acuToastCategory: ACU_TOAST_CATEGORY_ACU.PLAN_OK },
    );
  }

  return result.finalMessage;
}
