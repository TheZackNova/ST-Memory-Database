// update-process.ts — 表格更新 UI 壳（presentation 层：负责 UI 交互）
// service 层只返回结果，presentation 层根据返回值自行决定 UI 操作。

import { _set_isAutoUpdatingCard_ACU, _set_wasStoppedByUser_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { getChatArray_ACU } from '../../service/chat/chat-service';
import { getSelectedManualTableKeys_ACU } from '../../service/settings/settings-readers';
import { showToastr_ACU } from '../theme/toast';
import { showCustomConfirm_ACU } from '../theme/custom-confirm';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
// re-export 从 service 层搬迁的业务逻辑函数，保持外部调用方兼容
export { saveCurrentDataForTable_ACU } from '../../service/chat/chat-service';
import { $statusMessageSpan_ACU } from '../state/ui-refs';
import { topLevelWindow_ACU } from '../../shared/env';
import { beginNoticeTask_ACU, type NoticeTaskHandle_ACU } from '../../shared/notice-hub';
import { resetManualUpdateButton_ACU, shouldShowVectorMemoryManualUpdateWarning_ACU, syncManualUpdateButtonAvailability_ACU } from '../components/status-display';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { collectManualExtraHint_ACU } from './settings-ui-sync';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../components/pipeline-ui-helpers';
import { abortAllActiveRequests_ACU } from '../../service/runtime/state-manager';
import {
    processUpdatesBatch_ACU,
    executeCardUpdateCore_ACU,
    orchestrateManualUpdate_ACU,
    type CardUpdateResult,
    type BatchUpdateResult,
    type CardUpdateProgressEvent,
    type BatchUpdateProgressContext,
} from '../../service/table/update-orchestrator';
import { collectV2CheckpointFloorsFromChat_ACU } from '../../service/table/table-history';

// ============================================================
// UI 辅助函数
// ============================================================

function updateStatusText(text: string, isSilentMode: boolean) {
    if (!isSilentMode && $statusMessageSpan_ACU) $statusMessageSpan_ACU.text(text);
}

function notifyTableFillStart() {
    try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableFillStart(); } catch (_) {}
}

function notifyTableUpdate() {
    try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate(); } catch (_) {}
}

function updateStatusDisplay() {
    if (typeof updateCardUpdateStatusDisplay_ACU === 'function') updateCardUpdateStatusDisplay_ACU();
}

function buildBatchProgressLabel(event: Partial<CardUpdateProgressEvent>): string {
    if (Number.isFinite(event.currentBatch) && Number.isFinite(event.totalBatches)) {
        return `Lô ${event.currentBatch}/${event.totalBatches}`;
    }
    return 'Lô hiện tại';
}

function formatLegacyCheckpointReasonLabel_ACU(reason?: string): string {
    switch (reason) {
        case 'init':
            return 'Mốc ban đầu';
        case 'migration':
            return 'Mốc di chuyển';
        case 'compaction':
            return 'Mốc ranh giới giữ lại';
        case 'manual':
            return 'Mốc thủ công cũ';
        case 'periodic':
            return 'Mốc định kỳ cũ';
        default:
            return reason ? `Mốc cũ:${reason}` : 'Mốc cũ';
    }
}

function formatLegacyAiFloorRange_ACU(startAiFloor: number, endAiFloor: number): string {
    return startAiFloor === endAiFloor ? `Tầng AI ${startAiFloor}` : `Tầng AI ${startAiFloor}~${endAiFloor}`;
}

function buildLegacySelectedSheetSummary_ACU(targetKeys: string[]): string {
    const tables = currentJsonTableData_ACU && typeof currentJsonTableData_ACU === 'object' ? currentJsonTableData_ACU as Record<string, any> : null;
    return targetKeys.map(key => `${String(tables?.[key]?.name || key)} (${key})`).join(', ');
}

