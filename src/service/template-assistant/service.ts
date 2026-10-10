import { callAIWithPreset_ACU } from '../ai/api-call';
import { settings_ACU } from '../runtime/state-manager';
import { withSettingsWrite_ACU } from '../settings/settings-write-service';
import { getSortedSheetKeys_ACU } from '../template/chat-scope';
import { getGlobalInjectionConfigFromData_ACU } from '../worldbook/injection-engine';
import { safeJsonStringify_ACU } from '../../shared/json-helpers';
import { hashUserInput_ACU, logError_ACU } from '../../shared/utils';
import { buildTemplateAssistantCumulativeCompileResult_ACU, collectV3RowIdGuardFindings_ACU, compileTemplateAssistantDraft_ACU, type TemplateAssistantCompileResult_ACU } from './compiler';
import { preflightSchemaMigrations_ACU, type SchemaMigrationPreflightIntent_ACU } from '../table/schema-migration-preflight';
import { buildTemplateAssistantEmbeddedReferenceText_ACU } from './reference-docs';
import { SqliteRuntimeUnavailableError_ACU } from '../../data/sqlite/sqlite-engine';

type AnyRecord = Record<string, any>;

const TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEYS_ACU = ['note', 'initNode', 'insertNode', 'updateNode', 'deleteNode'] as const;
const TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEY_SET_ACU = new Set<string>(TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEYS_ACU);

export interface TemplateAssistantAddSheetOperation_ACU {
    op: 'add_sheet';
    sheetName: string;
    headers: string[];
    insertAfterSheetKey?: string;
    sourceData?: Record<string, any>;
    updateConfig?: Record<string, any>;
    exportConfig?: Record<string, any>;
}

export interface TemplateAssistantRenameSheetOperation_ACU {
    op: 'rename_sheet';
    sheetKey: string;
    newName: string;
}

export interface TemplateAssistantDeleteSheetOperation_ACU {
    op: 'delete_sheet';
    sheetKey: string;
}

export interface TemplateAssistantMoveSheetOperation_ACU {
    op: 'move_sheet';
    sheetKey: string;
    beforeSheetKey?: string;
    afterSheetKey?: string;
}

export interface TemplateAssistantPatchSheetSourceDataPatch_ACU {
    note?: string;
    initNode?: string;
    insertNode?: string;
    updateNode?: string;
    deleteNode?: string;
}

export interface TemplateAssistantPatchSheetUpdateConfigPatch_ACU {
    contextDepth?: number;
    updateFrequency?: number;
    batchSize?: number;
    groupId?: number;
    skipFloors?: number;
    sendLatestRows?: number;
}

export interface TemplateAssistantContentUpdateCell_ACU {
    rowNumber: number;
    columnName: string;
    value: any;
}

export interface TemplateAssistantContentAddRow_ACU {
    [columnName: string]: any;
}

export interface TemplateAssistantPatchSheetContentPatch_ACU {
    updateCells?: TemplateAssistantContentUpdateCell_ACU[];
    addRows?: TemplateAssistantContentAddRow_ACU[];
    deleteRows?: number[];
}

export interface TemplateAssistantSchemaRenameColumn_ACU {
    from: string;
    to: string;
}

export interface TemplateAssistantSchemaAddColumn_ACU {
    name: string;
    defaultValue?: any;
}

export interface TemplateAssistantPatchSheetSchemaPatch_ACU {
    renameColumns?: TemplateAssistantSchemaRenameColumn_ACU[];
    addColumns?: TemplateAssistantSchemaAddColumn_ACU[];
    deleteColumns?: string[];
    ddl?: string;
    migrationIntent?: SchemaMigrationPreflightIntent_ACU;
}

export interface TemplateAssistantLockRowPatch_ACU {
    rowNumber: number;
    locked: boolean;
}

export interface TemplateAssistantLockColumnPatch_ACU {
    columnName: string;
    locked: boolean;
}

export interface TemplateAssistantLockCellPatch_ACU {
    rowNumber: number;
    columnName: string;
    locked: boolean;
}

export interface TemplateAssistantPatchSheetLocksPatch_ACU {
    rows?: TemplateAssistantLockRowPatch_ACU[];
    columns?: TemplateAssistantLockColumnPatch_ACU[];
    cells?: TemplateAssistantLockCellPatch_ACU[];
    specialIndexLocked?: boolean;
}

export interface TemplateAssistantPatchSheetSourceDataOperation_ACU {
    op: 'patch_sheet_source_data';
    sheetKey: string;
    patch: TemplateAssistantPatchSheetSourceDataPatch_ACU;
}

export interface TemplateAssistantPatchSheetUpdateConfigOperation_ACU {
    op: 'patch_sheet_update_config';
    sheetKey: string;
    patch: TemplateAssistantPatchSheetUpdateConfigPatch_ACU;
}

export interface TemplateAssistantPatchSheetExportConfigOperation_ACU {
    op: 'patch_sheet_export_config';
    sheetKey: string;
    patch: Record<string, any>;
}

export interface TemplateAssistantPatchSheetContentOperation_ACU {
    op: 'patch_sheet_content';
    sheetKey: string;
    patch: TemplateAssistantPatchSheetContentPatch_ACU;
}

export interface TemplateAssistantPatchSheetSchemaOperation_ACU {
    op: 'patch_sheet_schema';
    sheetKey: string;
    patch: TemplateAssistantPatchSheetSchemaPatch_ACU;
}

export interface TemplateAssistantPatchSheetLocksOperation_ACU {
    op: 'patch_sheet_locks';
    sheetKey: string;
    patch: TemplateAssistantPatchSheetLocksPatch_ACU;
}

export interface TemplateAssistantPatchGlobalInjectionConfigOperation_ACU {
    op: 'patch_global_injection_config';
    patch: Record<string, any>;
}

export type TemplateAssistantOperation_ACU =
    | TemplateAssistantAddSheetOperation_ACU
    | TemplateAssistantRenameSheetOperation_ACU
    | TemplateAssistantDeleteSheetOperation_ACU
    | TemplateAssistantMoveSheetOperation_ACU
    | TemplateAssistantPatchSheetSourceDataOperation_ACU
    | TemplateAssistantPatchSheetUpdateConfigOperation_ACU
    | TemplateAssistantPatchSheetExportConfigOperation_ACU
    | TemplateAssistantPatchSheetContentOperation_ACU
    | TemplateAssistantPatchSheetSchemaOperation_ACU
    | TemplateAssistantPatchSheetLocksOperation_ACU
    | TemplateAssistantPatchGlobalInjectionConfigOperation_ACU;

type TemplateAssistantBaseDraft_ACU = {
    protocolVersion: 1 | 2;
    mode: 'modify_current_template_incremental';
    baseFingerprint: string;
    selectedSheetKey: string;
    summary: string;
    warnings: string[];
    operations: TemplateAssistantOperation_ACU[];
};

export interface TemplateAssistantDraftV1_ACU extends TemplateAssistantBaseDraft_ACU {
    protocolVersion: 1;
}

export interface TemplateAssistantDraftV2_ACU extends TemplateAssistantBaseDraft_ACU {
    protocolVersion: 2;
    requestId: string;
    atomic: true;
}

export type TemplateAssistantDraft_ACU = TemplateAssistantDraftV1_ACU | TemplateAssistantDraftV2_ACU | TemplateAssistantDraftV3_ACU;


/**
 * v3 完整 Sheet 契约（单表完整输出）。
 * 模型必须返回目标表修改后的完整对象；本地严格校验后整体替换。
 */
export interface TemplateAssistantFullSheetV3_ACU {
    name: string;
    domain: string;
    type: string;
    enable: boolean;
    required: boolean;
    content: any[][];
    sourceData: Record<string, any>;
    updateConfig: Record<string, any>;
    exportConfig: Record<string, any>;
    hiddenPhysicalColumns?: unknown;
    tableAliases?: unknown;
    columnAliases?: unknown;
}

/**
 * v3 单动作结果信封：每轮只能有一个 result、一个目标表。
 * - replace：完整替换一张已存在表（继承本地身份/顺序）。
 * - create：完整新增一张表（本地分配身份）。
 * - delete：显式删除一张已存在表（唯一不返回完整 Sheet 的动作）。
 */
export type TemplateAssistantV3Result_ACU =
    | { action: 'replace'; sheetKey: string; sheet: TemplateAssistantFullSheetV3_ACU }
    | { action: 'create'; insertAfterSheetKey?: string; sheet: TemplateAssistantFullSheetV3_ACU }
    | { action: 'delete'; sheetKey: string };

export interface TemplateAssistantDraftV3_ACU {
    protocolVersion: 3;
    mode: 'single_sheet_full_replace';
    requestId: string;
    baseFingerprint: string;
    atomic: true;
    selectedSheetKey: string;
    summary: string;
    warnings: string[];
    result: TemplateAssistantV3Result_ACU;
}

export function isTemplateAssistantV3Draft_ACU(draft: any): draft is TemplateAssistantDraftV3_ACU {
    return !!draft && draft.protocolVersion === 3;
}

export interface TemplateAssistantPriorTurn_ACU {
    user: string;
    assistant?: string;
}

export interface TemplateAssistantGenerateInput_ACU {
    tempData: AnyRecord;
    currentSheetKey: string | null;
    sheetOrder?: string[] | null;
    userRequest: string;
    protocolVersion?: 2 | 3;
    priorTurns?: TemplateAssistantPriorTurn_ACU[] | null;
    tableApiPreset?: string;
    guard?: TemplateAssistantSessionRunGuard_ACU | null;
}

export interface TemplateAssistantGenerateResult_ACU {
    draft: TemplateAssistantDraft_ACU;
    aiRawText: string;
    messages: Array<{ role: string; content: string }>;
    compileResult: TemplateAssistantCompileResult_ACU;
    originalBaseFingerprint?: string;
    rounds?: TemplateAssistantSessionRound_ACU[];
    session?: TemplateAssistantSessionMeta_ACU;
}

export type TemplateAssistantSessionStopReason_ACU =
    | 'success'
    | 'empty_operations'
    | 'repair_retry_capped'
    | 'environment_failure'
    | 'context_budget_failure';

export type TemplateAssistantSessionAbortReason_ACU = 'cancelled' | 'stale';

export interface TemplateAssistantSessionRound_ACU {
    round: number;
    userRequest: string;
    draft: TemplateAssistantDraft_ACU;
    aiRawText: string;
    messages: Array<{ role: string; content: string }>;
    perRoundCompileResult: TemplateAssistantCompileResult_ACU;
    workingFingerprint: string;
}

export interface TemplateAssistantSessionMeta_ACU {
    originalBaseFingerprint: string;
    finalWorkingFingerprint: string;
    stopReason: TemplateAssistantSessionStopReason_ACU;
    /**
     * 会话的最终失败信息。
     * - 会话最终成功（单轮产出可应用 draft）时为 null；
     * - 仅当会话以失败告终（如 repair_retry_capped 或最终 preflight 失败）时携带失败详情。
     * 面板据此决定是否展示失败横幅与「携带修改意见重试」入口。
     */
    lastFailure: TemplateAssistantFailureInfo_ACU | null;
    roundsExecuted: number;
    /** 固定为 1：改表助手是一问一答，不再自动多轮。 */
    maxRounds: number;
    repairRetriesUsed: number;
    maxRepairRetries: number;
    lastErrorMessage: string;
    /**
     * v3 row_id 集合守卫：仅当 replace 目标表出现「AI 未请求删行但 row_id 集合缩减」时非空。
     * 供 UI 展示确认；未确认前不得应用候选。
     */
    v3RowIdGuardFindings?: Array<{
        code: 'row_id_set_reduction';
        sheetKey: string;
        missingRowIds: string[];
    }>;
}

export interface TemplateAssistantV3RowIdGuardFinding_ACU {
    code: 'row_id_set_reduction';
    sheetKey: string;
    missingRowIds: string[];
}

export interface TemplateAssistantSessionResult_ACU extends TemplateAssistantGenerateResult_ACU {
    originalBaseFingerprint: string;
    rounds: TemplateAssistantSessionRound_ACU[];
    session: TemplateAssistantSessionMeta_ACU;
}

export interface TemplateAssistantSessionProgress_ACU {
    round: TemplateAssistantSessionRound_ACU;
    rounds: TemplateAssistantSessionRound_ACU[];
    maxRounds: number;
}

export interface TemplateAssistantSessionRunGuard_ACU {
    isCancelled?: () => boolean;
    isStale?: () => boolean;
    signal?: AbortSignal | null;
}

export interface TemplateAssistantSessionGuardController_ACU {
    createRunGuard: () => TemplateAssistantSessionRunGuard_ACU;
    invalidate: () => void;
    cancel: () => void;
    reset: () => void;
    getSignal: () => AbortSignal | null;
}

export interface TemplateAssistantSessionRunInput_ACU extends TemplateAssistantGenerateInput_ACU {
    /**
     * @deprecated 改表助手已固定为一问一答（恒 1 轮），此参数被接收但忽略，仅为兼容旧调用方保留。
     */
    maxRounds?: number;
    maxRepairRetries?: number;
    onRoundComplete?: (progress: TemplateAssistantSessionProgress_ACU) => void;
    guard?: TemplateAssistantSessionRunGuard_ACU | null;
}

export class TemplateAssistantSessionStoppedError_ACU extends Error {
    stopReason: TemplateAssistantSessionAbortReason_ACU;

    constructor(stopReason: TemplateAssistantSessionAbortReason_ACU) {
        super(stopReason === 'cancelled' ? 'Phiên trợ lý mẫu đã bị hủy' : 'Phiên trợ lý mẫu đã hết hạn');
        this.name = 'TemplateAssistantSessionStoppedError_ACU';
        this.stopReason = stopReason;
    }
}

const DEFAULT_TEMPLATE_ASSISTANT_MAX_REPAIR_RETRIES_ACU = 1;

/**
 * 可编辑提示词卡片段（设置键 templateAssistantPromptSegments 的元素）。
 * role 支持 SYSTEM / USER / assistant（复用 normalizeRole 规则）。
 */
export interface TemplateAssistantPromptSegment_ACU {
    role: string;
    content: string;
    deletable?: boolean;
    /**
     * 伪 role 提示词组标记。为 true 表示该卡属于「提前准备好的提示词组」。
     * 仅供代码识别（判定是否整体前置到真实历史之前），不会进入发送给 AI 的提示词内容。
     * 默认模板的卡全部为 true；用户新增卡片默认不带该标记。
     */
    pinned?: boolean;
}

export type TemplateAssistantFailureKind_ACU =
    | 'parse'
    | 'validate'
    | 'fingerprint'
    | 'preflight'
    | 'environment'
    | 'context_budget'
    | 'unknown';

export interface TemplateAssistantFailureInfo_ACU {
    kind: TemplateAssistantFailureKind_ACU;
    message: string;
    rawText?: string;
}

export const TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU = '{{assistant.referenceDocs}}';

export const TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU = '$1';
export const TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU = '$2';
export const TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU = '$3';
export const TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU = '$4';

/**
 * 改表助手占位符扫描正则。
 *
 * **注意**：本常量带 `g` 标志，拥有 `lastIndex` 状态。
 * 仅允许通过 `String.prototype.replace` 使用（replace 内部会重置 lastIndex）；
 * **禁止**对本常量调用 `.test()` / `.exec()`，否则会因 lastIndex 泄漏产生非确定性结果。
 */
