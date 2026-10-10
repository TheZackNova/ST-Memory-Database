// popup-bindings-optimization.ts
// 正文替换标签页事件绑定

import { showToastr_ACU } from '../theme/toast';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../shared/utils';
import { jQuery_API_ACU } from '../dom-utils';
import { settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { saveSettingsAndNotify_ACU } from '../components/settings-ui-helpers';
import { appendExcludeRuleRow_ACU, getLastOptimizedMessageIndex_ACU, readExcludeRulesFromRows_ACU, reoptimizeMessage_ACU } from '../components/optimization-ui';
import { buildDefaultContentOptimizationPromptGroup_ACU, performContentOptimization_ACU } from '../../service/optimization/content-optimization';
import { getOptimizationPromptGroupFromUI_ACU, loadOptimizationPresetSelect_ACU, loadOptimizationSettingsToUI_ACU, renderOptimizationPromptSegments_ACU, saveOptimizationPresetAsNew_ACU } from './popup-helpers';
import { refreshApiPresetSelectors_ACU } from '../triggers/settings-ui-sync';

/**
 * 绑定正文替换标签页的所有事件
 */
export async function bindOptimizationEvents_ACU(): Promise<void> {
      // --- [正文替换] UI事件绑定 ---
      // 正文替换功能开关
      const $optimizationEnabledCheckbox = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-enabled`);
      if ($optimizationEnabledCheckbox.length) {
        $optimizationEnabledCheckbox.on('change', function() {
          settings_ACU.contentOptimizationSettings.enabled = jQuery_API_ACU(this).is(':checked');
          saveSettingsAndNotify_ACU();
        });
      }

      // API预设选择
      const $optimizationApiPreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-api-preset`);
      if ($optimizationApiPreset.length) {
        $optimizationApiPreset.on('change', function() {
          settings_ACU.contentOptimizationSettings.apiPreset = jQuery_API_ACU(this).val();
          saveSettingsAndNotify_ACU();
        });
      }

      // 最小优化长度
      const $optimizationMinLength = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-min-length`);
      if ($optimizationMinLength.length) {
        $optimizationMinLength.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val() as string, 10);
          if (!isNaN(val) && val >= 0) {
            settings_ACU.contentOptimizationSettings.minLength = val;
            saveSettingsAndNotify_ACU();
          }
        });
      }

      // 最大优化项数
      const $optimizationMaxItems = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-max-items`);
      if ($optimizationMaxItems.length) {
        $optimizationMaxItems.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val() as string, 10);
          if (!isNaN(val) && val >= 1 && val <= 100) {
            settings_ACU.contentOptimizationSettings.maxOptimizations = val;
            saveSettingsAndNotify_ACU();
          }
        });
      }

      // [新增] 循环优化次数
      const $optimizationLoopCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-loop-count`);
      if ($optimizationLoopCount.length) {
        $optimizationLoopCount.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val() as string, 10);
          if (!isNaN(val) && val >= 1 && val <= 10) {
            settings_ACU.contentOptimizationSettings.loopCount = val;
            saveSettingsAndNotify_ACU();
          }
        });
      }

      // [新增] 自动重试次数
      const $optimizationRetryCount = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-retry-count`);
      if ($optimizationRetryCount.length) {
        $optimizationRetryCount.on('input change', function() {
          const val = parseInt(jQuery_API_ACU(this).val() as string, 10);
          if (!isNaN(val) && val >= 1 && val <= 10) {
            settings_ACU.contentOptimizationSettings.retryCount = val;
            saveSettingsAndNotify_ACU();
          }
        });
      }

      // 无感替换模式
      const $optimizationSeamlessMode = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-seamless-mode`);
      if ($optimizationSeamlessMode.length) {
        $optimizationSeamlessMode.on('change', function() {
          settings_ACU.contentOptimizationSettings.seamlessMode = jQuery_API_ACU(this).is(':checked');
          saveSettingsAndNotify_ACU();
        });
      }

      // 自动应用优化结果
      const $optimizationAutoApply = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-auto-apply`);
      if ($optimizationAutoApply.length) {
        $optimizationAutoApply.on('change', function() {
          settings_ACU.contentOptimizationSettings.autoApply = jQuery_API_ACU(this).is(':checked');
          saveSettingsAndNotify_ACU();
        });
      }

      // 显示优化对比
      const $optimizationShowDiff = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-show-diff`);
      if ($optimizationShowDiff.length) {
        $optimizationShowDiff.on('change', function() {
          settings_ACU.contentOptimizationSettings.showDiff = jQuery_API_ACU(this).is(':checked');
          saveSettingsAndNotify_ACU();
        });
      }

      // 填表与正文替换并行执行
      const $optimizationParallelMode = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-parallel-mode`);
      if ($optimizationParallelMode.length) {
        $optimizationParallelMode.on('change', function() {
          settings_ACU.contentOptimizationSettings.parallelMode = jQuery_API_ACU(this).is(':checked');
          saveSettingsAndNotify_ACU();
        });
      }

      // 正文优化快捷操作按钮
      const $optimizationReoptimizeLatest = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reoptimize-latest`);
      if ($optimizationReoptimizeLatest.length) {
        $optimizationReoptimizeLatest.off('click').on('click', async function() {
          const lastOptimizedMessageIndex = getLastOptimizedMessageIndex_ACU();

          if (lastOptimizedMessageIndex < 0) {
            showToastr_ACU('warning', 'Hiện chưa có phản hồi AI nào "đã được thay bằng nội dung tối ưu" để tối ưu lại');
            return;
          }

          jQuery_API_ACU(this).prop('disabled', true).text('Đang xử lý...');
          try {
            await reoptimizeMessage_ACU(lastOptimizedMessageIndex);
          } finally {
            jQuery_API_ACU(this).prop('disabled', false).html('<i class="fa-solid fa-rotate-right"></i> Tối ưu lại phản hồi AI được thay thế gần nhất');
          }
        });
      }

 
      // ═══ 正文替换标签筛选规则 ═══
      // 标签提取输入框
      const $optimizationExtractTags = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-tags`);
      if ($optimizationExtractTags.length) {
        $optimizationExtractTags.on('input', function() {
          settings_ACU.contentOptimizationSettings.extractTags = jQuery_API_ACU(this).val();
          saveSettingsAndNotify_ACU();
        });
      }

      // 标签提取规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`,
          { startPlaceholder: 'Từ bắt đầu (ví dụ: <think)', endPlaceholder: 'Từ kết thúc (ví dụ: </think)' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-end`, function() {
        settings_ACU.contentOptimizationSettings.extractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`);
        saveSettingsAndNotify_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.contentOptimizationSettings.extractRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-extract-rules`);
        saveSettingsAndNotify_ACU();
      });

      // 标签排除规则编辑器
      $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-add-rule`).on('click', function() {
        appendExcludeRuleRow_ACU(
          `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`,
          { startPlaceholder: 'Từ bắt đầu (ví dụ: <think)', endPlaceholder: 'Từ kết thúc (ví dụ: </think)' },
        );
      });
      $popupInstance_ACU.on('input', `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-start, #${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-end`, function() {
        settings_ACU.contentOptimizationSettings.excludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`);
        saveSettingsAndNotify_ACU();
      });
      $popupInstance_ACU.on('click', `#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules .acu-exclude-rule-delete`, function() {
        const $row = jQuery_API_ACU(this).closest('.acu-exclude-rule-row');
        if ($row.length) $row.remove();
        settings_ACU.contentOptimizationSettings.excludeRules = readExcludeRulesFromRows_ACU(`#${SCRIPT_ID_PREFIX_ACU}-optimization-exclude-rules`);
        saveSettingsAndNotify_ACU();
      });

      // ═══ 正文替换预设管理 ═══
      const $optimizationPresetSelect = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-preset-select`);
      const $optimizationImportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-import-presets`);
      const $optimizationExportPresets = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-export-presets`);
      const $optimizationSavePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-preset`);
      const $optimizationSaveAsNewPreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-as-new-preset`);
      const $optimizationDeletePreset = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-delete-preset`);
      const $optimizationResetDefaults = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reset-defaults`);
      const $optimizationPresetFileInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-preset-file-input`);

      // 预设选择事件
      if ($optimizationPresetSelect.length) {
        $optimizationPresetSelect.on('change', function() {
          const selectedName = jQuery_API_ACU(this).val();
          if (!selectedName) {
            $optimizationDeletePreset.hide();
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const selectedPreset = presets.find((p: any) => p.name === selectedName);

          if (selectedPreset) {
            // 加载预设到UI
            if (selectedPreset.promptGroup) {
              settings_ACU.contentOptimizationSettings.promptGroup = selectedPreset.promptGroup;
              renderOptimizationPromptSegments_ACU(selectedPreset.promptGroup);
            }
            $optimizationDeletePreset.show();
            saveSettingsAndNotify_ACU();
            showToastr_ACU('success', `Đã tải preset "${selectedName}"`);
          }
        });
      }

      // 导入预设
      if ($optimizationImportPresets.length) {
        $optimizationImportPresets.on('click', function() {
          $optimizationPresetFileInput.click();
        });
      }

      // 导出预设
      if ($optimizationExportPresets.length) {
        $optimizationExportPresets.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            showToastr_ACU('info', 'Hãy chọn preset cần xuất trước.');
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const selectedPreset = presets.find((p: any) => p.name === selectedName);

          if (!selectedPreset) {
            showToastr_ACU('error', 'Không tìm thấy preset đã chọn.');
            return;
          }

          const dataStr = JSON.stringify([selectedPreset], null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `optimization_preset_${String(selectedName).replace(/[^a-z0-9]/gi, '_')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          showToastr_ACU('success', `Đã xuất preset "${selectedName}" thành công.`);
        });
      }

      // 保存预设（覆盖）
      if ($optimizationSavePreset.length) {
        $optimizationSavePreset.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            // 如果没有选择预设，则等同于"另存为"
            saveOptimizationPresetAsNew_ACU();
            return;
          }

          if (!confirm(`Xác nhận dùng cài đặt hiện tại để ghi đè preset "${selectedName}"?`)) {
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const existingIndex = presets.findIndex((p: any) => p.name === selectedName);
          settings_ACU.contentOptimizationSettings.promptPresets = presets;
          saveSettingsAndNotify_ACU();
          showToastr_ACU('success', `Đã ghi đè preset "${selectedName}" thành công.`);
        });
      }

      // 另存为新预设
      if ($optimizationSaveAsNewPreset.length) {
        $optimizationSaveAsNewPreset.on('click', function() {
          saveOptimizationPresetAsNew_ACU();
        });
      }

      // 删除预设
      if ($optimizationDeletePreset.length) {
        $optimizationDeletePreset.on('click', function() {
          const selectedName = $optimizationPresetSelect.val();
          if (!selectedName) {
            showToastr_ACU('warning', 'Chưa chọn preset nào.');
            return;
          }

          if (!confirm(`Xác nhận xóa preset "${selectedName}"?`)) {
            return;
          }

          const presets = settings_ACU.contentOptimizationSettings.promptPresets || [];
          const indexToDelete = presets.findIndex((p: any) => p.name === selectedName);

          if (indexToDelete > -1) {
            presets.splice(indexToDelete, 1);
            settings_ACU.contentOptimizationSettings.promptPresets = presets;
            saveSettingsAndNotify_ACU();

            // 刷新预设选择器
            loadOptimizationPresetSelect_ACU();
            showToastr_ACU('success', `Đã xóa preset "${selectedName}".`);
          } else {
            showToastr_ACU('error', 'Không tìm thấy preset cần xóa.');
          }
        });
      }

      // 恢复默认提示词
      if ($optimizationResetDefaults.length) {
        $optimizationResetDefaults.on('click', function() {
          if (!confirm('Xác nhận khôi phục prompt thay thế nội dung mặc định? Thao tác này sẽ ghi đè cài đặt prompt hiện tại.')) {
            return;
          }
          settings_ACU.contentOptimizationSettings.promptGroup = buildDefaultContentOptimizationPromptGroup_ACU();
          saveSettingsAndNotify_ACU();
          renderOptimizationPromptSegments_ACU(settings_ACU.contentOptimizationSettings.promptGroup);
          showToastr_ACU('success', 'Prompt thay thế nội dung đã khôi phục về mặc định');
        });
      }

      // 预设文件导入
      if ($optimizationPresetFileInput.length) {
        $optimizationPresetFileInput.on('change', function(e) {
          const file = (e.target as HTMLInputElement).files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              const importedPresets = JSON.parse(e.target.result as string);

              if (!Array.isArray(importedPresets)) {
                throw new Error('Định dạng tệp JSON không đúng, nút gốc phải là một mảng.');
              }

              let currentPresets = settings_ACU.contentOptimizationSettings.promptPresets || [];
              let importedCount = 0;
              let overwrittenCount = 0;

              importedPresets.forEach(preset => {
                if (preset && typeof preset.name === 'string' && preset.name.length > 0) {
                  const presetData = {
                    name: preset.name,
                    promptGroup: preset.promptGroup || buildDefaultContentOptimizationPromptGroup_ACU()
                  };

                  const existingIndex = currentPresets.findIndex((p: any) => p.name === preset.name);

                  if (existingIndex !== -1) {
                    currentPresets[existingIndex] = presetData;
                    overwrittenCount++;
                  } else {
                    currentPresets.push(presetData);
                    importedCount++;
                  }
                }
              });

              if (importedCount > 0 || overwrittenCount > 0) {
                settings_ACU.contentOptimizationSettings.promptPresets = currentPresets;
                saveSettingsAndNotify_ACU();
                loadOptimizationPresetSelect_ACU();

                let messages = [];
                if (importedCount > 0) messages.push(`Đã nhập ${importedCount} preset mới.`);
                if (overwrittenCount > 0) messages.push(`Đã ghi đè ${overwrittenCount} preset cùng tên.`);
                showToastr_ACU('success', messages.join(' '));

                // 导入后：自动选择第一个有效预设并加载到UI
                const firstValid = importedPresets.find(p => p && typeof p.name === 'string' && p.name.length > 0);
                if (firstValid && $optimizationPresetSelect && $optimizationPresetSelect.length) {
                  setTimeout(() => {
                    $optimizationPresetSelect.val(firstValid.name).trigger('change');
                  }, 50);
                }
              } else {
                showToastr_ACU('warning', 'Không tìm thấy dữ liệu preset hợp lệ.');
              }
            } catch (err) {
              showToastr_ACU('error', `Nhập thất bại: ${err.message}`);
            }
          };
          reader.readAsText(file);
          // 清空文件输入，允许重复导入同一文件
          (e.target as HTMLInputElement).value = '';
        });
      }

      // 保存提示词组
      const $optimizationSavePromptGroup = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-save-prompt-group`);
      if ($optimizationSavePromptGroup.length) {
        $optimizationSavePromptGroup.on('click', function() {
          const segments = getOptimizationPromptGroupFromUI_ACU();
          settings_ACU.contentOptimizationSettings.promptGroup = segments;
          saveSettingsAndNotify_ACU();
          showToastr_ACU('success', 'Đã lưu nhóm prompt thay thế nội dung');
        });
      }

      // 恢复默认提示词组
      const $optimizationResetPromptGroup = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-reset-prompt-group`);
      if ($optimizationResetPromptGroup.length) {
        $optimizationResetPromptGroup.on('click', function() {
          if (!confirm('Xác nhận khôi phục prompt thay thế nội dung mặc định? Thao tác này sẽ ghi đè cài đặt prompt hiện tại.')) {
            return;
          }
          settings_ACU.contentOptimizationSettings.promptGroup = buildDefaultContentOptimizationPromptGroup_ACU();
          saveSettingsAndNotify_ACU();
          renderOptimizationPromptSegments_ACU(settings_ACU.contentOptimizationSettings.promptGroup);
          showToastr_ACU('success', 'Prompt thay thế nội dung đã khôi phục về mặc định');
        });
      }

      // 添加提示词段落
      $popupInstance_ACU.on('click', `.${SCRIPT_ID_PREFIX_ACU}-optimization-add-prompt-segment-btn`, function() {
        const position = jQuery_API_ACU(this).data('position');
        const newSegment = { role: 'USER', content: '', deletable: true };
        let segments = getOptimizationPromptGroupFromUI_ACU();
        if (position === 'top') segments.unshift(newSegment);
        else segments.push(newSegment);
        renderOptimizationPromptSegments_ACU(segments);
      });

      // 删除提示词段落
      $popupInstance_ACU.on('click', '.optimization-prompt-segment-delete-btn', function() {
        const indexToDelete = jQuery_API_ACU(this).data('index');
        let segments = getOptimizationPromptGroupFromUI_ACU();
        segments.splice(indexToDelete, 1);
        renderOptimizationPromptSegments_ACU(segments);
      });

      // 测试按钮
      const $optimizationTestBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-btn`);
      if ($optimizationTestBtn.length) {
        $optimizationTestBtn.on('click', async function() {
          const testInput = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-input`).val() as string;
          if (!testInput || testInput.trim().length < 10) {
            showToastr_ACU('warning', 'Hãy nhập văn bản thử nghiệm ít nhất 10 ký tự');
            return;
          }

          jQuery_API_ACU(this).prop('disabled', true).text('Đang tối ưu...');
          const $resultDiv = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-result`);
          const $outputDiv = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-optimization-test-output`);
          $resultDiv.show();
          $outputDiv.text('Đang gọi AI để tối ưu...');

          try {
            const result = await performContentOptimization_ACU(testInput);
            if (result.success) {
              let outputText = `Tối ưu hoàn tất! Có ${result.optimizations.length} chỗ cải thiện\n\n`;
              outputText += `Tóm tắt: ${result.summary || 'Không có'}\n\n`;
              outputText += `=== Chi tiết tối ưu ===\n\n`;
              result.optimizations.forEach((opt: any, i: number) => {
                outputText += `[${i + 1}] Phương án sửa: ${opt.plan || opt.reason || 'Chưa nêu rõ'}\n`;
                outputText += `Nguyên văn: ${opt.original.substring(0, 100)}${opt.original.length > 100 ? '...' : ''}\n`;
                outputText += `Tối ưu: ${opt.optimized.substring(0, 100)}${opt.optimized.length > 100 ? '...' : ''}\n\n`;
              });
              outputText += `=== Toàn văn sau tối ưu ===\n\n${result.optimizedContent}`;
              $outputDiv.text(outputText);
            } else {
              $outputDiv.text(`Tối ưu thất bại: ${result.error || 'Lỗi không xác định'}`);
            }
          } catch (e) {
            $outputDiv.text(`Lỗi khi tối ưu: ${e.message}`);
          }

          jQuery_API_ACU(this).prop('disabled', false).text('Chạy thử tối ưu');
        });
      }

      // 加载正文优化设置到UI
      loadOptimizationSettingsToUI_ACU();

      // [新增] 刷新API预设选择器
      refreshApiPresetSelectors_ACU();

}