function buildLegacyCheckpointFloorsLabel_ACU(): string {
    try {
        const checkpoints = collectV2CheckpointFloorsFromChat_ACU(getChatArray_ACU(), getCurrentIsolationKey_ACU());
        return checkpoints.length > 0
            ? checkpoints.map(item => `Tầng AI ${item.aiFloor} (${formatLegacyCheckpointReasonLabel_ACU(item.reason)})`).join(', ')
            : 'Nhãn cô lập hiện tại chưa có full checkpoint';
    } catch {
        return 'Nhãn cô lập hiện tại chưa có full checkpoint';
    }
}

function buildLegacyManualRefillRangeLabel_ACU(): string {
    try {
        const chat = getChatArray_ACU();
        if (!Array.isArray(chat) || chat.length === 0) return 'Chưa có tầng AI nào để điền lại';
        const aiItems = chat
            .map((msg: any, index: number) => msg && !msg.is_user ? { index, aiFloor: 0 } : null)
            .filter((item): item is { index: number; aiFloor: number } => item !== null);
        aiItems.forEach((item, index) => { item.aiFloor = index + 1; });
        const skip = Number.isFinite(Number(settings_ACU.skipUpdateFloors)) ? Math.max(0, Math.floor(Number(settings_ACU.skipUpdateFloors))) : 0;
        const manualDepth = Number.isFinite(Number(settings_ACU.manualUpdateContextDepth)) && Number(settings_ACU.manualUpdateContextDepth) > 0 ? Math.floor(Number(settings_ACU.manualUpdateContextDepth)) : aiItems.length;
        const effectiveAiItems = skip > 0 ? aiItems.slice(0, -skip) : aiItems.slice();
        const contextItems = manualDepth > 0 ? effectiveAiItems.slice(-manualDepth) : effectiveAiItems;
        if (!contextItems.length) return 'Chưa có tầng AI nào để điền lại';
        return formatLegacyAiFloorRange_ACU(contextItems[0].aiFloor, contextItems[contextItems.length - 1].aiFloor);
    } catch {
        return 'Chưa có tầng AI nào để điền lại';
    }
}

function buildProgressMessage(event: CardUpdateProgressEvent): string {
    const batchLabel = buildBatchProgressLabel(event);
    switch (event.phase) {
        case 'preparing':
            return `${batchLabel}: Đang chuẩn bị đầu vào AI...`;
        case 'calling_ai':
            return `${batchLabel}: Gọi AI cập nhật tăng dần lần ${event.attempt || 1}/${event.maxRetries || 1}...`;
        case 'parsing':
            return `${batchLabel}: Đang phân tích và áp dụng cập nhật do AI trả về...`;
        case 'saving':
            return `${batchLabel}: Đang lưu cơ sở dữ liệu đã cập nhật vào lịch sử trò chuyện...`;
        case 'chunk_done':
            return `${batchLabel}: Xử lý theo khối thành công...`;
        case 'complete':
            return `${batchLabel}: Cập nhật tăng dần cơ sở dữ liệu thành công!`;
        case 'retry':
            return `${batchLabel}: Lần thử ${event.attempt || 1}/${event.maxRetries || 1} thất bại, thử lại sau 5 giây...${event.message ? ` (${event.message})` : ''}`;
        case 'error':
            return `${batchLabel}: Lỗi: cập nhật thất bại.`;
        default:
            return `${batchLabel}: Đang xử lý...`;
    }
}

/**
 * 登记可停止的填表任务；终止请求后由执行器收尾，不提前释放填表运行状态。
 */