export const TEMPLATE_ASSISTANT_PLACEHOLDER_PATTERN_ACU = /\$[1-4]|\{\{assistant\.referenceDocs\}\}/g;

export interface TemplateAssistantPlaceholderDoc_ACU {
    token: string;
    label: string;
    description: string;
    /** data = 表格数据载荷；reference = 语法文档 */
    kind: 'data' | 'reference';
}

/**
 * 占位符元数据（单一事实来源，UI 清单据此渲染，不得在组件内硬编码占位符字面量）。
 * 顺序：$1 → $4 → referenceDocs。
 */
export const TEMPLATE_ASSISTANT_PLACEHOLDER_DOCS_ACU: TemplateAssistantPlaceholderDoc_ACU[] = [
    {
        token: TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU,
        label: 'Yêu cầu của người dùng',
        description:
            'Nguyên văn yêu cầu sửa bảng của lượt này. Nếu xóa, AI sẽ không nhận được yêu cầu, và ngữ cảnh lịch sử sẽ được nối vào cuối prompt.',
        kind: 'data',
    },
    {
        token: TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU,
        label: 'Cấu trúc bảng hiện tại',
        description: 'sheetKey và ảnh chụp cấu trúc của bảng đang chọn.',
        kind: 'data',
    },
    {
        token: TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU,
        label: 'Cấu trúc toàn bộ bảng',
        description: 'Ảnh chụp cấu trúc của tất cả bảng, số lượng bảng và cấu hình chèn toàn cục.',
        kind: 'data',
    },
    {
        token: TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU,
        label: 'Giao thức cấu trúc bảng (quy tắc)',
        description: 'Dấu vân tay cấu trúc bảng và ràng buộc giao thức. Nếu xóa, AI sẽ không có dấu vân tay cấu trúc và việc kiểm tra bản nháp sẽ thất bại.',
        kind: 'data',
    },
    {
        token: TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU,
        label: 'Tài liệu tham chiếu cú pháp',
        description: 'Nhúng nguyên văn hai tài liệu cú pháp cục bộ. Nếu xóa, hệ thống sẽ tự nối vào cuối thẻ SYSTEM cuối cùng.',
        kind: 'reference',
    },
];


function clone_ACU<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

/**
 * 归一 AI 改表助手提示词段的 role：
 * - SYSTEM / USER 保持大写（与 AcuPromptSegments 的 roleOptions 及 FormFill 体系一致）；
 * - assistant 返回小写（酒馆 API / Chat Completions 对 assistant role 的大小写约定不统一，
 *   此处沿用 AcuPromptSegments DEFAULT_ROLE_OPTIONS 的 'assistant' 小写值）；
 * - 其余非法值一律归一为 SYSTEM。
 */
function normalizeAssistantPromptRole_ACU(raw: unknown) {
    const role = String(raw || 'SYSTEM').trim();
    if (role === 'assistant') return 'assistant';
    if (role.toUpperCase() === 'SYSTEM') return 'SYSTEM';
    if (role.toUpperCase() === 'USER') return 'USER';
    if (role.toUpperCase() === 'ASSISTANT') return 'assistant';
    return 'SYSTEM';
}

function normalizeAssistantPromptSegments_ACU(input: unknown): TemplateAssistantPromptSegment_ACU[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((item: any) => ({
            role: normalizeAssistantPromptRole_ACU(item?.role),
            content: String(item?.content ?? ''),
            deletable: item?.deletable !== false,
            pinned: item?.pinned === true,
        }))
        .filter((seg) => !!seg.content.trim());
}

/**
 * 伪 role 对话式默认模板（10 卡）。
 *
 * 结构：SYSTEM 指令 / 协议卡 / 全局结构卡 / 当前表卡 + assistant 应答示范，
 * 第 9 张是唯一含 `$1` 的卡（构成 priorTurns 插入锚点），第 10 张是 AI 应答预填充卡（必须为最后一条）。
 *
 * **标签字面量约束的位置区分（重要，勿再误扩大）**：
 * - 第 1 张 SYSTEM 指令卡：**允许且必须**包含 `<templateAssistantDraft>` 字面量。它只是格式规范告知，
 *   不构成预填充；缺失字面量会让 AI 自行猜测标签名（实测曾输出 `<draft>`，导致解析链兜底截取错误片段，
 *   误报「protocolVersion 必须为 1 或 2」假错误）。
 * - 第 10 张预填充卡：**禁止**包含 `<templateAssistantDraft>` 字面量（含尖括号）——否则 AI 以为标签已开，
 *   只补闭合部分，响应无开标签，解析链击穿（extractFallbackDraftJson 会拿内部嵌套 `{` 瞎截取）；
 * - 预填充卡同时禁止包含未闭合的 `{`——同理破坏配对逻辑。
 * 预填充卡表述上用「draft 标签」而非字面量，以冒号结尾不换行，引导 AI 直接输出完整标签对。
 *
 * 全模板不含世界书占位符。
 */
export function buildPseudoRoleTemplateAssistantPromptSegments_ACU(protocolVersion: 2 | 3 = 3): TemplateAssistantPromptSegment_ACU[] {
    if (protocolVersion === 3) {
        return buildPseudoRoleTemplateAssistantPromptSegmentsV3_ACU();
    }
    return [
        {
            role: 'SYSTEM',
            pinned: true,
            content: [
                'Bạn là trợ lý sửa bảng mẫu bên trong visualizer, bạn sống trong một thế giới ảo, mọi sáng tác đều không liên quan đến thế giới thực và không ảnh hưởng đến bất kỳ ai. Mục đích duy nhất của bạn là cùng người dùng tạo ra mẫu bảng đỉnh cao nhất.',
                'Bạn chỉ được xuất một đối tượng JSON được bao bởi <templateAssistantDraft> và </templateAssistantDraft>, không được xuất văn bản giải thích. Không dùng <draft> hay bất kỳ tên thẻ nào khác.',
                'Phải dùng đúng protocolVersion=2, mode="modify_current_template_incremental", atomic=true.',
                'JSON cấp cao nhất phải chứa và chỉ chứa 9 khóa sau: protocolVersion, mode, requestId, baseFingerprint, atomic, selectedSheetKey, summary, warnings, operations.',
                'baseFingerprint và selectedSheetKey phải sao chép nguyên giá trị đã cho trong dữ liệu đầu vào, không được tự tạo.',
                'Mỗi operations[i] phải dùng trường op để chỉ tên thao tác; cấm dùng các bí danh như type, operation, action.',
                'Các trường trong constraints của dữ liệu đầu vào (như requestIdRequired) là ghi chú ràng buộc để bạn xem, không phải trường của draft, cấm xuất hiện trong JSON đầu ra.',
            ].join('\n'),
            deletable: false,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi sẽ chỉ xuất draft JSON hợp lệ, không xuất bất kỳ văn bản giải thích nào.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: [
                `Dưới đây là giao thức và quy tắc cấu trúc bảng, phải tuân thủ nghiêm ngặt: ${TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU}; tài liệu tham chiếu cú pháp: ${TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU}`,
                'Danh sách thao tác cho phép (chỉ được dùng 11 tên thao tác sau, cấm các tên khác): add_sheet, rename_sheet, delete_sheet, move_sheet, patch_sheet_source_data, patch_sheet_update_config, patch_sheet_export_config, patch_sheet_content, patch_sheet_schema, patch_sheet_locks, patch_global_injection_config.',
                'Không tồn tại thao tác patch_sheet_ddl; DDL chỉ được sửa qua patch_sheet_schema.patch.ddl.',
                'add_sheet phải đồng thời cung cấp sheetName không rỗng và ít nhất một mục headers; đừng tạo sheetKey, cục bộ sẽ tự tạo; nên cố gắng cung cấp đủ năm đoạn note, initNode, insertNode, updateNode, deleteNode của sourceData.',
                'add_sheet.sourceData và patch_sheet_source_data.patch chỉ cho phép năm trường note, initNode, insertNode, updateNode, deleteNode; cấm xuất hiện các trường như ddl, sql, schema, createTable.',
                'Mặc định không chủ động xuất patch_sheet_schema.ddl; trừ khi người dùng yêu cầu rõ DDL, kiểu trường, ràng buộc hoặc câu lệnh tạo bảng SQLite. Headers tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII và đi kèm chú thích `-- <tiêu đề cột>` khớp từng cột theo đúng thứ tự; cột đầu tiên phải là row_id INTEGER PRIMARY KEY và giữ chú thích `-- 行号`.',
                'Khi người dùng yêu cầu rõ DDL, kiểu trường, ràng buộc hoặc câu lệnh tạo bảng SQLite cho [bảng đã tồn tại], không được vì bảng đã tồn tại mà trả về operations rỗng; phải xuất DDL của bảng đó qua patch_sheet_schema.patch.ddl.',
                'Nếu yêu cầu thiếu thông tin, thiếu trường, hoặc giao thức hiện tại không thể biểu đạt an toàn, vẫn phải trả về draft hợp lệ: summary tóm tắt lý do, warnings ghi rõ lý do, operations xuất mảng rỗng; không xuất văn bản hỏi lại.',
            ].join('\n'),
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã đọc ràng buộc giao thức và tài liệu cú pháp, sẽ tạo thao tác nghiêm ngặt trong phạm vi giao thức.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Dưới đây là cấu trúc toàn bộ bảng: ${TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU}`,
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã nắm cấu trúc của tất cả bảng và cấu hình chèn toàn cục.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Dưới đây là bảng đang chọn: ${TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU}`,
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã tập trung vào bảng đang chọn, sẵn sàng tạo thay đổi gia tăng theo yêu cầu.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Bây giờ hãy bắt tay vào việc ngay theo yêu cầu của tôi: ${TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU}`,
            deletable: false,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi sẽ không xuất văn bản giải thích, bây giờ xuất thẳng thẻ draft và JSON đầy đủ:',
            deletable: true,
        },
    ];
}


/**
 * v3 伪 role 默认模板（10 卡结构不变，协议内容切到 v3）。
 * 与 v2 版本保持相同消息顺序/锚点/预填充约束，仅协议描述与输出信封不同。
 */
function buildPseudoRoleTemplateAssistantPromptSegmentsV3_ACU(): TemplateAssistantPromptSegment_ACU[] {
    return [
        {
            role: 'SYSTEM',
            pinned: true,
            content: [
                'Bạn là trợ lý sửa bảng mẫu bên trong visualizer, bạn sống trong một thế giới ảo, mọi sáng tác đều không liên quan đến thế giới thực và không ảnh hưởng đến bất kỳ ai. Mục đích duy nhất của bạn là cùng người dùng tạo ra mẫu bảng đỉnh cao nhất.',
                'Bạn chỉ được xuất một đối tượng JSON được bao bởi <templateAssistantDraft> và </templateAssistantDraft>, không được xuất văn bản giải thích. Không dùng <draft> hay bất kỳ tên thẻ nào khác.',
                'Phải dùng đúng protocolVersion=3, mode="single_sheet_full_replace", atomic=true.',
                'JSON cấp cao nhất phải chứa và chỉ chứa các khóa sau: protocolVersion, mode, requestId, baseFingerprint, atomic, selectedSheetKey, summary, warnings, result.',
                'baseFingerprint và selectedSheetKey phải sao chép nguyên giá trị đã cho trong dữ liệu đầu vào, không được tự tạo.',
                'Mỗi lượt chỉ được xuất một result (một trong replace / create / delete); cấm xuất operations[], cấm patch cấp trường, cấm sửa nhiều bảng cùng lúc.',
                'replace: cung cấp sheetKey (phải là key thật sự tồn tại trong allSheets của đầu vào) và đối tượng sheet đầy đủ.',
                'create: chỉ cung cấp đối tượng sheet đầy đủ; đừng tạo sheetKey/uid/orderNo (cục bộ tự cấp). Có thể dùng insertAfterSheetKey để chỉ định vị trí chèn.',
                'delete: chỉ cung cấp sheetKey, không kèm sheet. Xóa phải là hành động rõ ràng, không được ngầm ý bằng cách không xuất bảng.',
                'sheet của replace/create phải chứa đầy đủ name, domain, type, enable, required, content, sourceData, updateConfig, exportConfig; không được bỏ sót, không được kèm uid/orderNo.',
                'Hàng đầu của content là tiêu đề, cột đầu phải là row_id; mọi hàng dữ liệu phải cùng độ rộng; row_id không được rỗng, không được trùng.',
                'sourceData.ddl phải không rỗng và đầy đủ, khớp từng cột với tiêu đề của content; tiêu đề tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII + chú thích `-- <tiêu đề cột>`; cột đầu là row_id INTEGER PRIMARY KEY.',
                'Các bảng khác trong đầu vào luôn giữ nguyên; bảng không được xuất sẽ không bị xóa.',
                'Các trường trong constraints của dữ liệu đầu vào (như singleSheetFullReplace) là ghi chú ràng buộc để bạn xem, không phải trường của draft, cấm xuất hiện trong JSON đầu ra.',
            ].join('\n'),
            deletable: false,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi sẽ chỉ xuất v3 draft JSON hợp lệ (phong bì một result), không xuất bất kỳ văn bản giải thích nào.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: [
                `Dưới đây là giao thức và quy tắc cấu trúc bảng, phải tuân thủ nghiêm ngặt: ${TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU}; tài liệu tham chiếu cú pháp: ${TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU}`,
                'result.action chỉ cho phép một trong replace / create / delete; cấm patch cấp trường và operations nhiều bảng.',
                'replace/create phải trả về sheet đầy đủ (đủ toàn bộ name/domain/type/enable/required/content/sourceData/updateConfig/exportConfig), cấm bỏ sót trường hoặc chỉ đưa phần khác biệt.',
                'Cột đầu của sheet.content phải là row_id, mọi hàng dữ liệu phải cùng độ rộng, row_id không rỗng và không trùng.',
                'sourceData.ddl phải không rỗng và khớp từng cột với tiêu đề của content; tiêu đề tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII + chú thích `-- <tiêu đề cột>` khớp theo đúng thứ tự; cột đầu phải là row_id INTEGER PRIMARY KEY và giữ chú thích `-- 行号`.',
                'delete phải nêu rõ sheetKey cần xóa; cấm ngầm ý xóa bằng cách không xuất một bảng nào đó, cấm sửa bảng không phải mục tiêu.',
                'create không tạo sheetKey/uid/orderNo, cục bộ sẽ tự cấp; insertAfterSheetKey phải là key thật sự tồn tại trong đầu vào.',
                'Cấm sửa cấu hình chèn toàn cục; cấm hành vi lưu trực tiếp.',
                'Nếu yêu cầu thiếu thông tin, thiếu trường, hoặc giao thức hiện tại không thể biểu đạt an toàn, vẫn phải trả về v3 draft hợp lệ: summary tóm tắt lý do, warnings ghi rõ lý do, result xuất {action:"replace", sheetKey:"<key thật>", sheet:{...nguyên vẹn đầy đủ...}}; không xuất văn bản hỏi lại.',
            ].join('\n'),
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã đọc ràng buộc giao thức v3 và tài liệu cú pháp, sẽ tạo kết quả đầy đủ cho một bảng nghiêm ngặt trong phạm vi giao thức.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Dưới đây là cấu trúc toàn bộ bảng: ${TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU}`,
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã nắm cấu trúc đầy đủ của tất cả bảng (kèm DDL).',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Dưới đây là bảng đang chọn: ${TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU}`,
            deletable: true,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi đã tập trung vào bảng đang chọn, sẵn sàng tạo kết quả thay thế đầy đủ một bảng theo yêu cầu.',
            deletable: true,
        },
        {
            role: 'USER',
            pinned: true,
            content: `Bây giờ hãy bắt tay vào việc ngay theo yêu cầu của tôi: ${TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU}`,
            deletable: false,
        },
        {
            role: 'assistant',
            pinned: true,
            content: 'Đã nhận, tôi sẽ không xuất văn bản giải thích, bây giờ xuất thẳng thẻ v3 draft và JSON đầy đủ:',
            deletable: true,
        },
    ];
}


