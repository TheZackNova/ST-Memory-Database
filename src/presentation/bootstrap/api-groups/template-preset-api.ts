/**
 * presentation/bootstrap/api-groups/template-preset-api.ts
 * 模板预设 API — 模板预设的列表/切换/导入
 */

import { deriveTemplatePresetNameForImport_ACU, normalizeTemplatePresetSelectionValue_ACU } from '../../../shared/template-preset-utils';
import { logDebug_ACU, logError_ACU } from '../../../shared/utils';
import {
    applyTemplatePresetToCurrent_ACU,
    applyChatTemplateSnapshotWithReconciliation_ACU,
    listTemplatePresetNames_ACU,
    normalizeTemplateOperationScope_ACU,
    parseImportedTemplateData_ACU,
    resolveTemplateForExport_ACU,
    upsertTemplatePreset_ACU,
} from '../../../service/template/template-preset-service';
import { refreshTemplatePresetSelectInUI_ACU } from '../../components/template-preset-ui';
import { refreshPresetUIAfterSwitch_ACU } from '../../components/pipeline-ui-helpers';
import type { ApiGroupContext } from './callback-api';

export function createTemplatePresetApi(ctx: ApiGroupContext): Record<string, Function> {
    return {
        getTemplatePresetNames: function() {
            try {
                return listTemplatePresetNames_ACU();
            } catch (e) {
                logError_ACU('getTemplatePresetNames failed:', e);
                return [];
            }
        },

        switchTemplatePreset: async function(presetName: any, options: any = {}) {
            try {
                const { scope = 'global', destructiveChangeConfirmed = false } = options || {};
                const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
                const name = normalizeTemplatePresetSelectionValue_ACU(presetName);
                const displayName = name || 'Preset mặc định';
                const result = await applyTemplatePresetToCurrent_ACU(name, {
                    source: 'api',
                    updateGlobal: normalizedScope === 'global',
                    save: true,
                    persistChatScope: normalizedScope === 'chat',
                    // S1-3：全局切换影响 inherit_global 聊天时经协调器，可能返回
                    // 破坏性 blockers；调用方确认后带 destructiveChangeConfirmed 重试。
                    destructiveChangeConfirmed: destructiveChangeConfirmed === true,
                });
                const saved = !!result && (!(typeof result === 'object' && 'saved' in result) || result.saved !== false);
                if (saved) {
                    refreshPresetUIAfterSwitch_ACU({
                        templateGlobalSelectName: normalizedScope === 'global' ? name : null,
                        keepTemplateGlobalValue: normalizedScope !== 'global',
                    });
                    const runtimeReady = typeof result === 'object' && 'runtimeReady' in result
                        ? result.runtimeReady !== false
                        : undefined;
                    const postCommitWarning = typeof result === 'object' && 'postCommitWarning' in result && typeof result.postCommitWarning === 'string'
                        ? result.postCommitWarning
                        : undefined;
                    return {
                        success: true,
                        scope: normalizedScope,
                        message: `${normalizedScope === 'global' ? 'Preset mẫu toàn cục' : 'Preset mẫu của cuộc trò chuyện hiện tại'} đã chuyển: ${displayName}`,
                        ...(runtimeReady === undefined ? {} : { runtimeReady }),
                        ...(postCommitWarning ? { warning: postCommitWarning, postCommitWarning } : {}),
                    };
                }
                const error = typeof result === 'object' && result && 'error' in result && typeof result.error === 'string'
                    ? result.error
                    : '';
                const blockers = typeof result === 'object' && result && 'blockers' in result && Array.isArray((result as any).blockers)
                    ? (result as any).blockers
                    : null;
                return {
                    success: false,
                    scope: normalizedScope,
                    message: error || `${normalizedScope === 'global' ? 'Preset mẫu toàn cục' : 'Preset mẫu của cuộc trò chuyện hiện tại'} chuyển thất bại: ${displayName}`,
                    ...(error ? { error } : {}),
                    ...(blockers && blockers.length > 0 ? { blockers } : {}),
                };
            } catch (e) {
                logError_ACU('switchTemplatePreset failed:', e);
                const error = e?.message || String(e);
                return { success: false, scope: normalizeTemplateOperationScope_ACU(options?.scope || 'global'), message: `Chuyển preset mẫu thất bại: ${error}`, error };
            }
        },

        injectTemplatePresetToCurrentChat: async function(presetName: any) {
            try {
                return await ctx.getApi().switchTemplatePreset(presetName, { scope: 'chat' });
            } catch (e) {
                logError_ACU('injectTemplatePresetToCurrentChat failed:', e);
                return { success: false, message: `Chuyển preset mẫu của cuộc trò chuyện hiện tại thất bại: ${e.message}` };
            }
        },

        importTemplateFromData: async function(templateData: any, options: any = {}) {
            try {
                const { scope = 'global', presetName = '', dataMode, conflictPolicy } = options || {};
                const normalizedScope = normalizeTemplateOperationScope_ACU(scope);
                const normalizedPresetName = deriveTemplatePresetNameForImport_ACU({
                    presetName,
                    fallbackLabel: normalizedScope === 'global'
                        ? `Mau_nhap_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
                        : '',
                });
                const prepared = parseImportedTemplateData_ACU(templateData, { dataMode, conflictPolicy });

                if (normalizedScope === 'global') {
                    // ═══ 全局导入：仅保存到预设库，不自动切换当前生效模板 ═══
                    if (normalizedPresetName) {
                        const savePresetOk = upsertTemplatePreset_ACU(normalizedPresetName, prepared.templateStr);
                        if (!savePresetOk) {
                            return {
                                success: false,
                                scope: normalizedScope,
                                message: `Mẫu đã được phân tích nhưng lưu preset mẫu toàn cục thất bại: ${normalizedPresetName}`,
                            };
                        }
                    }

                    // 刷新 UI 让新预设立即出现在下拉列表中，但保持当前选中值不变
                    refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });

                    logDebug_ACU(`[API] importTemplateFromData: 模板已保存到全局预设库：${normalizedPresetName}。`);
                    return {
                        success: true,
                        scope: normalizedScope,
                        message: normalizedPresetName
                            ? `Đã lưu mẫu thành preset toàn cục: ${normalizedPresetName}. Bạn có thể chuyển thủ công sang nó trong danh sách "Preset mẫu toàn cục".`
                            : 'Mẫu đã được phân tích nhưng chưa chỉ định tên preset, chưa lưu vào thư viện preset.',
                        presetName: normalizedPresetName || undefined,
                        dataMode: prepared.dataMode,
                        conflictPolicy: prepared.conflictPolicy,
                    // 跨 content/seedRows 完全重复去重审计（content 优先），无去重时为空数组
                    deduplication: prepared.deduplication,
                    };
                }

                // ═══ 聊天导入：应用到当前聊天作用域 ═══
                const applied = await applyChatTemplateSnapshotWithReconciliation_ACU(prepared.templateObj, {
                    source: 'api_import_template_chat',
                    presetName: normalizedPresetName,
                    dataMode: prepared.dataMode,
                    conflictPolicy: prepared.conflictPolicy,
                });
                if (!applied.saved) {
                    const error = applied.error || 'Không thể áp dụng vào cuộc trò chuyện hiện tại.';
                    return {
                        success: false,
                        scope: normalizedScope,
                        message: `Nhập mẫu thất bại: ${error}`,
                        error,
                    };
                }

                logDebug_ACU(`[API] importTemplateFromData: 模板已成功导入到当前聊天。`);
                refreshPresetUIAfterSwitch_ACU({ keepTemplateGlobalValue: true });
                const postCommitWarning = 'postCommitWarning' in applied && typeof applied.postCommitWarning === 'string'
                    ? applied.postCommitWarning
                    : undefined;
                const runtimeReady = 'runtimeReady' in applied ? applied.runtimeReady !== false : true;
                return {
                    success: true,
                    scope: normalizedScope,
                    message: postCommitWarning || `Đã nhập mẫu vào cuộc trò chuyện hiện tại thành công${normalizedPresetName ? ` (tên preset: ${normalizedPresetName})` : ''}!`,
                    presetName: normalizedPresetName || undefined,
                    runtimeReady,
                    dataMode: prepared.dataMode,
                    conflictPolicy: prepared.conflictPolicy,
                    // 跨 content/seedRows 完全重复去重审计（content 优先），无去重时为空数组
                    deduplication: prepared.deduplication,
                    ...(postCommitWarning ? { warning: postCommitWarning, postCommitWarning } : {}),
                };

            } catch (e) {
                logError_ACU('importTemplateFromData failed:', e);
                const error = e?.message || String(e);
                return { success: false, scope: normalizeTemplateOperationScope_ACU(options?.scope || 'global'), message: `Nhập thất bại: ${error}`, error };
            }
        },

        getTableTemplate: function(options: any = {}) {
            try {
                const scope = normalizeTemplateOperationScope_ACU(options?.scope || 'chat');
                const resolved = resolveTemplateForExport_ACU(scope, options?.presetName);
                if (resolved?.jsonData) return resolved.jsonData;
                if (scope !== 'global') {
                    const fallbackGlobal = resolveTemplateForExport_ACU('global', options?.presetName);
                    if (fallbackGlobal?.jsonData) return fallbackGlobal.jsonData;
                }
                return null;
            } catch (e) {
                logError_ACU('getTableTemplate failed:', e);
                return null;
            }
        },
    };
}