function beginTableFillTask(feature: string, detail: string, abortController?: AbortController): NoticeTaskHandle_ACU {
    const task: NoticeTaskHandle_ACU = beginNoticeTask_ACU(feature, {
        detail,
        action: {
            label: 'Dừng',
            variant: 'danger',
            run: () => {
                syncManualUpdateButtonAvailability_ACU();
                _set_wasStoppedByUser_ACU(true);
                abortController?.abort();
                abortAllActiveRequests_ACU();
                updateStatusText('Tác vụ điền bảng đã bị dừng, đang dừng tác vụ hiện tại và các lô tiếp theo...', false);
                task.update('Tác vụ điền bảng đã bị dừng, đang dừng tác vụ hiện tại và các lô tiếp theo...', { action: null });
                showToastr_ACU('warning', 'Người dùng đã dừng tác vụ điền bảng, tác vụ hiện tại và các lô tiếp theo sẽ dừng ngay.');
            },
        },
    });
    return task;
}

/**
 * 根据 service 层返回的进度事件更新 UI
 * presentation 层自己决定"怎么展示"
 */
function handleProgressEvent(event: CardUpdateProgressEvent, isSilentMode: boolean, progressTask?: NoticeTaskHandle_ACU | null) {
    if (isSilentMode) return;
    const message = buildProgressMessage(event);
    updateStatusText(message, false);
    progressTask?.update(message);

    switch (event.phase) {
        case 'complete':
            updateStatusDisplay();
            notifyTableUpdate();
            break;
        case 'retry':
            showToastr_ACU('warning', message, { timeOut: 5000 });
            break;
        default:
            break;
    }
}

// ============================================================
// Presentation 层 UI 壳函数
// ============================================================

/**
 * 执行单次卡片更新：presentation 层负责 toast/停止按钮/状态文本
 * service 层只返回 CardUpdateResult
 */
export async function proceedWithCardUpdate_ACU(
    messagesToUse: any[],
    batchToastMessage = 'Đang điền bảng, vui lòng chờ...',
    saveTargetIndex = -1,
    isImportMode = false,
    updateMode = 'standard',
    isSilentMode = false,
    targetSheetKeys: string[] | null = null,
    requestOptions: Record<string, any> | null = null,
    progressContext: BatchUpdateProgressContext | null = null,
    showFinalErrorToast = true,
    executionOptions: { abortController?: AbortController; onProgress?: (event: CardUpdateProgressEvent) => void; planManaged?: boolean } = {},
): Promise<CardUpdateResult> {
    logDebug_ACU(`[更新流程] proceedWithCardUpdate: 消息数=${messagesToUse.length}, 模式=${updateMode}, 静默=${isSilentMode}, 目标表=${targetSheetKeys?.join(',') || '全部'}`);
    const localAbortController = executionOptions.abortController ?? new AbortController();
    let progressTask: NoticeTaskHandle_ACU | null = null;

    try {
        // 调用 service 层，传入进度回调（只接收纯数据事件）
        const result = await executeCardUpdateCore_ACU(
            messagesToUse,
            saveTargetIndex,
            isImportMode,
            updateMode,
            isSilentMode,
            targetSheetKeys,
            requestOptions,
            localAbortController,
            progressContext,
            (event) => {
                executionOptions.onProgress?.(event);
                // 仅准备输入或合法无工作返回不创建提示框。
                if (!executionOptions.planManaged && !isSilentMode && !progressTask && event.phase === 'calling_ai') {
                    notifyTableFillStart();
                    const initialMessage = progressContext
                        ? `${buildBatchProgressLabel(progressContext)}: ${batchToastMessage || 'Đang điền bảng, vui lòng chờ...'}`
                        : (batchToastMessage || 'Đang điền bảng, vui lòng chờ...');
                    progressTask = beginTableFillTask(isImportMode ? 'Nhập từ bên ngoài' : 'Điền bảng', initialMessage, localAbortController);
                }
                if (!executionOptions.planManaged) handleProgressEvent(event, isSilentMode, progressTask);
            }
        );

        // UI：根据返回值决定后续 UI 操作
        if (result.success && !isSilentMode && progressTask) {
            setTimeout(() => {
                notifyTableUpdate();
            }, 250);
        } else if (!result.success && !result.aborted && !isSilentMode && showFinalErrorToast) {
            showToastr_ACU('error', `Cập nhật thất bại: ${result.error || 'Lỗi không xác định'}`);
            updateStatusText('Lỗi: cập nhật thất bại.', false);
        }

        return result;
    } finally {
        // UI：结束进度任务
        progressTask?.end();
    }
}