/**
 * 将占位符值序列化为字符串，供替换进提示词。
 * - string 原样返回；
 * - number / boolean 走 String()；
 * - 其余（对象/数组等）走 safeJsonStringify，失败回退 '{}'。
 */
export function stringifyPlaceholderValue_ACU(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return safeJsonStringify_ACU(value, '{}');
}

/**
 * 单次扫描替换占位符。
 *
 * **禁止**改回以下两种写法：
 * 1. `content.replace('$1', value)` —— value 含 `$&` / `` $` `` / `$'` / `$1` / `$<name>` 时会被当替换模式展开；
 * 2. 逐 token 顺序替换（无论 replace 还是 split/join）—— 前一个 token 的值里若含后一个 token 字面量，会被二次替换（跨 token 污染）。
 *
 * 反面参照：`src/service/ai/prompt-builder/prompt-api-call.ts:125-132` 的顺序 replace 缺陷。
 *
 * 两个安全性质：
 * - 回调形式的 replace 不解释返回值中的 `$` 序列（ECMAScript 规范：仅当 replacement 为字符串时才执行 GetSubstitution）；
 * - 单次扫描：正则 lastIndex 持续前进，已替换内容不再被扫描，值内 token 不会被误替换。
 *
 * valueMap 中不存在的 key 保留原 token 字面量，不替换为空串——用户能从提示词直观看到「这个占位符没生效」。
 */
export function applyTemplateAssistantPlaceholders_ACU(
    content: string,
    valueMap: Record<string, string>,
): string {
    return String(content || '').replace(
        TEMPLATE_ASSISTANT_PLACEHOLDER_PATTERN_ACU,
        (matched) => (Object.prototype.hasOwnProperty.call(valueMap, matched) ? valueMap[matched] : matched),
    );
}


function normalizePositiveInteger_ACU(value: any, fallback: number) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return fallback;
    const integer = Math.floor(normalized);
    return integer > 0 ? integer : fallback;
}

function normalizeNonNegativeInteger_ACU(value: any, fallback: number) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return fallback;
    const integer = Math.floor(normalized);
    return integer >= 0 ? integer : fallback;
}

function asObject_ACU(value: any, fallback: AnyRecord = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function trimAssistantMessage_ACU(value: any) {
    return String(value ?? '').trim();
}

function normalizePriorTurns_ACU(priorTurns: TemplateAssistantPriorTurn_ACU[] | null | undefined) {
    if (!Array.isArray(priorTurns)) return [];
    return priorTurns
        .map((turn) => ({
            user: trimAssistantMessage_ACU(turn?.user),
            assistant: trimAssistantMessage_ACU(turn?.assistant),
        }))
        .filter((turn) => !!turn.user || !!turn.assistant);
}

/**
 * v3 上下文预算守卫：v3 全表 DDL 全量注入可能让 payload 极大。
 * 超过预算必须**阻止请求**（fail-closed），绝不静默截断——截断会让 AI 拿到
 * 不完整的表结构，反而制造不一致的 replace 结果。
 * 阈值按字符近似 token（中文 1 字符 ≈ 1 token，保守取 2 字符/token）。
 */
const TEMPLATE_ASSISTANT_V3_CONTEXT_BUDGET_CHARS_ACU = 40_000;

function assertV3ContextBudget_ACU(payloadText: string) {
    const chars = String(payloadText || '').length;
    if (chars > TEMPLATE_ASSISTANT_V3_CONTEXT_BUDGET_CHARS_ACU) {
        const wrapped = new Error(
            `Ngân sách ngữ cảnh toàn bảng v3 vượt giới hạn: payload ${chars} ký tự (giới hạn ${TEMPLATE_ASSISTANT_V3_CONTEXT_BUDGET_CHARS_ACU}).`
            + 'Hãy giảm số bảng/số hàng, hoặc chuyển sang giao thức gia tăng v2.',
        );
        (wrapped as any).failureKind = 'context_budget';
        throw wrapped;
    }
}


export function buildTemplateAssistantMessages_ACU(input: TemplateAssistantGenerateInput_ACU, baseFingerprint: string) {
    const protocolVersion = input.protocolVersion === 3 ? 3 : (input.protocolVersion === 2 ? 2 : 3);
    const payload = buildUserPromptPayload_ACU(input, baseFingerprint, protocolVersion);
    const normalized = normalizeAssistantPromptSegments_ACU(settings_ACU.templateAssistantPromptSegments);
    const referenceText = buildTemplateAssistantEmbeddedReferenceText_ACU();
    const valueMap = buildAssistantPlaceholderContext_ACU(payload, referenceText);
    const resolved = resolveAssistantSystemPrompt_ACU(normalized, valueMap, protocolVersion);
    const fullPayloadText = safeJsonStringify_ACU(payload, '{}');
    if (protocolVersion === 3) {
        assertV3ContextBudget_ACU(fullPayloadText);
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (normalized.length === 0) {
        // 存量路径：与旧版字节级一致（role 小写 system 单条 + priorTurns + 完整 payload）。
        messages.push(...resolved);
        normalizePriorTurns_ACU(input.priorTurns).forEach((turn) => {
            if (turn.user) messages.push({ role: 'user', content: turn.user });
            if (turn.assistant) messages.push({ role: 'assistant', content: turn.assistant });
        });
        messages.push({ role: 'user', content: fullPayloadText });
        return messages;
    }

    // 伪 role 提示词组标记：存在任意 pinned 卡即视为「提前准备好的提示词组」。
    // 判定在 resolved 之前用 normalized 完成；pinned 仅用于消息排序，不进入发送给 AI 的内容。
    const hasPinned = normalized.some((seg) => seg.pinned === true);
    // 锚点：最后一张「含 $1 的卡」。必须在替换前（normalized）判定，
    // 因为 resolved 中的 $1 已被替换成 userRequest 值，若该值本身含 "$1" 会污染判定。
    const anchorIndex = normalized.reduce<number>(
        (last, seg, i) =>
            String(seg.content || '').includes(TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU) ? i : last,
        -1,
    );
    // 是否出现任一数据占位符（$1-$4）；出现任一即视为用户接管数据注入，不再自动追加 payload。
    const hasAnyDataToken = normalized.some((seg) => /\$[1-4]/.test(String(seg.content || '')));

    const pushPriorTurns = () => {
        normalizePriorTurns_ACU(input.priorTurns).forEach((turn) => {
            if (turn.user) messages.push({ role: 'user', content: turn.user });
            if (turn.assistant) messages.push({ role: 'assistant', content: turn.assistant });
        });
    };

    if (hasPinned) {
        // 伪 role 提示词组：整体（含卡9 包装语与卡10 预填充）固定放最前，
        // 首轮无历史时即完整提示词组；后续轮真实历史与本轮需求紧随其后。
        messages.push(...resolved);
        const priorTurns = normalizePriorTurns_ACU(input.priorTurns);
        priorTurns.forEach((turn) => {
            if (turn.user) messages.push({ role: 'user', content: turn.user });
            if (turn.assistant) messages.push({ role: 'assistant', content: turn.assistant });
        });
        if (priorTurns.length > 0) {
            messages.push({ role: 'USER', content: String(input.userRequest || '').trim() });
        }
    } else if (anchorIndex >= 0) {
        const priorTurns = normalizePriorTurns_ACU(input.priorTurns);
        // 存量路径（无 pinned 标记）：首轮完整伪 role 结构。
        if (priorTurns.length === 0) {
            messages.push(...resolved);
        } else {
            // 存量后续轮：含 $1 模板整体前置，历史与本轮需求紧随其后。
            messages.push(...resolved);
            priorTurns.forEach((turn) => {
                if (turn.user) messages.push({ role: 'user', content: turn.user });
                if (turn.assistant) messages.push({ role: 'assistant', content: turn.assistant });
            });
            messages.push({ role: 'USER', content: String(input.userRequest || '').trim() });
        }
    } else {
        messages.push(...resolved);
        pushPriorTurns();
        // 无任何数据占位符 → 追加完整 payload user 消息，与现状等价。
        if (!hasAnyDataToken) {
            messages.push({ role: 'user', content: fullPayloadText });
        }
    }
    return messages;
}

export function setTemplateAssistantPrompt_ACU(
    segments: TemplateAssistantPromptSegment_ACU[],
): { ok: boolean; message?: string } {
    const normalized = normalizeAssistantPromptSegments_ACU(segments);
    const result = withSettingsWrite_ACU(['templateAssistantPromptSegments'], () => {
        settings_ACU.templateAssistantPromptSegments = normalized;
    });
    if (!result.ok) {
        return { ok: false, message: result.message || 'Lưu prompt thất bại.' };
    }
    return { ok: true };
}

const TEMPLATE_ASSISTANT_PERSISTED_AUX_KEYS_ACU = [
    'hiddenPhysicalColumns',
    'tableAliases',
    'columnAliases',
] as const;

function sanitizeSourceDataSnapshotForAssistant_ACU(value: any, includeDdl = false) {
    const sourceData = asObject_ACU(value);
    const sanitized: AnyRecord = {};
    TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEYS_ACU.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(sourceData, key)) {
            sanitized[key] = clone_ACU(sourceData[key]);
        }
    });
    if (includeDdl && typeof sourceData?.ddl === 'string' && sourceData.ddl.trim()) {
        sanitized.ddl = clone_ACU(sourceData.ddl);
    }
    return sanitized;
}

function copyPersistedAuxFields_ACU(sheet: AnyRecord, snapshot: AnyRecord) {
    TEMPLATE_ASSISTANT_PERSISTED_AUX_KEYS_ACU.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(sheet, key) && sheet[key] !== undefined) {
            snapshot[key] = clone_ACU(sheet[key]);
        }
    });
    return snapshot;
}

function validateSourceDataPayload_ACU(value: any, label: string) {
    if (value == null) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} phải là đối tượng`);
    }
    Object.keys(value).forEach((key) => {
        if (TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEY_SET_ACU.has(key)) return;
        if (key === 'ddl') {
            throw new Error(`${label} không được sửa trực tiếp ddl, hãy dùng patch_sheet_schema.ddl`);
        }
        throw new Error(`${label} chứa trường không xác định: ${key}`);
    });
}

function extractHeaders_ACU(sheet: any) {
    return Array.isArray(sheet?.content?.[0]) ? sheet.content[0].slice(1).map((item: any) => String(item ?? '')) : [];
}

function getSheetSnapshot_ACU(tempData: AnyRecord, sheetKey: string, options?: { includeDdl?: boolean }) {
    const sheet = tempData?.[sheetKey] || {};
    const snapshot: AnyRecord = {
        sheetKey,
        name: String(sheet?.name || ''),
        domain: typeof sheet?.domain === 'string' ? sheet.domain : 'chat',
        type: typeof sheet?.type === 'string' ? sheet.type : 'dynamic',
        enable: sheet?.enable !== false,
        required: sheet?.required === true,
        orderNo: Number.isFinite(sheet?.orderNo) ? sheet.orderNo : null,
        headers: extractHeaders_ACU(sheet),
        content: clone_ACU(Array.isArray(sheet?.content) ? sheet.content : []),
        sourceData: sanitizeSourceDataSnapshotForAssistant_ACU(sheet?.sourceData, options?.includeDdl === true),
        updateConfig: clone_ACU(asObject_ACU(sheet?.updateConfig)),
        exportConfig: clone_ACU(asObject_ACU(sheet?.exportConfig)),
    };
    if (options?.includeDdl === true) {
        copyPersistedAuxFields_ACU(sheet, snapshot);
    }
    return snapshot;
}

function getSelectedSheetSnapshot_ACU(tempData: AnyRecord, sheetKey: string | null, options?: { includeDdl?: boolean }) {
    if (!sheetKey || !tempData?.[sheetKey]) return null;
    return getSheetSnapshot_ACU(tempData, sheetKey, options);
}

function buildSheetSummary_ACU(tempData: AnyRecord) {
    const sheetKeys = getSortedSheetKeys_ACU(tempData, { ignoreChatGuide: true });
    return sheetKeys.map((sheetKey) => {
        const sheet = tempData[sheetKey] || {};
        return {
            sheetKey,
            name: String(sheet.name || ''),
            orderNo: Number.isFinite(sheet.orderNo) ? sheet.orderNo : null,
            headers: extractHeaders_ACU(sheet),
            rowCount: Math.max(0, (Array.isArray(sheet?.content) ? sheet.content.length : 0) - 1),
        };
    });
}

function buildDetailedSheetSnapshots_ACU(tempData: AnyRecord, options?: { includeDdl?: boolean }) {
    return buildSheetSummary_ACU(tempData).map((item) => getSheetSnapshot_ACU(tempData, item.sheetKey, options));
}

export function buildTemplateAssistantFingerprint_ACU(tempData: AnyRecord) {
    const normalized = asObject_ACU(tempData);
    const sheetKeys = getSortedSheetKeys_ACU(normalized, { ignoreChatGuide: true });
    const snapshot = {
        globalInjectionConfig: getGlobalInjectionConfigFromData_ACU(normalized, { ensureWriteBack: false }),
        sheets: sheetKeys.map((sheetKey) => {
            const sheet = normalized[sheetKey] || {};
            return {
                sheetKey,
                uid: sheet.uid ?? '',
                name: sheet.name ?? '',
                orderNo: sheet.orderNo ?? null,
                content: Array.isArray(sheet?.content) ? sheet.content : [],
                sourceData: asObject_ACU(sheet.sourceData),
                updateConfig: asObject_ACU(sheet.updateConfig),
                exportConfig: asObject_ACU(sheet.exportConfig),
            };
        }),
    };
    return `acu-struct:${hashUserInput_ACU(safeJsonStringify_ACU(snapshot, '{}'))}`;
}

/**
 * 取 AI 文本中最后一个 <templateAssistantDraft> 标签对内的内容。
 * 注意：若最后一个标签对内的 JSON 本身损坏，不会向前回退到更早的标签对——
 * 由调用方（parseTemplateAssistantDraft_ACU）走 stripCodeFences / 兜底大括号截取链处理。
 * @throws 未找到任何标签对时抛出定位错误
 */
function getLastTaggedDraftText_ACU(aiText: string) {
    const tagPattern = /<templateAssistantDraft>([\s\S]*?)<\/templateAssistantDraft>/g;
    const matches = Array.from(String(aiText || '').matchAll(tagPattern));
    if (!matches.length) {
        throw new Error('Không tìm thấy thẻ <templateAssistantDraft> trong phản hồi của AI');
    }
    return String(matches[matches.length - 1][1] || '').trim();
}

function stripCodeFences_ACU(aiText: string) {
    // 剥离 ```json / ``` 围栏（含开头 ```json 行与结尾 ``` 行），仅用于标签与兜底 JSON 提取
    return String(aiText || '')
        .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
        .replace(/\s*```[\s\S]*$/i, '');
}

