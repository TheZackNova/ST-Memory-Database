/**
 * templateFollowGlobalFlow — "跟随全局（清除聊天覆盖）"的共享 UI 流程（S1-2）。
 *
 * 三个消费口复用同一流程，避免破坏性确认/stale 重试逻辑出现第三份复制：
 * 1. 模板面板的"跟随全局"按钮（useTableTemplatePresets.followGlobalTemplate）
 * 2. 下拉星标设全局默认后的清覆盖确认（useTableTemplatePresets.selectGlobalPreset）
 * 3. 抽屉星标设全局默认后的清覆盖确认（useTablePresetManagement.setAsDefault）
 *
 * 流程：数据恢复守卫 → followGlobalTemplateForCurrentChat_ACU（单次 stale 重试）
 * → 破坏性 blockers 二次确认 → toast 反馈。模块级函数、不持 Vue 状态，
 * dialogStore/toast/signal 由调用方注入。
 */
import {
  followGlobalTemplateForCurrentChat_ACU,
} from '../../service/template/template-preset-service';
import {
  buildChatSheetGuideDataFromTemplateObj_ACU,
  getGlobalTemplateSnapshotForCurrentProfile_ACU,
} from '../../service/template/chat-scope';
import { ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU } from './useTemplateRecoveryGuard';
import type { useDialogStore } from '../stores/dialog-store';
import type { useToastStore } from '../stores/toast-store';

type DialogStore = ReturnType<typeof useDialogStore>;
type ToastStore = ReturnType<typeof useToastStore>;

function isStaleRevisionConflict(result: unknown): boolean {
  return !!result
    && typeof result === 'object'
    && (result as { saved?: unknown }).saved === false
    && /^V2 stale_revision_conflict(?:\b|:)/.test(String((result as { error?: unknown }).error || ''));
}

/**
 * 执行"跟随全局"完整流程。返回 true 表示已成功跟随全局（或本就在跟随），
 * false 表示用户取消、守卫失败或提交失败（失败已 toast）。
 */
export async function runFollowGlobalTemplateFlow_ACU({
  dialogStore,
  toast,
  signal,
}: {
  dialogStore: DialogStore;
  toast: ToastStore;
  signal?: AbortSignal;
}): Promise<boolean> {
  const globalSnapshot = getGlobalTemplateSnapshotForCurrentProfile_ACU();
  const guideData = globalSnapshot?.templateObj
    ? buildChatSheetGuideDataFromTemplateObj_ACU(globalSnapshot.templateObj, { stripSeedRows: false })
    : null;
  const recoveryGuard = await ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU(guideData, 'switch-template');
  if (!recoveryGuard.success) return false;

  const applyWithSingleStaleRetry = async (destructiveChangeConfirmed: boolean): Promise<any> => {
    const firstAttempt = await followGlobalTemplateForCurrentChat_ACU({ destructiveChangeConfirmed, signal });
    if (!isStaleRevisionConflict(firstAttempt)) return firstAttempt;
    if (signal?.aborted) return firstAttempt;
    return followGlobalTemplateForCurrentChat_ACU({ destructiveChangeConfirmed, signal });
  };

  let result = await applyWithSingleStaleRetry(false);
  if (result && result.saved === false && Array.isArray(result.blockers) && result.blockers.length > 0) {
    const destructiveBlockers = result.blockers.filter((blocker: unknown) => (
      typeof blocker === 'string' && (/删除(?:表|列).+需要显式确认/.test(blocker) || /Xóa (?:bảng|cột) .+ cần xác nhận (?:rõ ràng|tường minh)/.test(blocker))
    ));
    if (destructiveBlockers.length > 0) {
      const confirmed = await dialogStore.confirm({
        title: 'Xác nhận thay đổi mẫu có tính phá hủy',
        message: `Việc theo mẫu toàn cục sẽ xóa bảng hoặc cột hiện có:\n${destructiveBlockers.join('\n')}`,
        dangerMessage: 'Sau khi xác nhận sẽ thực hiện theo cam kết nguyên tử V2. Dữ liệu đã xóa chỉ có thể khôi phục qua bản sao lưu trò chuyện hoặc checkpoint.',
        confirmLabel: 'Xác nhận xóa và tiếp tục',
        cancelLabel: 'Hủy',
        confirmVariant: 'danger',
      });
      if (!confirmed) return false;
      result = await applyWithSingleStaleRetry(true);
    }
  }

  if (!result || result.saved !== true) {
    toast.error((result && typeof result.error === 'string' && result.error) || 'Theo mẫu toàn cục thất bại.');
    return false;
  }
  if (result.alreadyFollowing) {
    toast.info('Cuộc trò chuyện hiện tại đã theo mẫu toàn cục, không cần xóa ghi đè.');
    return true;
  }
  const warning = typeof result.postCommitWarning === 'string' ? result.postCommitWarning : '';
  if (warning) {
    toast.warning(warning, { muteable: false, durationMs: 6000 });
  } else {
    toast.success('Đã xóa ghi đè mẫu của cuộc trò chuyện, cuộc trò chuyện hiện tại theo mẫu toàn cục.', { muteable: false });
  }
  return true;
}

/**
 * 星标设全局默认成功后的清覆盖确认（S1-2 成因 c）：
 * 当前聊天存在 chat_override 时询问是否清除；拒绝则保持覆盖（合法状态）。
 * 返回 true 表示已清除覆盖。
 */
export async function promptFollowGlobalAfterSetDefault_ACU({
  dialogStore,
  toast,
  signal,
  newDefaultName,
}: {
  dialogStore: DialogStore;
  toast: ToastStore;
  signal?: AbortSignal;
  newDefaultName: string;
}): Promise<boolean> {
  const confirmed = await dialogStore.confirm({
    title: 'Xóa ghi đè mẫu của cuộc trò chuyện hiện tại?',
    message: `「${newDefaultName || 'Preset mặc định'}」đã được đặt làm mặc định toàn cục, nhưng cuộc trò chuyện hiện tại đang dùng ghi đè mẫu cấp cuộc trò chuyện, mặc định toàn cục mới sẽ không có hiệu lực trong cuộc trò chuyện này.\nXóa ghi đè để cuộc trò chuyện hiện tại theo mẫu toàn cục?`,
    confirmLabel: 'Xóa ghi đè và theo toàn cục',
    cancelLabel: 'Giữ ghi đè của cuộc trò chuyện',
  });
  if (!confirmed) return false;
  return runFollowGlobalTemplateFlow_ACU({ dialogStore, toast, signal });
}