/**
 * 批处理更新：presentation 层调用 service 层，根据返回值显示 toast
 */
export async function processUpdates_ACU(indicesToUpdate: number[], mode = 'auto', options: any = {}): Promise<BatchUpdateResult> {
    const result = await processUpdatesBatch_ACU(
        indicesToUpdate,
        mode,
        options,
        // 透传批处理控制器；请求返回后仍能取消当前任务及后续批次。
        async (
            messagesToUse: any[],
            saveTargetIndex: number,
            updateMode: string,
            isSilentMode: boolean,
            targetSheetKeys: string[] | null,
            requestOptions: Record<string, any> | null,
            progressContext: BatchUpdateProgressContext,
            abortController?: AbortController,
        ): Promise<CardUpdateResult> => {
            return proceedWithCardUpdate_ACU(messagesToUse, '', saveTargetIndex, false, updateMode, isSilentMode, targetSheetKeys, requestOptions, progressContext, false, {
                abortController, onProgress: options.onProgress, planManaged: options.planManaged,
            });
        }
    );

    // UI：根据返回值显示错误 toast
    if (!result.success && !result.aborted && result.error) {
        showToastr_ACU('error', result.error);
    }

    return result;
}

/**
 * 手动更新：presentation 层负责收集 UI 输入、显示确认框、显示 toast、重置按钮
 * service 层只返回 ManualUpdateResult
 */
