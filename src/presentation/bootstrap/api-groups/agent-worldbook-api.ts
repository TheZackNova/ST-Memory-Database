import type { AgentWorldbookControlMode_ACU } from '../../../shared/models/agent-worldbook-model';
import { logError_ACU } from '../../../shared/utils';
import {
    skillifyCurrentPlotWorldbookSelection_ACU,
    skillifyWorldbookEntries_ACU,
    type AgentSkillifyOptions_ACU,
} from '../../../service/agent/agent-skillify-service';
import {
    readAgentWorldbookControlFromWorldbooks_ACU,
    writeAgentWorldbookControlToWorldbook_ACU,
} from '../../../service/agent/agent-worldbook-config-meta';
import {
    clearWorldbookSkillMetaBlocks_ACU,
    deleteWorldbookEntrySkillMeta_ACU,
    saveWorldbookEntrySkillMeta_ACU,
    type WorldbookSkillMetaUpdatedBy_ACU,
} from '../../../service/agent/agent-worldbook-skill-meta';
import {
    refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU,
    restoreWorldbookGreenlights_ACU,
    takeoverWorldbookGreenlights_ACU,
} from '../../../service/agent/agent-worldbook-takeover';
import type { ApiGroupContext } from './callback-api';

type AgentWorldbookSkillifyApiOptions_ACU = AgentSkillifyOptions_ACU & {
    runTakeover?: boolean;
    bookNames?: string[] | string;
};

function agentWorldbookApiError_ACU(error: unknown, fallback: string): { success: false; error: string } {
    if (error instanceof Error && error.message) return { success: false, error: error.message };
    if (typeof error === 'string' && error.trim()) return { success: false, error: error.trim() };
    if (error && typeof error === 'object' && typeof (error as any).message === 'string' && (error as any).message.trim()) {
        return { success: false, error: (error as any).message.trim() };
    }
    return { success: false, error: fallback };
}

function normalizeAgentWorldbookModeForApi_ACU(mode: unknown): AgentWorldbookControlMode_ACU | null {
    return mode === 'disabled' || mode === 'passive' || mode === 'agent' ? mode : null;
}

function normalizeAgentWorldbookModeOptions_ACU(options: unknown): Record<string, any> {
    return options && typeof options === 'object' && !Array.isArray(options) ? options as Record<string, any> : {};
}

function isValidWorldbookSkillMetaUpdatedBy_ACU(value: unknown): value is WorldbookSkillMetaUpdatedBy_ACU {
    return value === 'manual' || value === 'agent-skillify';
}