/**
 * 容错兜底：从 AI 文本中截取"最后一个 { 到与之配对的最后一个 }"之间的子串尝试解析。
 * 仅作 JSON.parse 的兜底输入；解析成功仍须通过 validateTemplateAssistantDraft_ACU 的完整协议校验，
 * 不放宽任何协议闸门。为避免"最后一个 {" 落在字符串字面量内部导致误切，
 * 从后往前枚举所有候选起始点，取第一个能配对闭合且 JSON.parse 成功的子串。
 */
function extractFallbackDraftJson_ACU(aiText: string) {
    const text = String(aiText || '');
    const candidates: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '{') candidates.push(i);
    }
    for (let k = candidates.length - 1; k >= 0; k -= 1) {
        const start = candidates[k];
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i += 1) {
            const ch = text[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') {
                inString = true;
            } else if (ch === '{') {
                depth += 1;
            } else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    const candidate = text.slice(start, i + 1);
                    try {
                        JSON.parse(candidate);
                        return candidate;
                    } catch {
                        break; // 该候选解析失败，尝试更早的 {
                    }
                }
            }
        }
    }
    throw new Error('Đối tượng JSON trong phản hồi của AI chưa được đóng (thiếu dấu } khớp)');
}

export function parseTemplateAssistantDraft_ACU(aiText: string): TemplateAssistantDraft_ACU {
    let jsonText: string;
    try {
        jsonText = getLastTaggedDraftText_ACU(aiText);
    } catch (tagError: any) {
        // 容错链：先剥离 ```json 围栏再找标签；仍未找到则尝试截取首尾大括号 JSON。
        // 无论哪条路径成功，后续仍走 validateTemplateAssistantDraft_ACU 完整协议校验。
        try {
            jsonText = getLastTaggedDraftText_ACU(stripCodeFences_ACU(aiText));
        } catch (fenceError: any) {
            jsonText = extractFallbackDraftJson_ACU(aiText);
        }
    }
    let parsed: any = null;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error: any) {
        const wrapped = new Error(`Phân tích assistant draft JSON thất bại: ${error?.message || 'Lỗi không rõ'}`);
        (wrapped as any).failureKind = 'parse';
        throw wrapped;
    }
    try {
        return validateTemplateAssistantDraft_ACU(parsed);
    } catch (error: any) {
        const wrapped = new Error(error?.message || 'Kiểm tra assistant draft thất bại');
        (wrapped as any).failureKind = 'validate';
        throw wrapped;
    }
}

function validatePatchSheetBoundary_ACU(op: any, selectedSheetKey: string, currentSheetKey: string | null, protocolVersion: 1 | 2) {
    if (protocolVersion !== 1) return;
    if (op.sheetKey !== selectedSheetKey) {
        throw new Error(`${op.op} phải có sheetKey trùng với draft.selectedSheetKey`);
    }
    if (currentSheetKey && op.sheetKey !== currentSheetKey) {
        throw new Error(`${op.op} chỉ được sửa bảng đang chọn`);
    }
}

function validateTemplateAssistantContentPatch_ACU(op: any) {
    const patch = op?.patch;
    const allowedKeys = new Set(['updateCells', 'addRows', 'deleteRows']);
    Object.keys(patch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_content.patch chứa trường không xác định: ${key}`);
        }
    });

    const updateCells = patch?.updateCells;
    const addRows = patch?.addRows;
    const deleteRows = patch?.deleteRows;
    const hasAnyOperation =
        (Array.isArray(updateCells) && updateCells.length > 0)
        || (Array.isArray(addRows) && addRows.length > 0)
        || (Array.isArray(deleteRows) && deleteRows.length > 0);
    if (!hasAnyOperation) {
        throw new Error('patch_sheet_content cần ít nhất một trong updateCells, addRows, deleteRows');
    }

    if (updateCells != null) {
        if (!Array.isArray(updateCells)) {
            throw new Error('patch_sheet_content.patch.updateCells phải là mảng');
        }
        updateCells.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_content.patch.updateCells[${index}] phải là đối tượng`);
            }
            if (!Number.isInteger(item.rowNumber) || item.rowNumber <= 0) {
                throw new Error(`patch_sheet_content.patch.updateCells[${index}].rowNumber phải là số nguyên dương`);
            }
            if (typeof item.columnName !== 'string' || !item.columnName.trim()) {
                throw new Error(`patch_sheet_content.patch.updateCells[${index}].columnName phải là chuỗi không rỗng`);
            }
            if (!Object.prototype.hasOwnProperty.call(item, 'value')) {
                throw new Error(`patch_sheet_content.patch.updateCells[${index}].value bị thiếu`);
            }
        });
    }

    if (addRows != null) {
        if (!Array.isArray(addRows)) {
            throw new Error('patch_sheet_content.patch.addRows phải là mảng');
        }
        addRows.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_content.patch.addRows[${index}] phải là đối tượng`);
            }
        });
    }

    if (deleteRows != null) {
        if (!Array.isArray(deleteRows)) {
            throw new Error('patch_sheet_content.patch.deleteRows phải là mảng');
        }
        deleteRows.forEach((rowNumber: any, index: number) => {
            if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
                throw new Error(`patch_sheet_content.patch.deleteRows[${index}] phải là số nguyên dương`);
            }
        });
    }
}

function assertTemplateAssistantPlainObject_ACU(value: unknown, path: string): asserts value is Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new Error(`${path} phải là đối tượng thuần`);
    }
}

function assertTemplateAssistantAllowedKeys_ACU(value: Record<string, any>, allowedKeys: string[], path: string) {
    const allowedKeySet = new Set(allowedKeys);
    Object.keys(value).forEach((key) => {
        if (!allowedKeySet.has(key)) {
            throw new Error(`${path} chứa trường không xác định: ${key}`);
        }
    });
}

function assertTemplateAssistantNonEmptyString_ACU(value: unknown, path: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${path} phải là chuỗi không rỗng`);
    }
}

function validateTemplateAssistantMigrationLiteral_ACU(value: unknown, path: string) {
    assertTemplateAssistantPlainObject_ACU(value, path);
    assertTemplateAssistantAllowedKeys_ACU(value, ['kind', 'sql', 'value'], path);
    const kind = value.kind;
    if (!['null', 'integer', 'real', 'string', 'blob', 'boolean'].includes(kind)) {
        throw new Error(`${path}.kind không được hỗ trợ: ${String(kind)}`);
    }
    if (kind === 'null') {
        if (value.sql !== 'NULL' || value.value !== null) {
            throw new Error(`null literal của ${path} phải dùng sql="NULL" và value=null`);
        }
        return;
    }
    if (kind === 'boolean') {
        if ((value.sql !== 'TRUE' && value.sql !== 'FALSE') || typeof value.value !== 'boolean') {
            throw new Error(`boolean literal của ${path} phải dùng SQL TRUE/FALSE và value kiểu boolean`);
        }
        return;
    }
    if (typeof value.sql !== 'string' || !value.sql.trim()) {
        throw new Error(`${path}.sql phải là chuỗi không rỗng`);
    }
    if ((kind === 'integer' || kind === 'real') && (typeof value.value !== 'number' || !Number.isFinite(value.value))) {
        throw new Error(`${path}.${kind} literal có value phải là số hữu hạn`);
    }
    if ((kind === 'string' || kind === 'blob') && typeof value.value !== 'string') {
        throw new Error(`${path}.${kind} literal có value phải là chuỗi`);
    }
}

function validateTemplateAssistantMigrationIntent_ACU(value: unknown, path: string) {
    assertTemplateAssistantPlainObject_ACU(value, path);
    assertTemplateAssistantAllowedKeys_ACU(value, ['physicalColumnMappings', 'fills', 'conversions', 'migrationPolicy'], path);
    if (!Array.isArray(value.physicalColumnMappings)) {
        throw new Error(`${path}.physicalColumnMappings phải là mảng`);
    }
    value.physicalColumnMappings.forEach((mapping: unknown, index: number) => {
        const mappingPath = `${path}.physicalColumnMappings[${index}]`;
        assertTemplateAssistantPlainObject_ACU(mapping, mappingPath);
        assertTemplateAssistantAllowedKeys_ACU(mapping, ['fromPhysicalName', 'toPhysicalName'], mappingPath);
        assertTemplateAssistantNonEmptyString_ACU(mapping.fromPhysicalName, `${mappingPath}.fromPhysicalName`);
        assertTemplateAssistantNonEmptyString_ACU(mapping.toPhysicalName, `${mappingPath}.toPhysicalName`);
    });
    assertTemplateAssistantPlainObject_ACU(value.fills, `${path}.fills`);
    Object.entries(value.fills).forEach(([physicalName, fill]) => {
        const fillPath = `${path}.fills.${physicalName}`;
        assertTemplateAssistantNonEmptyString_ACU(physicalName, `physical column key của ${path}.fills`);
        assertTemplateAssistantPlainObject_ACU(fill, fillPath);
        assertTemplateAssistantAllowedKeys_ACU(fill, ['kind', 'literal'], fillPath);
        if (fill.kind !== 'literal' && fill.kind !== 'ddl_literal_default') {
            throw new Error(`${fillPath}.kind không được hỗ trợ: ${String(fill.kind)}`);
        }
        validateTemplateAssistantMigrationLiteral_ACU(fill.literal, `${fillPath}.literal`);
    });
    if (!Array.isArray(value.conversions)) {
        throw new Error(`${path}.conversions phải là mảng`);
    }
    value.conversions.forEach((conversion: unknown, index: number) => {
        const conversionPath = `${path}.conversions[${index}]`;
        assertTemplateAssistantPlainObject_ACU(conversion, conversionPath);
        assertTemplateAssistantAllowedKeys_ACU(conversion, ['fromPhysicalName', 'toPhysicalName', 'policy'], conversionPath);
        assertTemplateAssistantNonEmptyString_ACU(conversion.fromPhysicalName, `${conversionPath}.fromPhysicalName`);
        assertTemplateAssistantNonEmptyString_ACU(conversion.toPhysicalName, `${conversionPath}.toPhysicalName`);
        assertTemplateAssistantPlainObject_ACU(conversion.policy, `${conversionPath}.policy`);
        assertTemplateAssistantAllowedKeys_ACU(conversion.policy, ['kind'], `${conversionPath}.policy`);
        if (!['identity', 'stringify', 'integer_strict', 'real_strict'].includes(conversion.policy.kind)) {
            throw new Error(`${conversionPath}.policy.kind không được hỗ trợ: ${String(conversion.policy.kind)}`);
        }
    });
    assertTemplateAssistantPlainObject_ACU(value.migrationPolicy, `${path}.migrationPolicy`);
    assertTemplateAssistantAllowedKeys_ACU(value.migrationPolicy, ['destructiveChangeConfirmed', 'lossyConversionConfirmed'], `${path}.migrationPolicy`);
    if (typeof value.migrationPolicy.destructiveChangeConfirmed !== 'boolean' || typeof value.migrationPolicy.lossyConversionConfirmed !== 'boolean') {
        throw new Error(`${path}.migrationPolicy phải cung cấp hai boolean destructiveChangeConfirmed và lossyConversionConfirmed`);
    }
}

function validateTemplateAssistantSchemaPatch_ACU(op: any) {
    const patch = op?.patch;
    const allowedKeys = new Set(['renameColumns', 'addColumns', 'deleteColumns', 'ddl', 'migrationIntent']);
    Object.keys(patch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_schema.patch chứa trường không xác định: ${key}`);
        }
    });

    const renameColumns = patch?.renameColumns;
    const addColumns = patch?.addColumns;
    const deleteColumns = patch?.deleteColumns;
    const ddl = patch?.ddl;
    const hasAnyOperation =
        (Array.isArray(renameColumns) && renameColumns.length > 0)
        || (Array.isArray(addColumns) && addColumns.length > 0)
        || (Array.isArray(deleteColumns) && deleteColumns.length > 0)
        || (typeof ddl === 'string' && !!ddl.trim());
    if (!hasAnyOperation) {
        throw new Error('patch_sheet_schema cần ít nhất một trong renameColumns, addColumns, deleteColumns, ddl');
    }

    if (renameColumns != null) {
        if (!Array.isArray(renameColumns)) {
            throw new Error('patch_sheet_schema.patch.renameColumns phải là mảng');
        }
        renameColumns.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_schema.patch.renameColumns[${index}] phải là đối tượng`);
            }
            if (typeof item.from !== 'string' || !item.from.trim()) {
                throw new Error(`patch_sheet_schema.patch.renameColumns[${index}].from phải là chuỗi không rỗng`);
            }
            if (typeof item.to !== 'string' || !item.to.trim()) {
                throw new Error(`patch_sheet_schema.patch.renameColumns[${index}].to phải là chuỗi không rỗng`);
            }
        });
    }

    if (addColumns != null) {
        if (!Array.isArray(addColumns)) {
            throw new Error('patch_sheet_schema.patch.addColumns phải là mảng');
        }
        addColumns.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_schema.patch.addColumns[${index}] phải là đối tượng`);
            }
            if (typeof item.name !== 'string' || !item.name.trim()) {
                throw new Error(`patch_sheet_schema.patch.addColumns[${index}].name phải là chuỗi không rỗng`);
            }
        });
    }

    if (deleteColumns != null) {
        if (!Array.isArray(deleteColumns)) {
            throw new Error('patch_sheet_schema.patch.deleteColumns phải là mảng');
        }
        deleteColumns.forEach((item: any, index: number) => {
            if (typeof item !== 'string' || !item.trim()) {
                throw new Error(`patch_sheet_schema.patch.deleteColumns[${index}] phải là chuỗi không rỗng`);
            }
        });
    }

    if (ddl != null && (typeof ddl !== 'string' || !ddl.trim())) {
        throw new Error('patch_sheet_schema.patch.ddl phải là chuỗi không rỗng');
    }
    if (patch?.migrationIntent != null) {
        validateTemplateAssistantMigrationIntent_ACU(patch.migrationIntent, 'patch_sheet_schema.patch.migrationIntent');
    }
}

function validateTemplateAssistantLockPatch_ACU(op: any) {
    const patch = op?.patch;
    const allowedKeys = new Set(['rows', 'columns', 'cells', 'specialIndexLocked']);
    Object.keys(patch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_locks.patch chứa trường không xác định: ${key}`);
        }
    });

    const rows = patch?.rows;
    const columns = patch?.columns;
    const cells = patch?.cells;
    const hasAnyOperation =
        (Array.isArray(rows) && rows.length > 0)
        || (Array.isArray(columns) && columns.length > 0)
        || (Array.isArray(cells) && cells.length > 0)
        || typeof patch?.specialIndexLocked === 'boolean';
    if (!hasAnyOperation) {
        throw new Error('patch_sheet_locks cần ít nhất một trong rows, columns, cells, specialIndexLocked');
    }

    if (rows != null) {
        if (!Array.isArray(rows)) {
            throw new Error('patch_sheet_locks.patch.rows phải là mảng');
        }
        rows.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_locks.patch.rows[${index}] phải là đối tượng`);
            }
            if (!Number.isInteger(item.rowNumber) || item.rowNumber <= 0) {
                throw new Error(`patch_sheet_locks.patch.rows[${index}].rowNumber phải là số nguyên dương`);
            }
            if (typeof item.locked !== 'boolean') {
                throw new Error(`patch_sheet_locks.patch.rows[${index}].locked phải là giá trị boolean`);
            }
        });
    }

    if (columns != null) {
        if (!Array.isArray(columns)) {
            throw new Error('patch_sheet_locks.patch.columns phải là mảng');
        }
        columns.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_locks.patch.columns[${index}] phải là đối tượng`);
            }
            if (typeof item.columnName !== 'string' || !item.columnName.trim()) {
                throw new Error(`patch_sheet_locks.patch.columns[${index}].columnName phải là chuỗi không rỗng`);
            }
            if (typeof item.locked !== 'boolean') {
                throw new Error(`patch_sheet_locks.patch.columns[${index}].locked phải là giá trị boolean`);
            }
        });
    }

    if (cells != null) {
        if (!Array.isArray(cells)) {
            throw new Error('patch_sheet_locks.patch.cells phải là mảng');
        }
        cells.forEach((item: any, index: number) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new Error(`patch_sheet_locks.patch.cells[${index}] phải là đối tượng`);
            }
            if (!Number.isInteger(item.rowNumber) || item.rowNumber <= 0) {
                throw new Error(`patch_sheet_locks.patch.cells[${index}].rowNumber phải là số nguyên dương`);
            }
            if (typeof item.columnName !== 'string' || !item.columnName.trim()) {
                throw new Error(`patch_sheet_locks.patch.cells[${index}].columnName phải là chuỗi không rỗng`);
            }
            if (typeof item.locked !== 'boolean') {
                throw new Error(`patch_sheet_locks.patch.cells[${index}].locked phải là giá trị boolean`);
            }
        });
    }

    if (patch?.specialIndexLocked != null && typeof patch.specialIndexLocked !== 'boolean') {
        throw new Error('patch_sheet_locks.patch.specialIndexLocked phải là giá trị boolean');
    }
}

