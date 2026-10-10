import { STORAGE_KEY_IMPORTED_ENTRIES_ACU, STORAGE_KEY_IMPORTED_STATUS_ACU } from '../../shared/data-constants';
import { importTempGet_ACU, importTempRemove_ACU } from '../../shared/idb-import-temp';
import { getImportSelectionFromUI_ACU, renderImportTableSelector_ACU } from './table-selector';
import { showToastr_ACU } from '../theme/toast';
import { ACU_TOAST_CATEGORY_ACU } from '../../shared/constants';
import { handleInjectImportedTxtSelected_ACU } from '../triggers/import-process';
import { importTxtTextAndSplitCore_ACU } from '../../service/import/import-executor';
import { settings_ACU } from '../../service/runtime/state-manager';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { $popupInstance_ACU, $importTableSelector_ACU } from '../state/ui-refs';
/**
 * presentation/components/import-status-ui.ts — 导入状态 UI
 * 从 features/import/01~03 迁移而来
 */
  // --- [新增] 外部导入功能 ---

  export const IMPORTED_ENTRY_PREFIX_ACU = 'TavernDB-ACU-ImportedTxt-';

  // 外部导入前缀：
  // - stable: 用于 UI 识别/手动删除
  export function getImportStablePrefix_ACU() { return '外部导入-'; }
  // 当前按用户要求：外部导入不自动清理，因此无需批次隔离；统一使用稳定前缀即可
  export function getImportBatchPrefix_ACU() { return getImportStablePrefix_ACU(); }

  // [新增] 只清除本地存储中的导入缓存


  // [新增] 删除外部导入注入的世界书条目

  // --- [新增] 外部导入功能 ---
  
  export async function updateImportStatusUI_ACU() {
      if (!$popupInstance_ACU) return;
      const $statusDisplay = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-status`);
      const $injectButton = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
      
      const savedEntriesJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
      const savedStatusJson = await importTempGet_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);

      if (savedEntriesJson) {
          try {
              const chunks = JSON.parse(savedEntriesJson);
              if (Array.isArray(chunks) && chunks.length > 0) {
                  // 同步渲染一次表选择器（防止模板/数据变更后列表不刷新）
                  if ($importTableSelector_ACU) renderImportTableSelector_ACU();

                  const currentSelection = getImportSelectionFromUI_ACU();
                  const selectionSig = JSON.stringify(currentSelection || []);

                  if (settings_ACU.hasImportTableSelection && (!currentSelection || currentSelection.length === 0)) {
                      $statusDisplay.text('Trạng thái: chưa chọn bảng nào, không thể chèn.').css('color', 'salmon');
                      $injectButton.text('2. Chèn (bảng tự chọn)').prop('disabled', true);
                      return;
                      }

                  let status = null;
                  if (savedStatusJson) {
                      try { status = JSON.parse(savedStatusJson); } catch (e) { status = null; }
                  }

                  const canResume =
                      status &&
                      typeof status.total === 'number' &&
                      status.total === chunks.length &&
                      typeof status.currentIndex === 'number' &&
                      status.currentIndex < status.total &&
                      (typeof status.selectionSig === 'undefined' || status.selectionSig === selectionSig);

                  if (canResume) {
                      $statusDisplay.text(`Trạng thái: đã tạm dừng, hoàn tất ${status.currentIndex}/${status.total}.`).css('color', 'orange');
                      $injectButton.text('Tiếp tục chèn (bảng tự chọn)').prop('disabled', false);
                      } else {
                  $statusDisplay.text(`Trạng thái: đã sẵn sàng ${chunks.length} mục để chèn.`).css('color', 'lightgreen');
                      $injectButton.text('2. Chèn (bảng tự chọn)').prop('disabled', false);
                  }
                  return;
              }
          } catch(e) {
             await importTempRemove_ACU(STORAGE_KEY_IMPORTED_ENTRIES_ACU);
             await importTempRemove_ACU(STORAGE_KEY_IMPORTED_STATUS_ACU);
          }
      }
      
      $statusDisplay.text('Trạng thái: chưa tải tệp.').css('color', '');
      $injectButton.text('2. Chèn (bảng tự chọn)').prop('disabled', true);
  }

  // [新增] 获取导入专用的世界书目标

  export function getImportJsonStorageComment_ACU(modeSuffix = '-Selected') {
      const IMPORT_PREFIX = '外部导入-';
      return `${IMPORT_PREFIX}TavernDB-ACU-ImportedJsonData${modeSuffix}`;
  }





  // [外部导入] 自选表格注入（取代旧的 标准/总结/整体 模式）

  // 兼容旧API/旧按钮调用（仍会走自选表格逻辑）
  export async function handleInjectSplitEntriesStandard_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  export async function handleInjectSplitEntriesSummary_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  export async function handleInjectSplitEntriesFull_ACU() { return await handleInjectImportedTxtSelected_ACU(); }
  export async function handleTxtImportAndSplit_ACU() {
      const $splitSizeInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-split-size`);
      const $encodingSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-encoding`); // 新增
      const $statusDisplay = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-status`);
      const splitSize = parseInt($splitSizeInput.val() as string, 10);
      const encoding = ($encodingSelect.val() as string) || 'UTF-8'; // 新增

      if (isNaN(splitSize) || splitSize <= 0) {
          showToastr_ACU('error', 'Vui lòng nhập số ký tự chia hợp lệ.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
          return;
      }

      const $fileInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-hidden-file-input`);
      $fileInput.off('change.acu_import').on('change.acu_import', function(e) {
          const file = (e.target as HTMLInputElement).files[0];
          if (!file) return;

          $statusDisplay.text('Trạng thái: đang đọc và tách tệp...').css('color', '#61afef');
          const reader = new FileReader();
          
          reader.onload = (readerEvent) => {
              const content = readerEvent.target.result as string;
              if (!content) {
                  showToastr_ACU('warning', 'Tệp rỗng hoặc đọc thất bại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT });
                  void updateImportStatusUI_ACU();
                  $fileInput.val('');
                  return;
              }

              // Use a timeout to allow the UI to update before this potentially long-running task
              setTimeout(async () => {
                  try {
                      const result = await importTxtTextAndSplitCore_ACU(content, {
                          splitSize,
                          clearPrevious: true,
                      });

                      if (!result.success) {
                          showToastr_ACU('error', result.error || 'Tách tệp thất bại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                          void updateImportStatusUI_ACU();
                          $fileInput.val('');
                          return;
                      }
                      
                      showToastr_ACU(
                          'success',
                          `Đã tách tệp thành ${result.chunksCount || 0} phần thành công.`,
                          { acuToastCategory: ACU_TOAST_CATEGORY_ACU.IMPORT }
                      );
                      
                      void updateImportStatusUI_ACU();
                  } catch (e) {
                      showToastr_ACU('error', e instanceof Error ? e.message : 'Tách tệp thất bại.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
                      void updateImportStatusUI_ACU();
                  } finally {
                      // Reset file input value to allow re-importing the same file
                      $fileInput.val('');
                  }
              }, 50); // 50ms delay
          };
          
          reader.onerror = () => {
              showToastr_ACU('error', 'Lỗi khi đọc tệp.', { acuToastCategory: ACU_TOAST_CATEGORY_ACU.ERROR });
              void updateImportStatusUI_ACU();
              $fileInput.val('');
          };

          reader.readAsText(file, encoding); // 修改
      });
      $fileInput.trigger('click');
      return true;
  }

export   async function getImportWorldbookTarget_ACU() {
      // 优先使用 UI 当前选择（不落盘），以便在“完成后解除绑定”的策略下，“删除外部导入条目”仍可用
      try {
          if ($popupInstance_ACU) {
              const $select = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target`);
              const v = ($select && $select.length) ? String($select.val() || '').trim() : '';
              if (v) return v;
          }
      } catch (e) { /* ignore */ }

      // 回退：旧逻辑（从设置读取）
      if (settings_ACU.importWorldbookTarget) return settings_ACU.importWorldbookTarget;
      return null;
  }

  // [T176] 控制注入按钮启用/禁用
  export function setImportInjectButtonEnabled_ACU(enabled: boolean) {
    if (!$popupInstance_ACU) return;
    const $btn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button`);
    if ($btn.length) $btn.prop('disabled', !enabled);
  }
