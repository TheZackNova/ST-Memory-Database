import { validateCurrentChatTableRecovery_ACU } from '../../service/table/storage-frame-v2-replay';
import { useDialogStore } from '../stores/dialog-store';

export type TemplateRecoveryGuardAction_ACU = 'save-template' | 'switch-template';

export interface TemplateRecoveryGuardResult_ACU {
  success: boolean;
  dataWasReset: boolean;
}

function buildTemplateRecoveryConfirmMessage_ACU(action: TemplateRecoveryGuardAction_ACU, error?: string): string {
  const actionText = action === 'save-template' ? 'lưu thay đổi mẫu của cuộc trò chuyện lần này' : 'chuyển và lưu mẫu của cuộc trò chuyện hiện tại';
  const detail = error ? `\n\nLỗi khôi phục tầng dưới: ${error}` : '';
  return `Không thể xác nhận lịch sử cuộc trò chuyện hiện tại có thể khôi phục an toàn; đã giữ lại dữ liệu cục bộ của mã hiện tại, việc ${actionText} đã bị hủy. Vui lòng chẩn đoán và hoàn tất hội tụ khôi phục trong Quản lý dữ liệu trước, hoặc sao lưu/xuất cuộc trò chuyện rồi mới điều tra lỗi khôi phục.${detail}`;
}

export async function ensureTemplateRecoveryOrDeleteCurrentIsolationData_ACU(
  guideData: Record<string, any> | null,
  action: TemplateRecoveryGuardAction_ACU,
): Promise<TemplateRecoveryGuardResult_ACU> {
  void guideData;
  const validation = await validateCurrentChatTableRecovery_ACU();
  if (validation.success) return { success: true, dataWasReset: false };

  const dialogStore = useDialogStore();
  const requiresConvergence = 'diagnosticCode' in validation && validation.diagnosticCode === 'replay_requires_checkpoint_convergence';
  await dialogStore.confirm({
    title: requiresConvergence ? 'Lịch sử V2 hiện tại cần hội tụ khôi phục' : 'Khôi phục lịch sử cuộc trò chuyện hiện tại thất bại',
    message: buildTemplateRecoveryConfirmMessage_ACU(action, 'error' in validation ? validation.error : undefined),
    dangerMessage: requiresConvergence ? 'Dữ liệu cục bộ của mã hiện tại chưa bị xóa; trước khi hoàn tất hội tụ khôi phục V2 sẽ không lưu hay chuyển mẫu.' : 'Dữ liệu cục bộ của mã hiện tại chưa bị xóa; vui lòng sao lưu hoặc xuất trước rồi mới xử lý.',
    confirmLabel: 'Đã hiểu',
    cancelLabel: 'Đóng',
    confirmVariant: 'primary',
  });
  return { success: false, dataWasReset: false };
}
