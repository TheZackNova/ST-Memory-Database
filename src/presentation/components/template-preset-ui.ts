/**
 * presentation/components/template-preset-ui.ts — 模板预设 UI 函数（纯 DOM 操作）
 *
 * 纯业务逻辑函数已搬到 service/template/template-preset-service.ts。
 * 本文件只保留操作 DOM 的 UI 函数。
 */
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU, getCurrentTemplatePresetName_ACU, isDefaultTemplatePresetSelection_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../shared/template-preset-utils';
import { jQuery_API_ACU } from '../dom-utils';
import { getCurrentIsolationKey_ACU, settings_ACU } from '../../service/runtime/state-manager';
import { $popupInstance_ACU } from '../state/ui-refs';
import { getCurrentChatTemplateScopeState_ACU, migrateLegacyTemplateScopeForCurrentChat_ACU, normalizeTemplateScopeMode_ACU } from '../../service/template/chat-scope';
import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { formatPlotScopeUpdatedAt_ACU } from '../../shared/utils';
import { getTemplatePresetDisplayName_ACU, getTemplatePreset_ACU, listTemplatePresetNames_ACU, resolveActiveTemplatePresetName_ACU } from '../../service/template/template-preset-service';

// ═══ 纯 DOM 操作函数 ═══

  export function getTemplatePresetSelectJQ_ACU() {
      try {
          if (!$popupInstance_ACU || !$popupInstance_ACU.length) return null;
          const $sel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-select`);
          return $sel && $sel.length ? $sel : null;
      } catch (e) {
          return null;
      }
  }

  function getTemplateChatPresetSelectJQ_ACU() {
      try {
          if (!$popupInstance_ACU || !$popupInstance_ACU.length) return null;
          const $sel = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select`);
          return $sel && $sel.length ? $sel : null;
      } catch (e) {
          return null;
      }
  }

  function populateTemplatePresetSelectOptions_ACU($select: JQuery<HTMLElement> | null, { extraPresetName = '', extraLabelSuffix = ' (chỉ snapshot cuộc trò chuyện hiện tại)', extraOptions = [] as any[] } = {}) {
      if (!$select || !$select.length) return;
      const normalizedExtraPresetName = normalizeTemplatePresetSelectionValue_ACU(extraPresetName);
      const presetNames = listTemplatePresetNames_ACU();
      const renderedNames = new Set();
      $select.empty().append(jQuery_API_ACU('<option/>').val(DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU).text('Preset mặc định'));
      presetNames.forEach(name => {
          const normalizedName = normalizeTemplatePresetSelectionValue_ACU(name);
          if (!normalizedName || renderedNames.has(normalizedName)) return;
          renderedNames.add(normalizedName);
          $select.append(jQuery_API_ACU('<option/>').val(normalizedName).text(normalizedName));
      });
      if (normalizedExtraPresetName && !renderedNames.has(normalizedExtraPresetName)) {
          renderedNames.add(normalizedExtraPresetName);
          $select.append(jQuery_API_ACU('<option/>').val(normalizedExtraPresetName).text(`${normalizedExtraPresetName}${extraLabelSuffix}`));
      }
      (Array.isArray(extraOptions) ? extraOptions : []).forEach(option => {
          const value = String(option?.value || '').trim();
          if (!value || renderedNames.has(value)) return;
          renderedNames.add(value);
          const label = String(option?.label || value).trim() || value;
          $select.append(jQuery_API_ACU('<option/>').val(value).text(label));
      });
  }

  function hasOptionValue_ACU($select: JQuery<HTMLElement> | null, value: string) {
      if (!$select || !$select.length) return false;
      const normalizedValue = String(value ?? '');
      return $select.find('option').toArray().some((option) => String(jQuery_API_ACU(option).val() ?? '') === normalizedValue);
  }

  export function loadTemplatePresetSelect_ACU({ globalSelectName = null as string | null, keepGlobalValue = false } = {}) {
      if (!$popupInstance_ACU || !$popupInstance_ACU.length) return;

      const presetNames = listTemplatePresetNames_ACU();
      const globalPresetName = normalizeTemplatePresetSelectionValue_ACU(getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: false }));
      const chatScopeState = getCurrentChatTemplateScopeState_ACU() || migrateLegacyTemplateScopeForCurrentChat_ACU();
      const normalizedChatMode = normalizeTemplateScopeMode_ACU(chatScopeState?.mode);
      const effectiveChatPresetName = resolveActiveTemplatePresetName_ACU({ fallbackToGlobal: true });
      const chatSelectedPresetName = normalizeTemplatePresetSelectionValue_ACU(chatScopeState?.presetName || effectiveChatPresetName || '');
       const currentChatSnapshotName = normalizedChatMode === 'chat_override'
           ? normalizeTemplatePresetSelectionValue_ACU(chatScopeState?.presetName || effectiveChatPresetName || '')
           : '';
       const currentChatSnapshotOption = currentChatSnapshotName
           ? [{ value: currentChatSnapshotName, label: `${getTemplatePresetDisplayName_ACU(currentChatSnapshotName)} (snapshot cuộc trò chuyện hiện tại)` }]
           : [];
      const chatExtraPresetName = (() => {
          if (!chatSelectedPresetName) return '';
          if (presetNames.includes(chatSelectedPresetName)) return '';
           if (currentChatSnapshotOption.some(option => option.value === chatSelectedPresetName)) return '';
           return chatSelectedPresetName;
       })();

      const $globalSelect = getTemplatePresetSelectJQ_ACU();
      const $chatSelect = getTemplateChatPresetSelectJQ_ACU();
      const $globalStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-global-scope-status`);
      const $chatStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status`);
      const $chatOriginStatus = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status`);
      const $globalDeleteBtn = $popupInstance_ACU.find(`#${SCRIPT_ID_PREFIX_ACU}-template-preset-delete`);

      const hasGlobalPreset = !!globalPresetName && presetNames.includes(globalPresetName);

      populateTemplatePresetSelectOptions_ACU($globalSelect, {
          extraPresetName: hasGlobalPreset ? '' : globalPresetName,
          extraLabelSuffix: ' (chỉ snapshot mẫu toàn cục hiện tại)',
      });
       populateTemplatePresetSelectOptions_ACU($chatSelect, {
           extraPresetName: chatExtraPresetName,
           extraLabelSuffix: ' (snapshot cuộc trò chuyện hiện tại)',
           extraOptions: currentChatSnapshotOption,
       });

      if ($globalSelect && $globalSelect.length) {
          let resolvedGlobalValue = globalPresetName;
          if (globalSelectName !== null && typeof globalSelectName !== 'undefined') {
              resolvedGlobalValue = normalizeTemplatePresetSelectionValue_ACU(globalSelectName);
          } else if (keepGlobalValue) {
              resolvedGlobalValue = normalizeTemplatePresetSelectionValue_ACU($globalSelect.val());
          }
          const finalGlobalValue = resolvedGlobalValue && hasOptionValue_ACU($globalSelect, resolvedGlobalValue)
              ? resolvedGlobalValue
              : (hasGlobalPreset || (!!globalPresetName && hasOptionValue_ACU($globalSelect, globalPresetName))
                  ? globalPresetName
                  : DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
          $globalSelect.val(finalGlobalValue || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
      }

      if ($globalDeleteBtn && $globalDeleteBtn.length) {
          $globalDeleteBtn.toggle(!!globalPresetName && presetNames.includes(globalPresetName));
      }

      if ($chatSelect && $chatSelect.length) {
          const finalChatValue = chatSelectedPresetName && hasOptionValue_ACU($chatSelect, chatSelectedPresetName)
              ? chatSelectedPresetName
              : DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
          $chatSelect.val(finalChatValue || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
      }

      if ($globalStatus && $globalStatus.length) {
          if (globalPresetName && !hasGlobalPreset) {
              $globalStatus.text(`Mẫu toàn cục hiện tại: ${globalPresetName} (thư viện preset không còn nhưng profile hiện tại vẫn giữ snapshot mẫu này).`);
          } else {
              $globalStatus.text(`Mẫu toàn cục hiện tại: ${getTemplatePresetDisplayName_ACU(globalPresetName)}; cuộc trò chuyện mới sẽ mặc định kế thừa mẫu bảng ở đây.`);
          }
      }

      if ($chatStatus && $chatStatus.length) {
          if (normalizedChatMode === 'chat_override') {
              let scopeLabel = 'Preset riêng của cuộc trò chuyện hiện tại';
              if (chatScopeState.source === 'legacy_frozen') {
                  scopeLabel = 'Mẫu đóng băng cũ của cuộc trò chuyện (đã di chuyển)';
              } else if (chatScopeState.source === 'legacy_history_frozen') {
                  scopeLabel = 'Snapshot mẫu lịch sử hội thoại cũ (đã di chuyển)';
              } else if (chatScopeState.source === 'legacy_header_frozen') {
                  scopeLabel = 'Mẫu đóng băng tiêu đề cột cũ (đã di chuyển)';
              }
              $chatStatus.text(`Cuộc trò chuyện hiện tại: ${scopeLabel}; preset mẫu thực tế hiện tại là ${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}.`);
          } else if (normalizedChatMode === 'preset_link') {
              $chatStatus.text(`Cuộc trò chuyện hiện tại: tham chiếu preset cũ chờ di chuyển; preset mẫu thực tế hiện tại là ${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}.`);
          } else {
              $chatStatus.text(`Cuộc trò chuyện hiện tại: theo toàn cục hiện tại; preset mẫu thực tế hiện tại là ${getTemplatePresetDisplayName_ACU(effectiveChatPresetName)}.`);
          }
      }

      if ($chatOriginStatus && $chatOriginStatus.length) {
          if (normalizedChatMode === 'chat_override') {
              const detailParts = [];
              if (chatScopeState.source === 'legacy_frozen') {
                  detailParts.push('Nguồn: di chuyển từ mẫu đóng băng cũ của cuộc trò chuyện');
              } else if (chatScopeState.source === 'legacy_history_frozen') {
                  detailParts.push('Nguồn: di chuyển từ cấu trúc bảng thực tế của hội thoại cũ');
              } else if (chatScopeState.source === 'legacy_header_frozen') {
                  detailParts.push('Nguồn: di chuyển từ mẫu đóng băng tiêu đề cột cũ');
              } else {
                  detailParts.push('Nguồn: cuộc trò chuyện hiện tại đã lưu snapshot preset mẫu cục bộ');
              }
              if (chatScopeState.originGlobalName) {
                  detailParts.push(`Mẫu toàn cục nguồn: ${getTemplatePresetDisplayName_ACU(chatScopeState.originGlobalName)}`);
              }
              if (Number.isFinite(chatScopeState.originGlobalRevision) && chatScopeState.originGlobalRevision > 0) {
                  detailParts.push(`Phiên bản toàn cục nguồn: v${chatScopeState.originGlobalRevision}`);
              }
              const updatedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function') ? formatPlotScopeUpdatedAt_ACU(chatScopeState.updatedAt) : '';
              if (updatedAtText) {
                  detailParts.push(`Thời gian cập nhật: ${updatedAtText}`);
              }
              if (chatScopeState.source) {
                  detailParts.push(`Nguồn ghi: ${chatScopeState.source}`);
              }
               $chatOriginStatus.text(detailParts.join('; ') || 'Cuộc trò chuyện hiện tại đang dùng snapshot preset mẫu cấp cuộc trò chuyện.');
          } else if (normalizedChatMode === 'preset_link') {
              const detailParts = [
                  'Nguồn: trạng thái tương thích tham chiếu preset cũ, sau khi mở/chuyển sẽ được hiện thực hóa thành snapshot mẫu của cuộc trò chuyện hiện tại',
                  `Preset nguồn: ${getTemplatePresetDisplayName_ACU(chatSelectedPresetName)}`,
              ];
              const updatedAtText = (typeof formatPlotScopeUpdatedAt_ACU === 'function') ? formatPlotScopeUpdatedAt_ACU(chatScopeState?.updatedAt) : '';
              if (updatedAtText) {
                  detailParts.push(`Thời gian cập nhật: ${updatedAtText}`);
              }
              if (chatScopeState?.source) {
                  detailParts.push(`Nguồn ghi: ${chatScopeState.source}`);
              }
               $chatOriginStatus.text(detailParts.join('; '));
           } else {
               $chatOriginStatus.text('Cuộc trò chuyện hiện tại chưa lưu snapshot mẫu cục bộ, thực tế sẽ theo mẫu bảng toàn cục hiện tại.');
          }
      }
  }

  export function refreshTemplatePresetSelectInUI_ACU({ selectName = null as string | null, keepValue = false } = {}) {
      if ($popupInstance_ACU && $popupInstance_ACU.length) {
          loadTemplatePresetSelect_ACU({ globalSelectName: selectName, keepGlobalValue: !!keepValue });
          return;
      }

      const $sel = getTemplatePresetSelectJQ_ACU();
      if (!$sel || !$sel.length) return;
      renderTemplatePresetSelect_ACU($sel, { keepValue: !!keepValue });

      if (selectName === null || typeof selectName === 'undefined') return;

      const normalizedName = normalizeTemplatePresetSelectionValue_ACU(selectName);
      $sel.val(normalizedName || DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU);
  }

  function renderTemplatePresetSelect_ACU($select: JQuery<HTMLElement> | null, { keepValue = true } = {}) {
      try {
          if (!$select || !$select.length) return;
          const prev = keepValue ? normalizeTemplatePresetSelectionValue_ACU($select.val()) : '';
          const names = listTemplatePresetNames_ACU();
          const persistedName = getCurrentTemplatePresetName_ACU(settings_ACU, { requireExisting: true, getTemplatePresetFn: getTemplatePreset_ACU });
          $select.empty();
          $select.append(jQuery_API_ACU('<option/>').val(DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU).text('Preset mặc định'));
          names.forEach(n => {
              $select.append(jQuery_API_ACU('<option/>').val(String(n)).text(String(n)));
          });

          let resolvedValue = DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
          if (keepValue) {
              if (isDefaultTemplatePresetSelection_ACU(prev)) {
                  resolvedValue = DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU;
              } else if (names.includes(prev)) {
                  resolvedValue = prev;
              }
          }

          if (resolvedValue === DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU && persistedName && names.includes(persistedName)) {
              resolvedValue = persistedName;
          }

          $select.val(resolvedValue);
      } catch (e) {}
  }