export function createAgentWorldbookApi(_ctx: ApiGroupContext): Record<string, Function> {
    const runAgentWorldbookSkillifyCore = async function(options: AgentWorldbookSkillifyApiOptions_ACU = {}, bookNames?: string[]) {
        try {
            const normalizedOptions = normalizeAgentWorldbookModeOptions_ACU(options) as AgentWorldbookSkillifyApiOptions_ACU;
            const { runTakeover, bookNames: _ignoredBookNames, ...skillifyOptions } = normalizedOptions;
            const normalizedBookNames = Array.isArray(bookNames)
                ? bookNames.map(name => String(name || '').trim()).filter(Boolean)
                : [];
            const skillify = normalizedBookNames.length > 0
                ? await skillifyWorldbookEntries_ACU(normalizedBookNames, skillifyOptions)
                : await skillifyCurrentPlotWorldbookSelection_ACU(skillifyOptions);

            if (skillify.updated > 0 && runTakeover !== false) {
                const takeover = await takeoverWorldbookGreenlights_ACU();
                const snapshot = await refreshPlotAgentWorldbookSnapshotFromWorldbooks_ACU();
                const success = takeover.failed === 0 && snapshot.active === true;
                return {
                    success,
                    error: success ? undefined : (takeover.reason || 'Việc đồng bộ tiếp quản sau khi Skill hóa sổ thế giới Agent chưa hoàn tất hoàn toàn.'),
                    skillify,
                    takeover,
                    snapshot,
                };
            }

            return { success: true, skillify };
        } catch (e) {
            logError_ACU('runAgentWorldbookSkillify failed:', e);
            return agentWorldbookApiError_ACU(e, 'Thực hiện Skill hóa sổ thế giới Agent thất bại.');
        }
    };

    const runAgentWorldbookSkillify = async function(options: AgentWorldbookSkillifyApiOptions_ACU = {}) {
        return runAgentWorldbookSkillifyCore(options);
    };

    const skillifyWorldbookEntries = async function(options: AgentWorldbookSkillifyApiOptions_ACU = {}) {
        const normalizedOptions = normalizeAgentWorldbookModeOptions_ACU(options) as AgentWorldbookSkillifyApiOptions_ACU;
        const rawBookNames = normalizedOptions.bookNames;
        const bookNames = typeof rawBookNames === 'string' ? rawBookNames.split(/[,，\n]/) : rawBookNames;
        return runAgentWorldbookSkillifyCore(normalizedOptions, Array.isArray(bookNames) ? bookNames : undefined);
    };

    const saveAgentWorldbookSkillMeta = async function(bookName: any, uid: any, metaDraft: any, updatedBy: any = 'manual') {
        try {
            const normalizedUpdatedBy = updatedBy && typeof updatedBy === 'object' && !Array.isArray(updatedBy)
                ? (updatedBy as any).updatedBy ?? 'manual'
                : updatedBy;
            if (!isValidWorldbookSkillMetaUpdatedBy_ACU(normalizedUpdatedBy)) {
                return { success: false, error: 'updatedBy của metadata Skill phải là manual hoặc agent-skillify.' };
            }
            const result = await saveWorldbookEntrySkillMeta_ACU(String(bookName || ''), uid, metaDraft || {}, normalizedUpdatedBy);
            return { success: true, result };
        } catch (e) {
            logError_ACU('saveAgentWorldbookSkillMeta failed:', e);
            return agentWorldbookApiError_ACU(e, 'Lưu metadata Skill của sổ thế giới Agent thất bại.');
        }
    };

    const deleteAgentWorldbookSkillMeta = async function(bookName: any, uid: any) {
        try {
            const result = await deleteWorldbookEntrySkillMeta_ACU(String(bookName || ''), uid);
            return { success: true, result };
        } catch (e) {
            logError_ACU('deleteAgentWorldbookSkillMeta failed:', e);
            return agentWorldbookApiError_ACU(e, 'Xóa metadata Skill của sổ thế giới Agent thất bại.');
        }
    };

    return {
        getAgentWorldbookControl: async function() {
            try {
                const result = await readAgentWorldbookControlFromWorldbooks_ACU();
                return { success: true, ...result };
            } catch (e) {
                logError_ACU('getAgentWorldbookControl failed:', e);
                return agentWorldbookApiError_ACU(e, 'Đọc cấu hình điều khiển sổ thế giới Agent thất bại.');
            }
        },

        setAgentWorldbookMode: async function(mode: any, options: any = {}) {
            try {
                const nextMode = normalizeAgentWorldbookModeForApi_ACU(mode);
                if (!nextMode) {
                    return { success: false, error: 'Chế độ sổ thế giới Agent phải là disabled, passive hoặc agent.' };
                }

                const normalizedOptions = normalizeAgentWorldbookModeOptions_ACU(options);
                const writeResult = await writeAgentWorldbookControlToWorldbook_ACU({
                    mode: nextMode,
                    enabled: nextMode !== 'disabled',
                });
                if (!writeResult.updated) {
                    return {
                        success: false,
                        error: writeResult.reason || 'Ghi cấu hình điều khiển sổ thế giới Agent thất bại.',
                        mode: nextMode,
                        control: writeResult.control,
                        write: writeResult,
                    };
                }

                if (nextMode === 'agent' && normalizedOptions.runTakeover !== false) {
                    const takeover = await takeoverWorldbookGreenlights_ACU();
                    const success = takeover.failed === 0 && takeover.snapshot?.active === true;
                    return {
                        success,
                        error: success ? undefined : (takeover.reason || 'Việc tiếp quản sổ thế giới Agent chưa hoàn tất hoàn toàn.'),
                        mode: nextMode,
                        control: writeResult.control,
                        write: writeResult,
                        takeover,
                    };
                }

                if (nextMode === 'disabled' && normalizedOptions.restoreOnDisable !== false) {
                    const restore = await restoreWorldbookGreenlights_ACU({ cleanupMode: 'restore_only' });
                    const success = restore.skipped === 0 && restore.failed === 0;
                    return {
                        success,
                        error: success ? undefined : (restore.reason || 'Việc khôi phục sổ thế giới Agent chưa hoàn tất hoàn toàn.'),
                        mode: nextMode,
                        control: writeResult.control,
                        write: writeResult,
                        restore,
                    };
                }

                return {
                    success: true,
                    mode: nextMode,
                    control: writeResult.control,
                    write: writeResult,
                };
            } catch (e) {
                logError_ACU('setAgentWorldbookMode failed:', e);
                return agentWorldbookApiError_ACU(e, 'Đặt chế độ sổ thế giới Agent thất bại.');
            }
        },

        runAgentWorldbookSkillify,
        skillifyWorldbookEntries,

        saveAgentWorldbookSkillMeta,
        saveWorldbookEntrySkillMeta: saveAgentWorldbookSkillMeta,

        deleteAgentWorldbookSkillMeta,
        deleteWorldbookEntrySkillMeta: deleteAgentWorldbookSkillMeta,

        clearAgentWorldbookSkillMetas: async function(bookNames: any = []) {
            try {
                const normalizedBookNames = Array.isArray(bookNames) ? bookNames : [];
                const result = await clearWorldbookSkillMetaBlocks_ACU(normalizedBookNames);
                const hasErrors = Array.isArray(result.errors) && result.errors.length > 0;
                const success = result.failed === 0 && !hasErrors;
                return {
                    success,
                    error: success ? undefined : 'Việc xóa metadata Skill của sổ thế giới Agent chưa hoàn tất hoàn toàn.',
                    result,
                };
            } catch (e) {
                logError_ACU('clearAgentWorldbookSkillMetas failed:', e);
                return agentWorldbookApiError_ACU(e, 'Xóa metadata Skill của sổ thế giới Agent thất bại.');
            }
        },
    };
}
