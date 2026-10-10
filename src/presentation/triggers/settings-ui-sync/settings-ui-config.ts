/**
 * presentation/triggers/settings-ui-sync/settings-ui-config.ts
 */
import { AUTO_UPDATE_FLOOR_INCREASE_DELAY_ACU } from '../../../shared/defaults';
import { updateCardUpdateStatusDisplay_ACU } from '../../components/update-status-display';
import { getCharCardPromptFromUI_ACU, isAutoUpdatingCard_ACU, manualExtraHint_ACU, renderPromptSegments_ACU, wasStoppedByUser_ACU, _set_isAutoUpdatingCard_ACU, _set_manualExtraHint_ACU } from '../../components/plot-editors';
import { showToastr_ACU } from '../../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../../shared/constants';
import { SillyTavern_API_ACU, TavernHelper_API_ACU, toastr_API_ACU, _set_SillyTavern_API_ACU, _set_TavernHelper_API_ACU, _set_jQuery_API_ACU, _set_toastr_API_ACU } from '../../../shared/host-api';
import { jQuery_API_ACU } from '../../dom-utils';
import { getChatArray_ACU, saveChatToHost_ACU } from '../../../service/chat/chat-service';
import { getConnectionManagerProfiles_ACU } from '../../../service/ai/ai-service';
import { getCurrentCharacterFallback_ACU } from '../../../service/host/host-state-service';
import { NEW_MESSAGE_DEBOUNCE_DELAY_ACU, allChatMessages_ACU, coreApisAreReady_ACU, currentJsonTableData_ACU, getCurrentIsolationKey_ACU, lastTotalAiMessages_ACU, settings_ACU , _set_coreApisAreReady_ACU, _set_lastTotalAiMessages_ACU} from '../../../service/runtime/state-manager';
import { $popupInstance_ACU, $customApiUrlInput_ACU, $customApiKeyInput_ACU, $customApiModelInput_ACU, $customApiModelSelect_ACU, $maxTokensInput_ACU, $temperatureInput_ACU, $apiStatusDisplay_ACU, $charCardPromptSegmentsContainer_ACU, $autoUpdateThresholdInput_ACU, $autoUpdateTokenThresholdInput_ACU, $autoUpdateFrequencyInput_ACU, $updateBatchSizeInput_ACU, $maxConcurrentGroupsInput_ACU, $skipUpdateFloorsInput_ACU, $retainRecentLayersInput_ACU, $tableMaxRetriesInput_ACU, $manualExtraHintCheckbox_ACU } from '../../state/ui-refs';
import { checkAutoMergeTrigger_ACU, prepareAutoMergeBatches_ACU, executeAutoMergeBatch_ACU, finalizeAutoMerge_ACU } from '../../../service/summary/merge-logic';
import { processUpdates_ACU } from '../update-process';
import { getSortedSheetKeys_ACU } from '../../../service/template/chat-scope';
import { loadAllChatMessages_ACU } from '../../../service/worldbook/pipeline';
import { refreshMergedDataAndNotifyWithUI_ACU } from '../../components/pipeline-ui-helpers';
import { SCRIPT_ID_PREFIX_ACU } from '../../../shared/constants';
import { escapeHtml_ACU } from '../../../shared/html-helpers';
import { topLevelWindow_ACU } from '../../../shared/env';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { executeContentOptimization_ACU } from '../../components/optimization-ui';
import { maybeLiftWorldbookSuppression_ACU } from '../../../service/runtime/helpers-remaining';
// [V1 收敛] 填表提示词写权限收敛到 service 事务式函数。
import { setCurrentPromptSegments_ACU, resetCurrentPromptToDefault_ACU, setUpdateNumberFields_ACU } from '../../../service/settings/settings-write-service';

  export function saveCustomCharCardPrompt_ACU() {
    if (!$popupInstance_ACU || !$charCardPromptSegmentsContainer_ACU) {
      logError_ACU('保存更新预设失败：UI元素未初始化。');
      return;
    }
    let newPromptSegments = getCharCardPromptFromUI_ACU();
    if (!newPromptSegments || newPromptSegments.length === 0 || (newPromptSegments.length === 1 && !newPromptSegments[0].content.trim())) {
      showToastr_ACU('warning', 'Preset cập nhật không được để trống.');
      return;
    }

    // [健全性] 主提示词槽位去重：A/B 各最多一个（多余的自动降级为普通段落）
    try {
      const seen = { A: false, B: false };
      newPromptSegments = newPromptSegments.map(seg => {
        const slot = String(seg?.mainSlot || (seg?.isMain ? 'A' : (seg?.isMain2 ? 'B' : ''))).toUpperCase();
        if (slot === 'A' || slot === 'B') {
          if (seen[slot]) {
            const cleaned = { ...seg };
            delete cleaned.mainSlot;
            delete cleaned.isMain;
            delete cleaned.isMain2;
            cleaned.deletable = cleaned.deletable !== false;
            return cleaned;
          }
          seen[slot] = true;
        }
        return seg;
      });
    } catch (e) {}

    // [V1 收敛] 委托 service 事务式保存；保存失败已回滚，不再触发全量 reload。
    const result = setCurrentPromptSegments_ACU(newPromptSegments);
    if (!result.ok) {
      showToastr_ACU('error', result.message || 'Lưu preset cập nhật thất bại, đã khôi phục.');
      return;
    }
    showToastr_ACU('success', 'Đã lưu preset cập nhật!');
  }

  export function resetDefaultCharCardPrompt_ACU() {
    // [V1 收敛] 委托 service 事务式重置；保存失败已回滚，不再触发全量 reload。
    const result = resetCurrentPromptToDefault_ACU();
    if (!result.ok) {
      showToastr_ACU('error', result.message || 'Khôi phục prompt mặc định thất bại, đã khôi phục trạng thái cũ.');
      return;
    }
    showToastr_ACU('info', 'Preset cập nhật đã khôi phục về mặc định!');
  }
  export function loadCharCardPromptFromJson_ACU() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = (e.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = readerEvent => {
            const content = readerEvent.target.result;
            let jsonData;

            try {
                jsonData = JSON.parse(content as string);
            } catch (error) {
                logError_ACU('导入提示词模板失败：JSON解析错误。', error);
                showToastr_ACU('error', 'Tệp không phải định dạng JSON hợp lệ.', { timeOut: 5000 });
                return;
            }
            
            try {
                // Basic validation: must be an array of objects with role and content
                if (!Array.isArray(jsonData) || jsonData.some(item => typeof item.role === 'undefined' || typeof item.content === 'undefined')) {
                    throw new Error('Định dạng JSON không đúng. Phải là một mảng các đối tượng chứa khóa "role" và "content".');
                }
                
                // Add deletable: true and normalize roles for consistency
                const segments = jsonData.map(item => {
                    let normalizedRole = 'USER'; // Default to USER
                    if (item.role) {
                        const roleLower = item.role.toLowerCase();
                        if (roleLower === 'system') {
                            normalizedRole = 'SYSTEM';
                        } else if (roleLower === 'assistant' || roleLower === 'ai') {
                            normalizedRole = 'assistant';
                        }
                    }
                    const slot = String(item?.mainSlot || (item?.isMain ? 'A' : (item?.isMain2 ? 'B' : ''))).toUpperCase();
                    const normalizedSlot = (slot === 'A' || slot === 'B') ? slot : '';
                    return {
                        ...item,
                        role: normalizedRole,
                        mainSlot: normalizedSlot || item.mainSlot,
                        // 主提示词A/B不可删除
                        deletable: (normalizedSlot ? false : (item.deletable !== false)),
                    };
                });

                // Use the existing render function
                renderPromptSegments_ACU(segments);
                showToastr_ACU('success', 'Đã tải mẫu prompt thành công!');
                logDebug_ACU('New prompt template loaded from JSON file.');

            } catch (error) {
                logError_ACU('导入提示词模板失败：结构验证失败。', error);
                showToastr_ACU('error', `Nhập thất bại: ${error.message}`, { timeOut: 10000 });
            }
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  // [新增] 导出"填表提示词组(更新预设/AI指令预设)"为 JSON（与 loadCharCardPromptFromJson_ACU 联动）
  export function exportCharCardPromptToJson_ACU() {
    try {
      const segments = getCharCardPromptFromUI_ACU();
      if (!Array.isArray(segments) || segments.length === 0) {
        showToastr_ACU('warning', 'Không có mẫu prompt để xuất.');
        return;
      }
      // 基础校验：必须包含 role/content
      const invalid = segments.some(s => !s || typeof s !== 'object' || typeof s.role === 'undefined' || typeof s.content === 'undefined');
      if (invalid) {
        showToastr_ACU('error', 'Xuất thất bại: cấu trúc prompt không đầy đủ (thiếu role hoặc content).');
        return;
      }

      const jsonString = JSON.stringify(segments, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TavernDB_TablePromptGroup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToastr_ACU('success', 'Đã xuất mẫu prompt thành JSON!', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.MANUAL_TABLE });
    } catch (e) {
      logError_ACU('导出提示词模板失败:', e);
      showToastr_ACU('error', 'Xuất mẫu prompt thất bại, hãy kiểm tra console để biết chi tiết.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }
  export function saveAutoUpdateThreshold_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateThresholdInput_ACU) {
      logError_ACU('保存阈值失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateThresholdInput_ACU.val() as string;
    const newT = parseInt(valStr, 10);

    if (!isNaN(newT) && newT >= 0) {
      // [V1 收敛] 委托 service 事务式写入（含归一化与保存失败回滚）
      const result = setUpdateNumberFields_ACU({ autoUpdateThreshold: newT });
      if (!result.ok) {
        if (!silent) showToastr_ACU('error', result.message || 'Lưu ngưỡng tự động cập nhật thất bại, đã khôi phục.');
        return;
      }
      if (!silent) {
        if (newT === 0) showToastr_ACU('success', 'Đã lưu ngưỡng tự động cập nhật! Tự động cập nhật bảng chuẩn đã tắt.');
        else showToastr_ACU('success', 'Đã lưu ngưỡng tự động cập nhật!');
      }
    } else {
      if (!silent) showToastr_ACU('warning', `Ngưỡng "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn hoặc bằng 0. Khôi phục về: ${settings_ACU.autoUpdateThreshold}`);
      $autoUpdateThresholdInput_ACU.val(settings_ACU.autoUpdateThreshold);
    }
  }

  export function saveAutoUpdateTokenThreshold_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateTokenThresholdInput_ACU) {
      logError_ACU('保存Token阈值失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateTokenThresholdInput_ACU.val() as string;
    const newT = parseInt(valStr, 10);

    if (!isNaN(newT) && newT >= 0) {
      // [V1 收敛] 委托 service 事务式写入
      const result = setUpdateNumberFields_ACU({ autoUpdateTokenThreshold: newT });
      if (!result.ok) {
        if (!silent) showToastr_ACU('error', result.message || 'Lưu ngưỡng Token tự động cập nhật thất bại, đã khôi phục.');
        return;
      }
      if (!silent) showToastr_ACU('success', 'Đã lưu ngưỡng Token tự động cập nhật!');
    } else {
      if (!silent) showToastr_ACU('warning', `Ngưỡng Token "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn hoặc bằng 0. Khôi phục về: ${settings_ACU.autoUpdateTokenThreshold}`);
      $autoUpdateTokenThresholdInput_ACU.val(settings_ACU.autoUpdateTokenThreshold);
    }
  }

  // [新增] 保存填表自动重试次数的函数
  export function saveTableMaxRetries_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$tableMaxRetriesInput_ACU) {
      logError_ACU('保存填表重试次数失败：UI元素未初始化。');
      return;
    }
    const valStr = $tableMaxRetriesInput_ACU.val() as string;
    const newR = parseInt(valStr, 10);
    if (!isNaN(newR) && newR >= 1 && newR <= 10) {
      // [V1 收敛] 委托 service 事务式写入
      const result = setUpdateNumberFields_ACU({ tableMaxRetries: newR });
      if (!result.ok) {
        if (!silent) showToastr_ACU('error', result.message || 'Lưu số lần tự động thử lại điền bảng thất bại, đã khôi phục.');
        return;
      }
      if (!silent) showToastr_ACU('success', 'Đã lưu số lần tự động thử lại điền bảng!');
    } else {
      if (!silent) showToastr_ACU('warning', `Số lần thử lại "${valStr}" không hợp lệ. Hãy nhập số nguyên từ 1 đến 10. Khôi phục về: ${settings_ACU.tableMaxRetries || 3}`);
      $tableMaxRetriesInput_ACU.val(settings_ACU.tableMaxRetries || 3);
    }
  }

  export function saveAutoUpdateFrequency_ACU({ silent = false, skipReload = false } = {}) {
    if (!$popupInstance_ACU || !$autoUpdateFrequencyInput_ACU) {
      logError_ACU('保存更新频率失败：UI元素未初始化。');
      return;
    }
    const valStr = $autoUpdateFrequencyInput_ACU.val() as string;
    const newF = parseInt(valStr, 10);

    if (!isNaN(newF) && newF >= 1) {
      // [V1 收敛] 委托 service 事务式写入
      const result = setUpdateNumberFields_ACU({ autoUpdateFrequency: newF });
      if (!result.ok) {
        if (!silent) showToastr_ACU('error', result.message || 'Lưu tần suất tự động cập nhật thất bại, đã khôi phục.');
        return;
      }
      if (!silent) showToastr_ACU('success', 'Đã lưu tần suất tự động cập nhật!');
    } else {
      if (!silent) showToastr_ACU('warning', `Tần suất cập nhật "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn 0. Khôi phục về: ${settings_ACU.autoUpdateFrequency}`);
      $autoUpdateFrequencyInput_ACU.val(settings_ACU.autoUpdateFrequency);
    }
  }


  // [新增] 保存批处理大小的函数
  export function saveUpdateBatchSize_ACU({ silent = false, skipReload = false } = {}) {
      if (!$popupInstance_ACU || !$updateBatchSizeInput_ACU) {
          logError_ACU('保存批处理大小失败：UI元素未初始化。');
          return;
      }
      const valStr = $updateBatchSizeInput_ACU.val() as string;
      const newBatchSize = parseInt(valStr, 10);

      if (!isNaN(newBatchSize) && newBatchSize >= 1) {
          // [V1 收敛] 委托 service 事务式写入
          const result = setUpdateNumberFields_ACU({ updateBatchSize: newBatchSize });
          if (!result.ok) {
              if (!silent) showToastr_ACU('error', result.message || 'Lưu kích thước lô thất bại, đã khôi phục.');
              return;
          }
          if (!silent) showToastr_ACU('success', 'Đã lưu kích thước lô!');
      } else {
          if (!silent) showToastr_ACU('warning', `Kích thước lô "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn 0. Khôi phục về: ${settings_ACU.updateBatchSize}`);
          $updateBatchSizeInput_ACU.val(settings_ACU.updateBatchSize);
      }
  }

  // [新增] 保存最大并发组数
  export function saveMaxConcurrentGroups_ACU({ silent = false, skipReload = false } = {}) {
      if (!$popupInstance_ACU || !$maxConcurrentGroupsInput_ACU) {
          logError_ACU('保存最大并发数失败：UI元素未初始化。');
          return;
      }
      const valStr = $maxConcurrentGroupsInput_ACU.val() as string;
      const newLimit = parseInt(valStr, 10);

      if (!isNaN(newLimit) && newLimit >= 1) {
          // [V1 收敛] 委托 service 事务式写入
          const result = setUpdateNumberFields_ACU({ maxConcurrentGroups: newLimit });
          if (!result.ok) {
              if (!silent) showToastr_ACU('error', result.message || 'Lưu số luồng đồng thời tối đa thất bại, đã khôi phục.');
              return;
          }
          if (!silent) showToastr_ACU('success', 'Đã lưu số luồng đồng thời tối đa!');
      } else {
          if (!silent) showToastr_ACU('warning', `Số luồng đồng thời tối đa "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn 0. Khôi phục về: ${settings_ACU.maxConcurrentGroups || 1}`);
          $maxConcurrentGroupsInput_ACU.val(settings_ACU.maxConcurrentGroups || 1);
      }
  }

   // [新增] 保存跳过更新楼层（全局）
   export function saveSkipUpdateFloors_ACU({ silent = false, skipReload = false } = {}) {
       if (!$popupInstance_ACU || !$skipUpdateFloorsInput_ACU) {
           logError_ACU('保存跳过更新楼层失败：UI元素未初始化。');
           return;
       }
       const valStr = $skipUpdateFloorsInput_ACU.val() as string;
       const newSkip = parseInt(valStr, 10);
 
       if (!isNaN(newSkip) && newSkip >= 0) {
           // [V1 收敛] 委托 service 事务式写入
           const result = setUpdateNumberFields_ACU({ skipUpdateFloors: newSkip });
           if (!result.ok) {
               if (!silent) showToastr_ACU('error', result.message || 'Lưu số tầng bỏ qua cập nhật thất bại, đã khôi phục.');
               return;
           }
           if (!silent) showToastr_ACU('success', 'Đã lưu số tầng bỏ qua cập nhật!');
       } else {
           if (!silent) showToastr_ACU('warning', `Số tầng bỏ qua cập nhật "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn hoặc bằng 0. Khôi phục về: ${settings_ACU.skipUpdateFloors || 0}`);
           $skipUpdateFloorsInput_ACU.val(settings_ACU.skipUpdateFloors || 0);
       }
   }

   // [新增] 保存"保留最近N个AI回复楼层数据"（全局）
   export function saveRetainRecentLayers_ACU({ silent = false, skipReload = false } = {}) {
       if (!$popupInstance_ACU || !$retainRecentLayersInput_ACU) {
           logError_ACU('保存 AI 回复楼层保留数失败：UI元素未初始化。');
           return;
       }
       const valStr = $retainRecentLayersInput_ACU.val() as string;
       const parsed = parseInt(valStr, 10);
       // 空字符串或无效值视为0（全部保留）
       const newRetain = (!valStr || valStr.trim() === '' || isNaN(parsed)) ? 0 : Math.max(0, parsed);

       // [V1 收敛] 委托 service 事务式写入
       const result = setUpdateNumberFields_ACU({ retainRecentLayers: newRetain });
       if (!result.ok) {
           if (!silent) showToastr_ACU('error', result.message || 'Lưu số tầng phản hồi AI giữ lại thất bại, đã khôi phục.');
           return;
       }
       if (!silent) {
           if (newRetain === 0) {
               showToastr_ACU('success', 'Đã xóa số tầng phản hồi AI giữ lại (sẽ giữ toàn bộ dữ liệu lịch sử)!');
           } else {
               showToastr_ACU('success', `Đã lưu số tầng phản hồi AI giữ lại: ${newRetain} tầng phản hồi AI gần nhất!`);
           }
       }
   }

   // [新增] 清理超出 AI 回复楼层保留数的旧本地数据（表格数据 + 剧情推进数据）
   // 按 AI 回复楼层计数，仅保留最近 N 个 AI 回复楼层的数据，更早楼层的 TavernDB_ACU_* 和 qrf_plot 字段将被删除
   // [重要] 此函数不会删除聊天第一层的"空白指导表"（TavernDB_ACU_InternalSheetGuide），
   //        指导表用于保存表头结构和填表参数，作为该聊天的总指导。
   // purgeOldLayerData_ACU 已搬迁到 service/chat/chat-service.ts
   // 通过 re-export 保持外部调用方兼容
   export { purgeOldLayerData_ACU } from '../../../service/chat/chat-service';
 
   export function saveImportSplitSize_ACU() {
       if (!$popupInstance_ACU) return;
      const $input = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-split-size`);
      if (!$input.length) {
          logError_ACU('保存导入分割大小失败：UI元素未初始化。');
          return;
      }
      const valStr = $input.val() as string;
      const newSize = parseInt(valStr, 10);

      if (!isNaN(newSize) && newSize >= 100) {
          // [V1 收敛] 委托 service 事务式写入
          const result = setUpdateNumberFields_ACU({ importSplitSize: newSize });
          if (!result.ok) {
              showToastr_ACU('error', result.message || 'Lưu kích thước chia khi nhập thất bại, đã khôi phục.');
              return;
          }
          showToastr_ACU('success', 'Đã lưu kích thước chia khi nhập!');
      } else {
          showToastr_ACU('warning', `Kích thước chia khi nhập "${valStr}" không hợp lệ. Hãy nhập một số nguyên lớn hơn hoặc bằng 100. Khôi phục về: ${settings_ACU.importSplitSize}`);
          $input.val(settings_ACU.importSplitSize);
      }
  }
