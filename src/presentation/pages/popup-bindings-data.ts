// popup-bindings-data.ts
// 数据管理标签页事件绑定（数据隔离 + 外部导入 + 模板预设 + 数据管理按钮）

import { DEFAULT_MERGE_SUMMARY_PROMPT_ACU, DEFAULT_MERGE_SUMMARY_PROMPT_SQL_ACU, TABLE_TEMPLATE_ACU } from '../../shared/defaults-json.js';
import { deriveTemplatePresetNameForImport_ACU, getCurrentTemplatePresetName_ACU, isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../shared/template-preset-utils';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU, SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { topLevelWindow_ACU } from '../../shared/env';
import { escapeHtml_ACU } from '../../shared/html-helpers';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { jQuery_API_ACU } from '../dom-utils';
import { isSqliteMode } from '../../service/table/storage-mode';
import { settings_ACU, currentChatFileIdentifier_ACU, currentJsonTableData_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU, $charCardPromptToggle_ACU, $charCardPromptAreaDiv_ACU, $saveCharCardPromptButton_ACU, $resetCharCardPromptButton_ACU, $loadModelsButton_ACU, $saveApiConfigButton_ACU, $clearApiConfigButton_ACU, $useMainApiCheckbox_ACU, $customApiModelInput_ACU, $customApiModelSelect_ACU, $importTableSelectAll_ACU, $importTableSelectNone_ACU } from '../state/ui-refs';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { updateImportStatusUI_ACU, handleTxtImportAndSplit_ACU } from '../components/import-status-ui';
import { clearImportLocalStorage_ACU, clearImportedEntries_ACU, deleteImportedEntries_ACU, handleInjectImportedTxtSelected_ACU } from '../triggers/import-process';
import { importCombinedSettings_ACU } from '../triggers/data-admin-ui';
import { applyTemplateScopeForCurrentChat_ACU, getDataIsolationHistory_ACU, removeDataIsolationHistory_ACU, switchIsolationProfile_ACU, persistCurrentTemplatePresetName_ACU, setSummaryVectorIndexMode_ACU } from '../../service/settings/settings-service';
// [V1 收敛] 以下写操作统一委托 service 层事务式函数，禁止 V1 直接写 settings_ACU。
import { setFeatureApiPreset_ACU } from '../../service/settings/feature-preset-reference-service';
import { setUseMainApi_ACU } from '../../service/settings/api-preset-service';
import { setTableContextRules_ACU } from '../../service/settings/settings-write-service';
import { deleteAllGeneratedEntries_ACU } from '../../service/worldbook/pipeline';
import { refreshMergedDataAndNotifyWithUI_ACU, refreshPresetUIAfterSwitch_ACU } from '../components/pipeline-ui-helpers';
import { loadOrCreateJsonTableFromChatHistory_ACU } from '../../service/table/table-service';
import { getTemplatePreset_ACU, applyChatTemplateSnapshotWithReconciliation_ACU, applyTemplatePresetToCurrent_ACU, applyTemplateSnapshotToScope_ACU, deleteTemplatePreset_ACU, ensureUniqueTemplatePresetName_ACU, normalizeTemplateForPresetSave_ACU, parseImportedTemplateData_ACU, resolveActiveTemplatePresetName_ACU, upsertTemplatePreset_ACU } from '../../service/template/template-preset-service';
import { getCurrentChatTemplateScopeState_ACU, sanitizeTemplateSnapshotForChat_ACU } from '../../service/template/chat-scope';
import { loadTemplatePresetSelect_ACU } from '../components/template-preset-ui';
import { deleteLocalDataInChat_ACU, exportCurrentJsonData_ACU, exportTableTemplate_ACU, importTableTemplate_ACU, migrateLegacySummaryVectorIndex_ACU, overrideLatestLayerWithTemplate_ACU, resetAllToDefaults_ACU, resetTableTemplate_ACU } from '../triggers/data-admin-ui';
import { exportCombinedSettings_ACU, handleManualMergeSummary_ACU } from '../triggers/update-trigger';
import { formatJsonToReadable_ACU } from '../../service/runtime/helpers-remaining';
import { appendExcludeRuleRow_ACU, readExcludeRulesFromRows_ACU } from '../components/optimization-ui';
import { updateCardUpdateStatusDisplay_ACU } from '../components/update-status-display';
import { populateImportWorldbookTargetSelector_ACU } from '../components/worldbook-selector';
import { saveApiConfig_ACU, clearApiConfig_ACU, fetchModelsAndConnect_ACU, loadApiPreset_ACU, saveApiPreset_ACU, deleteApiPreset_ACU, saveCustomCharCardPrompt_ACU, saveImportSplitSize_ACU, resetDefaultCharCardPrompt_ACU, updateCustomApiInputsState_ACU, refreshApiPresetSelectors_ACU } from '../triggers/settings-ui-sync';
import { handleImportSelectAll_ACU, handleImportSelectNone_ACU } from '../components/table-selector';
import { getLatestSummaryVectorIndexSnapshotState_ACU } from '../../service/vector/summary-vector-index-state-service';
import { rebuildCurrentSummaryVectorIndexNow_ACU } from '../../service/vector/summary-vector-index-rebuild-service';
import { deleteCurrentSummaryVectorIndexFromChat_ACU, tryRecoverSummaryVectorIndexFromExternalSnapshot_ACU } from '../../service/vector/summary-vector-index-chat-service';
import { getCurrentWorldbookConfig_ACU } from '../../service/settings/settings-readers';
import { syncManualUpdateButtonAvailability_ACU } from '../components/status-display';
import {
    getSummaryVectorIndexStats_ACU,
    inspectSummaryVectorIndexHealth_ACU,
} from '../../service/vector/summary-vector-index-storage-service';
import { clearVectorIndexTempCache_ACU } from '../../data/storage/vector-index-temp-cache';
import { clearSummaryVectorHotCache_ACU } from '../../data/storage/vector-index-hot-cache';
import { getChatArray_ACU, isFullRangeDeletionRequest_ACU } from '../../service/chat/chat-service';

function formatBytes_ACU(bytes: number): string {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

async function refreshVectorIndexStatsPanel_ACU(): Promise<void> {
    let snapshot = getLatestSummaryVectorIndexSnapshotState_ACU();
    // ── 自动恢复：tag data 无 state 时，从外部单文件快照恢复 ──
    if (!snapshot?.summaryVectorIndexState?.manifest) {
        try {
            const recovered = await tryRecoverSummaryVectorIndexFromExternalSnapshot_ACU();
            if (recovered) {
                snapshot = getLatestSummaryVectorIndexSnapshotState_ACU();
            }
        } catch { /* 恢复失败不影响面板显示 */ }
    }
    const state = snapshot?.summaryVectorIndexState || null;
    const manifest = state?.manifest || null;
    const stats = await getSummaryVectorIndexStats_ACU(manifest);
    const $panel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-stats`);
    if (!$panel.length) return;
    const setField = (field: string, value: string): void => {
        $panel.find(`[data-acu-vector-index-field="${field}"]`).text(value);
    };
    // 优先使用 state 层的实际行/块数量，而非 manifest 的可能过时的计数
    const stateRowCount = Array.isArray(state?.rows) ? state.rows.filter((r: any) => r.status !== 'removed').length : 0;
    const stateChunkCount = Array.isArray(state?.chunks) ? state.chunks.length : 0;
    const displayRowCount = stateRowCount > 0 ? stateRowCount : stats.rowCount;
    const displayChunkCount = stateChunkCount > 0 ? stateChunkCount : stats.chunkCount;
    setField('status', stats.status || 'none');
    setField('indexId', stats.indexId || '-');
    setField('backend', stats.backend || 'none');
    setField('rowsChunks', `${displayRowCount} / ${displayChunkCount}`);
    setField('shards', `${stats.baseShardCount} / ${stats.deltaShardCount}`);
    setField('tombstones', `${stats.tombstoneRowCount} / ${stats.tombstoneChunkCount}`);
    setField('externalBytes', formatBytes_ACU(stats.externalTotalBytes));
    setField('cacheBytes', formatBytes_ACU(stats.cacheTotalBytes));
    const pendingFlushCount = (stats.flushTaskDirtyCount || 0) + (stats.flushTaskQueuedCount || 0) + (stats.flushTaskFlushingCount || 0);
    setField('flushQueue', `${pendingFlushCount} pending / ${stats.flushTaskFailedCount || 0} failed`);
    setField('flushError', stats.flushTaskLastError || '-');
    setField('updatedAt', stats.updatedAt || '-');
}

function getCurrentSummaryVectorIndexSourceTableKey_ACU(): string {
    const tables = currentJsonTableData_ACU && typeof currentJsonTableData_ACU === 'object'
        ? currentJsonTableData_ACU
        : null;
    if (!tables) return '';
    const candidates = Object.keys(tables).filter((key) => {
        const table = tables[key];
        return !!table?.name && isSummaryOrOutlineTable_ACU(String(table.name || ''));
    });
    // 多个纪要表无法从 popup 上下文证明哪一个是当前 scope；宁可拒绝恢复。
    return candidates.length === 1 ? candidates[0] : '';
}

/**
 * 绑定数据管理标签页的所有事件（数据隔离 + 外部导入 + 模板预设 + 数据管理按钮）
 */
export async function bindDataEvents_ACU(): Promise<void> {
      // 局部变量声明（原在主函数开头声明的元素引用）
      const $dataIsolationCodeInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-code`);
      const $dataIsolationSaveButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-save`);
      const $dataIsolationDeleteButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries`);
      const $dataIsolationCombo = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo`);
      const $dataIsolationHistoryToggle = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle`);
      const $dataIsolationHistoryList = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list`);
      const $importTxtButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-txt-button`);
      const $injectImportedTxtButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
      const $clearImportedAllButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-clear-imported-all-button`);
      const $clearImportedCacheButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-clear-imported-cache-button`);
      const $saveImportSplitSizeButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-import-split-size`);
      const $importTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-template`);
      const $exportTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-template`);
      const $resetTemplateButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-reset-template`);
      const $templatePresetSelect_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-select`);
      const $templateChatPresetSelect_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select`);
      const $templatePresetSaveBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-save`);
      const $templatePresetSaveAsBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-saveas`);
      const $templatePresetRenameBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-rename`);
      const $templatePresetDeleteBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-delete`);
      const $templateChatSaveBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-save-preset`);
      const $templateChatImportBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-import-preset`);
      const $templateChatExportBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-export-preset`);
      const $templateChatClearOverrideBtn_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-clear-override`);
      const $templateChatPresetFileInput_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-file-input`);
      const $resetAllDefaultsButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults`);
      const $exportJsonDataButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-json-data`);
      const $importCombinedSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-combined-settings`);
      const $exportCombinedSettingsButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-export-combined-settings`);
      const $openNewVisualizerButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer`);
      const $vectorIndexModeEnabled_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-mode-enabled`);
      const $vectorIndexRefreshButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-refresh`);
      const $vectorIndexClearCacheButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-clear-cache`);
      const $vectorIndexDeleteCurrentButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-delete-current`);
      const $vectorIndexMigrateLegacyButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-migrate-legacy`);
      const $buildVectorIndexNowButton_ACU = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-build-vector-index-now`);

      const syncSummaryVectorIndexModeToggles_ACU = (modeEnabled: boolean): void => {
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-vector-index-mode-enabled`).prop('checked', modeEnabled);
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-summary-vector-index-mode-enabled`).prop('checked', modeEnabled);
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-enabled`).prop('checked', modeEnabled);
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-worldbook-vector-memory-config-block`).toggle(modeEnabled);
          syncManualUpdateButtonAvailability_ACU();
      };

      const handleSummaryVectorIndexModeChange_ACU = (modeEnabled: boolean): void => {
          setSummaryVectorIndexMode_ACU(modeEnabled);
          syncSummaryVectorIndexModeToggles_ACU(modeEnabled);
          showToastr_ACU(
              modeEnabled ? 'success' : 'info',
              modeEnabled
                  ? 'Đã bật chỉ mục vector chế độ giao hỏa: về sau sẽ duy trì tệp chỉ mục ngoài theo dữ liệu bảng kỷ yếu.'
                  : 'Đã tắt chỉ mục vector chế độ giao hỏa: tệp chỉ mục ngoài hiện có sẽ không tự xóa, có thể xóa thủ công chỉ mục hiện tại bên dưới.',
          );
      };

      const handleOpenVisualizerClick_ACU = async () => {
          try {
              const topLevelApi = (topLevelWindow_ACU as any)?.AutoCardUpdaterAPI;
              if (!topLevelApi?.openVisualizer) {
                  throw new Error('V2 visualizer API is unavailable.');
              }
              const opened = await topLevelApi.openVisualizer();
              if (!opened) throw new Error('V2 visualizer failed to open.');
          } catch (e: any) {
              logError_ACU('打开可视化表格编辑器失败:', e);
              showToastr_ACU('error', `Mở trình chỉnh sửa bảng trực quan thất bại: ${e?.message || 'Lỗi không xác định'}`);
          }
      };

      if ($openNewVisualizerButton_ACU.length) {
          $openNewVisualizerButton_ACU
              .off('click.acu_visualizer')
              .on('click.acu_visualizer', handleOpenVisualizerClick_ACU);
      }

      syncSummaryVectorIndexModeToggles_ACU(getCurrentWorldbookConfig_ACU().summaryVectorIndexModeEnabled === true);
      if ($vectorIndexModeEnabled_ACU.length) {
          $vectorIndexModeEnabled_ACU.off('change.acu_vector_index_mode').on('change.acu_vector_index_mode', function() {
              handleSummaryVectorIndexModeChange_ACU(jQuery_API_ACU(this).is(':checked'));
          });
      }

      void refreshVectorIndexStatsPanel_ACU();
      if ($vectorIndexRefreshButton_ACU.length) {
          $vectorIndexRefreshButton_ACU.off('click.acu_vector_index').on('click.acu_vector_index', async () => {
              await refreshVectorIndexStatsPanel_ACU();
              showToastr_ACU('success', 'Đã làm mới trạng thái chỉ mục chế độ giao hỏa.');
          });
      }
      if ($vectorIndexClearCacheButton_ACU.length) {
          $vectorIndexClearCacheButton_ACU.off('click.acu_vector_index').on('click.acu_vector_index', async () => {
              await clearVectorIndexTempCache_ACU();
              await clearSummaryVectorHotCache_ACU();
              await refreshVectorIndexStatsPanel_ACU();
              showToastr_ACU('success', 'Đã xóa bộ nhớ đệm tạm và bộ nhớ đệm nóng của chế độ giao hỏa.');
          });
      }
      if ($buildVectorIndexNowButton_ACU.length) {
          $buildVectorIndexNowButton_ACU.off('click.acu_vector_index_archive').on('click.acu_vector_index_archive', async () => {
              $buildVectorIndexNowButton_ACU.prop('disabled', true).text('Đang dựng lại snapshot chỉ mục giao hỏa...');
              try {
                  const result = await rebuildCurrentSummaryVectorIndexNow_ACU();
                  await refreshVectorIndexStatsPanel_ACU();
                  if (result.success && !result.skipped) {
                      try { (topLevelWindow_ACU as any).AutoCardUpdaterAPI?._notifyTableUpdate?.(); } catch (_) {}
                      showToastr_ACU('success', `Dựng lại snapshot chỉ mục giao hỏa hoàn tất: ${result.indexedRowCount || 0} hàng, ${result.chunkCount || 0} chunk.`);
                      return;
                  }
                  const reasonText = result.errors?.length ? result.errors.join('; ') : (result.reason || 'Không có nội dung để dựng lại');
                  showToastr_ACU(result.success ? 'info' : 'error', `Snapshot chỉ mục giao hỏa chưa hoàn tất: ${reasonText}`);
              } catch (e: any) {
                  logError_ACU('交火索引快照重建按钮执行失败:', e);
                  showToastr_ACU('error', `Dựng lại snapshot chỉ mục giao hỏa thất bại: ${e?.message || 'Lỗi không xác định'}`);
              } finally {
                  $buildVectorIndexNowButton_ACU.prop('disabled', false).html('<i class="fa-solid fa-brain"></i> Dựng lại snapshot chỉ mục giao hỏa ngay');
              }
          });
      }
      if ($vectorIndexMigrateLegacyButton_ACU.length) {
          $vectorIndexMigrateLegacyButton_ACU.off('click.acu_vector_index_migrate').on('click.acu_vector_index_migrate', async () => {
              $vectorIndexMigrateLegacyButton_ACU.prop('disabled', true).text('Đang di chuyển...');
              try {
                  const report = await inspectSummaryVectorIndexHealth_ACU();
                  const legacyCount = report.legacyManifestCount || 0;
                  if (legacyCount === 0) {
                      showToastr_ACU('info', 'Hiện không có chỉ mục giao hỏa cũ nào để di chuyển.');
                      return;
                  }
                  const result = await migrateLegacySummaryVectorIndex_ACU();
                  await refreshVectorIndexStatsPanel_ACU();
                  if (result.success && !result.skipped) {
                      showToastr_ACU('success', `Di chuyển không phá hủy chỉ mục giao hỏa cũ hoàn tất: ${result.indexedRowCount || 0} hàng, ${result.chunkCount || 0} chunk. Tham chiếu tầng cũ giữ nguyên.`);
                      return;
                  }
                  const reasonText = result.errors?.length ? result.errors.join('; ') : (result.reason || 'Không có nội dung để di chuyển');
                  showToastr_ACU(result.success ? 'info' : 'warning', `Di chuyển chỉ mục giao hỏa cũ chưa thực hiện: ${reasonText}`);
              } catch (e: any) {
                  logError_ACU('旧交火索引迁移按钮执行失败:', e);
                  showToastr_ACU('error', `Di chuyển chỉ mục giao hỏa cũ thất bại: ${e?.message || 'Lỗi không xác định'}`);
              } finally {
                  $vectorIndexMigrateLegacyButton_ACU.prop('disabled', false).text('Di chuyển không phá hủy chỉ mục cũ');
              }
          });
      }

      if ($vectorIndexDeleteCurrentButton_ACU.length) {
          $vectorIndexDeleteCurrentButton_ACU.off('click.acu_vector_index').on('click.acu_vector_index', async () => {
              if (!confirm('Xác nhận xóa chỉ mục vector ngoài của chế độ giao hỏa hiện tại? Thao tác này sẽ xóa các phân đoạn chỉ mục trong /user/files và xóa manifest trong lịch sử trò chuyện.')) return;
              const deleted = await deleteCurrentSummaryVectorIndexFromChat_ACU();
              await refreshVectorIndexStatsPanel_ACU();
              showToastr_ACU(deleted ? 'success' : 'info', deleted ? 'Đã xóa chỉ mục chế độ giao hỏa hiện tại.' : 'Cuộc trò chuyện hiện tại không có chỉ mục chế độ giao hỏa để xóa.');
          });
      }

        const closeDataIsolationHistoryDropdown_ACU = () => {
            if ($dataIsolationCombo.length && $dataIsolationHistoryList.length) {
                $dataIsolationCombo.removeClass('open');
                $dataIsolationHistoryList.hide();
            }
        };

        const renderDataIsolationHistoryDropdown_ACU = () => {
            if (!$dataIsolationHistoryList.length) return;
            const history = getDataIsolationHistory_ACU();
            $dataIsolationHistoryList.empty();
            if (!history.length) {
                $dataIsolationHistoryList.append(
                    `<li class="acu-history-empty" style="padding: 6px 10px; color: var(--text-dim); user-select: none;">Chưa có lịch sử</li>`,
                );
                return;
            }
            history.forEach(code => {
                const safeCode = escapeHtml_ACU(code);
                $dataIsolationHistoryList.append(
                    `<li class="acu-history-item" data-code="${safeCode}" title="${safeCode}" style="padding: 6px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <span class="acu-history-text" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeCode}</span>
                        <button type="button" class="acu-remove-code" data-code="${safeCode}" title="Xóa mã định danh này" style="border: none; background: transparent; color: var(--error-color); cursor: pointer; font-size: 12px; line-height: 1;">×</button>
                    </li>`,
                );
            });
        };

        // 初始化输入框的值
        if ($dataIsolationCodeInput.length) {
            $dataIsolationCodeInput.val(settings_ACU.dataIsolationCode || '');
        }
        // 初始化历史下拉
        renderDataIsolationHistoryDropdown_ACU();

        // [新增] 删除按钮事件
        if ($dataIsolationDeleteButton.length) {
            $dataIsolationDeleteButton.on('click', async function() {
                if (confirm('Xác nhận xóa tất cả mục sổ thế giới đã chèn dưới mã định danh hiện tại?\n(Thao tác này không xóa dữ liệu trong lịch sử trò chuyện)')) {
                    await deleteAllGeneratedEntries_ACU(); // 此函数已修改为支持隔离逻辑
                    showToastr_ACU('success', 'Đã xóa các mục sổ thế giới liên quan.');
                }
            });
        }

        // 保存按钮事件 (简化版隔离流程)
        if ($dataIsolationSaveButton.length) {
            $dataIsolationSaveButton.on('click', async function() {
                const code = String($dataIsolationCodeInput.val() || '').trim();

                if (code) showToastr_ACU('info', `Đang chuyển sang toàn bộ cài đặt/mẫu/dữ liệu của mã định danh [${code}]...`);
                else showToastr_ACU('info', `Mã định danh trống: đang chuyển sang toàn bộ cài đặt/mẫu/dữ liệu mặc định...`);

                // [Profile] 切换标识 = 切换 profile（设置+模板），标识列表跨 profile 共享
                await switchIsolationProfile_ACU(code);

                // 刷新下拉（跨标识共享）
                renderDataIsolationHistoryDropdown_ACU();
                // 同步输入框显示（以当前 profile 为准）
                if ($dataIsolationCodeInput.length) $dataIsolationCodeInput.val(settings_ACU.dataIsolationCode || '');
                
                // 强制重载
                await loadOrCreateJsonTableFromChatHistory_ACU();
                
                // 触发UI刷新
                // 1. 刷新可视化编辑器（如果打开）
                if (jQuery_API_ACU('#acu-visualizer-content').length || (typeof (window as any).ACU_WindowManager !== 'undefined' && (window as any).ACU_WindowManager.isOpen(`${SCRIPT_ID_PREFIX_ACU}-visualizer-window`))) {
                     jQuery_API_ACU(document).trigger('acu-visualizer-refresh-data');
                }
                
                // 2. [新增] 强制刷新前端UI显示的表格 (如果前端有监听 update 事件)
                if ((topLevelWindow_ACU as any).AutoCardUpdaterAPI) {
                     (topLevelWindow_ACU as any).AutoCardUpdaterAPI._notifyTableUpdate();
                }

                // 3. [新增] 强制刷新状态显示 (消息计数)
                if (typeof updateCardUpdateStatusDisplay_ACU === 'function') {
                    updateCardUpdateStatusDisplay_ACU();
                }
                
                showToastr_ACU('success', 'Đã tải dữ liệu xong!');
            });
        }
        
        // 保留回车键支持
        if ($dataIsolationCodeInput.length) {
            $dataIsolationCodeInput.on('keypress', function(e) {
                if (e.which === 13) { // Enter key
                    $dataIsolationSaveButton.trigger('click');
                }
            });
        }

        if ($dataIsolationHistoryToggle.length) {
            $dataIsolationHistoryToggle.on('click', function(e) {
                e.stopPropagation();
                if (!$dataIsolationHistoryList.length) return;
                const willOpen = !$dataIsolationCombo.hasClass('open');
                if (willOpen) {
                    renderDataIsolationHistoryDropdown_ACU();
                }
                $dataIsolationCombo.toggleClass('open', willOpen);
                $dataIsolationHistoryList.toggle(willOpen);
            });
        }

        if ($dataIsolationHistoryList.length) {
            $dataIsolationHistoryList.on('click', '.acu-history-item', function(e) {
                if (jQuery_API_ACU(e.target).hasClass('acu-remove-code')) return;
                const chosen = jQuery_API_ACU(this).data('code');
                if (chosen && $dataIsolationCodeInput.length) {
                    $dataIsolationCodeInput.val(chosen);
                }
                closeDataIsolationHistoryDropdown_ACU();
            });

            $dataIsolationHistoryList.on('click', '.acu-remove-code', function(e) {
                e.stopPropagation();
                const targetCode = jQuery_API_ACU(this).data('code');
                removeDataIsolationHistory_ACU(targetCode);
                renderDataIsolationHistoryDropdown_ACU();
            });
        }

        if ($dataIsolationCombo.length) {
            jQuery_API_ACU(document).on('click', function(e) {
                if (!$dataIsolationCombo.hasClass('open')) return;
                if (jQuery_API_ACU(e.target).closest($dataIsolationCombo).length === 0) {
                    closeDataIsolationHistoryDropdown_ACU();
                }
            });
        }

      // [新增] 外部导入事件绑定
      if ($importTxtButton.length) {
          $importTxtButton.on('click', handleTxtImportAndSplit_ACU);
      }
      // [新增] 外部导入注入按钮（自选表格）在下方统一绑定（使用 $injectImportedTxtButton）
      
      if ($injectImportedTxtButton && $injectImportedTxtButton.length) {
          $injectImportedTxtButton.on('click', handleInjectImportedTxtSelected_ACU);
      }

      // 导入表选择：全选 / 全不选
      if ($importTableSelectAll_ACU && $importTableSelectAll_ACU.length) {
          $importTableSelectAll_ACU.on('click', handleImportSelectAll_ACU);
      }
      if ($importTableSelectNone_ACU && $importTableSelectNone_ACU.length) {
          $importTableSelectNone_ACU.on('click', handleImportSelectNone_ACU);
      }
      
      // [新增] 删除注入条目按钮的事件绑定
      const $deleteImportedEntriesButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-imported-entries`);
      if ($deleteImportedEntriesButton.length) {
          $deleteImportedEntriesButton.on('click', deleteImportedEntries_ACU);
      }
      
      if ($clearImportedAllButton.length) {
          $clearImportedAllButton.on('click', () => clearImportedEntries_ACU(true));
      }
      // [新增] 绑定新按钮的点击事件
      if ($clearImportedCacheButton.length) {
          $clearImportedCacheButton.on('click', () => clearImportLocalStorage_ACU(true));
      }
      if ($saveImportSplitSizeButton_ACU.length) {
          $saveImportSplitSizeButton_ACU.on('click', saveImportSplitSize_ACU);
      }
      // Initial UI state update for the import tab
      void updateImportStatusUI_ACU();

      if ($useMainApiCheckbox_ACU.length) {
        $useMainApiCheckbox_ACU.on('change', function () {
            const useMainApi = jQuery_API_ACU(this).is(':checked');
            const result = setUseMainApi_ACU(useMainApi);
            if (!result.ok) {
              showToastr_ACU('error', result.message || 'Lưu công tắc API chính thất bại, đã khôi phục.');
              jQuery_API_ACU(this).prop('checked', !useMainApi);
              return;
            }
            updateCustomApiInputsState_ACU();
            showToastr_ACU('info', `API tùy chỉnh đã chuyển sang ${useMainApi ? 'dùng API chính' : 'dùng cấu hình riêng'}`);
        });
      }
      if ($loadModelsButton_ACU.length) $loadModelsButton_ACU.on('click', fetchModelsAndConnect_ACU);
      if ($saveApiConfigButton_ACU.length) $saveApiConfigButton_ACU.on('click', saveApiConfig_ACU);
      if ($clearApiConfigButton_ACU.length) $clearApiConfigButton_ACU.on('click', clearApiConfig_ACU);
      
      // [新增] 下拉选择改变时自动覆盖到输入框
      if ($customApiModelSelect_ACU.length) {
          $customApiModelSelect_ACU.on('change', function() {
              const selectedModel = jQuery_API_ACU(this).val();
              if (selectedModel && $customApiModelInput_ACU.length) {
                  $customApiModelInput_ACU.val(selectedModel);
              }
          });
      }

      // --- [新增] API预设管理事件绑定 ---
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-save-api-preset`).on('click', function() {
        const presetName = String($popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-name`).val() || '');
        if (saveApiPreset_ACU(presetName)) {
          $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-name`).val('');
        }
      });

      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-load-api-preset`).on('click', function() {
        const presetName = String($popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-select`).val() || '');
        if (presetName) {
          loadApiPreset_ACU(presetName);
        } else {
          showToastr_ACU('warning', 'Vui lòng chọn một preset trước.');
        }
      });

      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-api-preset`).on('click', function() {
        const presetName = String($popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-api-preset-select`).val() || '');
        if (presetName) {
          if (confirm(`Xác nhận xóa preset API "${presetName}"?`)) {
            deleteApiPreset_ACU(presetName);
          }
        } else {
          showToastr_ACU('warning', 'Vui lòng chọn một preset trước.');
        }
      });

      // 填表API预设选择器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-api-preset-select`).on('change', function() {
        const next = String(jQuery_API_ACU(this).val() || '');
        const result = setFeatureApiPreset_ACU('table', next);
        if (!result.ok) {
          showToastr_ACU('error', result.message || 'Lưu preset API điền bảng thất bại, đã khôi phục.');
          return;
        }
        logDebug_ACU(`填表API预设已切换为: ${next || '当前配置'}`);
      });

      // 填表正文标签提取规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`,
          { startPlaceholder: 'Từ bắt đầu (ví dụ: <think)', endPlaceholder: 'Từ kết thúc (ví dụ: </think>)' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-end`, function() {
        const rules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`);
        const result = setTableContextRules_ACU('extract', rules);
        if (!result.ok) showToastr_ACU('error', result.message || 'Lưu quy tắc trích xuất điền bảng thất bại, đã khôi phục.');
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        const rules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-extract-rules`);
        const result = setTableContextRules_ACU('extract', rules);
        if (!result.ok) showToastr_ACU('error', result.message || 'Lưu quy tắc trích xuất điền bảng thất bại, đã khôi phục.');
      });

      // 填表正文标签排除规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`,
          { startPlaceholder: 'Từ bắt đầu (ví dụ: <thinking)', endPlaceholder: 'Từ kết thúc (ví dụ: </thinking>)' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-end`, function() {
        const rules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`);
        const result = setTableContextRules_ACU('exclude', rules);
        if (!result.ok) showToastr_ACU('error', result.message || 'Lưu quy tắc loại trừ điền bảng thất bại, đã khôi phục.');
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        const rules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-table-context-exclude-rules`);
        const result = setTableContextRules_ACU('exclude', rules);
        if (!result.ok) showToastr_ACU('error', result.message || 'Lưu quy tắc loại trừ điền bảng thất bại, đã khôi phục.');
      });

      // 剧情推进API预设选择器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-plot-api-preset-select`).on('change', function() {
        const next = String(jQuery_API_ACU(this).val() || '');
        const result = setFeatureApiPreset_ACU('plot', next);
        if (!result.ok) {
          showToastr_ACU('error', result.message || 'Lưu preset API đẩy cốt truyện thất bại, đã khôi phục.');
          return;
        }
        logDebug_ACU(`剧情推进API预设已切换为: ${next || '当前配置'}`);
      });

      if ($charCardPromptToggle_ACU.length)
        $charCardPromptToggle_ACU.on('click', () => $charCardPromptAreaDiv_ACU.slideToggle());
      if ($saveCharCardPromptButton_ACU.length) $saveCharCardPromptButton_ACU.on('click', saveCustomCharCardPrompt_ACU);
      if ($resetCharCardPromptButton_ACU.length)
        $resetCharCardPromptButton_ACU.on('click', resetDefaultCharCardPrompt_ACU);
      // 由上方"提示词组 JSON 导入/导出"统一做 off/on 绑定，避免重复绑定导致多次触发
      // if ($loadCharCardPromptFromJsonButton_ACU.length) $loadCharCardPromptFromJsonButton_ACU.on('click', loadCharCardPromptFromJson_ACU);
      
        if ($importTemplateButton_ACU.length) {
            $importTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                importTableTemplate_ACU({ scope: 'global' });
            });
        }
        if ($exportTemplateButton_ACU.length) {
            $exportTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                exportTableTemplate_ACU({ scope: 'global' });
            });
        }
        if ($resetTemplateButton_ACU.length) {
            $resetTemplateButton_ACU.off('click.acu_template_scope').on('click.acu_template_scope', function() {
                resetTableTemplate_ACU({ source: 'ui_global_reset', scope: 'global' });
            });
        }

        const refreshTemplatePresetUiState_ACU = ({ globalSelectName = null, keepGlobalValue = false } = {}) => {
            if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;
            loadTemplatePresetSelect_ACU({ globalSelectName, keepGlobalValue });
        };

        const applyChatTemplateWithDestructiveConfirmation_ACU = async (apply: (destructiveChangeConfirmed: boolean) => Promise<any>) => {
            const firstResult = await apply(false);
            if (!firstResult || firstResult.saved !== false || !Array.isArray(firstResult.blockers)) return firstResult;
            const destructiveBlockers = firstResult.blockers.filter((blocker: unknown) => (
                typeof blocker === 'string' && (/删除(?:表|列).+需要显式确认/.test(blocker) || /Xóa (?:bảng|cột) .+ cần xác nhận (?:rõ ràng|tường minh)/.test(blocker))
            ));
            if (destructiveBlockers.length === 0) return firstResult;
            const confirmed = confirm(
                `Thay đổi mẫu này sẽ xóa bảng hoặc cột hiện có:\n${destructiveBlockers.join('\n')}\n\nSau khi xác nhận sẽ thực hiện theo commit nguyên tử V2. Dữ liệu đã xóa chỉ có thể khôi phục qua bản sao lưu cuộc trò chuyện hoặc checkpoint.`,
            );
            return confirmed ? apply(true) : firstResult;
        };

        const persistCurrentTemplateChatSnapshot_ACU = async ({ source = 'ui_chat_save', presetName = null, showToast = true } = {}) => {
            const selectedChatPresetName = normalizeTemplatePresetSelectionValue_ACU(
                jQuery_API_ACU($templateChatPresetSelect_ACU).val(),
            );
            const resolvedPresetName = presetName === null
                ? (selectedChatPresetName || resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }))
                : normalizeTemplatePresetSelectionValue_ACU(presetName);
            const applied = await applyChatTemplateWithDestructiveConfirmation_ACU(destructiveChangeConfirmed => applyTemplateSnapshotToScope_ACU(TABLE_TEMPLATE_ACU, {
                scope: 'chat',
                source,
                save: true,
                persistChatScope: true,
                presetName: resolvedPresetName,
                registerChatPresetEntry: false,
                destructiveChangeConfirmed,
            }));
            if (!applied || ('saved' in applied && applied.saved === false)) {
                const error = applied && typeof applied === 'object' && 'error' in applied && typeof applied.error === 'string'
                    ? applied.error
                    : 'Lưu preset mẫu của cuộc trò chuyện hiện tại thất bại.';
                showToastr_ACU('error', error, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                return false;
            }
            refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
            if (showToast) {
                const warning = typeof applied === 'object' && 'postCommitWarning' in applied && typeof applied.postCommitWarning === 'string'
                    ? applied.postCommitWarning
                    : '';
                showToastr_ACU(
                    warning ? 'warning' : 'success',
                    warning || `Đã lưu preset của cuộc trò chuyện hiện tại${resolvedPresetName ? ` (tên preset: ${resolvedPresetName})` : ' (preset mặc định)'}; lần lưu sau trong cuộc trò chuyện này sẽ ghi đè preset cùng tên.`,
                    { acuToastCategory: warning ? ACU_TOAST_CATEGORY_ACU.ERROR : ACU_TOAST_CATEGORY_ACU.IMPORT },
                );
            }
            return true;
        };

        const exportCurrentChatTemplateSnapshot_ACU = () => {
            const effectivePresetName = normalizeTemplatePresetSelectionValue_ACU(resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true }));
            const chatScopeState = getCurrentChatTemplateScopeState_ACU();
            const snapshot = sanitizeTemplateSnapshotForChat_ACU(chatScopeState?.templateStr || TABLE_TEMPLATE_ACU);
            if (!snapshot?.templateObj) {
                showToastr_ACU('error', 'Đọc snapshot mẫu của cuộc trò chuyện hiện tại thất bại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                return;
            }

            const jsonString = JSON.stringify(snapshot.templateObj, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template_chat_snapshot_${(effectivePresetName || 'default').replace(/[^a-z0-9]/gi, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToastr_ACU('success', `Đã xuất snapshot mẫu của cuộc trò chuyện hiện tại${effectivePresetName ? ` (tên preset: ${effectivePresetName})` : ''}.`, {
                acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT,
            });
        };

        refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: false });

        // --- [模板预设库] 全局 / 当前聊天双作用域 ---
        if ($templatePresetSelect_ACU && $templatePresetSelect_ACU.length) {
            $templatePresetSelect_ACU.off('change.acu_template_preset').on('change.acu_template_preset', async function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU(this).val());
                const displayName = name || 'Preset mặc định';
                showToastr_ACU('info', `Đang chuyển preset mẫu toàn cục: ${displayName}...`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                // S1-3：inherit_global 聊天下全局切换经协调器，破坏性 blockers 需确认重试，
                // saved:false（fail-closed，全局未变）必须按失败处理。
                const result = await applyChatTemplateWithDestructiveConfirmation_ACU(destructiveChangeConfirmed => applyTemplatePresetToCurrent_ACU(name, {
                    source: 'ui_global_select',
                    updateGlobal: true,
                    save: true,
                    persistChatScope: false,
                    destructiveChangeConfirmed,
                }));
                if (result && (!(typeof result === 'object' && 'saved' in result) || result.saved !== false)) {
                    refreshPresetUIAfterSwitch_ACU({ templateGlobalSelectName: name, keepTemplateGlobalValue: false });
                    const warning = typeof result === 'object' && 'postCommitWarning' in result && typeof result.postCommitWarning === 'string'
                        ? result.postCommitWarning
                        : '';
                    if (warning) {
                        showToastr_ACU('warning', warning, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    } else {
                        showToastr_ACU('success', `Đã chuyển preset mẫu toàn cục: ${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    }
                } else {
                    const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' && result.error
                        ? result.error
                        : `Chuyển preset mẫu toàn cục thất bại: ${displayName}`;
                    showToastr_ACU('error', error, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: false });
                }
            });
        }
        if ($templateChatPresetSelect_ACU && $templateChatPresetSelect_ACU.length) {
            $templateChatPresetSelect_ACU.off('change.acu_template_preset').on('change.acu_template_preset', async function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU(this).val());
                const displayName = name || 'Preset mặc định';
                showToastr_ACU('info', `Đang chuyển preset mẫu của cuộc trò chuyện hiện tại: ${displayName}...`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                const result = await applyChatTemplateWithDestructiveConfirmation_ACU(destructiveChangeConfirmed => applyTemplatePresetToCurrent_ACU(name, {
                    source: 'ui_chat_select',
                    updateGlobal: false,
                    save: true,
                    persistChatScope: true,
                    destructiveChangeConfirmed,
                }));
                if (result && (!(typeof result === 'object' && 'saved' in result) || result.saved !== false)) {
                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
                    const warning = typeof result === 'object' && 'postCommitWarning' in result && typeof result.postCommitWarning === 'string'
                        ? result.postCommitWarning
                        : '';
                    if (warning) {
                        showToastr_ACU('warning', warning, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    } else if ((result as any).mode === 'chat_override') {
                        showToastr_ACU('success', `Cuộc trò chuyện hiện tại đã chuyển sang preset mẫu cục bộ: ${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    } else {
                        showToastr_ACU('success', `Cuộc trò chuyện hiện tại đã chuyển sang preset tham chiếu: ${displayName}; cuộc trò chuyện chưa tạo snapshot cục bộ.`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    }
                } else {
                    showToastr_ACU('error', `Chuyển preset mẫu của cuộc trò chuyện hiện tại thất bại: ${displayName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
                }
            });
        }
        if ($templatePresetSaveBtn_ACU && $templatePresetSaveBtn_ACU.length) {
            $templatePresetSaveBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const currentSelectedName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                let finalName = currentSelectedName;
                if (isDefaultTemplatePresetSelection_ACU(currentSelectedName)) {
                    const promptedName = prompt('Nhập tên preset mẫu toàn cục cần lưu:', 'Preset mẫu mới');
                    if (!promptedName) return;
                    finalName = String(promptedName).trim();
                } else if (!confirm(`Xác nhận dùng mẫu hiện tại để ghi đè preset toàn cục "${currentSelectedName}"? Preset toàn cục cùng tên sẽ bị ghi đè, preset cục bộ của cuộc trò chuyện hiện tại sẽ không tự bị xóa.`)) {
                    return;
                }
                if (!finalName) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', 'Lưu preset mẫu toàn cục thất bại: không thể phân tích mẫu hiện tại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', 'Lưu preset mẫu toàn cục thất bại: không thể ghi vào kho cài đặt.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_global_save',
                    updateGlobal: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied || (typeof applied === 'object' && 'saved' in applied && applied.saved === false)) {
                    const error = applied && typeof applied === 'object' && 'error' in applied && typeof applied.error === 'string' && applied.error
                        ? applied.error
                        : 'Chuyển preset mẫu toàn cục sau khi lưu thất bại.';
                    showToastr_ACU('error', error, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                showToastr_ACU('success', `Đã lưu preset mẫu toàn cục: ${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetSaveAsBtn_ACU && $templatePresetSaveAsBtn_ACU.length) {
            $templatePresetSaveAsBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const cur = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                const defaultName = cur ? `${cur}_bản sao` : 'Preset mẫu mới';
                const raw = prompt('Tên preset mẫu toàn cục khi lưu thành:', defaultName);
                if (!raw) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', 'Lưu thành preset mẫu toàn cục thất bại: không thể phân tích mẫu hiện tại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const requested = String(raw).trim();
                if (!requested) return;
                const finalName = ensureUniqueTemplatePresetName_ACU(requested);
                if (finalName !== requested) {
                    if (!confirm(`Tên preset đã tồn tại, sẽ tự động lưu thành "${finalName}". Tiếp tục?`)) return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', 'Lưu thành preset mẫu toàn cục thất bại: không thể ghi vào kho cài đặt.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_global_save_as',
                    updateGlobal: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied || (typeof applied === 'object' && 'saved' in applied && applied.saved === false)) {
                    const error = applied && typeof applied === 'object' && 'error' in applied && typeof applied.error === 'string' && applied.error
                        ? applied.error
                        : 'Chuyển preset mẫu toàn cục sau khi lưu thành thất bại.';
                    showToastr_ACU('error', error, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                showToastr_ACU('success', `Đã lưu thành preset mẫu toàn cục: ${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetRenameBtn_ACU && $templatePresetRenameBtn_ACU.length) {
            $templatePresetRenameBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                const oldName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                if (isDefaultTemplatePresetSelection_ACU(oldName)) {
                    showToastr_ACU('warning', 'Không thể đổi tên preset toàn cục mặc định.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                const preset = getTemplatePreset_ACU(oldName);
                if (!preset?.templateStr) {
                    showToastr_ACU('warning', 'Không tìm thấy preset mẫu toàn cục đang chọn.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                const newName = prompt(`Đổi tên preset mẫu toàn cục "${oldName}" thành:`, oldName);
                if (!newName) return;
                const nn = String(newName).trim();
                if (!nn) return;
                const saveOk = upsertTemplatePreset_ACU(nn, preset.templateStr);
                if (!saveOk) {
                    showToastr_ACU('error', 'Đổi tên preset mẫu toàn cục thất bại: không thể ghi vào kho cài đặt.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                if (nn !== oldName) {
                    deleteTemplatePreset_ACU(oldName);
                }
                if (normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false })) === oldName) {
                    persistCurrentTemplatePresetName_ACU(settings_ACU, nn, { save: false });
                    saveSettingsAndNotify_ACU();
                }
                refreshPresetUIAfterSwitch_ACU({ templateGlobalSelectName: nn, keepTemplateGlobalValue: false });
                showToastr_ACU('success', `Đã đổi tên preset mẫu toàn cục: ${oldName} → ${nn}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templatePresetDeleteBtn_ACU && $templatePresetDeleteBtn_ACU.length) {
            $templatePresetDeleteBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                const name = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templatePresetSelect_ACU).val());
                if (isDefaultTemplatePresetSelection_ACU(name)) {
                    showToastr_ACU('warning', 'Không thể xóa preset toàn cục mặc định.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    return;
                }
                if (!confirm(`Xác nhận xóa preset mẫu toàn cục "${name}"? Thao tác này không thể hoàn tác.`)) return;
                const ok = deleteTemplatePreset_ACU(name);
                refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: false });
                if (ok) {
                    const activeGlobalName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }));
                    if (activeGlobalName === name) {
                        showToastr_ACU('success', `Đã xóa preset khỏi thư viện mẫu toàn cục: ${name}. Profile hiện tại vẫn giữ snapshot mẫu này cho đến khi bạn chuyển lại hoặc khôi phục mặc định.`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    } else {
                        showToastr_ACU('success', `Đã xóa preset mẫu toàn cục: ${name}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                    }
                } else {
                    showToastr_ACU('warning', `Xóa thất bại hoặc preset mẫu toàn cục không tồn tại: ${name}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                }
            });
        }
        if ($templateChatSaveBtn_ACU && $templateChatSaveBtn_ACU.length) {
            $templateChatSaveBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                await persistCurrentTemplateChatSnapshot_ACU({ source: 'ui_chat_save' });
            });
        }
        if ($templateChatExportBtn_ACU && $templateChatExportBtn_ACU.length) {
            $templateChatExportBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                exportCurrentChatTemplateSnapshot_ACU();
            });
        }
        if ($templateChatClearOverrideBtn_ACU && $templateChatClearOverrideBtn_ACU.length) {
            $templateChatClearOverrideBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', async function() {
                const currentSelectedName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templateChatPresetSelect_ACU).val());
                let finalName = currentSelectedName;
                if (isDefaultTemplatePresetSelection_ACU(currentSelectedName)) {
                    const promptedName = prompt('Nhập tên preset mẫu cần lưu vào toàn cục:', 'Preset mẫu mới');
                    if (!promptedName) return;
                    finalName = String(promptedName).trim();
                } else if (!confirm(`Xác nhận dùng mẫu đang dùng trong cuộc trò chuyện hiện tại để ghi đè preset toàn cục "${currentSelectedName}"?`)) {
                    return;
                }
                if (!finalName) return;
                const norm = normalizeTemplateForPresetSave_ACU();
                if (!norm) {
                    showToastr_ACU('error', 'Lưu vào toàn cục thất bại: không thể phân tích mẫu hiện tại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const ok = upsertTemplatePreset_ACU(finalName, norm.templateStr);
                if (!ok) {
                    showToastr_ACU('error', 'Lưu vào toàn cục thất bại: không thể ghi vào kho cài đặt.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                const applied = await applyTemplatePresetToCurrent_ACU(finalName, {
                    source: 'ui_chat_save_to_global',
                    updateGlobal: true,
                    save: true,
                    persistChatScope: false,
                });
                if (!applied || (typeof applied === 'object' && 'saved' in applied && applied.saved === false)) {
                    const error = applied && typeof applied === 'object' && 'error' in applied && typeof applied.error === 'string' && applied.error
                        ? applied.error
                        : 'Chuyển preset mẫu toàn cục sau khi lưu vào toàn cục thất bại.';
                    showToastr_ACU('error', error, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                    return;
                }
                refreshPresetUIAfterSwitch_ACU({ templateGlobalSelectName: finalName, keepTemplateGlobalValue: false });
                showToastr_ACU('success', `Đã lưu cấu hình mẫu của cuộc trò chuyện hiện tại vào preset toàn cục: ${finalName}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
            });
        }
        if ($templateChatImportBtn_ACU && $templateChatImportBtn_ACU.length) {
            $templateChatImportBtn_ACU.off('click.acu_template_preset').on('click.acu_template_preset', function() {
                if ($templateChatPresetFileInput_ACU && $templateChatPresetFileInput_ACU.length) {
                    $templateChatPresetFileInput_ACU.click();
                }
            });
        }
        if ($templateChatPresetFileInput_ACU && $templateChatPresetFileInput_ACU.length) {
            $templateChatPresetFileInput_ACU.off('change.acu_template_preset').on('change.acu_template_preset', function(e) {
                const file = (e.target as HTMLInputElement).files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async readerEvent => {
                    try {
                        const content = String(readerEvent?.target?.result || '');
                        const prepared = parseImportedTemplateData_ACU(content);
                        const fallbackLabel = `Mau_nhap_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
                const selectedChatPresetName = normalizeTemplatePresetSelectionValue_ACU(jQuery_API_ACU($templateChatPresetSelect_ACU).val() as string);
                        const presetName = normalizeTemplatePresetSelectionValue_ACU(
                            deriveTemplatePresetNameForImport_ACU({
                                filename: file?.name,
                                fallbackLabel: selectedChatPresetName || fallbackLabel,
                            }) || selectedChatPresetName || fallbackLabel,
                        );
                        const applied = await applyChatTemplateWithDestructiveConfirmation_ACU(destructiveChangeConfirmed => applyChatTemplateSnapshotWithReconciliation_ACU(prepared.templateObj, {
                            source: 'ui_chat_import',
                            presetName,
                            destructiveChangeConfirmed,
                        }));
                        if (!applied.saved) {
                            throw new Error(applied.error || 'Cấu trúc mẫu không hợp lệ, không thể tạo preset mẫu cho cuộc trò chuyện hiện tại.');
                        }
                        refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
                        const warning = typeof applied.postCommitWarning === 'string' ? applied.postCommitWarning : '';
                        showToastr_ACU(
                            warning ? 'warning' : 'success',
                            warning || `Đã nhập preset mẫu của cuộc trò chuyện hiện tại${presetName ? ` (tên preset: ${presetName})` : ''}; preset cùng tên sẽ bị ghi đè.`,
                            { acuToastCategory: warning ? ACU_TOAST_CATEGORY_ACU.ERROR : ACU_TOAST_CATEGORY_ACU.IMPORT },
                        );
                    } catch (error) {
                        logError_ACU('[TemplateScope] 导入当前聊天模板预设失败:', error);
                        showToastr_ACU('error', `Nhập preset mẫu của cuộc trò chuyện hiện tại thất bại: ${error.message}`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR, timeOut: 10000 });
                    } finally {
                        $templateChatPresetFileInput_ACU.val('');
                    }
                };
                reader.readAsText(file, 'UTF-8');
            });
        }
        if ($resetAllDefaultsButton_ACU.length) $resetAllDefaultsButton_ACU.on('click', resetAllToDefaults_ACU);
        if ($exportJsonDataButton_ACU.length) $exportJsonDataButton_ACU.on('click', exportCurrentJsonData_ACU);

        // [新增] 模板覆盖最新层数据按钮绑定
        const $overrideWithTemplateButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-override-with-template`);
        if ($overrideWithTemplateButton.length) {
            $overrideWithTemplateButton.on('click', overrideLatestLayerWithTemplate_ACU);
        }
        
        // [新增] 删除本地数据按钮绑定
        const $deleteCurrentLocalDataButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data`);
        const $deleteAllLocalDataButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data`);

        if ($deleteCurrentLocalDataButton.length) {
            $deleteCurrentLocalDataButton.on('click', function() {
                const $startFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                const $endFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);

                const startFloor = $startFloor.length ? parseInt($startFloor.val() as string) || null : null;
                const endFloor = $endFloor.length && $endFloor.val() ? parseInt($endFloor.val() as string) || null : null;

                // 保存楼层范围设置
                settings_ACU.deleteStartFloor = startFloor;
                settings_ACU.deleteEndFloor = endFloor;
                saveSettingsAndNotify_ACU();

                const identityText = settings_ACU.dataIsolationEnabled ? `mã định danh [${settings_ACU.dataIsolationCode}]` : "tất cả mã định danh";
                const rangeText = startFloor && endFloor ? `tầng AI ${startFloor} đến ${endFloor}` :
                                startFloor ? `từ tầng AI ${startFloor} trở đi` :
                                endFloor ? `đến hết tầng AI ${endFloor}` : "tất cả tầng AI";

                if (confirm(`Cảnh báo: thao tác này sẽ xóa vĩnh viễn toàn bộ dữ liệu cơ sở dữ liệu thuộc ${identityText} ở ${rangeText} trong lịch sử trò chuyện hiện tại.\n\nThao tác không thể khôi phục!\n\nXác nhận tiếp tục?`)) {
                    deleteLocalDataInChat_ACU('current', startFloor, endFloor);
                }
            });
        }

        if ($deleteAllLocalDataButton.length) {
            $deleteAllLocalDataButton.on('click', function() {
                const $startFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-start-floor`);
                const $endFloor = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-delete-end-floor`);
                const startFloor = $startFloor.length ? parseInt($startFloor.val() as string) || null : null;
                const endFloor = $endFloor.length && $endFloor.val() ? parseInt($endFloor.val() as string) || null : null;

                // 保存楼层范围设置：all 现在也依赖楼层范围判定（是否触发硬清空）
                settings_ACU.deleteStartFloor = startFloor;
                settings_ACU.deleteEndFloor = endFloor;
                saveSettingsAndNotify_ACU();

                const chat = getChatArray_ACU();
                const aiMessageCount = Array.isArray(chat) ? chat.filter((msg: any) => !msg?.is_user).length : 0;
                const isFullRange = isFullRangeDeletionRequest_ACU(startFloor, endFloor, aiMessageCount);

                if (!isFullRange) {
                    const rangeText = startFloor && endFloor ? `tầng AI ${startFloor} đến ${endFloor}`
                        : startFloor ? `từ tầng AI ${startFloor} trở đi`
                        : `đến hết tầng AI ${endFloor}`;
                    if (confirm(`Cảnh báo: thao tác này sẽ xóa vĩnh viễn dữ liệu cơ sở dữ liệu của mọi mã định danh ở ${rangeText}.\n\n`
                         + 'Chỉ xóa dữ liệu điền bảng của các tầng trong phạm vi này; scope mẫu cấp cuộc trò chuyện và vùng chứa guide được giữ lại.\n\n'
                            + 'Thao tác không thể khôi phục! Xác nhận tiếp tục?')) {
                        deleteLocalDataInChat_ACU('all', startFloor, endFloor);
                    }
                    return;
                }

                if (confirm('Cảnh báo nghiêm trọng: phạm vi xóa hiện tại bao trùm toàn bộ tầng AI, sẽ xóa sạch toàn bộ trạng thái cơ sở dữ liệu cục bộ của cuộc trò chuyện hiện tại.\n\n'
                        + '· Xóa dữ liệu cục bộ của mọi mã định danh cô lập;\n'
                        + '· Bao gồm các trường trên tin nhắn đầu tiên của người dùng;\n'
                        + '· Xóa scope mẫu cấp cuộc trò chuyện và vùng chứa guide (lựa chọn mẫu quay về kế thừa toàn cục);\n'
                        + '· Không giữ neo init, khi điền bảng lại sheetKey sẽ được cấp phát lại;\n'
                        + '· Kết quả tương đương một phiên hoàn toàn mới, không thể khôi phục.\n\n'
                        + 'Nếu chỉ muốn xóa một phần tầng, hãy đặt phạm vi tầng bắt đầu/kết thúc ở trên trước.\n'
                        + 'Toàn cục, prompt và nội dung trò chuyện không bị ảnh hưởng. Xác nhận tiếp tục?')) {
                    if (confirm('Xác nhận lại: bạn thật sự muốn xóa sạch toàn bộ bản lưu cơ sở dữ liệu của cuộc trò chuyện hiện tại? Thao tác này không thể hoàn tác.')) {
                        deleteLocalDataInChat_ACU('all', startFloor, endFloor);
                    }
                }
            });
        }

        if ($importCombinedSettingsButton.length) $importCombinedSettingsButton.on('click', importCombinedSettings_ACU);
        if ($exportCombinedSettingsButton.length) $exportCombinedSettingsButton.on('click', exportCombinedSettings_ACU);

}