export async function handleManualUpdate_ACU(options: { skipConfirm?: boolean } = {}): Promise<boolean> {
    logDebug_ACU('[更新流程] handleManualUpdate: 开始手动更新');
    let manualProgressTask: NoticeTaskHandle_ACU | null = null;
    try {
        if (shouldShowVectorMemoryManualUpdateWarning_ACU()) {
            syncManualUpdateButtonAvailability_ACU();
            showToastr_ACU('warning', 'Không nên cập nhật bảng thủ công khi tính năng vector đang bật; lần này vẫn tiếp tục thực hiện.', {
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE,
            });
        }
 
        // UI：收集手动额外提示
        collectManualExtraHint_ACU();

        // 从持久化设置读取表格选择，不能依赖已移除的 V1 checkbox DOM。
        const targetKeys = getSelectedManualTableKeys_ACU();

        // [前置校验] 在弹出确认框之前，先做基本有效性检查
        // 避免用户确认后又因为"没选表格"或"聊天为空"而报错
        if (!targetKeys || targetKeys.length === 0) {
            showToastr_ACU('warning', 'Chưa chọn bảng cần cập nhật.');
            return false;
        }

        const selectedSheetSummary = buildLegacySelectedSheetSummary_ACU(targetKeys);
        const checkpointFloorsLabel = buildLegacyCheckpointFloorsLabel_ACU();
        const manualRefillRangeLabel = buildLegacyManualRefillRangeLabel_ACU();
        // 弹出确认框：手动填表会先删除范围内选中表的 checkpoint 与增量，再重新填写
        // 外部 API 调用由调用方负责确认（skipConfirm），不在宿主页面弹出确认遮罩。
        const confirmed = options.skipConfirm === true || await showCustomConfirm_ACU(
            'Xác nhận điền bảng thủ công',
            `Sắp thực hiện điền bảng thủ công.\n\nfull checkpoint hiện tại: ${checkpointFloorsLabel}\nPhạm vi điền lại lần này: ${manualRefillRangeLabel}\nBảng đã chọn: ${selectedSheetSummary}\n\n` +
            'Thao tác rủi ro cao: hệ thống sẽ xóa checkpoint và nhật ký tăng dần V2 của các bảng đã chọn trong phạm vi điền lại, rồi dùng trạng thái đã dọn làm nền để điền lại, cuối cùng ghi checkpoint đơn bảng mới.\n' +
            'Nếu checkpoint bị xóa là mốc dữ liệu duy nhất của các bảng này, dữ liệu bảng của các tầng trước đó sẽ không thể khôi phục.\n' +
            'checkpoint ranh giới giữ lại được tính theo tầng phản hồi AI, sẽ tự động cuộn để tạo sau khi đạt cửa sổ giữ lại và đệm 20 tầng AI.\n' +
            'checkpoint ngoài phạm vi, dữ liệu bảng của lịch sử trò chuyện ngoài phạm vi và các bảng không được chọn sẽ không bị xóa. Khi thực hiện thất bại hoặc bị dừng sẽ khôi phục về trạng thái trước thao tác này.',
            { confirmLabel: 'Xác nhận và tiếp tục', cancelLabel: 'Hủy' }
        );

        if (!confirmed) {
            logDebug_ACU('[更新流程] 用户取消了手动填表确认框');
            showToastr_ACU('info', 'Đã hủy điền bảng thủ công.');
            return false;
        }

        // 调用 service 层，启用事务式手动重填（兼容沿用 clearBeforeUpdate 参数名）
        _set_wasStoppedByUser_ACU(false);
        notifyTableFillStart();
        manualProgressTask = beginTableFillTask('Điền bảng thủ công', 'Bắt đầu điền bảng thủ công.');

        const result = await orchestrateManualUpdate_ACU(
            targetKeys,
            // processBatch 回调保留给兼容路径；当前手动填表主路径由 service grouped helper 执行。
            async (indices, batchMode, batchOptions) => {
                return processUpdates_ACU(indices, batchMode, batchOptions);
            },
            // refreshData 回调（纯数据刷新 + UI 刷新）
            async () => {
                await refreshMergedDataAndNotifyWithUI_ACU();
            },
            // [新增] 传入用户确认后的预清空选项
            {
                clearBeforeUpdate: true,
                onProgress: event => handleProgressEvent(event, false, manualProgressTask),
                // 注意：legacy 入口未传 executionSnapshot，不启用确认期 TOCTOU 快照防护
                // （该防护由 V2 UI useManualUpdate 在确认前建立快照并传入 service）。
                // 刻意保持兼容，不把可选参数改为必填。
            }
        );

        manualProgressTask?.end();
        manualProgressTask = null;

        // UI：根据返回值显示 toast
        if (result.success) {
            showToastr_ACU(result.checkpointWarning ? 'warning' : 'success', result.checkpointWarning ? `Cập nhật thủ công hoàn tất, nhưng tạo checkpoint ranh giới giữ lại của tầng AI thất bại: ${result.checkpointWarning}` : 'Cập nhật thủ công hoàn tất!');
            updateStatusDisplay();
            notifyTableUpdate();

            if (result.autoMergeTriggered && result.autoMergeSuccess) {
                showToastr_ACU('success', 'Tự động gộp kỷ yếu hoàn tất!');
                notifyTableUpdate();
            }
        } else if (result.error) {
            // 区分 warning 和 error 类型
            const warningMessages = ['正在进行中', '聊天记录为空', '尚未检测到', '未选择', '未找到可用', 'đang được cập nhật', 'Lịch sử trò chuyện trống', 'Chưa phát hiện phản hồi AI', 'Chưa chọn bảng', 'Không tìm thấy ngữ cảnh khả dụng'];
            const isWarning = warningMessages.some(msg => result.error!.includes(msg));
            showToastr_ACU(isWarning ? 'warning' : 'error', result.error);
        }
        return result.success === true;
    } finally {
        manualProgressTask?.end();
        // UI：重置手动更新按钮
        if (typeof resetManualUpdateButton_ACU === 'function') resetManualUpdateButton_ACU();
    }
}

// saveCurrentDataForTable_ACU 已搬迁到 service/chat/chat-service.ts
// 通过文件顶部的 re-export 保持外部调用方兼容