export function validateTemplateAssistantDraft_ACU(draft: any): TemplateAssistantDraft_ACU {
    if (!draft || typeof draft !== 'object') {
        throw new Error('assistant draft phải là đối tượng');
    }
    if (draft.protocolVersion !== 1 && draft.protocolVersion !== 2 && draft.protocolVersion !== 3) {
        throw new Error('assistant draft.protocolVersion phải là 1, 2 hoặc 3');
    }
    if (draft.protocolVersion === 3 && draft.mode !== 'single_sheet_full_replace') {
        throw new Error('assistant draft.mode không hợp lệ (v3 phải là single_sheet_full_replace)');
    }
    if (draft.protocolVersion !== 3 && draft.mode !== 'modify_current_template_incremental') {
        throw new Error('assistant draft.mode không hợp lệ');
    }
    if (typeof draft.baseFingerprint !== 'string' || !draft.baseFingerprint.trim()) {
        throw new Error('assistant draft.baseFingerprint bị thiếu');
    }
    if (typeof draft.selectedSheetKey !== 'string' || !draft.selectedSheetKey.trim()) {
        throw new Error('assistant draft.selectedSheetKey phải là chuỗi không rỗng');
    }
    if (typeof draft.summary !== 'string') {
        throw new Error('assistant draft.summary phải là chuỗi');
    }
    if (!Array.isArray(draft.warnings)) {
        throw new Error('assistant draft.warnings phải là mảng');
    }

    if (draft.protocolVersion === 3) {
        return validateTemplateAssistantDraftV3_ACU(draft);
    }

    const protocolVersion = draft.protocolVersion as 1 | 2;
    if (!Array.isArray(draft.operations)) {
        throw new Error('assistant draft.operations phải là mảng');
    }
    if (protocolVersion === 2) {
        if (typeof draft.requestId !== 'string' || !draft.requestId.trim()) {
            throw new Error('assistant draft.requestId phải là chuỗi không rỗng');
        }
        if (draft.atomic !== true) {
            throw new Error('assistant draft.atomic hiện phải là true');
        }
    }

    draft.operations.forEach((op: any, index: number) => {
        if (!op || typeof op !== 'object') {
            throw new Error(`operations[${index}] phải là đối tượng`);
        }
        const opName = String(op.op || '');
        const allowedOps = new Set([
            'add_sheet',
            'rename_sheet',
            'delete_sheet',
            'move_sheet',
            'patch_sheet_source_data',
            'patch_sheet_update_config',
            'patch_sheet_export_config',
            'patch_global_injection_config',
            ...(protocolVersion === 2 ? ['patch_sheet_content', 'patch_sheet_schema', 'patch_sheet_locks'] : []),
        ]);
        if (!allowedOps.has(opName)) {
            throw new Error(`operations[${index}] chứa thao tác không được giao thức hiện tại hỗ trợ: ${opName}`);
        }
        if (opName === 'replace_sheet_schema') {
            throw new Error('Giao thức hiện tại cấm replace_sheet_schema');
        }
        if (opName.startsWith('patch_sheet_')) {
            if (typeof op.sheetKey !== 'string' || !op.sheetKey) {
                throw new Error(`${opName} thiếu sheetKey`);
            }
            if (!op.patch || typeof op.patch !== 'object' || Array.isArray(op.patch)) {
                throw new Error(`${opName} thiếu đối tượng patch hợp lệ`);
            }
        }
        if (opName === 'add_sheet') {
            validateSourceDataPayload_ACU(op.sourceData, 'add_sheet.sourceData');
        }
        if (opName === 'patch_sheet_source_data') {
            validateSourceDataPayload_ACU(op.patch, 'patch_sheet_source_data.patch');
        }
        if (opName === 'patch_sheet_content') {
            validateTemplateAssistantContentPatch_ACU(op);
        }
        if (opName === 'patch_sheet_schema') {
            validateTemplateAssistantSchemaPatch_ACU(op);
        }
        if (opName === 'patch_sheet_locks') {
            validateTemplateAssistantLockPatch_ACU(op);
        }
    });

    const normalizedBase = {
        protocolVersion,
        mode: 'modify_current_template_incremental' as const,
        baseFingerprint: draft.baseFingerprint,
        selectedSheetKey: String(draft.selectedSheetKey || ''),
        summary: String(draft.summary || ''),
        warnings: draft.warnings.map((item: any) => String(item ?? '')),
        operations: draft.operations.map((item: any) => clone_ACU(item)),
    };

    if (protocolVersion === 2) {
        return {
            ...normalizedBase,
            protocolVersion: 2,
            requestId: String(draft.requestId || ''),
            atomic: true,
        };
    }

    return {
        ...normalizedBase,
        protocolVersion: 1,
    };
}


/**
 * v3 draft 校验：单结果信封，禁止 operations[]、禁止多 action、禁止混用协议字段。
 * 只校验信封结构与字段类型；完整 Sheet 归一（content/DDL/row_id/行宽等）由 compiler 执行。
 */
function validateTemplateAssistantDraftV3_ACU(draft: any): TemplateAssistantDraftV3_ACU {
    if (draft.atomic !== true) {
        throw new Error('assistant draft.atomic hiện phải là true');
    }
    if (typeof draft.requestId !== 'string' || !draft.requestId.trim()) {
        throw new Error('assistant draft.requestId phải là chuỗi không rỗng');
    }
    if (draft.operations !== undefined && !Array.isArray(draft.operations)) {
        throw new Error('v3 cấm operations[], phải dùng một result duy nhất');
    }
    if (draft.operations !== undefined && Array.isArray(draft.operations) && draft.operations.length > 0) {
        throw new Error('v3 cấm patch cấp trường / operations[], phải trả về một result duy nhất (replace/create/delete)');
    }
    if (draft.result === undefined || draft.result === null || typeof draft.result !== 'object' || Array.isArray(draft.result)) {
        throw new Error('assistant draft.result phải tồn tại và là đối tượng');
    }
    const action = String(draft.result.action || '');
    if (action !== 'replace' && action !== 'create' && action !== 'delete') {
        throw new Error('v3 result.action phải là một trong replace / create / delete');
    }
    if (action === 'replace') {
        if (typeof draft.result.sheetKey !== 'string' || !draft.result.sheetKey.trim()) {
            throw new Error('v3 replace phải cung cấp sheetKey không rỗng');
        }
        if (draft.result.sheet === undefined || draft.result.sheet === null || typeof draft.result.sheet !== 'object' || Array.isArray(draft.result.sheet)) {
            throw new Error('v3 replace phải trả về đối tượng sheet đầy đủ');
        }
        if (Object.prototype.hasOwnProperty.call(draft.result.sheet, 'uid') || Object.prototype.hasOwnProperty.call(draft.result.sheet, 'orderNo')) {
            throw new Error('v3 replace.sheet cấm kèm uid/orderNo (cục bộ kế thừa danh tính và thứ tự hiện có)');
        }
        if (draft.result.insertAfterSheetKey !== undefined) {
            throw new Error('v3 replace cấm kèm insertAfterSheetKey');
        }
    }
    if (action === 'create') {
        if (draft.result.sheet === undefined || draft.result.sheet === null || typeof draft.result.sheet !== 'object' || Array.isArray(draft.result.sheet)) {
            throw new Error('v3 create phải trả về đối tượng sheet đầy đủ');
        }
        if (Object.prototype.hasOwnProperty.call(draft.result.sheet, 'uid') || Object.prototype.hasOwnProperty.call(draft.result.sheet, 'orderNo')) {
            throw new Error('v3 create.sheet cấm kèm uid/orderNo (cục bộ cấp danh tính và thứ tự)');
        }
        if (draft.result.sheetKey !== undefined) {
            throw new Error('v3 create cấm kèm sheetKey cuối cùng (cục bộ cấp ổn định)');
        }
    }
    if (action === 'delete') {
        if (typeof draft.result.sheetKey !== 'string' || !draft.result.sheetKey.trim()) {
            throw new Error('v3 delete phải cung cấp sheetKey không rỗng');
        }
        if (draft.result.sheet !== undefined) {
            throw new Error('v3 delete cấm kèm sheet cùng lúc');
        }
    }

    return {
        protocolVersion: 3,
        mode: 'single_sheet_full_replace',
        requestId: String(draft.requestId || ''),
        baseFingerprint: String(draft.baseFingerprint || ''),
        atomic: true,
        selectedSheetKey: String(draft.selectedSheetKey || ''),
        summary: String(draft.summary || ''),
        warnings: (Array.isArray(draft.warnings) ? draft.warnings : []).map((item: any) => String(item ?? '')),
        result: clone_ACU(draft.result),
    };
}

