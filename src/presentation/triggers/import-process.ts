// import-process.ts — 导入编排逻辑（presentation 层：涉及 UI 读取和状态更新）


import { STORAGE_KEY_IMPORTED_ENTRIES_ACU, STORAGE_KEY_IMPORTED_STATUS_ACU, STORAGE_KEY_IMPORTED_STATUS_FULL_ACU, STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU, STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU } from '../../shared/data-constants';

import { importTempGet_ACU, importTempRemove_ACU, importTempSet_ACU } from '../../shared/idb-import-temp';
import { getImportWorldbookTarget_ACU, updateImportStatusUI_ACU } from '../components/import-status-ui';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { getSelectedImportTableKeys_ACU } from '../../service/settings/settings-readers';
import { getCurrentCharPrimaryLorebook_ACU, isWorldbookApiAvailable_ACU, loadImportedJsonDataFromLorebook_ACU, saveImportedJsonDataToLorebook_ACU, deleteImportedJsonDataFromLorebook_ACU } from '../../service/worldbook/worldbook-service';
// re-export 从 service 层搬迁的业务逻辑函数，保持外部调用方兼容
export { loadImportedJsonDataFromLorebook_ACU, saveImportedJsonDataToLorebook_ACU, deleteImportedJsonDataFromLorebook_ACU } from '../../service/worldbook/worldbook-service';
import { currentJsonTableData_ACU, settings_ACU, _set_currentJsonTableData_ACU} from '../../service/runtime/state-manager';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { proceedWithCardUpdate_ACU } from './update-process';
import { updateReadableLorebookEntry_ACU } from '../../service/worldbook/pipeline';
import { logDebug_ACU, logError_ACU, logWarn_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { setImportInjectButtonEnabled_ACU } from '../components/import-status-ui';
import { getSortedSheetKeys_ACU } from '../../service/template/chat-scope';
import { getInjectionTargetLorebook_ACU } from '../../service/worldbook/injection-engine';
import { initImportDatabase_ACU, saveChunkProgress_ACU, finalizeImportAndCleanup_ACU, clearImportedEntriesCore_ACU, deleteImportedEntriesCore_ACU } from '../../service/import/import-executor';

export   async function processImportedTxtAsUpdates_ACU() {
      // 外部导入：按"自选表格"处理与注入（与手动填表一致的表选择体验）
      const $injectButton: any = null; // 旧闭包变量，现在通过 UI 层控制

      const savedEntriesJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
      if (!savedEntriesJson) {
          logDebug_ACU('No imported entries found in storage.');
          return;
      }
      
      let allChunks;
      try {
          allChunks = JSON.parse(savedEntriesJson);
      } catch (e) {
          logError_ACU('Could not parse imported entries from storage.', e);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
          void updateImportStatusUI_ACU();
          return;
      }

      if (!Array.isArray(allChunks) || allChunks.length === 0) return;

      // 先获取导入目标世界书
      const importTargetLorebook = await getImportWorldbookTarget_ACU();
      if (!importTargetLorebook) {
          showToastr_ACU('error', 'Không thể chèn: chưa đặt sổ thế giới đích để chèn dữ liệu nhập.');
          return;
      }
      const importTarget = importTargetLorebook === 'character'
        ? await getCurrentCharPrimaryLorebook_ACU()
          : importTargetLorebook;
      if (!importTarget) {
          showToastr_ACU('error', 'Không thể chèn: không tìm thấy sổ thế giới đích thực tế của việc nhập.');
          return;
      }

      // 读取当前表选择（空且曾选择过 => 不允许执行）
      const selectedSheetKeys = getSelectedImportTableKeys_ACU();
      if (settings_ACU.hasImportTableSelection && (!selectedSheetKeys || selectedSheetKeys.length === 0)) {
          showToastr_ACU('error', 'Chưa chọn bảng nào, không thể chèn. Hãy chọn ít nhất một bảng trong "Chọn bảng chèn" trước.');
          return;
      }
      const selectionSig = JSON.stringify(selectedSheetKeys || []);

      if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(false);

      // [重构] 调用 service 层的 initImportDatabase_ACU 初始化/恢复导入数据库
      const initResult = await initImportDatabase_ACU(importTarget, selectedSheetKeys, allChunks, selectionSig);
      if (!initResult.success) {
          showToastr_ACU('error', initResult.error || 'Khởi tạo nhập thất bại.');
          if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(true);
          return;
      }

      const { status, modeSuffix } = initResult;

      // 自选表格：用统一模式 + 传入 targetSheetKeys，让 AI 只看/只改选中的表
      const updateMode = 'manual_unified';

      for (let i = status!.currentIndex; i < allChunks.length; i++) {
          const chunk = allChunks[i];
          const mockMessage = { is_user: false, mes: chunk.content, name: '导入文本' };
          
          let success = false;
          let attempt = 0;
          const MAX_RETRIES = 3;

          while (attempt < MAX_RETRIES && !success) {
              const toastMessage = `Đang xử lý ${i + 1}/${allChunks.length} (lần thử ${attempt + 1}/${MAX_RETRIES})...`;
              const updateResult = await proceedWithCardUpdate_ACU([mockMessage], toastMessage, -1, true, updateMode, false, selectedSheetKeys);
              success = updateResult.success;
              
              if (!success) {
                  attempt++;
                  logError_ACU(`处理区块 ${i + 1} 失败, 尝试次数 ${attempt}:`, "Update process returned false.");
                  if (attempt >= MAX_RETRIES) {
                      status!.currentIndex = i;
                      await importTempSet_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU, JSON.stringify(status));
                      showToastr_ACU('error', `Số lần xử lý thất bại quá nhiều, thao tác đã dừng. Hãy bấm "Tiếp tục" để thử lại sau.`);
                      void updateImportStatusUI_ACU();
                      if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(true);
                      return;
                  }
                  await new Promise(resolve => setTimeout(resolve, 2000));
              }
          }
          
          // [重构] 调用 service 层的 saveChunkProgress_ACU 保存中间状态
          const saved = await saveChunkProgress_ACU(importTarget, modeSuffix!, status!, i);
          if (!saved) {
              showToastr_ACU('error', `Khối thứ ${i + 1} xử lý thành công nhưng không thể lưu mục cơ sở dữ liệu tạm, đã dừng nhập tiếp.`);
              if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(true);
              return;
          }
      }

      // [重构] 调用 service 层的 finalizeImportAndCleanup_ACU 完成最终注入和清理
      showToastr_ACU('info', `Đã xử lý xong tất cả khối văn bản, đang tạo mục sổ thế giới cuối cùng (chèn bảng tự chọn)...`);
      const finalResult = await finalizeImportAndCleanup_ACU(importTarget, selectedSheetKeys, modeSuffix!, allChunks.length);

      if (finalResult.success) {
          if (finalResult.cleanedCount && finalResult.cleanedCount > 0) {
              showToastr_ACU('info', `Nhập từ bên ngoài hoàn tất: đã dọn ${finalResult.cleanedCount} mục cơ sở dữ liệu cũ.`);
          }
          showToastr_ACU('success', `Nhập từ bên ngoài đã hoàn tất: đã chèn ${allChunks.length} khối và gỡ liên kết với sổ thế giới.`);
      } else {
          showToastr_ACU('error', finalResult.error || 'Chèn cuối cùng thất bại.');
      }

      void updateImportStatusUI_ACU();
      if (typeof setImportInjectButtonEnabled_ACU === 'function') setImportInjectButtonEnabled_ACU(true);
      }


  // [T176] handleTxtImportAndSplit_ACU 已移到 presentation/components/import-status-ui.ts


