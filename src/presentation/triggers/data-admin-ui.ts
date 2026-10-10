import { deriveTemplatePresetNameForImport_ACU, getCurrentTemplatePresetName_ACU, normalizeTemplatePresetSelectionValue_ACU, sanitizeFilenameComponent_ACU } from '../../shared/template-preset-utils';
import { renderPromptSegments_ACU } from '../components/plot-editors';
import { getDefaultTemplateSnapshot_ACU, getTemplatePreset_ACU, resolveTemplateForExport_ACU } from '../../service/template/template-preset-service';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { isSqliteMode } from '../../service/table/storage-mode';
import { reloadStorageProvider } from '../../service/table/table-storage-strategy';
import { getChatArray_ACU, deleteLocalDataWithScope_ACU, overrideLatestLayerWithTemplateCore_ACU } from '../../service/chat/chat-service';
import { isWorldbookApiAvailable_ACU } from '../../service/worldbook/worldbook-service';
import { cleanupWorldbookEntriesAfterDataDeletion_ACU } from '../../service/worldbook/worldbook-cleanup';
import { currentChatFileIdentifier_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { resetAllPromptsToDefault_ACU } from '../../service/settings/settings-write-service';
import { sanitizeChatSheetsObject_ACU } from '../../service/template/chat-scope';
import { refreshMergedDataAndNotifyWithUI_ACU, refreshPresetUIAfterSwitch_ACU } from '../components/pipeline-ui-helpers';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

import { ensureSheetOrderNumbers_ACU, logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { loadOrCreateJsonTableFromChatHistory_ACU } from '../../service/table/table-service';
import { applyChatTemplateSnapshotWithReconciliation_ACU, applyTemplateSnapshotToScope_ACU, normalizeTemplateOperationScope_ACU, parseImportedTemplateData_ACU, upsertTemplatePreset_ACU } from '../../service/template/template-preset-service';
import { applyCombinedSettingsImport_ACU } from '../../service/settings/settings-service';
import { getTemplatePresetSelectJQ_ACU, refreshTemplatePresetSelectInUI_ACU } from '../components/template-preset-ui';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { migrateLegacySummaryVectorIndexToContentAddressed_ACU } from '../../service/vector/summary-vector-index-archive-service';
/**
 * presentation/triggers/data-admin-ui.ts — 导入/导出/重置 UI
 * 从 features/data/01_data_admin.js 迁移而来
 */

  export function importCombinedSettings_ACU() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const content = readerEvent.target.result;
            let combinedData;

            try {
                combinedData = JSON.parse(content as string);
            } catch (error) {
                logError_ACU('导入合并配置失败：JSON解析错误。', error);
                showToastr_ACU('error', 'Tệp không phải định dạng JSON hợp lệ.', { timeOut: 5000 });
                return;
            }
            
            try {
                // Validation
                if (!combinedData.prompt || !combinedData.template) {
                    throw new Error('Tệp JSON thiếu khóa "prompt" hoặc "template".');
                }
                if (!Array.isArray(combinedData.prompt)) {
                    throw new Error('Giá trị của "prompt" phải là một mảng.');
                }
                if (typeof combinedData.template !== 'object' || combinedData.template === null) {
                    throw new Error('Giá trị của "template" phải là một đối tượng.');
                }

                // [重构] 调用 service 层导入配置
                const modifiedFields = applyCombinedSettingsImport_ACU(combinedData);
                logDebug_ACU(`Combined settings imported. Modified fields: ${modifiedFields.join(', ')}`);

                // UI 操作：渲染提示词段落
                renderPromptSegments_ACU(combinedData.prompt);
                showToastr_ACU('success', 'Đã nhập và lưu preset prompt thành công!');

                // 合并总结 UI 已停用；导入兼容仍保留 merge 字段，但不再尝试同步已移除的合并控件。
                if (modifiedFields.includes('mergeTargetCount')) {
                    const $deleteStartFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                    const $deleteEndFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);
                    if ($deleteStartFloor.length) $deleteStartFloor.val(settings_ACU.deleteStartFloor || 1);
                    if ($deleteEndFloor.length) $deleteEndFloor.val(settings_ACU.deleteEndFloor || '');
                }
                
                // 2. Apply and save template
                // [瘦身] 导入时清洗模板并回写（兼容旧模板带冗余字段）
                const sheetKeys = Object.keys(combinedData.template).filter(k => k.startsWith('sheet_'));
                ensureSheetOrderNumbers_ACU(combinedData.template, { baseOrderKeys: sheetKeys, forceRebuild: false });
                const sanitizedTemplate = sanitizeChatSheetsObject_ACU(combinedData.template, { ensureMate: true });
                const appliedTemplate = await applyTemplateSnapshotToScope_ACU(sanitizedTemplate, {
                    scope: 'global',
                    source: 'import_combined',
                    presetName: normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false })),
                    save: true,
                    persistChatScope: false,
                });
                if (!appliedTemplate || (typeof appliedTemplate === 'object' && 'saved' in appliedTemplate && (appliedTemplate as any).saved === false)) {
                    const reason = appliedTemplate && typeof appliedTemplate === 'object' && 'error' in appliedTemplate && typeof (appliedTemplate as any).error === 'string'
                        ? (appliedTemplate as any).error
                        : '';
                    throw new Error(reason || 'Mẫu bảng trong cấu hình gộp đã được phân tích nhưng áp dụng vào mẫu toàn cục thất bại.');
                }

                showToastr_ACU('success', 'Đã nhập mẫu bảng thành công! Mẫu đã được cập nhật nhưng không ảnh hưởng dữ liệu cục bộ của cuộc trò chuyện hiện tại.');

                // 刷新模板预设下拉 UI，确保预设列表与状态文案同步
                refreshPresetUIAfterSwitch_ACU();

                // [优化] 不再触发表格数据初始化，仅修改当前插件模板
                // 只有在新开卡或之前没有用过插件的聊天记录里才会使用新的通用模板作为基底
                showToastr_ACU('success', 'Đã nhập cấu hình gộp thành công!');

            } catch (error) {
                logError_ACU('导入合并配置失败：结构验证失败。', error);
                showToastr_ACU('error', `Nhập thất bại: ${error.message}`, { timeOut: 10000 });
            }
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // [新增] 删除聊天记录中的本地数据
  // 范围感知：mode='all' 且范围覆盖全部 AI 楼层时由服务层编排入口切换为硬清空 purge，
  // 其余情况走范围删除（deleteLocalDataInChatCore_ACU）。
  export async function deleteLocalDataInChat_ACU(mode: 'current' | 'all' = 'current', startFloor: any = null, endFloor: any = null) {
      const chat = getChatArray_ACU();
      if (!chat || chat.length === 0) {
          showToastr_ACU('warning', 'Lịch sử trò chuyện trống, không thể thực hiện thao tác xóa.');
          return;
      }

      const aiMessageCount = chat.filter((msg: any) => !msg.is_user).length;
      const outcome = await deleteLocalDataWithScope_ACU(mode, startFloor, endFloor);

      // aiCount === 0 时不再提前 return：范围覆盖全部（含 0 层）的 all 请求会走 purge，
      // purge 仍需清理用户首条消息字段与 chat[0] scope/guide 镜像。
      // 只有走 range 路径且确实没有 AI 楼层时才提示无可删数据。
      if (outcome.path === 'range' && aiMessageCount === 0) {
          showToastr_ACU('warning', 'Lịch sử trò chuyện không có tin nhắn AI, không thể xóa theo phạm vi.');
          return;
      }

      if (outcome.path === 'aborted') {
          showToastr_ACU('warning', outcome.reason, { timeOut: 10000 });
          return;
      }

      if (outcome.path === 'purge') {
          await applyPurgeResultToUi_ACU(outcome.result);
          return;
      }

      const deletedCount = outcome.deletedCount;
      if (deletedCount > 0) {
          // 刷新内存和UI：删除楼层数据后，SQLite 运行时必须从当前聊天持久化模板/guide 重建
          await loadOrCreateJsonTableFromChatHistory_ACU();
          if (isSqliteMode()) await reloadStorageProvider();
          await refreshMergedDataAndNotifyWithUI_ACU();

          // [重构] 调用 service 层清理世界书条目
          await cleanupWorldbookEntriesAfterDataDeletion_ACU();

          if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
              updateCardUpdateStatusDisplay_ACU();
          }

          showToastr_ACU('success', `Đã xóa thành công dữ liệu cục bộ trong ${deletedCount} tin nhắn (${mode === 'all' ? 'tất cả mã định danh' : 'mã định danh hiện tại'}).`);
      } else {
          showToastr_ACU('info', 'Không tìm thấy dữ liệu thỏa điều kiện xóa.');
      }
  }

  /**
   * 硬清空（purge）结果落 UI（legacy 入口共用）。
   *
   * 与 range 删除的收尾差异：
   * purgeCurrentChatDatabaseState_ACU 内部已在严格保存后回落为当前全局模板的
   * header-only 空结构（S1-1，pristine：不写 frame，首次填表才建根），此处不再
   * loadOrCreate / reloadStorageProvider，只调 refreshMergedDataAndNotifyWithUI_ACU
   * 让面板展示回落后的模板空结构；世界书条目清理由 purge 内部完成
   * （cleanupDatabaseGeneratedWorldbookEntries_ACU），结果进入 result.cleanupWarnings。
   */
  export async function applyPurgeResultToUi_ACU(result: { saved: boolean; clearedMessageCount: number; removedMetadata: string[]; cleanupWarnings?: string[]; error?: string }): Promise<void> {
      if (!result.saved) {
          showToastr_ACU('error', result.error || 'Xóa sạch thất bại, xem chi tiết trong nhật ký chạy.', { timeOut: 10000 });
          return;
      }
      await refreshMergedDataAndNotifyWithUI_ACU();
      if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
          updateCardUpdateStatusDisplay_ACU();
      }
      const removed = result.removedMetadata.length ? `, đã gỡ metadata: ${result.removedMetadata.join(', ')}` : '';
      if (result.cleanupWarnings?.length) {
          showToastr_ACU('warning', `Đã xóa sạch toàn bộ dữ liệu cục bộ (${result.clearedMessageCount} tin nhắn)${removed}. Cảnh báo: ${result.cleanupWarnings[0]}`, { timeOut: 10000 });
      } else {
          showToastr_ACU('success', `Đã xóa toàn bộ dữ liệu cục bộ (${result.clearedMessageCount} tin nhắn)${removed}.`);
      }
  }



  export async function migrateLegacySummaryVectorIndex_ACU() {
    try {
        const result = await migrateLegacySummaryVectorIndexToContentAddressed_ACU();
        if (result.success && !result.skipped) {
            showToastr_ACU('success', `Chỉ mục giao hỏa cũ đã được di chuyển không phá hủy: ${result.indexedRowCount || 0} hàng, ${result.chunkCount || 0} chunk. Tệp ngoài cũ vẫn được giữ cho các tầng lịch sử khôi phục.`);
            return result;
        }
        if (result.success && result.skipped) {
            const reason = result.reason === 'already_content_addressed'
                ? 'Chỉ mục giao hỏa hiện tại đã dùng giao thức định địa chỉ theo nội dung, không cần di chuyển.'
                : 'Cuộc trò chuyện hiện tại không có chỉ mục giao hỏa cũ để di chuyển.';
            showToastr_ACU('info', reason);
            return result;
        }
        const reasonText = result.errors?.length ? result.errors.join('; ') : (result.reason || 'Lý do không xác định');
        showToastr_ACU('error', `Di chuyển chỉ mục giao hỏa cũ thất bại: ${reasonText}`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'Lỗi không xác định');
        logError_ACU('旧交火索引迁移失败:', error);
        showToastr_ACU('error', `Di chuyển chỉ mục giao hỏa cũ thất bại: ${message}`);
        return { success: false, skipped: false, indexedRowCount: 0, skippedRowCount: 0, chunkCount: 0, reason: 'exception', errors: [message] };
    }
  }

  export function exportCurrentJsonData_ACU() {
    if (!currentJsonTableData_ACU) {
        showToastr_ACU('warning', 'Không có cơ sở dữ liệu để xuất. Hãy bắt đầu một cuộc hội thoại trước.');
        return;
    }
    try {
        const chatName = currentChatFileIdentifier_ACU || 'current_chat';
        const fileName = `TavernDB_data_${chatName}.json`;
        // [瘦身] Json导出时清洗冗余字段（兼容旧数据输入，但导出不再携带）
        const sanitized = sanitizeChatSheetsObject_ACU(currentJsonTableData_ACU, { ensureMate: true });
        const jsonString = JSON.stringify(sanitized, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToastr_ACU('success', 'Đã xuất tệp JSON cơ sở dữ liệu thành công!');
    } catch (error) {
        logError_ACU('导出JSON数据失败:', error);
        showToastr_ACU('error', 'Xuất JSON thất bại, hãy kiểm tra console để biết chi tiết.');
    }
  }

  export function exportTableTemplate_ACU({ scope = 'global' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    try {
        // [重构] 调用 service 层解析模板数据
        const selectedPresetName = String(getTemplatePresetSelectJQ_ACU()?.val?.() || '');
        const resolved = resolveTemplateForExport_ACU(normalizedScope, selectedPresetName);
        if (!resolved) {
            throw new Error('Không thể phân tích mẫu hiện tại.');
        }

        const { jsonData, fromPresetName } = resolved;

        const sanitized = sanitizeChatSheetsObject_ACU(jsonData, { ensureMate: true });
        const jsonString = JSON.stringify(sanitized, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        if (fromPresetName) {
            const safePart = sanitizeFilenameComponent_ACU(fromPresetName) || 'template';
            a.download = normalizedScope === 'chat'
                ? `TavernDB_template_chat_${safePart}.json`
                : `TavernDB_template_${safePart}.json`;
        } else {
            a.download = normalizedScope === 'chat'
                ? 'TavernDB_template_chat_snapshot.json'
                : 'TavernDB_template.json';
        }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (normalizedScope === 'chat') {
            showToastr_ACU('success', fromPresetName ? `Đã xuất snapshot mẫu cuộc trò chuyện hiện tại thành công: ${fromPresetName}` : 'Đã xuất snapshot mẫu cuộc trò chuyện hiện tại thành công!');
        } else {
            showToastr_ACU('success', fromPresetName ? `Đã xuất preset mẫu bảng toàn cục thành công: ${fromPresetName}` : 'Đã xuất mẫu bảng toàn cục thành công! (đã gồm tham số xuất mới nhất)');
        }
        return true;
    } catch (error) {
        logError_ACU('导出模板失败:', error);
        showToastr_ACU('error', 'Xuất mẫu thất bại, hãy kiểm tra console để biết chi tiết.');
        return false;
    }
  }

  export async function resetAllToDefaults_ACU() {
      if (!confirm('Xác nhận khôi phục đồng thời [Preset chỉ thị AI mặc định] và [Mẫu bảng mặc định]?\n\nThao tác này sẽ ghi đè cài đặt tùy chỉnh hiện tại của bạn và không thể hoàn tác.')) {
          return false;
      }

      try {
          // [V1 收敛] 委托 service 事务式恢复默认提示词（含保存失败回滚），不再直写 settings_ACU。
          const promptResetResult = resetAllPromptsToDefault_ACU();
          if (!promptResetResult.ok) {
              showToastr_ACU('error', promptResetResult.message || 'Khôi phục prompt mặc định thất bại, đã khôi phục trạng thái cũ.');
              return false;
          }

          const templateResetOk = await resetTableTemplate_ACU({
              showToast: false,
              updatePresetSelection: true,
              _refreshUi: false,
              overwriteReason: 'reset_all_defaults',
              scope: 'global',
              source: 'reset_all_defaults',
          });
          if (!templateResetOk) {
              showToastr_ACU('error', 'Khôi phục cài đặt mặc định thất bại: không khôi phục được mẫu bảng mặc định.');
              return false;
          }

          refreshTemplatePresetSelectInUI_ACU({ selectName: '', keepValue: false });
          showToastr_ACU('success', 'Đã khôi phục preset và mẫu mặc định! Mẫu đã được cập nhật nhưng không ảnh hưởng dữ liệu cục bộ của cuộc trò chuyện hiện tại.');
          return true;
      } catch (error) {
          logError_ACU('恢复默认设置失败:', error);
          showToastr_ACU('error', 'Khôi phục cài đặt mặc định thất bại, hãy kiểm tra console để biết chi tiết.');
          return false;
      }
  }

  // [新增] 使用通用模板覆盖最新层所有表格数据的函数
  export async function overrideLatestLayerWithTemplate_ACU() {
      if (!confirm('⚠️ Cảnh báo: thao tác này sẽ dùng mẫu chung hiện tại để ghi đè toàn bộ dữ liệu bảng ở tầng mới nhất trong lịch sử trò chuyện!\n\n' +
                  '• Các bảng có trong mẫu sẽ bị ghi đè (chỉ giữ tiêu đề cột, xóa dữ liệu)\n' +
                  '• Các bảng không có trong mẫu sẽ bị bỏ qua (dữ liệu cục bộ giữ nguyên)\n' +
                  '• Thao tác này chỉ ảnh hưởng tin nhắn AI mới nhất\n' +
                  '• Xóa dữ liệu trò chuyện của tầng mới nhất là có thể khôi phục bình thường\n\n' +
                  'Xác nhận tiếp tục?')) {
          return;
      }

      const chat = getChatArray_ACU();
      if (!chat || chat.length === 0) {
          showToastr_ACU('error', 'Lịch sử trò chuyện trống, không thể thực hiện thao tác ghi đè.');
          return;
      }

      // 解析通用模板
      const templateData = parseTableTemplateJson_ACU({ stripSeedRows: true });
      if (!templateData) {
          showToastr_ACU('error', 'Không thể phân tích mẫu chung, hãy kiểm tra định dạng mẫu.');
          return;
      }

      // 检查是否有AI消息
      const hasAiMessage = chat.some((msg: any) => !msg.is_user);
      if (!hasAiMessage) {
          showToastr_ACU('error', 'Lịch sử trò chuyện không có tin nhắn AI, không thể thực hiện thao tác ghi đè.');
          return;
      }

      // 调用 service 层核心逻辑执行覆盖
      const modifiedCount = await overrideLatestLayerWithTemplateCore_ACU(templateData);

      if (modifiedCount > 0) {
          // 刷新内存和UI
          await loadOrCreateJsonTableFromChatHistory_ACU();
          await refreshMergedDataAndNotifyWithUI_ACU();

          showToastr_ACU('success', `Đã dùng mẫu chung ghi đè dữ liệu của ${Object.keys(templateData).filter(k => k.startsWith('sheet_')).length} bảng ở tầng mới nhất.`);
      } else {
          showToastr_ACU('warning', 'Không tìm thấy dữ liệu bảng cần ghi đè.');
      }
  }

  export async function resetTableTemplate_ACU({ showToast = true, updatePresetSelection = true, _refreshUi = true, overwriteReason = 'reset_template', scope = 'global', source = '' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    try {
        const snapshot = getDefaultTemplateSnapshot_ACU();
        if (!snapshot?.templateStr) {
            throw new Error('Không thể phân tích mẫu mặc định.');
        }

        const result = await applyTemplateSnapshotToScope_ACU(snapshot.templateStr, {
            scope: normalizedScope,
            source: source || overwriteReason || (normalizedScope === 'chat' ? 'ui_chat_reset' : 'ui_global_reset'),
            presetName: '',
            save: true,
            persistChatScope: normalizedScope === 'chat',
        });
        if (!result || (typeof result === 'object' && 'saved' in result && result.saved === false)) {
            throw new Error('Áp dụng snapshot mẫu mặc định thất bại.');
        }

        if (showToast) {
            if (normalizedScope === 'chat') {
                const warning = typeof result === 'object' && 'postCommitWarning' in result && typeof result.postCommitWarning === 'string'
                    ? result.postCommitWarning
                    : '';
                showToastr_ACU(warning ? 'warning' : 'success', warning || 'Mẫu của cuộc trò chuyện hiện tại đã khôi phục về mặc định! Chỉ ảnh hưởng cuộc trò chuyện hiện tại, không đổi mẫu toàn cục.', {
                    acuToastCategory: warning ? ACU_TOAST_CATEGORY_ACU.ERROR : ACU_TOAST_CATEGORY_ACU.IMPORT,
                });
            } else {
                showToastr_ACU('success', 'Mẫu toàn cục đã khôi phục về mặc định! Mẫu đã được cập nhật nhưng không ảnh hưởng dữ liệu cục bộ của cuộc trò chuyện hiện tại.');
            }
        }
        logDebug_ACU(`Table template has been reset to default for scope: ${normalizedScope}. updatePresetSelection=${updatePresetSelection}`);
        return true;
    } catch (error) {
        logError_ACU('恢复默认模板失败:', error);
        if (showToast) {
            showToastr_ACU('error', 'Khôi phục mẫu mặc định thất bại, hãy kiểm tra console để biết chi tiết.');
        }
        return false;
    }
  }

  export function importTableTemplate_ACU({ scope = 'global' } = {}) {
    const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            try {
                const content = String(readerEvent?.target?.result || '');
                const prepared = parseImportedTemplateData_ACU(content);
                const derivedPresetName = deriveTemplatePresetNameForImport_ACU({
                    filename: file?.name,
                    fallbackLabel: normalizedScope === 'global'
                        ? `Mau_nhap_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
                        : '',
                });

                if (normalizedScope === 'global') {
                    // ═══ 全局导入：仅保存到预设库，不自动切换当前生效模板 ═══
                    // 用户可随后通过下拉手动切换到新导入的预设
                    let savePresetOk = false;
                    if (derivedPresetName) {
                        try {
                            savePresetOk = upsertTemplatePreset_ACU(derivedPresetName, prepared.templateStr);
                        } catch (presetError) {
                            savePresetOk = false;
                            logWarn_ACU('[TemplateScope] 导入全局模板后保存预设失败:', presetError);
                        }
                    }

                    // 刷新 UI 让新预设立即出现在下拉列表中，但保持当前选中值不变
                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });

                    if (savePresetOk) {
                        showToastr_ACU('success', `Đã lưu mẫu thành preset toàn cục: ${derivedPresetName} (cùng tên sẽ tự ghi đè). Bạn có thể chuyển thủ công sang nó trong danh sách "Preset mẫu toàn cục".`, {
                            acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
                        });
                    } else if (derivedPresetName) {
                        showToastr_ACU('warning', `Mẫu đã được phân tích nhưng lưu vào thư viện preset thất bại: ${derivedPresetName}`, {
                            acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                        });
                    } else {
                        showToastr_ACU('warning', 'Mẫu đã được phân tích nhưng không xác định được tên preset, chưa lưu vào thư viện preset.', {
                            acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                        });
                    }
                    logDebug_ACU(`[TemplateScope] Template imported to global preset library: ${derivedPresetName}. saveOk=${savePresetOk}`);
                } else {
                    const applied = await applyChatTemplateSnapshotWithReconciliation_ACU(prepared.templateObj, {
                        source: 'ui_chat_import',
                        presetName: derivedPresetName,
                    });
                    if (!applied.saved) {
                        throw new Error(applied.error || 'Mẫu đã được phân tích nhưng áp dụng vào cuộc trò chuyện hiện tại thất bại.');
                    }

                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
                    const warning = 'postCommitWarning' in applied && typeof applied.postCommitWarning === 'string'
                        ? applied.postCommitWarning
                        : '';
                    showToastr_ACU(
                        warning ? 'warning' : 'success',
                        warning || `Đã nhập snapshot mẫu cuộc trò chuyện hiện tại${derivedPresetName ? ` (tên preset: ${derivedPresetName})` : ''}.`,
                        { acuToastCategory: warning ? ACU_TOAST_CATEGORY_ACU.ERROR : ACU_TOAST_CATEGORY_ACU.IMPORT },
                    );
                    logDebug_ACU(`[TemplateScope] Template imported to chat scope: ${derivedPresetName}.`);
                }
            } catch (error) {
                logError_ACU('导入模板失败：', error);
                showToastr_ACU('error', `Nhập thất bại: ${error.message}`, {
                    acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                    timeOut: 10000,
                });
            }
        };
        reader.onerror = error => {
            logError_ACU('导入模板失败：文件读取失败。', error);
            showToastr_ACU('error', 'Đọc tệp mẫu thất bại, vui lòng thử lại.', {
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR,
                timeOut: 10000,
            });
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // --- [New Visualizer & Inheritance Module] ---

  // CSS for the Visualizer - 墨韵清雅设计系统（古典中国风）