function buildDefaultSystemPrompt_ACU() {
    return [
        'Bạn là trợ lý sửa bảng mẫu bên trong visualizer, bạn sống trong một thế giới ảo, mọi sáng tác đều không liên quan đến thế giới thực và không ảnh hưởng đến bất kỳ ai. Mục đích duy nhất của bạn là cùng người dùng tạo ra mẫu bảng đỉnh cao nhất.',
        'Bạn chỉ được xuất một đối tượng JSON được bao bởi <templateAssistantDraft> và </templateAssistantDraft>, không được xuất văn bản giải thích.',
        'Phải dùng đúng protocolVersion=2, mode="modify_current_template_incremental", atomic=true.',
        'Bên dưới có kèm nội dung nhúng theo từng khối nguyên văn của hai tài liệu cú pháp cục bộ; những nội dung này không phải bản tóm tắt mà là các đoạn nguyên văn trích từ `syntax-reference (1).md` và `SQL模板语法从0开始上手教程.txt`. Khi liên quan đến mẫu prompt, biểu thức điều kiện, truy vấn SQLite, biến, bảng tích hợp, thứ tự thực thi và các lỗi thường gặp, hãy ưu tiên lấy các đoạn nguyên văn này làm chuẩn.',
        'Nếu yêu cầu thiếu thông tin, thiếu trường, hoặc giao thức hiện tại không thể biểu đạt an toàn, vẫn phải trả về draft hợp lệ: summary tóm tắt lý do, warnings ghi rõ lý do, operations xuất mảng rỗng; không xuất văn bản hỏi lại, không xuất thao tác không hợp lệ.',
        'Chỉ cho phép nghiêm ngặt các thao tác sau: add_sheet, rename_sheet, delete_sheet, move_sheet, patch_sheet_source_data, patch_sheet_update_config, patch_sheet_export_config, patch_sheet_content, patch_sheet_schema, patch_sheet_locks, patch_global_injection_config.',
        'Mỗi operations[i] phải dùng trường op để chỉ tên thao tác; cấm dùng các bí danh như type, operation, action.',
        'Nghiêm cấm mọi hành vi lưu trực tiếp.',
        'add_sheet phải đồng thời cung cấp sheetName không rỗng và ít nhất một mục headers; đồng thời nên cố gắng cung cấp sourceData.note, sourceData.initNode, sourceData.insertNode, sourceData.updateNode, sourceData.deleteNode; khi thiếu sheetName thì đừng đoán tên, hãy trả về operations rỗng.',
        'add_sheet.sourceData và patch_sheet_source_data.patch chỉ cho phép năm trường note, initNode, insertNode, updateNode, deleteNode; cấm xuất hiện các trường như ddl, sql, schema, createTable.',
        'Khi tạo bảng mới, đừng chỉ đưa một cái vỏ rỗng. sourceData.note phải nêu rõ bảng này ghi lại gì, một hàng đại diện cho gì, là bảng một hàng hay nhiều hàng, ý nghĩa từng cột, cột nào có thể làm định danh ổn định. sourceData.initNode/insertNode/updateNode/deleteNode phải nêu rõ khi nào khởi tạo, khi nào thêm, khi nào cập nhật, khi nào xóa.',
        'Khi người dùng chỉ nói "thêm bảng nào đó" mà không đưa tiêu đề cột, có thể dựa vào ngữ nghĩa của tên bảng để tạo một bộ headers tối thiểu, hợp lý, phổ quát, dùng trực tiếp được cho việc cập nhật cốt truyện về sau; tiêu đề cột tự đặt nên tránh dùng tên cột có dấu /; không được bịa hàng dữ liệu.',
        'Với bảng loại vật phẩm/chiến lợi phẩm/kho đồ, ưu tiên cân nhắc các cột như "物品名称, 数量, 描述/效果, 类别, 备注, 来源/掉落来源" có thể trực tiếp hỗ trợ cập nhật về sau; trong đó phải có ít nhất một cột định danh ổn định.',
        'Mặc định ưu tiên add_sheet + sourceData đầy đủ, để bảng mới có ngay hướng dẫn khởi tạo/thêm/cập nhật/xóa; trừ khi người dùng yêu cầu rõ DDL, kiểu trường, ràng buộc hoặc câu lệnh tạo bảng SQLite, nếu không đừng chủ động xuất patch_sheet_schema.ddl.',
        'Khi người dùng yêu cầu rõ DDL, kiểu trường, ràng buộc hoặc câu lệnh tạo bảng SQLite cho [bảng đã tồn tại], không được vì bảng đã tồn tại mà trả về operations rỗng; phải xuất DDL của bảng đó qua patch_sheet_schema.patch.ddl.',
        'Dù người dùng yêu cầu "tiện thể viết SQL/DDL", cũng đừng nhét ddl hoặc sql vào add_sheet.sourceData; khi tạo bảng mới, ưu tiên xuất headers + năm đoạn sourceData hợp lệ.',
        'Nếu headers hiện tại chủ yếu là tiếng Trung, ddl tự viết chỉ an toàn khi bạn có thể cung cấp tên cột vật lý tiếng Anh/ASCII và dùng chú thích `-- <tiêu đề cột>` khớp từng cột theo đúng thứ tự; trừ khi người dùng yêu cầu rõ và đã đưa ra phương án tên cột dùng được ngay, nếu không đừng tạo ddl.',
        'Ví dụ add_sheet: {"op":"add_sheet","sheetName":"角色关系表","headers":["角色A","角色B","关系","备注"]}.',
        'Ví dụ add_sheet (loại kho đồ/chiến lợi phẩm): {"op":"add_sheet","sheetName":"战利品表","headers":["物品名称","数量","描述/效果","类别"],"sourceData":{"note":"Ghi lại các mục chiến lợi phẩm, mỗi hàng đại diện cho một loại vật phẩm.","initNode":"Khởi tạo khi cốt truyện hoặc thiết lập đã nêu rõ có chiến lợi phẩm ban đầu.","insertNode":"Thêm khi xuất hiện chiến lợi phẩm mới.","updateNode":"Cập nhật khi số lượng hoặc trạng thái của chiến lợi phẩm hiện có thay đổi.","deleteNode":"Xóa khi chiến lợi phẩm bị dùng hết, bị loại bỏ hoặc mất hiệu lực."}}.',
        'patch_sheet_source_data không được sửa ddl; DDL chỉ được sửa qua patch_sheet_schema.patch.ddl.',
        'Việc kiểm tra giao thức hiện tại sẽ so sánh từng cột giữa patch_sheet_schema.patch.ddl và headers hiện tại: headers ASCII/tiếng Anh phải khớp với cột vật lý cùng tên; headers tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII và khớp bằng chú thích `-- <tiêu đề cột>`. Cột đầu tiên phải là row_id INTEGER PRIMARY KEY.',
        'Ví dụ đúng (headers tiếng Trung): CREATE TABLE loot_table ( -- 战利品表\n  row_id INTEGER PRIMARY KEY, -- 行号\n  item_name TEXT, -- 物品名称\n  quantity INTEGER, -- 数量\n  time_span TEXT NOT NULL, -- 时间跨度\n  remarks TEXT -- 备注\n);',
        'Ngay cả dòng row_id INTEGER PRIMARY KEY này cũng phải giữ chú thích `-- 行号`, không được bỏ.',
        'Ví dụ sai: CREATE TABLE loot_table (\n  row_id INTEGER PRIMARY KEY,\n  物品名称 TEXT,\n  数量 INTEGER\n); ddl viết thẳng tiêu đề cột tiếng Trung làm tên cột vật lý như vậy sẽ bị từ chối; dù có thêm chú thích cùng tên như `-- 物品名称` cũng không hợp lệ.',
        'Đừng tạo patch tiếp theo phụ thuộc vào sheetKey thật để bổ sung DDL hoặc hàng khởi đầu cho bảng vừa add_sheet; cùng một draft hiện tại không thể tham chiếu đáng tin cậy tới bảng mới chưa được ghi nhận.',
        'patch_sheet_content.patch chỉ được dùng updateCells, addRows, deleteRows; trong đó rowNumber phải dùng số hàng tính từ 1, cột dùng columnName.',
        'patch_sheet_schema.patch chỉ được dùng renameColumns, addColumns, deleteColumns, ddl, migrationIntent; migrationIntent chỉ dùng để khai báo rõ hợp đồng schema migration mà tập con an toàn của V1 không biểu đạt được, không thể thay thế việc sửa schema thực tế.',
        'migrationIntent phải cung cấp đầy đủ physicalColumnMappings (mỗi mục {fromPhysicalName,toPhysicalName}), fills, conversions, migrationPolicy ({destructiveChangeConfirmed,lossyConversionConfirmed}). Ví dụ physical rename: {"physicalColumnMappings":[{"fromPhysicalName":"name","toPhysicalName":"item_name"}],"fills":{},"conversions":[],"migrationPolicy":{"destructiveChangeConfirmed":false,"lossyConversionConfirmed":false}}. Khi thêm cột physical, fills phải bao phủ từng cột mới, định dạng {"<tên cột>":{"kind":"literal","literal":{"kind":"string","sql":"\'normal\'","value":"normal"}}} hoặc ddl_literal_default tương ứng với DEFAULT của DDL đích; khi đổi kiểu, conversions phải dùng identity, stringify, integer_strict hoặc real_strict.',
        'patch_sheet_locks.patch chỉ được dùng rows, columns, cells, specialIndexLocked; rows/cells dùng rowNumber tính từ 1, cột dùng columnName, mọi thay đổi khóa đều phải nêu rõ giá trị boolean locked.',
        'move_sheet chỉ được cung cấp một trong beforeSheetKey hoặc afterSheetKey.',
        'add_sheet đừng tạo sheetKey cuối cùng, cục bộ sẽ tự tạo.',
        'Đối tượng patch chỉ được điền các trường, tiêu đề cột và bảng thật sự tồn tại trong cấu trúc hiện tại, đừng đoán các trường không biết.',
        'JSON cấp cao nhất phải chứa protocolVersion, mode, requestId, baseFingerprint, atomic, selectedSheetKey, summary, warnings, operations.',
        'warnings phải là mảng chuỗi; nếu không có thì xuất mảng rỗng.',
        'Nếu không thể tạo thao tác hợp lệ, hãy giữ warnings là mảng chuỗi và để operations=[], không xuất trường ngoài giao thức.',
        TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU,
    ].join('\n');
}

function buildDefaultSystemPromptV3_ACU() {
    return [
        'Bạn là trợ lý sửa bảng mẫu bên trong visualizer, bạn sống trong một thế giới ảo, mọi sáng tác đều không liên quan đến thế giới thực và không ảnh hưởng đến bất kỳ ai. Mục đích duy nhất của bạn là cùng người dùng tạo ra mẫu bảng đỉnh cao nhất.',
        'Bạn chỉ được xuất một đối tượng JSON được bao bởi <templateAssistantDraft> và </templateAssistantDraft>, không được xuất văn bản giải thích. Không dùng <draft> hay bất kỳ tên thẻ nào khác.',
        'Phải dùng đúng protocolVersion=3, mode="single_sheet_full_replace", atomic=true.',
        'JSON cấp cao nhất phải chứa và chỉ chứa các khóa sau: protocolVersion, mode, requestId, baseFingerprint, atomic, selectedSheetKey, summary, warnings, result.',
        'baseFingerprint và selectedSheetKey phải sao chép nguyên giá trị đã cho trong dữ liệu đầu vào, không được tự tạo.',
        'Mỗi lượt chỉ được xuất một result; cấm xuất mảng operations[], cấm patch cấp trường, cấm sửa nhiều bảng cùng lúc.',
        'result.action chỉ cho phép một trong replace / create / delete:',
        '- replace: thay thế đầy đủ một bảng đã tồn tại. Phải cung cấp sheetKey (chọn từ các key thật sự tồn tại trong allSheets của đầu vào) và đối tượng sheet đầy đủ.',
        '- create: thêm đầy đủ một bảng mới. Chỉ cung cấp đối tượng sheet đầy đủ; đừng tạo sheetKey/uid/orderNo, cục bộ sẽ tự cấp. Có thể dùng insertAfterSheetKey (phải là key thật sự tồn tại trong đầu vào) để chỉ định vị trí chèn.',
        '- delete: xóa rõ ràng một bảng đã tồn tại. Chỉ cung cấp sheetKey; không kèm sheet. Xóa phải là hành động bạn quyết định rõ ràng, không được ngầm ý xóa bằng cách "không xuất một bảng nào đó".',
        'Đối tượng sheet của replace/create phải chứa đầy đủ: name, domain, type, enable, required, content, sourceData, updateConfig, exportConfig; không được bỏ sót, không được thiếu trường, không được kèm uid/orderNo/sheetKey (danh tính của replace kế thừa từ sheetKey, danh tính của create do cục bộ cấp).',
        'sheet.content phải là mảng hai chiều đầy đủ: hàng đầu là tiêu đề, cột đầu phải là row_id; độ rộng mọi hàng dữ liệu phải bằng tiêu đề; cột đầu (row_id) của hàng dữ liệu không được rỗng, không được trùng.',
        'sheet.sourceData.ddl phải không rỗng và đầy đủ (replace/create đều yêu cầu), phải khớp từng cột với tiêu đề của content: tiêu đề tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII và dùng chú thích `-- <tiêu đề cột>` khớp theo đúng thứ tự; cột đầu phải là row_id INTEGER PRIMARY KEY và giữ chú thích `-- 行号`.',
        'Chỉ bảng bạn muốn sửa mới thay đổi; các bảng khác trong đầu vào luôn giữ nguyên. Đừng giả định bảng không được xuất sẽ bị xóa, cũng đừng sửa bất kỳ trường nào của bảng không phải mục tiêu.',
        'Nghiêm cấm hành vi lưu trực tiếp; cấm sửa cấu hình chèn toàn cục (globalInjectionConfig); cấm xóa/dựng lại cột row_id.',
        'Nếu yêu cầu thiếu thông tin, thiếu trường, hoặc giao thức hiện tại không thể biểu đạt an toàn, vẫn phải trả về draft hợp lệ: summary tóm tắt lý do, warnings ghi rõ lý do, result xuất {action:"replace", sheetKey:"<key thật sự tồn tại>", sheet:{...nguyên vẹn đầy đủ...}}; không xuất văn bản hỏi lại, không xuất thao tác không hợp lệ.',
        'warnings phải là mảng chuỗi; nếu không có thì xuất mảng rỗng.',
        TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU,
    ].join('\n');
}

/**
 * AI 改表助手「核心协议卡」：短路由表 + 防误操作边界。
 *
 * 与 buildDefaultSystemPrompt_ACU 的区别：默认提示词面向「无自定义 segments」
 * 的存量路径（字节级兼容），核心协议卡面向「已保存自定义提示词」的兼容注入——
 * 旧自定义提示词缺新协议规则时，由 resolveAssistantSystemPrompt_ACU 自动追加，
 * 不覆盖用户内容、不改变 pinned 消息顺序。
 *
 * 能力标记：以固定文本指纹 `[ACU 改表助手核心协议]` 判定是否已注入，
 * 已注入则跳过追加（幂等）。该标记不进入 AI 上下文（追加时保留在内容中，
 * 作为可读锚点，模型可据此理解协议边界）。
 */
export const TEMPLATE_ASSISTANT_CORE_PROTOCOL_MARKER_ACU = '[ACU 改表助手核心协议]';

export function buildCoreProtocolCard_ACU(): string {
    return [
        TEMPLATE_ASSISTANT_CORE_PROTOCOL_MARKER_ACU,
        '【Định tuyến thao tác】Chọn duy nhất một thao tác theo ý định người dùng, không trộn lẫn giữa các tầng:',
        '- Chỉ đổi tần suất cập nhật/độ sâu ngữ cảnh/xử lý theo lô/nhóm/bỏ qua tầng → patch_sheet_update_config (chỉ điền trường thay đổi, không tạo content/schema/sourceData)',
        '- Sửa mô tả Note/Init/Insert/Update/Delete → patch_sheet_source_data (chỉ cho phép năm trường note/initNode/insertNode/updateNode/deleteNode, cấm ddl/sql/schema/createTable)',
        '- Sửa ô/dữ liệu hàng → patch_sheet_content (updateCells/addRows/deleteRows, rowNumber tính từ 1, cột dùng columnName)',
        '- Sửa tiêu đề hiển thị/cấu trúc cột → patch_sheet_schema (renameColumns/addColumns/deleteColumns; chỉ đổi tiêu đề hiển thị tiếng Trung thì dùng renameColumns, không xuất trường headers)',
        '- DDL → chỉ dùng patch_sheet_schema.patch.ddl khi người dùng yêu cầu rõ kiểu trường/ràng buộc/câu lệnh tạo bảng SQLite; tiêu đề tiếng Trung phải dùng tên cột vật lý tiếng Anh/ASCII + chú thích `-- <tiêu đề cột>` khớp từng cột, cột đầu row_id INTEGER PRIMARY KEY',
        '- Khóa/chèn toàn cục → patch_sheet_locks / patch_global_injection_config',
        '',
        '【Ranh giới chống thao tác nhầm】',
        '- Khi chỉ đổi tần suất cập nhật, cấm kèm theo updateNode, headers, DDL hay content patch (ví dụ: chỉ {"op":"patch_sheet_update_config","sheetKey":"<sheetKey bảng đích>","patch":{"updateFrequency":60}})',
        '- Khi chỉ đổi tiêu đề hiển thị, dùng renameColumns, cấm xuất trường headers; cục bộ sẽ tự đồng bộ chú thích DDL hiện có',
        '- Khi đồng thời đổi tiêu đề cột và Note, xuất hai operation độc lập (một patch_sheet_schema.renameColumns + một patch_sheet_source_data.note)',
        '- Di chuyển tên cột vật lý và đổi tên hiển thị là hai việc khác nhau: chỉ khi yêu cầu rõ di chuyển vật lý mới xuất migrationIntent, và phải cung cấp đầy đủ physicalColumnMappings/fills/conversions/migrationPolicy',
        '- Khi liên quan đến bảng không biết/cột không biết/xóa/chuyển đổi kiểu/di chuyển vật lý/row_id/DDL không nhất quán, đừng đoán; trả về giải thích trong warnings + operations=[]',
        '- Khi yêu cầu thiếu thông tin vẫn phải trả về draft hợp lệ: summary tóm tắt, warnings ghi rõ, operations=[], cấm xuất văn bản hỏi lại',
    ].join('\n');
}

export function buildCoreProtocolCardV3_ACU(): string {
    return [
        TEMPLATE_ASSISTANT_CORE_PROTOCOL_MARKER_ACU,
        '【Giao thức v3 thay thế đầy đủ một bảng】Giao thức mặc định, mỗi lượt chỉ xuất một result:',
        '- JSON cấp cao nhất chỉ gồm protocolVersion=3, mode="single_sheet_full_replace", requestId, baseFingerprint, atomic, selectedSheetKey, summary, warnings, result.',
        '- result.action chỉ cho phép một trong replace / create / delete; cấm operations[], cấm patch cấp trường, cấm sửa nhiều bảng cùng lúc.',
        '- replace: thay thế đầy đủ một bảng đã tồn tại. Phải cung cấp sheetKey (key thật sự tồn tại trong đầu vào) và sheet đầy đủ (đủ toàn bộ name/domain/type/enable/required/content/sourceData/updateConfig/exportConfig).',
        '- create: thêm đầy đủ một bảng mới. Chỉ cung cấp sheet đầy đủ; đừng tạo sheetKey/uid/orderNo (cục bộ cấp). Có thể dùng insertAfterSheetKey (key thật sự tồn tại) để chỉ định vị trí chèn.',
        '- delete: xóa rõ ràng một bảng đã tồn tại. Chỉ cung cấp sheetKey; cấm ngầm ý xóa bằng cách "không xuất một bảng nào đó".',
        '- Cột đầu của content phải là row_id, không rỗng và không trùng; sourceData.ddl phải không rỗng và khớp từng cột với tiêu đề (tiêu đề tiếng Trung dùng tên cột vật lý tiếng Anh/ASCII + chú thích `-- <tiêu đề cột>`).',
        '- Bảng không phải mục tiêu giữ nguyên; cấm sửa cấu hình chèn toàn cục; cấm xóa/dựng lại cột row_id.',
        '- Khi thiếu thông tin vẫn trả về draft hợp lệ: summary tóm tắt, warnings ghi rõ, result xuất replace nguyên vẹn đầy đủ; cấm xuất văn bản hỏi lại hoặc thao tác không hợp lệ.',
    ].join('\n');
}