export   async function handleInjectImportedTxtSelected_ACU() {
      showToastr_ACU('info', 'Bắt đầu xử lý tệp nhập (chèn bảng tự chọn)...', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
      await processImportedTxtAsUpdates_ACU();
  }


export   async function clearImportLocalStorage_ACU(notify = true) {
      try {
          const entriesExist = (await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU)) !== null;
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);
          // [新增] 清除所有模式的断点续行状态
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_STANDARD_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_SUMMARY_ACU);
          await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_FULL_ACU);
          if (notify && entriesExist) showToastr_ACU('success', 'Đã xóa bộ nhớ đệm tạm của việc nhập (IndexedDB) thành công.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          else if (notify && !entriesExist) showToastr_ACU('info', 'Không có bộ nhớ đệm tạm của việc nhập cần xóa.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          logDebug_ACU('[外部导入] Cleared imported txt entries and status from temp storage (IndexedDB preferred).');
          // Update the UI to reflect the change
          if (typeof updateImportStatusUI_ACU === 'function') {
              void updateImportStatusUI_ACU();
          }
          return true;
      } catch(error) {
          logError_ACU('[外部导入] Failed to clear import temp storage:', error);
          if (notify) showToastr_ACU('error', 'Lỗi khi xóa bộ nhớ đệm nhập.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
          return false;
      }
  }


export   async function clearImportedEntries_ACU(notify = true) {
    const targetLorebook = await getInjectionTargetLorebook_ACU();
    if (!targetLorebook) {
        showToastr_ACU('error', 'Không thể xóa mục nhập: chưa đặt đích chèn dữ liệu.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
        return;
    }

    try {
        // [重构] 调用 service 层核心逻辑
        const result = await clearImportedEntriesCore_ACU(targetLorebook);
        if (result.deletedCount > 0) {
            if (notify) showToastr_ACU('success', `Đã xóa ${result.deletedCount} mục nhập thành công.`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
        } else {
            if (notify) showToastr_ACU('info', 'Không tìm thấy mục sổ thế giới đã chèn nào để xóa.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
        }
        // 更新 UI
        if (typeof updateImportStatusUI_ACU === 'function') {
            void updateImportStatusUI_ACU();
        }
    } catch(error) {
        logError_ACU('Failed to delete imported lorebook entries:', error);
        if (notify) showToastr_ACU('error', 'Lỗi khi xóa mục nhập.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }


export   async function deleteImportedEntries_ACU() {
      const targetLorebook = await getImportWorldbookTarget_ACU();
      if (!targetLorebook) {
          showToastr_ACU('error', 'Không thể xóa mục đã chèn: chưa đặt sổ thế giới đích để chèn dữ liệu nhập.');
          return;
      }

      try {
          // [重构] 调用 service 层核心逻辑
          const deletedCount = await deleteImportedEntriesCore_ACU(targetLorebook);
          if (deletedCount > 0) {
              showToastr_ACU('success', `Đã xóa ${deletedCount} mục do nhập từ bên ngoài chèn vào.`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          } else {
              showToastr_ACU('info', `Không tìm thấy mục nhập từ bên ngoài khớp với mã định danh hiện tại trong sổ thế giới "${targetLorebook}".`, { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
          }
      } catch(error) {
          logError_ACU('Failed to delete imported entries:', error);
          showToastr_ACU('error', 'Lỗi khi xóa mục đã chèn.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
    }
  }



  // [T176] getImportWorldbookTarget_ACU 已移到 presentation/components/import-status-ui.ts



  // loadImportedJsonDataFromLorebook_ACU, saveImportedJsonDataToLorebook_ACU, deleteImportedJsonDataFromLorebook_ACU
  // 已搬迁到 service/worldbook/worldbook-service.ts
  // 通过文件顶部的 re-export 保持外部调用方兼容