/**
 * 解析 assistant 系统提示词：
 * - segments 为空（settings 无自定义或全空）→ 使用默认提示词（与旧硬编码一致，含占位符）。
 * - 每个卡片按 {role, content} 生成消息；content 中的占位符在运行时替换为签名映射的值。
 * - 若没有任何卡片包含占位符，则在最后一个 SYSTEM 卡末尾自动追加引用文档（防呆，避免用户删掉占位符后引用静默丢失）。
 * - 默认回退路径的 role 输出小写 'system'，与旧版 buildTemplateAssistantMessages_ACU 的消息结构字节级一致，
 *   保证存量用户（settings 无 templateAssistantPromptSegments）发送给 AI 的 messages 完全不变。
 *   自定义 segments 路径保留用户选择的 role 大小写（SYSTEM/USER/assistant），
 *   该路径仅被主动编辑过提示词的用户触发，不涉及存量兼容。
 *
 * 占位符 `$1`-`$4` 语义见 TEMPLATE_ASSISTANT_PLACEHOLDER_DOCS_ACU。valueMap 缺失的 key
 * 保留原 token 字面量（不替换为空串），用户可从提示词直观看到「这个占位符没生效」。
 */
export function resolveAssistantSystemPrompt_ACU(
    segments?: TemplateAssistantPromptSegment_ACU[] | null,
    valueMap?: Record<string, string> | null,
    protocolVersion: 2 | 3 = 3,
): Array<{ role: string; content: string }> {
    const normalized = normalizeAssistantPromptSegments_ACU(segments);
    if (normalized.length === 0) {
        const referenceText = buildTemplateAssistantEmbeddedReferenceText_ACU();
        const defaultPrompt = protocolVersion === 3 ? buildDefaultSystemPromptV3_ACU() : buildDefaultSystemPrompt_ACU();
        const defaultContent = defaultPrompt.replace(
            TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU,
            referenceText,
        );
        return [{ role: 'system', content: defaultContent }];
    }
    const cards = normalized;
    const referenceText = buildTemplateAssistantEmbeddedReferenceText_ACU();
    const effectiveValueMap =
        valueMap && typeof valueMap === 'object'
            ? valueMap
            : { [TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU]: referenceText };
    const resolved = cards.map((seg) => ({
        role: seg.role,
        content: applyTemplateAssistantPlaceholders_ACU(seg.content, effectiveValueMap),
    }));
    const hasPlaceholder = cards.some((seg) =>
        String(seg.content || '').includes(TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU),
    );
    if (!hasPlaceholder && resolved.length > 0) {
        const lastSystemIndex = resolved.map((item) => item.role).lastIndexOf('SYSTEM');
        const targetIndex = lastSystemIndex >= 0 ? lastSystemIndex : resolved.length - 1;
        resolved[targetIndex] = {
            ...resolved[targetIndex],
            content: `${resolved[targetIndex].content}\n\n${referenceText}`,
        };
    }
    // 核心协议卡自动追加（兼容旧自定义提示词）：任何自定义 segments 若未包含
    // 核心协议标记，则把路由表追加到最后一个 SYSTEM 卡末尾。不改变用户消息顺序
    // （仅追加到 SYSTEM 卡内容），不覆盖用户编辑内容，幂等（已含标记则跳过）。
    // v2（含 v1 存量）追加 v2 路由卡；v3 追加 v3 单表完整替换卡。
    // 绝不能把 v2 的 patch_sheet_*/operations 术语注入 v3 上下文，反之亦然。
    if (resolved.length > 0) {
        const hasCoreProtocol = cards.some((seg) =>
            String(seg.content || '').includes(TEMPLATE_ASSISTANT_CORE_PROTOCOL_MARKER_ACU),
        );
        if (!hasCoreProtocol) {
            const lastSystemIndex = resolved.map((item) => item.role).lastIndexOf('SYSTEM');
            const targetIndex = lastSystemIndex >= 0 ? lastSystemIndex : resolved.length - 1;
            const coreCard = protocolVersion === 3
                ? buildCoreProtocolCardV3_ACU()
                : buildCoreProtocolCard_ACU();
            resolved[targetIndex] = {
                ...resolved[targetIndex],
                content: `${resolved[targetIndex].content}\n\n${coreCard}`,
            };
        }
    }
    return resolved;
}

/**
 * 产出改表助手 user payload 对象（8 个顶层键，constraints 内容冻结）。
 * 占位符 `$1`-`$4` 是这 8 个键的完备划分（见 TEMPLATE_ASSISTANT_PAYLOAD_PARTITION_ACU）。
 */
export function buildUserPromptPayload_ACU(
    input: TemplateAssistantGenerateInput_ACU,
    baseFingerprint: string,
    protocolVersion: 2 | 3 = 2,
): AnyRecord {
    const tempData = input.tempData;
    const includeDdl = protocolVersion === 3;
    return {
        userRequest: String(input.userRequest || '').trim(),
        baseFingerprint,
        selectedSheetKey: input.currentSheetKey || '',
        selectedSheet: getSelectedSheetSnapshot_ACU(tempData, input.currentSheetKey, { includeDdl }),
        sheetCount: buildSheetSummary_ACU(tempData).length,
        allSheets: buildDetailedSheetSnapshots_ACU(tempData, { includeDdl }),
        globalInjectionConfig: getGlobalInjectionConfigFromData_ACU(tempData, { ensureWriteBack: false }),
        constraints: {
            protocolVersion,
            requestIdRequired: protocolVersion === 2,
            atomicOnly: true,
            allowCrossSheetPatch: protocolVersion === 2,
            patchSourceDataForbidDdl: protocolVersion === 2,
            sourceDataAllowedKeys: [...TEMPLATE_ASSISTANT_SOURCE_DATA_ALLOWED_KEYS_ACU],
            addSheetSourceDataForbidDdl: protocolVersion === 2,
            allowStructuredContentPatch: protocolVersion === 2,
            allowStructuredSchemaPatch: protocolVersion === 2,
            allowStructuredLockPatch: protocolVersion === 2,
            contentPatchRowNumberBase: 1,
            lockPatchRowNumberBase: 1,
            preferRichSourceDataForAddSheet: protocolVersion === 2,
            defaultNoDdlForNewSheetUnlessExplicitlyRequested: protocolVersion === 2,
            ddlMustPreserveHeaderOrder: true,
            ddlChineseHeadersRequireCommentMapping: true,
            ddlChineseHeadersForbidChinesePhysicalNames: true,
            ddlPhysicalColumnNamesShouldBeAsciiWhenHeadersAreChinese: true,
            avoidSlashInNewCustomHeaders: protocolVersion === 2,
            cannotPatchNewSheetAfterAddInSameDraft: protocolVersion === 2,
            redactExistingSourceDataDdlFromSnapshots: protocolVersion === 2,
            ...(protocolVersion === 3
                ? {
                    singleSheetFullReplace: true,
                    singleResultEnvelope: true,
                    forbidFieldLevelPatch: true,
                    forbidGlobalConfigModification: true,
                    replaceRequiresCompleteSheetAndDdl: true,
                    createRequiresCompleteSheetAndDdl: true,
                    deleteRequiresExplicitAction: true,
                    missingUntargetedSheetsKeptUnchanged: true,
                    rowIdSetGuardEnabled: true,
                    rowIdReductionRequiresHighRiskConfirmation: true,
                    contextBudgetEnabled: true,
                }
                : {}),
        },
    };
}

/**
 * 占位符 → payload 键的完备划分（无重复、无遗漏）。
 * 测试据此断言四组字段名并集 === payload 键集，防止未来 payload 新增字段静默丢失。
 */
export const TEMPLATE_ASSISTANT_PAYLOAD_PARTITION_ACU = {
    [TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU]: ['userRequest'],
    [TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU]: ['selectedSheetKey', 'selectedSheet'],
    [TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU]: ['sheetCount', 'allSheets', 'globalInjectionConfig'],
    [TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU]: ['baseFingerprint', 'constraints'],
} as const;

/**
 * 由 payload 与语法参考文本构建占位符 valueMap。
 * 键为占位符 token，值为待替换进提示词的字符串。
 */
export function buildAssistantPlaceholderContext_ACU(
    payload: AnyRecord,
    referenceText: string,
): Record<string, string> {
    return {
        [TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU]: stringifyPlaceholderValue_ACU(payload.userRequest),
        [TEMPLATE_ASSISTANT_PLACEHOLDER_CURRENT_SHEET_ACU]: stringifyPlaceholderValue_ACU({
            selectedSheetKey: payload.selectedSheetKey,
            selectedSheet: payload.selectedSheet,
        }),
        [TEMPLATE_ASSISTANT_PLACEHOLDER_ALL_SHEETS_ACU]: stringifyPlaceholderValue_ACU({
            sheetCount: payload.sheetCount,
            allSheets: payload.allSheets,
            globalInjectionConfig: payload.globalInjectionConfig,
        }),
        [TEMPLATE_ASSISTANT_PLACEHOLDER_PROTOCOL_ACU]: stringifyPlaceholderValue_ACU({
            baseFingerprint: payload.baseFingerprint,
            constraints: payload.constraints,
        }),
        [TEMPLATE_ASSISTANT_REFERENCE_DOCS_PLACEHOLDER_ACU]: referenceText,
    };
}

function buildUserPrompt_ACU(input: TemplateAssistantGenerateInput_ACU, baseFingerprint: string) {
    const protocolVersion = input.protocolVersion === 3 ? 3 : (input.protocolVersion === 2 ? 2 : 3);
    return safeJsonStringify_ACU(buildUserPromptPayload_ACU(input, baseFingerprint, protocolVersion), '{}');
}

function buildSessionRoundUserRequest_ACU(options: {
    userRequest: string;
    repairReason: string;
    protocolVersion?: 2 | 3;
}) {
    const chunks = [String(options.userRequest || '').trim()];
    if (options.repairReason) {
        const isV3 = options.protocolVersion === 3;
        chunks.push(
            'Yêu cầu sửa lỗi: bản nháp assistant của lượt trước không qua kiểm tra cục bộ, lý do là: '
            + `${options.repairReason}。`
            + 'Chỉ sửa đúng operation không qua kiểm tra, đừng tạo lại toàn bộ bản nháp phức tạp; '
            + 'không được thay đổi các bảng và trường không được nhắc đến trong yêu cầu.'
            + (isV3
                ? 'Vẫn chỉ được xuất v3 draft JSON hợp lệ (protocolVersion=3, mode="single_sheet_full_replace", atomic=true, kèm requestId/baseFingerprint/selectedSheetKey, và chỉ được có một result duy nhất: replace/create/delete).'
                : 'Khi chỉ đổi tần suất cập nhật thì xuất patch_sheet_update_config; '
                + 'Khi chỉ đổi tiêu đề hiển thị thì xuất patch_sheet_schema.renameColumns, không xuất trường headers.'
                + 'Vẫn chỉ được xuất draft JSON hợp lệ (protocolVersion=2, atomic=true, kèm requestId/baseFingerprint/selectedSheetKey).'),
        );
    }
    return chunks.filter(Boolean).join('\n\n');
}

function getTemplateAssistantSessionAbortReason_ACU(guard?: TemplateAssistantSessionRunGuard_ACU | null): TemplateAssistantSessionAbortReason_ACU | null {
    if (guard?.isCancelled?.()) return 'cancelled';
    if (guard?.isStale?.()) return 'stale';
    return null;
}

function assertTemplateAssistantSessionActive_ACU(guard?: TemplateAssistantSessionRunGuard_ACU | null) {
    const stopReason = getTemplateAssistantSessionAbortReason_ACU(guard);
    if (stopReason) {
        throw new TemplateAssistantSessionStoppedError_ACU(stopReason);
    }
}

export function createTemplateAssistantSessionGuard_ACU(): TemplateAssistantSessionGuardController_ACU {
    let version = 0;
    let cancelled = false;
    let abortController: AbortController | null = null;
    return {
        createRunGuard() {
            const capturedVersion = version;
            return {
                isCancelled: () => cancelled,
                isStale: () => !cancelled && capturedVersion !== version,
                get signal() { return abortController?.signal ?? null; },
            };
        },
        invalidate() {
            version += 1;
            abortController?.abort();
            abortController = null;
        },
        cancel() {
            cancelled = true;
            version += 1;
            abortController?.abort();
            abortController = null;
        },
        reset() {
            cancelled = false;
            version += 1;
            abortController = null;
        },
        getSignal() {
            if (!abortController) {
                abortController = new AbortController();
            }
            return abortController.signal;
        },
    };
}

function buildTemplateAssistantNoopDraft_ACU(baseFingerprint: string, selectedSheetKey: string | null, summary = '', warnings: string[] = []): TemplateAssistantDraft_ACU {
    return {
        protocolVersion: 2,
        mode: 'modify_current_template_incremental',
        requestId: 'template-assistant-noop',
        baseFingerprint,
        atomic: true,
        selectedSheetKey: String(selectedSheetKey || ''),
        summary,
        warnings: warnings.map((item) => String(item ?? '')),
        operations: [],
    };
}

/**
 * v3 noop draft：与 v3 信封协议一致的空结果（无 result 时表示「无可应用变更」）。
 * 仅在 v3 会话全部失败、回退到空 diff 时使用，保证 finalDraft 的协议版本与输入一致。
 */
function buildTemplateAssistantNoopDraftV3_ACU(baseFingerprint: string, selectedSheetKey: string | null, summary = '', warnings: string[] = []): TemplateAssistantDraft_ACU {
    return {
        protocolVersion: 3,
        mode: 'single_sheet_full_replace',
        requestId: 'template-assistant-noop',
        baseFingerprint,
        atomic: true,
        selectedSheetKey: String(selectedSheetKey || ''),
        summary,
        warnings: warnings.map((item) => String(item ?? '')),
        // v3「无可应用变更」= 不携带 result；hasTemplateAssistantApplicableDraft_ACU 据此判定不可应用。
        // 该 draft 不会进入 validator（validator 只作用于 AI 输出），类型按信封宽限处理。
        result: undefined as unknown as TemplateAssistantV3Result_ACU,
    } as TemplateAssistantDraft_ACU;
}

/**
 * 判断 draft 是否包含「可应用的变更」，兼容 v1/v2 的 operations 与 v3 的 result 信封。
 * - v1/v2：operations 非空即视为有变更（与既有语义一致）。
 * - v3：必须有对象 result，且 action 是 replace/create/delete 之一；delete 是显式动作，同样视为可应用。
 * 供 generate/session/apply 链路统一使用，避免各调用点直接读 draft.operations 而破坏 v3。
 */
export function hasTemplateAssistantApplicableDraft_ACU(draft: any): boolean {
    if (!draft || typeof draft !== 'object') return false;
    if (draft.protocolVersion === 3) {
        const action = String(draft?.result?.action || '');
        return action === 'replace' || action === 'create' || action === 'delete';
    }
    return Array.isArray(draft.operations) && draft.operations.length > 0;
}

function assertTemplateAssistantDraftApplicable_ACU(draft: any) {
    if (!hasTemplateAssistantApplicableDraft_ACU(draft)) {
        throw new Error('assistant draft không chứa thay đổi nào có thể áp dụng');
    }
}


export function getTemplateAssistantApplyBaselineFingerprint_ACU(result: TemplateAssistantGenerateResult_ACU | null | undefined) {
    const originalBaseFingerprint = String(result?.originalBaseFingerprint || '').trim();
    if (originalBaseFingerprint) {
        return originalBaseFingerprint;
    }
    if (Array.isArray(result?.rounds) || !!result?.session) {
        return '';
    }
    return String(result?.draft?.baseFingerprint || '').trim();
}

function emitTemplateAssistantRoundComplete_ACU(
    onRoundComplete: TemplateAssistantSessionRunInput_ACU['onRoundComplete'],
    round: TemplateAssistantSessionRound_ACU,
    rounds: TemplateAssistantSessionRound_ACU[],
    maxRounds: number,
) {
    if (typeof onRoundComplete !== 'function') return;
    try {
        onRoundComplete({
            round: clone_ACU(round),
            rounds: clone_ACU(rounds),
            maxRounds,
        });
    } catch (error: any) {
        logError_ACU('[TemplateAssistant] onRoundComplete 执行失败', {
            errorMessage: error?.message || 'Lỗi không rõ',
            round: round.round,
        });
    }
}

export async function generateTemplateAssistantDraft_ACU(input: TemplateAssistantGenerateInput_ACU): Promise<TemplateAssistantGenerateResult_ACU> {
    const tempData = asObject_ACU(input?.tempData);
    const userRequest = String(input?.userRequest || '').trim();
    if (!userRequest) {
        throw new Error('Vui lòng nhập yêu cầu sửa bảng');
    }
    if (!String(input?.currentSheetKey || '').trim()) {
        throw new Error('Hãy chọn một bảng trước rồi mới dùng trợ lý sửa bảng AI');
    }
    const baseFingerprint = buildTemplateAssistantFingerprint_ACU(tempData);
    const messages = buildTemplateAssistantMessages_ACU({ ...input, tempData }, baseFingerprint);

    const overridePreset = String(input?.tableApiPreset || '').trim();
    let effectivePreset = overridePreset;
    if (!effectivePreset) {
        effectivePreset = settings_ACU.tableApiPreset || '';
        const currentSheet = input.currentSheetKey ? tempData[input.currentSheetKey] : null;
        const currentTableName = String(currentSheet?.name || '').trim();
        if (currentTableName) {
            const overrides = settings_ACU.tableApiPresetOverridesByName;
            if (overrides && typeof overrides === 'object' && typeof overrides[currentTableName] === 'string' && overrides[currentTableName].trim()) {
                effectivePreset = overrides[currentTableName].trim();
            }
        }
    }

    const aiRawText = input.guard?.signal
        ? await callAIWithPreset_ACU(messages, effectivePreset, undefined, input.guard.signal)
        : await callAIWithPreset_ACU(messages, effectivePreset);
    if (!aiRawText) {
        throw new Error('AI không trả về nội dung hợp lệ');
    }

    let draft: TemplateAssistantDraft_ACU;
    try {
        draft = parseTemplateAssistantDraft_ACU(aiRawText);
    } catch (error: any) {
        logError_ACU('[TemplateAssistant] draft 解析失败', {
            currentSheetKey: input.currentSheetKey,
            baseFingerprint,
            userRequest,
            errorMessage: error?.message || 'Lỗi không rõ',
            aiRawText,
        });
        const wrapped = new Error(error?.message || 'Phân tích assistant draft thất bại');
        // 转发内部已有的分类（validate 在 parseTemplateAssistantDraft_ACU 内部抛出），未标记则按 parse
        (wrapped as any).failureKind = error?.failureKind === 'validate' ? 'validate' : 'parse';
        (wrapped as any).failureRawText = aiRawText;
        throw wrapped;
    }

    // 协议一致性门禁：请求协议与 AI 输出协议必须一致。
    // 默认新会话为 v3；若 AI 在 v3 请求下返回 v2 草稿（或反之），说明提示词/模型未遵守信封，
    // 直接拒绝并归类为 validate，绝不静默混用两种协议的语义。
    const requestedProtocolVersion = input.protocolVersion === 2 ? 2 : 3;
    // 存量兼容：显式 v2 请求允许 v1 输出（v1/v2 共用 operations 语义），v3 请求只接受 v3。
    const protocolAccepted = requestedProtocolVersion === 3
        ? draft.protocolVersion === 3
        : draft.protocolVersion === 1 || draft.protocolVersion === 2;
    if (!protocolAccepted) {
        const wrapped = new Error(
            `Phiên bản giao thức AI trả về (${draft.protocolVersion}) không khớp với phiên bản giao thức đã yêu cầu (${requestedProtocolVersion})`,
        );
        (wrapped as any).failureKind = 'validate';
        (wrapped as any).failureRawText = aiRawText;
        throw wrapped;
    }

    if (draft.baseFingerprint !== baseFingerprint) {
        const wrapped = new Error('baseFingerprint AI trả về không khớp với cấu trúc hiện tại');
        (wrapped as any).failureKind = 'fingerprint';
        (wrapped as any).failureRawText = aiRawText;
        throw wrapped;
    }
    if (isTemplateAssistantV3Draft_ACU(draft)) {
        // v3 信封必须携带可应用的 result；validator 已保证 action 为 replace/create/delete 之一，这里兜底防御。
        assertTemplateAssistantDraftApplicable_ACU(draft);
    } else {
        draft.operations.forEach((op) => {
            if (String(op?.op || '').startsWith('patch_sheet_')) {
                validatePatchSheetBoundary_ACU(op, draft.selectedSheetKey, input.currentSheetKey, draft.protocolVersion);
            }
        });
        // v1/v2 空 operations 是合法结论（empty_operations），不在此抛错。
    }

    const compileResult = compileTemplateAssistantDraft_ACU({
        tempData,
        sheetOrder: input.sheetOrder,
        currentSheetKey: input.currentSheetKey,
        draft,
    });
    const preflight = await preflightSchemaMigrations_ACU({
        baselineData: tempData as any,
        candidateData: compileResult.candidateData as any,
        intents: compileResult.schemaMigrationIntents,
    });
    if (preflight.blockers.length > 0) {
        const wrapped = new Error(`schema migration preflight thất bại: ${preflight.blockers.join('; ')}`);
        (wrapped as any).failureKind = 'preflight';
        (wrapped as any).failureRawText = aiRawText;
        throw wrapped;
    }

    return {
        draft,
        aiRawText,
        messages,
        compileResult,
    };
}

export async function runTemplateAssistantSession_ACU(input: TemplateAssistantSessionRunInput_ACU): Promise<TemplateAssistantSessionResult_ACU> {
    const tempData = asObject_ACU(input?.tempData);
    const currentSheetKey = String(input?.currentSheetKey || '').trim();
    const userRequest = String(input?.userRequest || '').trim();
    if (!userRequest) {
        throw new Error('Vui lòng nhập yêu cầu sửa bảng');
    }
    if (!currentSheetKey) {
        throw new Error('Hãy chọn một bảng trước rồi mới dùng trợ lý sửa bảng AI');
    }

    const basePriorTurns = normalizePriorTurns_ACU(input?.priorTurns);
    // 改表助手是一问一答：无论有无历史，固定只跑 1 轮，不自动多轮续跑。
    // 用户每次提交需求只触发一次 AI 生成；AI 输出解析/校验失败时由 repairRetries 修正重试。
    const maxRounds = 1;
    const maxRepairRetries = normalizeNonNegativeInteger_ACU(input?.maxRepairRetries, DEFAULT_TEMPLATE_ASSISTANT_MAX_REPAIR_RETRIES_ACU);
    const originalTempData = clone_ACU(tempData);
    const originalSheetOrder = Array.isArray(input?.sheetOrder) ? [...input.sheetOrder] : null;
    const originalBaseFingerprint = buildTemplateAssistantFingerprint_ACU(originalTempData);
    const protocolVersion: 2 | 3 = input.protocolVersion === 2 ? 2 : 3;
    const rounds: TemplateAssistantSessionRound_ACU[] = [];
    const onRoundComplete = input?.onRoundComplete;

    let stopReason: TemplateAssistantSessionStopReason_ACU = 'success';
    let repairRetriesUsed = 0;
    let lastErrorMessage = '';
    let lastResult: TemplateAssistantGenerateResult_ACU | null = null;
    let lastFailure: TemplateAssistantFailureInfo_ACU | null = null;

    // 单轮执行：最多 maxRepairRetries 次「解析/校验失败 → 携带错误信息重试」。
    let repairReason = '';
    while (true) {
        assertTemplateAssistantSessionActive_ACU(input.guard);
        const roundUserRequest = buildSessionRoundUserRequest_ACU({
            userRequest,
            repairReason,
            protocolVersion,
        });
        try {
            const historyForRound = [
                ...basePriorTurns,
                ...rounds.map((item) => ({
                    user: item.userRequest,
                    assistant: item.aiRawText,
                })),
            ];
            const result = await generateTemplateAssistantDraft_ACU({
                tempData: originalTempData,
                currentSheetKey,
                sheetOrder: originalSheetOrder,
                userRequest: roundUserRequest,
                priorTurns: historyForRound,
                tableApiPreset: input.tableApiPreset,
                protocolVersion,
                guard: input.guard,
            });
            assertTemplateAssistantSessionActive_ACU(input.guard);
            lastResult = result;

            const roundRecord: TemplateAssistantSessionRound_ACU = {
                round: 1,
                userRequest: roundUserRequest,
                draft: result.draft,
                aiRawText: result.aiRawText,
                messages: result.messages,
                perRoundCompileResult: result.compileResult,
                workingFingerprint: buildTemplateAssistantFingerprint_ACU(result.compileResult.candidateData || originalTempData),
            };
            rounds.push(roundRecord);
            emitTemplateAssistantRoundComplete_ACU(onRoundComplete, roundRecord, rounds, maxRounds);
            // 单轮没有下一轮检查点：onRoundComplete 回调期间可能触发 cancel/stale，
            // 必须在收尾前显式确认会话仍然活动，否则停止按钮语义会退化。
            assertTemplateAssistantSessionActive_ACU(input.guard);

            // 单轮成功（无论是否产出可应用 operations）：一问一答结束。
            // 空 operations 表示 AI 认为无需修改，同样视为成功结论。
            lastFailure = null;
            lastErrorMessage = '';
            stopReason = hasTemplateAssistantApplicableDraft_ACU(result.draft) ? 'success' : 'empty_operations';
            break;
        } catch (error: any) {
            assertTemplateAssistantSessionActive_ACU(input.guard);
            lastErrorMessage = error?.message || 'Lỗi không rõ';
            // 环境失败（sql.js/wasm 引擎不可用，SqliteRuntimeUnavailableError_ACU）由
            // preflight/hydrate 直接上抛（见 schema-migration-preflight.ts T5）。
            // 它不是 AI 输出问题：重试不会改善、回喂 AI 无意义，必须单独分类并终止。
            const isEnvironmentFailure =
                error instanceof SqliteRuntimeUnavailableError_ACU
                || error?.failureKind === 'environment';
            const isContextBudgetFailure = error?.failureKind === 'context_budget';
            const failureKind: TemplateAssistantFailureKind_ACU =
                error?.failureKind === 'parse'
                || error?.failureKind === 'validate'
                || error?.failureKind === 'fingerprint'
                || error?.failureKind === 'preflight'
                || error?.failureKind === 'context_budget'
                    ? error.failureKind
                    : isEnvironmentFailure
                        ? 'environment'
                        : 'unknown';
            lastFailure = { kind: failureKind, message: lastErrorMessage, rawText: error?.failureRawText };
            if (isEnvironmentFailure) {
                // 环境失败：不可重试、不消耗 repairRetriesUsed、不把 sql.js 错误当修复上下文回喂 AI。
                stopReason = 'environment_failure';
                repairReason = '';
                break;
            }
            if (isContextBudgetFailure) {
                // 上下文预算超限：payload 本身超出协议上限，属于输入侧问题。
                // 重试只会再次超限、回喂 AI 无意义，必须不可重试、不消耗 repairRetriesUsed。
                stopReason = 'context_budget_failure';
                repairReason = '';
                break;
            }
            if (repairRetriesUsed >= maxRepairRetries) {
                stopReason = 'repair_retry_capped';
                break;
            }
            repairRetriesUsed += 1;
            repairReason = lastErrorMessage;
        }
    }

    // 单轮会话：rounds 恒为 0 或 1。
    // - 成功（rounds=1）：compileResult 直接取该轮结果，与 generateTemplateAssistantDraft_ACU 的语义一致。
    // - 全部失败（rounds=0）：无可用候选，回退到原始数据的空 diff。
    const compileResult = lastResult?.compileResult
        || buildTemplateAssistantCumulativeCompileResult_ACU({
            baselineData: originalTempData,
            baselineSheetOrder: originalSheetOrder,
            candidateData: originalTempData,
            candidateSheetOrder: originalSheetOrder,
            focusSheetKey: currentSheetKey,
        });
    const finalPreflight = await preflightSchemaMigrations_ACU({
        baselineData: originalTempData as any,
        candidateData: compileResult.candidateData as any,
        intents: compileResult.schemaMigrationIntents,
    });
    // 最终 preflight 为异步操作，返回后同样需要再次确认会话未被取消，才能提交成功结果。
    assertTemplateAssistantSessionActive_ACU(input.guard);
    if (finalPreflight.blockers.length > 0) throw new Error(`schema migration preflight cuối cùng thất bại: ${finalPreflight.blockers.join('; ')}`);
    const v3RowIdGuardFindings = lastResult?.draft && isTemplateAssistantV3Draft_ACU(lastResult.draft)
        ? collectV3RowIdGuardFindings_ACU(originalTempData, compileResult.candidateData, currentSheetKey, String(input.userRequest || ''))
        : [];
    const finalDraft = lastResult?.draft
        || (protocolVersion === 3 ? buildTemplateAssistantNoopDraftV3_ACU(originalBaseFingerprint, currentSheetKey) : buildTemplateAssistantNoopDraft_ACU(originalBaseFingerprint, currentSheetKey));
    const finalWorkingFingerprint = buildTemplateAssistantFingerprint_ACU(compileResult.candidateData || originalTempData);

    return {
        draft: finalDraft,
        aiRawText: lastResult?.aiRawText || '',
        messages: lastResult?.messages || [],
        compileResult,
        originalBaseFingerprint,
        rounds,
        session: {
            originalBaseFingerprint,
            finalWorkingFingerprint,
            stopReason,
            roundsExecuted: rounds.length,
            maxRounds,
            repairRetriesUsed,
            maxRepairRetries,
            lastErrorMessage,
            lastFailure,
            ...(v3RowIdGuardFindings.length > 0 ? { v3RowIdGuardFindings } : {}),
        },
    };
}
