/**
 * service/continuation/agent/agent-protocol.ts — Agent 文本协议解析
 *
 * 内部 AI 没有原生工具调用能力，所有动作都通过模型输出的 JSON 块表达。
 * 项目里既有的大纲链路证明：尾部 assistant 段在实际后端只起格式示范作用，
 * 模型常常重新完整输出而不是续写。所以解析必须同时容忍两种返回形态：
 * 直接输出完整 JSON，或只续写预填充之后的部分。
 */

import { ContinuationValidationError_ACU, createContinuationError_ACU } from '../model';
import type { AgentToolMode_ACU } from '../../ai/agent-tool-mode';
import { parseJsonLenient_ACU, parseSqlJsonValue_ACU, salvageTruncatedJson_ACU, stripReasoningBlocks_ACU } from '../lenient-text';
import { parseRestrictedSqlDml_ACU, parseRestrictedSqlDmlTolerant_ACU, type RestrictedSqlStatement_ACU, type RestrictedSqlValue_ACU } from '../../shared/restricted-sql-dml';
import {
  AGENT_CHRONOLOGY_PRECISIONS_ACU,
  AGENT_HOOK_IMPORTANCES_ACU,
  AGENT_HOOK_STATUSES_ACU,
  AGENT_REVEAL_STATUSES_ACU,
  AGENT_REVIEW_VERDICTS_ACU,
  AGENT_SEARCH_SCOPES_ACU,
  AGENT_STORY_ARC_SCOPES_ACU,
  AGENT_STORY_ARC_STATUSES_ACU,
  AGENT_VOLUME_NARRATIVE_ROLES_ACU,
  AGENT_WEB_TOOL_ACTIONS_ACU,
  type AgentChronologyDeltaItem_ACU,
  type AgentChronologyPatch_ACU,
  type AgentComposerOutput_ACU,
  type AgentDelegation_ACU,
  type AgentFinalReviewerOutput_ACU,
  type AgentHookDeltaItem_ACU,
  type AgentHookPatch_ACU,
  type AgentInfoGapDeltaItem_ACU,
  type AgentInfoGapPatch_ACU,
  type AgentMainAction_ACU,
  type AgentMaintainerOutput_ACU,
  type AgentModuleDelta_ACU,
  type AgentSubagentName_ACU,
  type AgentModuleWriterRole_ACU,
  type AgentWritableModule_ACU,
  type AgentPlannerOutput_ACU,
  type AgentReadFence_ACU,
  type AgentReviewerOutput_ACU,
  type AgentSearchScope_ACU,
  type AgentStoryArcDeltaItem_ACU,
  type AgentStoryArcPatch_ACU,
  type AgentToolCall_ACU,
  type AgentWebRefPatch_ACU,
  type AgentWebRefSource_ACU,
  type AgentWebToolCall_ACU,
} from './agent-model';

function failProtocol_ACU(reason: string, details?: Record<string, unknown>): never {
  throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_AGENT_PROTOCOL_INVALID', 'agent_loop', reason, true, details));
}

function isRecord_ACU(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText_ACU(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readTextList_ACU(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readText_ACU).filter(Boolean);
}

function parseAgentReadFence_ACU(value: unknown): AgentReadFence_ACU {
  if (!isRecord_ACU(value)) failProtocol_ACU('read.requestedFence phải là đối tượng');
  if (Object.keys(value).some(key => key !== 'lower' && key !== 'upper')) {
    failProtocol_ACU('read.requestedFence chỉ cho phép lower / upper');
  }
  const readBoundary_ACU = (key: 'lower' | 'upper'): string | number | undefined => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    const boundary = value[key];
    if (typeof boundary === 'number' && Number.isSafeInteger(boundary)) return boundary;
    if (typeof boundary === 'string' && boundary.trim()) return boundary.trim();
    failProtocol_ACU(`read.requestedFence.${key} phải là chuỗi không rỗng hoặc số nguyên an toàn`);
  };
  const lower = readBoundary_ACU('lower');
  const upper = readBoundary_ACU('upper');
  if (lower === undefined && upper === undefined) failProtocol_ACU('read.requestedFence cần ít nhất lower hoặc upper');
  if (typeof lower === 'number' && typeof upper === 'number' && lower > upper) {
    failProtocol_ACU('lower của read.requestedFence không được lớn hơn upper');
  }
  return {
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
  };
}

/** 单次解析里最多扫描的顶层配平对象数，防止超长返回里的花括号碎片拖垮解析。 */
const JSON_OBJECT_SCAN_LIMIT_ACU = 6;

function balancedObjectFrom_ACU(text: string, start: number): { json: string; end: number } | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = inString; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { json: text.slice(start, index + 1), end: index + 1 };
    }
  }
  return null;
}

/**
 * 从任意文本里提取首个配平的 JSON 对象。
 * @param text 模型返回的原始文本，可能带 Markdown 围栏或前后解释
 * @returns 提取到的 JSON 子串；找不到返回 null
 */
export function extractFirstJsonObject_ACU(text: string): string | null {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start < 0) return null;
  return balancedObjectFrom_ACU(text, start)?.json ?? null;
}

/**
 * 从任意文本里依次提取多个顶层配平 JSON 对象（已消费区间内的嵌套对象不重复提取）。
 * @param text 模型返回的原始文本
 * @returns 提取到的 JSON 子串列表，最多 6 个
 */
export function extractJsonObjects_ACU(text: string): string[] {
  if (typeof text !== 'string') return [];
  const objects: string[] = [];
  let cursor = 0;
  while (objects.length < JSON_OBJECT_SCAN_LIMIT_ACU) {
    const start = text.indexOf('{', cursor);
    if (start < 0) break;
    const balanced = balancedObjectFrom_ACU(text, start);
    if (!balanced) {
      // 从该花括号起无法配平（多半是散文里的孤立花括号），跳过它继续找。
      cursor = start + 1;
      continue;
    }
    objects.push(balanced.json);
    cursor = balanced.end;
  }
  return objects;
}

function stripMarkdownFences_ACU(text: string): string {
  return text.replace(/```[a-zA-Z]*\n?/g, '').trim();
}

/** 统一的原文预处理：剥推理块。围栏由花括号扫描天然跳过，不在这里处理。 */
function normalizeModelText_ACU(raw: string | null | undefined): string {
  return typeof raw === 'string' ? stripReasoningBlocks_ACU(raw) : '';
}

/** 在候选文本里按优先级提取全部可解析的顶层对象（严格失败时走宽松 JSON）。 */
function parseObjectsFrom_ACU(candidate: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const extracted of extractJsonObjects_ACU(candidate)) {
    const parsed = parseJsonLenient_ACU(extracted);
    if (isRecord_ACU(parsed)) records.push(parsed);
  }
  return records;
}

/**
 * 解析一份 Agent 协议载荷。对返回形态宽容：模型可以完整重输 JSON、只续写预填充、
 * 或在 JSON 前后写自然语言——运行时按判别键从全文中挑出正确的动作对象。
 * @param raw 模型返回的原始文本
 * @param prefill 该请求尾段预填充文本，可为空
 * @param requiredKeys 协议对象的判别键，含任意一个即视为目标对象；缺省不判别
 * @returns 解析出的对象
 */
export function parseAgentJsonPayload_ACU(raw: string | null | undefined, prefill = '', requiredKeys: readonly string[] = []): Record<string, unknown> {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) failProtocol_ACU('AI nội bộ trả về rỗng');
  // 剥掉围栏后以 { 开头视为完整重输，原文优先；否则视为续写预填充，拼接候选优先。
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  let firstParsed: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    for (const parsed of parseObjectsFrom_ACU(candidate)) {
      if (!requiredKeys.length || requiredKeys.some(key => key in parsed)) return parsed;
      if (!firstParsed) firstParsed = parsed;
    }
  }
  // 没有对象命中判别键时退回首个可解析对象，让上层契约校验给出准确的字段级报错。
  if (firstParsed) return firstParsed;
  failProtocol_ACU(`Nội dung trả về không chứa đối tượng JSON có thể phân tích. Đoạn mô hình trả về: ${text.trim().slice(0, 300)}`);
}

export interface AgentJsonPayloadDraft_ACU {
  payload: Record<string, unknown>;
  /** 输出在 JSON 中途被截断，payload 只含抢救出的完整条目。 */
  truncated: boolean;
}

/**
 * 契约载荷的草稿解析：完整 JSON 直接返回；配平失败时尝试抢救截断的 JSON——保留已写完的
 * 条目、丢掉未完成的尾部，并标记 truncated，让调用方向模型索要“剩余条目”而不是整份重来。
 * @param raw 模型返回的原始文本
 * @param prefill 尾段预填充
 * @param requiredKeys 契约对象判别键
 */
export function parseAgentJsonPayloadDraft_ACU(raw: string | null | undefined, prefill = '', requiredKeys: readonly string[] = []): AgentJsonPayloadDraft_ACU {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) failProtocol_ACU('AI nội bộ trả về rỗng');
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  let firstParsed: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    const stripped = stripMarkdownFences_ACU(candidate);
    const start = stripped.indexOf('{');
    if (start < 0) continue;
    // 逐个候选判定：首个 { 能配平就按完整对象解析；配不平才视为截断去抢救。
    // 决不能对已经完整的原文再去试“预填充 + 原文”的拼接——预填充以未闭合引号结尾，拼上完整 JSON
    // 后必然配不平，会被当成截断抢救出一份没有 delta 的假载荷，让子代理“成功”却什么都没写。
    if (balancedObjectFrom_ACU(stripped, start)) {
      for (const parsed of parseObjectsFrom_ACU(stripped)) {
        if (!requiredKeys.length || requiredKeys.some(key => key in parsed)) return { payload: parsed, truncated: false };
        if (!firstParsed) firstParsed = parsed;
      }
      continue;
    }
    const salvaged = salvageTruncatedJson_ACU(stripped);
    if (!salvaged) continue;
    const parsed = parseJsonLenient_ACU(salvaged.json);
    if (isRecord_ACU(parsed) && (!requiredKeys.length || requiredKeys.some(key => key in parsed))) {
      return { payload: parsed, truncated: true };
    }
  }
  if (firstParsed) return { payload: firstParsed, truncated: false };
  failProtocol_ACU(`Nội dung trả về không chứa đối tượng JSON có thể phân tích. Đoạn mô hình trả về: ${text.trim().slice(0, 300)}`);
}

function parseDelegations_ACU(value: unknown): AgentDelegation_ACU[] {
  if (!Array.isArray(value) || !value.length) failProtocol_ACU('Hành động delegate phải cung cấp mảng delegations không rỗng');
  return value.map((raw, index) => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delegations[${index}] phải là đối tượng`);
    const agentName = readText_ACU(raw.agentName);
    const prompt = readText_ACU(raw.prompt);
    if (!agentName) failProtocol_ACU(`delegations[${index}].agentName không được rỗng`);
    if (!prompt) failProtocol_ACU(`delegations[${index}].prompt không được rỗng`);
    // 旧协议的 writes 字段静默忽略：写入范围由子代理职责固定决定，不再由主 Agent 授权。
    return { agentName, prompt, reads: readTextList_ACU(raw.reads) };
  });
}

/** 单次 read 调用最多允许的地址数，防止一口气抄全目录。 */
const READ_ADDRESS_LIMIT_ACU = 8;

/** search 单次调用默认与上限的返回条数。 */
export const AGENT_SEARCH_DEFAULT_MAX_RESULTS_ACU = 30;
export const AGENT_SEARCH_MAX_RESULTS_CAP_ACU = 100;

function parseSearchScope_ACU(value: unknown): AgentSearchScope_ACU[] {
  if (value === undefined || value === null) return [...AGENT_SEARCH_SCOPES_ACU];
  const list = Array.isArray(value) ? value : [value];
  const scopes: AgentSearchScope_ACU[] = [];
  for (const raw of list) {
    const scope = readText_ACU(raw);
    if (!scope) continue;
    if (!(AGENT_SEARCH_SCOPES_ACU as readonly string[]).includes(scope)) {
      failProtocol_ACU(`scope của search chỉ được là ${AGENT_SEARCH_SCOPES_ACU.join(' / ')}, thực nhận: ${scope}`);
    }
    if (!scopes.includes(scope as AgentSearchScope_ACU)) scopes.push(scope as AgentSearchScope_ACU);
  }
  return scopes.length ? scopes : [...AGENT_SEARCH_SCOPES_ACU];
}

/**
 * 把一个 JSON 载荷解析成工具调用。
 * @param payload 已解析且 action 为 read / search 的载荷
 * @returns 工具调用对象；字段非法时抛可回灌的协议错误
 */
export function parseAgentToolCall_ACU(payload: Record<string, unknown>): AgentToolCall_ACU {
  const action = readText_ACU(payload.action);
  if (action === 'read') {
    const reads = readTextList_ACU(payload.reads);
    if (!reads.length) failProtocol_ACU('Hành động read phải cung cấp mảng reads không rỗng (danh sách địa chỉ tư liệu)');
    if (reads.length > READ_ADDRESS_LIMIT_ACU) failProtocol_ACU(`Một lần read tối đa ${READ_ADDRESS_LIMIT_ACU} địa chỉ; hãy tách thành nhiều lần hoặc dùng search để thu hẹp phạm vi trước`);
    const requestedFence = payload.requestedFence === undefined ? undefined : parseAgentReadFence_ACU(payload.requestedFence);
    return {
      kind: 'read',
      reads: [...new Set(reads)],
      ...(requestedFence === undefined ? {} : { requestedFence }),
    };
  }
  if (action === 'search') {
    const query = readText_ACU(payload.query);
    if (!query) failProtocol_ACU('Hành động search phải cung cấp query không rỗng');
    let maxResults = AGENT_SEARCH_DEFAULT_MAX_RESULTS_ACU;
    if (payload.maxResults !== undefined) {
      if (typeof payload.maxResults !== 'number' || !Number.isInteger(payload.maxResults) || payload.maxResults < 1) {
        failProtocol_ACU('maxResults của search phải là số nguyên dương');
      }
      maxResults = Math.min(payload.maxResults, AGENT_SEARCH_MAX_RESULTS_CAP_ACU);
    }
    return { kind: 'search', query, scope: parseSearchScope_ACU(payload.scope), isRegex: payload.isRegex === true, maxResults };
  }
  failProtocol_ACU(`Hành động công cụ phải là read / search, thực nhận: ${action || '(rỗng)'}`);
}

/** 一次输出里最多接受的工具调用数（与 JSON 扫描上限一致）。 */
export const AGENT_TOOL_BATCH_LIMIT_ACU = JSON_OBJECT_SCAN_LIMIT_ACU;

interface ParsedActionObjects_ACU {
  records: Record<string, unknown>[];
}

/** 按 parseAgentJsonPayload 的候选优先级提取全部带 action 键的顶层对象。 */
function collectActionObjects_ACU(raw: string | null | undefined, prefill: string): ParsedActionObjects_ACU {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) failProtocol_ACU('AI nội bộ trả về rỗng (hoặc chỉ có chữ suy luận, không có JSON hành động nào)');
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  for (const candidate of candidates) {
    const records = parseObjectsFrom_ACU(candidate).filter(parsed => 'action' in parsed);
    if (records.length) return { records };
  }
  failProtocol_ACU(`Nội dung trả về không chứa đối tượng JSON có trường action. Đoạn mô hình trả về: ${text.trim().slice(0, 300)}`);
}

/**
 * 解析主 Agent 的一次完整输出。
 *
 * 输出里出现任意 read / search 对象时，本次视为工具并发批次：收集全部工具调用同时执行，
 * 混入的决策动作被忽略（决策必须在拿到工具结果后单独输出）。否则按单动作解析。
 * @param raw 模型返回的原始文本
 * @param prefill 尾段预填充
 * @param allowDelegate 本轮是否仍允许派工
 * @returns 判别联合形式的动作对象（可能是 tools 批次）
 */
export function parseAgentMainOutput_ACU(raw: string | null | undefined, prefill: string, allowDelegate: boolean): AgentMainAction_ACU {
  const { records } = collectActionObjects_ACU(raw, prefill);
  const toolRecords = records.filter(record => { const action = readText_ACU(record.action); return action === 'read' || action === 'search'; });
  if (toolRecords.length) {
    const calls = toolRecords.slice(0, AGENT_TOOL_BATCH_LIMIT_ACU).map(parseAgentToolCall_ACU);
    return { kind: 'tools', thought: readText_ACU(toolRecords[0].thought), calls };
  }
  return parseAgentMainAction_ACU(records[0], allowDelegate);
}

/**
 * 从子代理输出里提取工具并发批次。
 * @param raw 模型返回的原始文本
 * @param prefill 尾段预填充
 * @returns 工具调用列表；输出里没有任何 read / search 对象时返回 null（应按契约解析）
 */
export function parseAgentSubagentToolCalls_ACU(raw: string | null | undefined, prefill: string): AgentToolCall_ACU[] | null {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) return null;
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  for (const candidate of candidates) {
    const records = parseObjectsFrom_ACU(candidate);
    const toolRecords = records.filter(parsed => { const action = readText_ACU(parsed.action); return action === 'read' || action === 'search'; });
    if (toolRecords.length) return toolRecords.slice(0, AGENT_TOOL_BATCH_LIMIT_ACU).map(parseAgentToolCall_ACU);
    if (records.length) return null;
  }
  return null;
}

/** write_sql 只在普通可写子代理的运行时提取；主 Agent 和终审仍用只读解析器。 */
export function parseAgentWritableToolCalls_ACU(raw: string | null | undefined, prefill: string, allowWeb = false): Array<AgentToolCall_ACU | AgentWebToolCall_ACU | { kind: 'write_sql'; sql: string }> | null {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) return null;
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  for (const candidate of candidates) {
    const records = parseObjectsFrom_ACU(candidate);
    if (!records.length) continue;
    const actions = records.map(record => readText_ACU(record.action));
    if (!actions.some(action => action === 'read' || action === 'search' || action === 'write_sql' || (allowWeb && isWebToolAction_ACU(action)))) return null;
    return records.slice(0, AGENT_TOOL_BATCH_LIMIT_ACU).map(record => {
      const action = readText_ACU(record.action);
      if (action === 'write_sql') {
        if (Object.keys(record).some(key => key !== 'action' && key !== 'sql')) failProtocol_ACU('write_sql chỉ cho phép action và sql');
        const sql = readText_ACU(record.sql);
        if (!sql) failProtocol_ACU('write_sql phải cung cấp chuỗi sql không rỗng');
        return { kind: 'write_sql' as const, sql };
      }
      if (allowWeb && isWebToolAction_ACU(action)) return parseAgentWebToolCall_ACU(record);
      return parseAgentToolCall_ACU(record);
    });
  }
  return null;
}

const ENCYCLOPEDIA_SOURCE_ALIASES_ACU: Record<string, Exclude<AgentWebRefSource_ACU, 'web'>> = {
  moegirl: 'moegirl', 萌娘百科: 'moegirl', 萌娘: 'moegirl', moe: 'moegirl',
  wikipedia_zh: 'wikipedia_zh', wikipedia: 'wikipedia_zh', zhwiki: 'wikipedia_zh', 维基百科: 'wikipedia_zh', 中文维基: 'wikipedia_zh', 维基: 'wikipedia_zh',
  wikipedia_en: 'wikipedia_en', enwiki: 'wikipedia_en', 英文维基: 'wikipedia_en',
  baidu: 'baidu', baike: 'baidu', 百度百科: 'baidu', 百度: 'baidu',
};

function parseEncyclopediaSource_ACU(value: unknown, path: string): Exclude<AgentWebRefSource_ACU, 'web'> {
  const raw = readText_ACU(value);
  const source = ENCYCLOPEDIA_SOURCE_ALIASES_ACU[raw] ?? ENCYCLOPEDIA_SOURCE_ALIASES_ACU[raw.toLowerCase()];
  if (!source) failProtocol_ACU(`${path} phải là một trong moegirl / wikipedia_zh / wikipedia_en / baidu, thực nhận: ${raw || '(rỗng)'}`);
  return source;
}

/**
 * 把一个 JSON 载荷解析成 web-researcher 的出网工具调用。
 * @param payload 已解析且 action 为四种出网动作之一的载荷
 */
export function parseAgentWebToolCall_ACU(payload: Record<string, unknown>): AgentWebToolCall_ACU {
  const action = readText_ACU(payload.action);
  if (action === 'encyclopedia_search') {
    const query = readText_ACU(payload.query);
    if (!query) failProtocol_ACU('encyclopedia_search phải cung cấp query không rỗng');
    const rawSources = payload.sources === undefined || payload.sources === null ? [] : (Array.isArray(payload.sources) ? payload.sources : [payload.sources]);
    const sources = [...new Set(rawSources.map((item, index) => parseEncyclopediaSource_ACU(item, `encyclopedia_search.sources[${index}]`)))];
    return { kind: 'encyclopedia_search', query, sources };
  }
  if (action === 'encyclopedia_read') {
    const title = readText_ACU(payload.title);
    if (!title) failProtocol_ACU('encyclopedia_read phải cung cấp title không rỗng (tiêu đề mục từ, sao chép từ ứng viên của encyclopedia_search)');
    return { kind: 'encyclopedia_read', source: parseEncyclopediaSource_ACU(payload.source, 'encyclopedia_read.source'), title };
  }
  if (action === 'web_search') {
    const query = readText_ACU(payload.query);
    if (!query) failProtocol_ACU('web_search phải cung cấp query không rỗng');
    return { kind: 'web_search', query };
  }
  if (action === 'web_read') {
    const url = readText_ACU(payload.url);
    if (!url) failProtocol_ACU('web_read phải cung cấp url không rỗng');
    return { kind: 'web_read', url };
  }
  failProtocol_ACU(`Hành động công cụ ra mạng phải là ${AGENT_WEB_TOOL_ACTIONS_ACU.join(' / ')}, thực nhận: ${action || '(rỗng)'}`);
}

function isWebToolAction_ACU(action: string): boolean {
  return (AGENT_WEB_TOOL_ACTIONS_ACU as readonly string[]).includes(action);
}

/**
 * 从 web-researcher 输出里提取工具并发批次：本地 read/search 与四种出网工具混排。
 * @returns 工具调用列表；输出里没有任何工具对象时返回 null（应按契约解析）
 */
export function parseAgentResearcherToolCalls_ACU(raw: string | null | undefined, prefill: string): Array<AgentToolCall_ACU | AgentWebToolCall_ACU> | null {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) return null;
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  for (const candidate of candidates) {
    const records = parseObjectsFrom_ACU(candidate);
    const toolRecords = records.filter(parsed => {
      const action = readText_ACU(parsed.action);
      return action === 'read' || action === 'search' || isWebToolAction_ACU(action);
    });
    if (toolRecords.length) {
      return toolRecords.slice(0, AGENT_TOOL_BATCH_LIMIT_ACU).map(record => (
        isWebToolAction_ACU(readText_ACU(record.action)) ? parseAgentWebToolCall_ACU(record) : parseAgentToolCall_ACU(record)
      ));
    }
    if (records.length) return null;
  }
  return null;
}

/**
 * 提取 web-researcher 为已读网页写下的精炼工作笔记。网页正文不进子代理历史；
 * 下一次工具动作须把从上一批网页获得的事实写入 notes，运行时仅保留这部分。
 */
export function parseAgentResearcherWorkingNotes_ACU(raw: string | null | undefined, prefill: string): string[] {
  const text = normalizeModelText_ACU(raw);
  if (!text.trim()) return [];
  const looksComplete = stripMarkdownFences_ACU(text).startsWith('{');
  const candidates = looksComplete || !prefill ? [text, `${prefill}${text}`] : [`${prefill}${text}`, text];
  for (const candidate of candidates) {
    const records = parseObjectsFrom_ACU(candidate);
    const notes: string[] = [];
    for (const record of records) {
      const action = readText_ACU(record.action);
      if (!action || (!isWebToolAction_ACU(action) && action !== 'read' && action !== 'search')) continue;
      const rawNotes = record.notes ?? record.workingNotes;
      const items = Array.isArray(rawNotes) ? rawNotes : [rawNotes];
      for (const item of items) {
        const note = readText_ACU(item);
        if (note) notes.push(note.length > 800 ? `${note.slice(0, 800)}…` : note);
      }
    }
    if (notes.length || records.length) return [...new Set(notes)].slice(0, 12);
  }
  return [];
}

/** web-researcher 契约里的单条写集（pageRef 尚未回填）。 */
export interface AgentResearcherDraftItem_ACU {
  action: 'upsert' | 'retire';
  id: string;
  pageRef: string;
  title: string;
  tags: string[];
  brief: string;
  summary: string;
  reason: string;
}

export interface AgentResearcherDraft_ACU {
  summary: string;
  expectedRevision: number | undefined;
  items: AgentResearcherDraftItem_ACU[];
  /** 栏级修补（pageRef 可选，给了才回填来源字段）。 */
  patches: AgentWebRefPatch_ACU[];
}

/**
 * 解析 web-researcher 的契约输出（回填前）。每条资料以一个实体分份，固定字段只有
 * name（名称）与 brief（一句话简介）；detail 自由发挥。upsert 必须带 pageRef、name、brief；
 * patch 至少带一个要改的字段，pageRef 只在需要换来源时给；retire 必须带 id 与 reason。
 * @param payload 已解析的 JSON 载荷
 */
export function parseAgentResearcherOutput_ACU(payload: Record<string, unknown>): AgentResearcherDraft_ACU {
  const normalizedPayload = normalizeResearcherSqlPayload_ACU(payload);
  const rawDelta = isRecord_ACU(normalizedPayload.delta) ? normalizedPayload.delta : normalizedPayload;
  const expectedRevision = parseWebRefsExpectedRevision_ACU(rawDelta.expectedRevisions ?? normalizedPayload.expectedRevisions);
  const summary = readText_ACU(normalizedPayload.summary);
  const list = rawDelta.webRefs ?? rawDelta.entries ?? rawDelta.items;
  if (list === undefined || list === null) {
    return { summary, expectedRevision, items: [], patches: [] };
  }
  if (!Array.isArray(list)) failProtocol_ACU('delta.webRefs phải là mảng');
  const items: AgentResearcherDraftItem_ACU[] = [];
  const patches: AgentWebRefPatch_ACU[] = [];
  list.forEach((raw, index) => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delta.webRefs[${index}] phải là đối tượng`);
    const actionText = readText_ACU(raw.action) || 'upsert';
    if (actionText === 'patch') {
      const id = readText_ACU(raw.id);
      if (!id) failProtocol_ACU(`patch của delta.webRefs[${index}] cần id`);
      const patch: AgentWebRefPatch_ACU = { id };
      const pageRef = readText_ACU(raw.pageRef ?? raw.page ?? raw.ref);
      if (pageRef) patch.pageRef = pageRef;
      const title = readText_ACU(raw.name ?? raw.title);
      if (title) patch.title = title;
      const brief = readText_ACU(raw.brief ?? raw.intro ?? raw.oneLine);
      if (brief) patch.brief = brief;
      if (raw.tags !== undefined) patch.tags = readTextList_ACU(raw.tags);
      const detailRaw = raw.detail ?? raw.summary ?? raw.body;
      if (detailRaw !== undefined) patch.summary = typeof detailRaw === 'string' ? detailRaw.trim() : (detailRaw && typeof detailRaw === 'object' ? JSON.stringify(detailRaw, null, 1) : '');
      if (Object.keys(patch).length === 1) failProtocol_ACU(`patch của delta.webRefs[${index}] phải kèm ít nhất một trường cần sửa`);
      patches.push(patch);
      return;
    }
    if (actionText !== 'upsert' && actionText !== 'retire') failProtocol_ACU(`delta.webRefs[${index}].action phải là upsert / patch / retire`);
    const action = actionText as 'upsert' | 'retire';
    const id = readText_ACU(raw.id);
    if (action === 'retire') {
      if (!id) failProtocol_ACU(`retire của delta.webRefs[${index}] cần id`);
      items.push({ action, id, pageRef: '', title: '', tags: [], brief: '', summary: '', reason: readText_ACU(raw.reason) });
      return;
    }
    const pageRef = readText_ACU(raw.pageRef ?? raw.page ?? raw.ref);
    if (!pageRef) failProtocol_ACU(`upsert của delta.webRefs[${index}] phải kèm pageRef (handle trang trong kết quả công cụ, như P1); không cho phép tự viết url hoặc nguyên văn`);
    const title = readText_ACU(raw.name ?? raw.title);
    if (!title) failProtocol_ACU(`name của delta.webRefs[${index}] (pageRef=${pageRef}) không được rỗng: hãy ghi tên thực thể ứng với tư liệu này (nhân vật / vật phẩm / phép thuật / sự kiện...)`);
    const brief = readText_ACU(raw.brief ?? raw.intro ?? raw.oneLine);
    if (!brief) failProtocol_ACU(`brief của delta.webRefs[${index}] "${title}" không được rỗng: nói rõ nó là gì trong một câu`);
    const detailRaw = raw.detail ?? raw.summary ?? raw.body;
    const detail = typeof detailRaw === 'string' ? detailRaw.trim() : (detailRaw && typeof detailRaw === 'object' ? JSON.stringify(detailRaw, null, 1) : '');
    items.push({ action, id, pageRef, title, tags: readTextList_ACU(raw.tags), brief, summary: detail, reason: '' });
  });
  return { summary, expectedRevision, items, patches };
}

function parseWebRefsExpectedRevision_ACU(value: unknown): number | undefined {
  if (!isRecord_ACU(value)) return undefined;
  const raw = value.webRefs;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

/**
 * 解析主 Agent 的一次协议动作。
 * @param payload 已解析的 JSON 载荷
 * @param allowDelegate 本轮是否仍允许派工（预算最后一轮为 false）
 * @returns 判别联合形式的动作对象
 */
export function parseAgentMainAction_ACU(payload: Record<string, unknown>, allowDelegate: boolean): AgentMainAction_ACU {
  const action = readText_ACU(payload.action);
  const thought = readText_ACU(payload.thought);
  if (action === 'delegate') {
    if (!allowDelegate) failProtocol_ACU('Lượt này là lượt cuối của ngân sách, delegate đã bị tắt, phải xuất finalize hoặc block');
    return { kind: 'delegate', thought, delegations: parseDelegations_ACU(payload.delegations) };
  }
  if (action === 'open_round') {
    const focus = readText_ACU(payload.focus).trim();
    if (!focus) failProtocol_ACU('Hành động open_round phải cung cấp focus không rỗng');
    return {
      kind: 'open_round',
      thought,
      focus,
      summary: readText_ACU(payload.summary),
      dispatchWebResearcher: payload.dispatchWebResearcher === true,
    };
  }
  if (action === 'adjust_progress') {
    const allowed = ['action', 'thought', 'reason', 'stageId', 'revision', 'nextTurnId', 'completeStage'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) failProtocol_ACU('adjust_progress chứa tham số chưa khai báo');
    const reason = readText_ACU(payload.reason).trim();
    const stageId = readText_ACU(payload.stageId).trim();
    const revision = payload.revision;
    const nextTurnId = payload.nextTurnId;
    const completeStage = payload.completeStage;
    if (!reason || !stageId) failProtocol_ACU('adjust_progress phải cung cấp reason và stageId không rỗng');
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) failProtocol_ACU('revision phải là số nguyên dương');
    if (nextTurnId !== undefined && (typeof nextTurnId !== 'string' || !nextTurnId.trim())) failProtocol_ACU('nextTurnId phải là ID lượt không rỗng');
    if (completeStage !== undefined && typeof completeStage !== 'boolean') failProtocol_ACU('completeStage phải là giá trị boolean');
    if ((nextTurnId !== undefined) === (completeStage !== undefined)) failProtocol_ACU('nextTurnId và completeStage phải và chỉ được cho một trong hai');
    return { kind: 'adjust_progress', thought, reason, stageId, revision: revision as number,
      ...(typeof nextTurnId === 'string' ? { nextTurnId: nextTurnId.trim() } : { completeStage: completeStage as boolean }),
    };
  }
  if (action === 'correct_materials') {
    const allowed = ['action', 'thought', 'reason', 'sql', 'settlementStartIndex', 'userMessageId'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) failProtocol_ACU('correct_materials chứa tham số chưa khai báo');
    const reason = readText_ACU(payload.reason).trim();
    const sql = readText_ACU(payload.sql).trim();
    const start = payload.settlementStartIndex;
    const user = payload.userMessageId;
    if (!reason || (!sql && start === undefined)) {
      const state = (value: unknown): string => value === undefined ? 'missing'
        : value === null ? 'null' : typeof value !== 'string' ? `type:${typeof value}`
          : value.trim() ? 'nonempty' : 'empty';
      failProtocol_ACU(`correct_materials phải cung cấp reason cùng sql hoặc settlementStartIndex; trạng thái trường thực tế: reason=${state(payload.reason)}, sql=${state(payload.sql)}, settlementStartIndex=${start === undefined ? 'missing' : typeof start}. `
        + 'reason và sql phải là chuỗi không rỗng ở cấp cao nhất của hành động; chữ suy nghĩ không được tính là tham số. '
        + 'Khi không có chỉnh sửa nghiệp vụ thì dùng open_round, không dùng SQL rỗng hay điểm truy ngược hư cấu.');
    }
    if (payload.sql !== undefined && (typeof payload.sql !== 'string' || !sql)) failProtocol_ACU('sql phải là chuỗi không rỗng');
    if (start !== undefined && (typeof start !== 'number' || !Number.isInteger(start) || start < 0)) failProtocol_ACU('settlementStartIndex phải là số nguyên không âm');
    if (start !== undefined && (typeof user !== 'number' || !Number.isInteger(user) || user < 1)) failProtocol_ACU('Thay đổi điểm truy ngược phải trích dẫn userMessageId của tin nhắn người dùng thật');
    if (start === undefined && user !== undefined) failProtocol_ACU('userMessageId chỉ được cung cấp cùng settlementStartIndex');
    return { kind: 'correct_materials', thought, reason,
      ...(sql ? { sql } : {}),
      ...(start !== undefined ? { settlementStartIndex: start as number, userMessageId: user as number } : {}),
    };
  }
  if (action === 'finalize') {
    const instruction = readText_ACU(payload.instruction);
    if (!instruction) failProtocol_ACU('Hành động finalize phải cung cấp instruction không rỗng');
    const rawConstraints = payload.constraints;
    let constraints: { add: string[]; retire: string[] } | null = null;
    if (isRecord_ACU(rawConstraints)) {
      // 兼容旧全量形态：current 视为「确保存在」（已存在的条目由事务层幂等跳过），retired 同 retire。
      const add = [...new Set([...readTextList_ACU(rawConstraints.add), ...readTextList_ACU(rawConstraints.current)])];
      const retire = [...new Set([...readTextList_ACU(rawConstraints.retire), ...readTextList_ACU(rawConstraints.retired)])];
      if (add.length || retire.length) constraints = { add, retire };
    }
    return { kind: 'finalize', thought, instruction, summary: readText_ACU(payload.summary), constraints };
  }
  if (action === 'block') {
    const reason = readText_ACU(payload.reason);
    if (!reason) failProtocol_ACU('Hành động block phải cung cấp reason');
    return { kind: 'block', thought, reason, unresolved: readTextList_ACU(payload.unresolved) };
  }
  if (action === 'read' || action === 'search') {
    return { kind: 'tools', thought, calls: [parseAgentToolCall_ACU(payload)] };
  }
  failProtocol_ACU(`action phải là một trong read / search / delegate / open_round / correct_materials / adjust_progress / finalize / block; sửa tổng cương có thể dùng correct_materials hoặc delegate arc-architect, sửa dàn ý giai đoạn thì delegate riêng outline-architect, thực nhận: ${action || '(rỗng)'}`);
}

export function parseAgentComposerOutput_ACU(payload: Record<string, unknown>): AgentComposerOutput_ACU {
  const instruction = readText_ACU(payload.instruction).trim();
  if (!instruction) failProtocol_ACU('instruction-composer phải cung cấp instruction không rỗng');
  const rawConstraints = payload.constraints;
  let constraints: { add: string[]; retire: string[] } | null = null;
  if (isRecord_ACU(rawConstraints)) {
    const add = readTextList_ACU(rawConstraints.add);
    const retire = readTextList_ACU(rawConstraints.retire);
    if (add.length || retire.length) constraints = { add, retire };
  }
  return { instruction, summary: readText_ACU(payload.summary), constraints };
}

function parseCharacterKnowledge_ACU(value: unknown): AgentInfoGapDeltaItem_ACU['characterKnowledge'] {
  const knowledge = Array.isArray(value) ? value : [];
  return knowledge.flatMap(item => {
    if (!isRecord_ACU(item)) return [];
    const name = readText_ACU(item.name);
    return name ? [{ name, knows: readText_ACU(item.knows) }] : [];
  });
}

function parseHookPatch_ACU(raw: Record<string, unknown>, index: number): AgentHookPatch_ACU {
  const id = readText_ACU(raw.id);
  if (!id) failProtocol_ACU(`patch của delta.hooks[${index}] cần id`);
  const patch: AgentHookPatch_ACU = { id };
  if (typeof raw.summary === 'string' && raw.summary.trim()) patch.summary = raw.summary.trim();
  const status = readText_ACU(raw.status);
  if (status) {
    if (!(AGENT_HOOK_STATUSES_ACU as readonly string[]).includes(status)) failProtocol_ACU(`patch.status của delta.hooks[${index}] không hợp lệ: ${status}`, { field: 'status' });
    patch.status = status as AgentHookPatch_ACU['status'];
  }
  const importance = readText_ACU(raw.importance);
  if (importance) {
    if (!(AGENT_HOOK_IMPORTANCES_ACU as readonly string[]).includes(importance)) failProtocol_ACU(`patch.importance của delta.hooks[${index}] không hợp lệ: ${importance}`, { field: 'importance' });
    patch.importance = importance as AgentHookPatch_ACU['importance'];
  }
  if (typeof raw.plannedPayoff === 'string') patch.plannedPayoff = raw.plannedPayoff.trim();
  if (Object.keys(patch).length === 1) failProtocol_ACU(`patch của delta.hooks[${index}] phải kèm ít nhất một trường cần sửa`, { rejectionKind: 'empty_patch' });
  return patch;
}

function parseInfoGapPatch_ACU(raw: Record<string, unknown>, index: number): AgentInfoGapPatch_ACU {
  const id = readText_ACU(raw.id);
  if (!id) failProtocol_ACU(`patch của delta.infoGap[${index}] cần id`);
  const patch: AgentInfoGapPatch_ACU = { id };
  if (typeof raw.topic === 'string' && raw.topic.trim()) patch.topic = raw.topic.trim();
  if (typeof raw.objectiveFact === 'string') patch.objectiveFact = raw.objectiveFact.trim();
  if (typeof raw.readerKnown === 'string') patch.readerKnown = raw.readerKnown.trim();
  if (Array.isArray(raw.characterKnowledge)) patch.characterKnowledge = parseCharacterKnowledge_ACU(raw.characterKnowledge);
  const revealStatus = readText_ACU(raw.revealStatus);
  if (revealStatus) {
    if (!(AGENT_REVEAL_STATUSES_ACU as readonly string[]).includes(revealStatus)) failProtocol_ACU(`patch.revealStatus của delta.infoGap[${index}] không hợp lệ: ${revealStatus}`, { field: 'revealStatus' });
    patch.revealStatus = revealStatus as AgentInfoGapPatch_ACU['revealStatus'];
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'revealIndex')) {
    if (raw.revealIndex === null) patch.revealIndex = null;
    else if (typeof raw.revealIndex === 'number' && Number.isInteger(raw.revealIndex) && raw.revealIndex >= 0) patch.revealIndex = raw.revealIndex;
    else failProtocol_ACU(`patch.revealIndex của delta.infoGap[${index}] phải là số nguyên không âm hoặc null`, { field: 'revealIndex' });
  }
  if (Object.keys(patch).length === 1) failProtocol_ACU(`patch của delta.infoGap[${index}] phải kèm ít nhất một trường cần sửa`, { rejectionKind: 'empty_patch' });
  return patch;
}

/** 契约里单条被拒的条目：合法条目已收下，只有这些需要模型重发。 */
export interface AgentContractRejection_ACU {
  module: 'hooks' | 'infoGap' | 'storyArc' | 'chronology';
  index: number;
  id: string;
  reason: string;
  field?: string;
  rejectionKind?: 'empty_patch';
  revision?: number;
}

type RejectionSink_ACU = AgentContractRejection_ACU[] | undefined;

/**
 * 逐条解析时的收集包装：给了 sink 就把单条协议错误记下并跳过该条，没给就按原样抛出。
 * 数组本身不是数组这类结构错误不在此范围，始终抛出。
 */
function collectItem_ACU(sink: RejectionSink_ACU, module: AgentContractRejection_ACU['module'], index: number, raw: unknown, parse: () => void): void {
  try {
    parse();
  } catch (error) {
    if (!sink || !(error instanceof ContinuationValidationError_ACU) || error.error.code !== 'CONTINUATION_AGENT_PROTOCOL_INVALID') throw error;
    const details = error.error.details;
    sink.push({ module, index, id: isRecord_ACU(raw) ? readText_ACU(raw.id) : '', reason: error.error.message,
      ...(typeof details?.field === 'string' ? { field: details.field } : {}),
      ...(details?.rejectionKind === 'empty_patch' && isRecord_ACU(raw)
        && Object.keys(raw).every(key => key === 'action' || key === 'id')
        ? { rejectionKind: 'empty_patch' as const } : {}) });
  }
}

function parseHookItems_ACU(value: unknown, rejected?: RejectionSink_ACU): { items: AgentHookDeltaItem_ACU[]; patches: AgentHookPatch_ACU[] } {
  if (value === undefined || value === null) return { items: [], patches: [] };
  if (!Array.isArray(value)) failProtocol_ACU('delta.hooks phải là mảng');
  const items: AgentHookDeltaItem_ACU[] = [];
  const patches: AgentHookPatch_ACU[] = [];
  value.forEach((raw, index) => collectItem_ACU(rejected, 'hooks', index, raw, () => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delta.hooks[${index}] phải là đối tượng`);
    const action = readText_ACU(raw.action);
    if (action === 'patch') { patches.push(parseHookPatch_ACU(raw, index)); return; }
    if (action !== 'upsert' && action !== 'retire') failProtocol_ACU(`delta.hooks[${index}].action phải là upsert / patch / retire`);
    const status = readText_ACU(raw.status);
    const importance = readText_ACU(raw.importance);
    items.push({
      action,
      id: readText_ACU(raw.id),
      summary: readText_ACU(raw.summary),
      status: ((AGENT_HOOK_STATUSES_ACU as readonly string[]).includes(status) ? status : 'planted') as AgentHookDeltaItem_ACU['status'],
      importance: ((AGENT_HOOK_IMPORTANCES_ACU as readonly string[]).includes(importance) ? importance : 'mid') as AgentHookDeltaItem_ACU['importance'],
      plantedIndex: typeof raw.plantedIndex === 'number' && Number.isInteger(raw.plantedIndex) && raw.plantedIndex >= 0 ? raw.plantedIndex : -1,
      plannedPayoff: readText_ACU(raw.plannedPayoff),
      reason: readText_ACU(raw.reason),
    });
  }));
  return { items, patches };
}

function parseInfoGapItems_ACU(value: unknown, rejected?: RejectionSink_ACU): { items: AgentInfoGapDeltaItem_ACU[]; patches: AgentInfoGapPatch_ACU[] } {
  if (value === undefined || value === null) return { items: [], patches: [] };
  if (!Array.isArray(value)) failProtocol_ACU('delta.infoGap phải là mảng');
  const items: AgentInfoGapDeltaItem_ACU[] = [];
  const patches: AgentInfoGapPatch_ACU[] = [];
  value.forEach((raw, index) => collectItem_ACU(rejected, 'infoGap', index, raw, () => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delta.infoGap[${index}] phải là đối tượng`);
    const action = readText_ACU(raw.action);
    if (action === 'patch') { patches.push(parseInfoGapPatch_ACU(raw, index)); return; }
    if (action !== 'upsert' && action !== 'retire') failProtocol_ACU(`delta.infoGap[${index}].action phải là upsert / patch / retire`);
    const revealStatus = readText_ACU(raw.revealStatus);
    items.push({
      action,
      id: readText_ACU(raw.id),
      topic: readText_ACU(raw.topic),
      objectiveFact: readText_ACU(raw.objectiveFact),
      readerKnown: readText_ACU(raw.readerKnown),
      characterKnowledge: parseCharacterKnowledge_ACU(raw.characterKnowledge),
      revealStatus: ((AGENT_REVEAL_STATUSES_ACU as readonly string[]).includes(revealStatus) ? revealStatus : 'unrevealed') as AgentInfoGapDeltaItem_ACU['revealStatus'],
      revealIndex: typeof raw.revealIndex === 'number' && Number.isInteger(raw.revealIndex) && raw.revealIndex >= 0 ? raw.revealIndex : null,
      reason: readText_ACU(raw.reason),
    });
  }));
  return { items, patches };
}

function parseStageNumbers_ACU(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) failProtocol_ACU(`${path} phải là mảng số hiệu giai đoạn`);
  return value.map(item => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 1) failProtocol_ACU(`phần tử của ${path} phải là số hiệu giai đoạn nguyên bắt đầu từ 1, thực nhận: ${JSON.stringify(item)}`);
    return item;
  });
}

function parseTargetStageRange_ACU(value: unknown, path: string): { min: number; max: number } {
  if (!isRecord_ACU(value)) failProtocol_ACU(`${path} phải là đối tượng chứa min / max`);
  const { min, max } = value;
  if (!Number.isInteger(min) || (min as number) < 1 || !Number.isInteger(max) || (max as number) < 1) {
    failProtocol_ACU(`${path}.min / max phải là số nguyên bắt đầu từ 1`);
  }
  if ((min as number) > (max as number)) failProtocol_ACU(`${path}.min không được lớn hơn max`);
  return { min: min as number, max: max as number };
}

function parseStoryArcTextList_ACU(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) failProtocol_ACU(`${path} phải là mảng chuỗi`);
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) failProtocol_ACU(`${path}[${index}] phải là chuỗi không rỗng`);
    return item.trim();
  });
}

function parseNarrativeRole_ACU(value: unknown, path: string): AgentStoryArcPatch_ACU['narrativeRole'] {
  const role = readText_ACU(value);
  if (!(AGENT_VOLUME_NARRATIVE_ROLES_ACU as readonly string[]).includes(role)) {
    failProtocol_ACU(`${path} phải là ${AGENT_VOLUME_NARRATIVE_ROLES_ACU.join(' / ')}, thực nhận: ${role || '(rỗng)'}`);
  }
  return role as AgentStoryArcPatch_ACU['narrativeRole'];
}

function parseStoryArcPatch_ACU(raw: Record<string, unknown>, index: number): AgentStoryArcPatch_ACU {
  const id = readText_ACU(raw.id);
  if (!id) failProtocol_ACU(`patch của delta.storyArc[${index}] cần id`);
  const patch: AgentStoryArcPatch_ACU = { id };
  if (typeof raw.title === 'string' && raw.title.trim()) patch.title = raw.title.trim();
  if (typeof raw.direction === 'string' && raw.direction.trim()) patch.direction = raw.direction.trim();
  if (typeof raw.escalation === 'string') patch.escalation = raw.escalation.trim();
  if (typeof raw.withheld === 'string') patch.withheld = raw.withheld.trim();
  const status = readText_ACU(raw.status);
  if (status) {
    if (!(AGENT_STORY_ARC_STATUSES_ACU as readonly string[]).includes(status)) failProtocol_ACU(`patch.status của delta.storyArc[${index}] không hợp lệ: ${status}, chỉ được là ${AGENT_STORY_ARC_STATUSES_ACU.join(' / ')}`, { field: 'status' });
    patch.status = status as AgentStoryArcPatch_ACU['status'];
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'stageNumbers')) patch.stageNumbers = parseStageNumbers_ACU(raw.stageNumbers, `delta.storyArc[${index}].stageNumbers`);
  if (Object.prototype.hasOwnProperty.call(raw, 'completionStageNumber')) {
    const value = raw.completionStageNumber;
    if (value !== null && (!Number.isInteger(value) || (value as number) < 1)) {
      failProtocol_ACU(`delta.storyArc[${index}].completionStageNumber phải là số nguyên bắt đầu từ 1 hoặc null`);
    }
    patch.completionStageNumber = value as number | null;
  }
  if (typeof raw.completionState === 'string') patch.completionState = raw.completionState.trim();
  if (typeof raw.continuationRationale === 'string') patch.continuationRationale = raw.continuationRationale.trim();
  if (Object.prototype.hasOwnProperty.call(raw, 'narrativeRole')) patch.narrativeRole = parseNarrativeRole_ACU(raw.narrativeRole, `delta.storyArc[${index}].narrativeRole`);
  if (Object.prototype.hasOwnProperty.call(raw, 'targetStageRange')) patch.targetStageRange = parseTargetStageRange_ACU(raw.targetStageRange, `delta.storyArc[${index}].targetStageRange`);
  for (const key of ['targetTimeSpan', 'progressCeiling', 'completionRationale'] as const) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      if (typeof raw[key] !== 'string') failProtocol_ACU(`delta.storyArc[${index}].${key} phải là chuỗi`);
      patch[key] = raw[key].trim();
    }
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'sustainingThreads')) patch.sustainingThreads = parseStoryArcTextList_ACU(raw.sustainingThreads, `delta.storyArc[${index}].sustainingThreads`);
  if (Object.prototype.hasOwnProperty.call(raw, 'payoffTargets')) patch.payoffTargets = parseStoryArcTextList_ACU(raw.payoffTargets, `delta.storyArc[${index}].payoffTargets`);
  if (Object.keys(patch).length === 1) failProtocol_ACU(`patch của delta.storyArc[${index}] phải kèm ít nhất một trường cần sửa`, { rejectionKind: 'empty_patch' });
  return patch;
}

function parseStoryArcItems_ACU(value: unknown, rejected?: RejectionSink_ACU): { items: AgentStoryArcDeltaItem_ACU[]; patches: AgentStoryArcPatch_ACU[] } {
  if (value === undefined || value === null) return { items: [], patches: [] };
  if (!Array.isArray(value)) failProtocol_ACU('delta.storyArc phải là mảng');
  const items: AgentStoryArcDeltaItem_ACU[] = [];
  const patches: AgentStoryArcPatch_ACU[] = [];
  value.forEach((raw, index) => collectItem_ACU(rejected, 'storyArc', index, raw, () => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delta.storyArc[${index}] phải là đối tượng`);
    const action = readText_ACU(raw.action);
    if (action === 'patch') { patches.push(parseStoryArcPatch_ACU(raw, index)); return; }
    if (action !== 'upsert' && action !== 'retire') failProtocol_ACU(`delta.storyArc[${index}].action phải là upsert / patch / retire`);
    const scope = readText_ACU(raw.scope);
    // scope 决定这条是全书方向还是卷台阶，写错会让唯一性约束落在错误的层级上，不能静默回落。
    if (action === 'upsert' && !(AGENT_STORY_ARC_SCOPES_ACU as readonly string[]).includes(scope)) {
      failProtocol_ACU(`delta.storyArc[${index}].scope phải là ${AGENT_STORY_ARC_SCOPES_ACU.join(' / ')}, thực nhận: ${scope || '(rỗng)'}`);
    }
    const status = readText_ACU(raw.status);
    if (action === 'upsert' && status && !(AGENT_STORY_ARC_STATUSES_ACU as readonly string[]).includes(status)) {
      failProtocol_ACU(`delta.storyArc[${index}].status phải là ${AGENT_STORY_ARC_STATUSES_ACU.join(' / ')}, thực nhận: ${status}`);
    }
    items.push({
      action,
      id: readText_ACU(raw.id),
      scope: (scope || 'volume') as AgentStoryArcDeltaItem_ACU['scope'],
      title: readText_ACU(raw.title),
      direction: readText_ACU(raw.direction),
      escalation: readText_ACU(raw.escalation),
      withheld: readText_ACU(raw.withheld),
      status: (status || 'planned') as AgentStoryArcDeltaItem_ACU['status'],
      statusProvided: !!status,
      stageNumbers: raw.stageNumbers === undefined ? [] : parseStageNumbers_ACU(raw.stageNumbers, `delta.storyArc[${index}].stageNumbers`),
      completionStageNumber: raw.completionStageNumber === undefined || raw.completionStageNumber === null ? null : (typeof raw.completionStageNumber === 'number' && Number.isInteger(raw.completionStageNumber) && raw.completionStageNumber >= 1 ? raw.completionStageNumber : failProtocol_ACU(`delta.storyArc[${index}].completionStageNumber phải là số nguyên bắt đầu từ 1 hoặc null`)),
      completionState: readText_ACU(raw.completionState),
      continuationRationale: readText_ACU(raw.continuationRationale),
      narrativeRole: raw.narrativeRole === undefined ? undefined : parseNarrativeRole_ACU(raw.narrativeRole, `delta.storyArc[${index}].narrativeRole`),
      targetStageRange: raw.targetStageRange === undefined ? undefined : parseTargetStageRange_ACU(raw.targetStageRange, `delta.storyArc[${index}].targetStageRange`),
      targetTimeSpan: raw.targetTimeSpan === undefined
        ? undefined
        : (typeof raw.targetTimeSpan === 'string'
          ? raw.targetTimeSpan.trim()
          : failProtocol_ACU(`delta.storyArc[${index}].targetTimeSpan phải là chuỗi`)),
      progressCeiling: raw.progressCeiling === undefined
        ? undefined
        : (typeof raw.progressCeiling === 'string'
          ? raw.progressCeiling.trim()
          : failProtocol_ACU(`delta.storyArc[${index}].progressCeiling phải là chuỗi`)),
      sustainingThreads: raw.sustainingThreads === undefined ? undefined : parseStoryArcTextList_ACU(raw.sustainingThreads, `delta.storyArc[${index}].sustainingThreads`),
      payoffTargets: raw.payoffTargets === undefined ? undefined : parseStoryArcTextList_ACU(raw.payoffTargets, `delta.storyArc[${index}].payoffTargets`),
      completionRationale: raw.completionRationale === undefined
        ? undefined
        : (typeof raw.completionRationale === 'string'
          ? raw.completionRationale.trim()
          : failProtocol_ACU(`delta.storyArc[${index}].completionRationale phải là chuỗi`)),
      reason: readText_ACU(raw.reason),
    });
  }));
  return { items, patches };
}

function parseChronologyEvidenceIndexes_ACU(value: unknown, path: string): number[] {
  if (!Array.isArray(value) || !value.length) {
    failProtocol_ACU(`${path} phải là mảng không rỗng: mỗi sự thật thời gian đều phải trích dẫn tầng chính văn thật`);
  }
  const evidenceIndexes = value.map(item => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0) {
      failProtocol_ACU(`phần tử của ${path} phải là số tầng nguyên không âm, thực nhận: ${JSON.stringify(item)}`);
    }
    return item;
  });
  return [...new Set(evidenceIndexes)].sort((left, right) => left - right);
}

/** 年代学栏级修补：只带要改的字段，至少一栏；precision 与证据的合法性与 upsert 同一标准。 */
function parseChronologyPatch_ACU(raw: Record<string, unknown>, index: number): AgentChronologyPatch_ACU {
  const id = readText_ACU(raw.id);
  if (!id) failProtocol_ACU(`patch của delta.chronology[${index}] cần id`);
  const patch: AgentChronologyPatch_ACU = { id };
  if (typeof raw.anchor === 'string' && raw.anchor.trim()) patch.anchor = raw.anchor.trim();
  if (typeof raw.elapsed === 'string' && raw.elapsed.trim()) patch.elapsed = raw.elapsed.trim();
  if (typeof raw.transition === 'string' && raw.transition.trim()) patch.transition = raw.transition.trim();
  const precision = readText_ACU(raw.precision);
  if (precision) {
    if (!(AGENT_CHRONOLOGY_PRECISIONS_ACU as readonly string[]).includes(precision)) {
      failProtocol_ACU(`patch.precision của delta.chronology[${index}] phải là ${AGENT_CHRONOLOGY_PRECISIONS_ACU.join(' / ')}, thực nhận: ${precision}`, { field: 'precision' });
    }
    patch.precision = precision as AgentChronologyPatch_ACU['precision'];
  }
  if (raw.evidenceIndexes !== undefined) patch.evidenceIndexes = parseChronologyEvidenceIndexes_ACU(raw.evidenceIndexes, `patch.evidenceIndexes của delta.chronology[${index}]`);
  if (Object.keys(patch).length === 1) failProtocol_ACU(`patch của delta.chronology[${index}] phải kèm ít nhất một trường cần sửa`, { rejectionKind: 'empty_patch' });
  return patch;
}

/**
 * 解析年代学写集。时间事实的登记契约是硬边界：非法 action、非法 precision、非空必填
 * 文本缺失、证据数组为空或含非整数楼层都必须拒绝——把坏时间记录静默降级会污染后续
 * 每一次时间一致性审查的基准。
 */
function parseChronologyItems_ACU(value: unknown, rejected?: RejectionSink_ACU): { items: AgentChronologyDeltaItem_ACU[]; patches: AgentChronologyPatch_ACU[] } {
  if (value === undefined || value === null) return { items: [], patches: [] };
  if (!Array.isArray(value)) failProtocol_ACU('delta.chronology phải là mảng');
  const items: AgentChronologyDeltaItem_ACU[] = [];
  const patches: AgentChronologyPatch_ACU[] = [];
  value.forEach((raw, index) => collectItem_ACU(rejected, 'chronology', index, raw, () => {
    if (!isRecord_ACU(raw)) failProtocol_ACU(`delta.chronology[${index}] phải là đối tượng`);
    const action = readText_ACU(raw.action);
    if (action === 'patch') { patches.push(parseChronologyPatch_ACU(raw, index)); return; }
    if (action !== 'upsert' && action !== 'retire') failProtocol_ACU(`delta.chronology[${index}].action phải là upsert / patch / retire, thực nhận: ${action || '(rỗng)'}`);
    const id = readText_ACU(raw.id);
    if (!id) failProtocol_ACU(`delta.chronology[${index}] cần id không rỗng`);
    if (action === 'retire') {
      items.push({ action, id, anchor: readText_ACU(raw.anchor), elapsed: readText_ACU(raw.elapsed), precision: 'unknown' as const, transition: readText_ACU(raw.transition), evidenceIndexes: [] as number[], reason: readText_ACU(raw.reason) });
      return;
    }
    const anchor = readText_ACU(raw.anchor);
    const elapsed = readText_ACU(raw.elapsed);
    const transition = readText_ACU(raw.transition);
    if (!anchor) failProtocol_ACU(`delta.chronology[${index}].anchor không được rỗng: phải đưa ra mốc thời gian tương đối dùng để định vị trong chính văn`);
    if (!elapsed) failProtocol_ACU(`delta.chronology[${index}].elapsed không được rỗng: khi không thể định lượng đáng tin cậy thì ghi rõ "chưa rõ" hoặc "khoảng ..."`);
    if (!transition) failProtocol_ACU(`delta.chronology[${index}].transition không được rỗng: hãy ghi rõ chuyển đổi thời gian thực sự xảy ra từ mốc trước đến mốc này`);
    const precision = readText_ACU(raw.precision);
    if (!(AGENT_CHRONOLOGY_PRECISIONS_ACU as readonly string[]).includes(precision)) {
      failProtocol_ACU(`delta.chronology[${index}].precision phải là ${AGENT_CHRONOLOGY_PRECISIONS_ACU.join(' / ')}, thực nhận: ${precision || '(rỗng)'}`);
    }
    const evidenceIndexes = parseChronologyEvidenceIndexes_ACU(raw.evidenceIndexes, `delta.chronology[${index}].evidenceIndexes`);
    items.push({
      action,
      id,
      anchor,
      elapsed,
      precision: precision as AgentChronologyDeltaItem_ACU['precision'],
      transition,
      evidenceIndexes,
      reason: readText_ACU(raw.reason),
    });
  }));
  return { items, patches };
}

function parseExpectedRevisions_ACU(value: unknown): AgentModuleDelta_ACU['expectedRevisions'] {
  if (!isRecord_ACU(value)) return {};
  const result: AgentModuleDelta_ACU['expectedRevisions'] = {};
  for (const key of ['hooks', 'infoGap', 'constraints', 'storyArc', 'chronology', 'webRefs'] as const) {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) result[key] = raw;
  }
  return result;
}

const CONTINUATION_SQL_TABLE_MODULE_ACU = {
  hooks: 'hooks',
  info_gap: 'infoGap',
  story_arc: 'storyArc',
  chronology: 'chronology',
  web_refs: 'webRefs',
} as const;

const CONTINUATION_SQL_COLUMNS_ACU: Readonly<Record<string, ReadonlySet<string>>> = {
  hooks: new Set(['id', 'summary', 'status', 'importance', 'planted_index', 'planned_payoff', 'reason', 'expected_revision']),
  info_gap: new Set(['id', 'topic', 'objective_fact', 'reader_known', 'character_knowledge', 'reveal_status', 'reveal_index', 'reason', 'expected_revision']),
  story_arc: new Set([
    'id', 'scope', 'title', 'direction', 'escalation', 'withheld', 'status', 'stage_numbers',
    'completion_stage_number', 'completion_state', 'continuation_rationale', 'narrative_role',
    'target_stage_range', 'target_time_span', 'progress_ceiling', 'sustaining_threads',
    'payoff_targets', 'completion_rationale', 'reason', 'expected_revision',
  ]),
  chronology: new Set(['id', 'anchor', 'elapsed', 'precision', 'transition', 'evidence_indexes', 'reason', 'expected_revision']),
  web_refs: new Set(['id', 'page_ref', 'name', 'brief', 'tags', 'detail', 'reason', 'expected_revision']),
  constraint_proposals: new Set(['text']),
};

function validateContinuationSqlColumns_ACU(table: string, values: Record<string, RestrictedSqlValue_ACU>, path: string): void {
  const allowed = CONTINUATION_SQL_COLUMNS_ACU[table];
  if (!allowed) failProtocol_ACU(`Bảng SQL không nằm trong danh sách trắng ghi của viết tiếp: ${table}`);
  for (const column of Object.keys(values)) {
    if (!allowed.has(column)) failProtocol_ACU(`Trường SQL không nằm trong danh sách trắng: ${path}.${column}`);
  }
}

/** 只将已声明的 SQL 列或领域字段名归一化，未知列仍由原白名单拒绝。 */
function canonicalSqlColumn_ACU(table: string, column: string): string {
  const allowed = CONTINUATION_SQL_COLUMNS_ACU[table];
  if (!allowed || allowed.has(column)) return column;
  return [...allowed].find(key => key.replace(/_/g, '') === column
    || FIELD_SQL_COLUMNS_ACU[table]?.[key]?.toLowerCase() === column) ?? column;
}

function normalizeContinuationSqlStatement_ACU(statement: RestrictedSqlStatement_ACU): RestrictedSqlStatement_ACU {
  const normalize = (values: Record<string, RestrictedSqlValue_ACU>): Record<string, RestrictedSqlValue_ACU> => {
    const result: Record<string, RestrictedSqlValue_ACU> = {};
    for (const [column, value] of Object.entries(values)) {
      const key = canonicalSqlColumn_ACU(statement.table, column);
      if (Object.prototype.hasOwnProperty.call(result, key)) failProtocol_ACU(`Cùng một cột SQL không được ghi lặp qua các bí danh khác nhau: ${statement.table}.${key}`);
      result[key] = value;
    }
    return result;
  };
  if (statement.kind === 'insert') return { ...statement, values: normalize(statement.values) };
  if (statement.kind === 'update') return { ...statement, values: normalize(statement.values), where: normalize(statement.where) };
  return { ...statement, where: normalize(statement.where) };
}

function sqlColumnName_ACU(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function sqlProtocolValue_ACU(value: RestrictedSqlValue_ACU): unknown {
  return parseSqlJsonValue_ACU(value);
}

function sqlRecord_ACU(values: Record<string, RestrictedSqlValue_ACU>, omitted: readonly string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values)
    .filter(([key]) => !omitted.includes(key))
    .map(([key, value]) => [sqlColumnName_ACU(key), sqlProtocolValue_ACU(value)]));
}

function requireSqlText_ACU(value: RestrictedSqlValue_ACU | undefined, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) failProtocol_ACU(`SQL ${field} phải là chuỗi không rỗng`);
  return text;
}

function continuationSqlDelta_ACU(statements: readonly RestrictedSqlStatement_ACU[], role: 'maintainer' | 'researcher'): Record<string, unknown> {
  const delta: Record<string, unknown> = { expectedRevisions: {} };
  const revisions = delta.expectedRevisions as Record<string, number>;
  for (const rawStatement of statements) {
    const statement = normalizeContinuationSqlStatement_ACU(rawStatement);
    if (role === 'maintainer' && statement.table !== 'hooks' && statement.table !== 'info_gap' && statement.table !== 'story_arc' && statement.table !== 'chronology' && statement.table !== 'constraint_proposals') failProtocol_ACU(`Vai trò loại bảo trì không có quyền ghi ${statement.table}`);
    if (role === 'researcher' && statement.table !== 'web_refs') failProtocol_ACU(`web-researcher chỉ được ghi web_refs, thực nhận: ${statement.table}`);
    if (statement.kind !== 'delete') {
      validateContinuationSqlColumns_ACU(statement.table, statement.values, `${statement.table}.SET`);
      if (statement.kind === 'update' && Object.keys(statement.values).some(key => ['id', 'reason', 'expected_revision'].includes(key))) {
        failProtocol_ACU(`SET của UPDATE ${statement.table} không cho phép id, reason hoặc expected_revision`);
      }
    }
    if (statement.kind !== 'insert') {
      const allowedWhere = new Set(['id', 'expected_revision', 'reason']);
      for (const column of Object.keys(statement.where)) {
        if (!allowedWhere.has(column)) failProtocol_ACU(`Trường WHERE của SQL không nằm trong danh sách trắng: ${statement.table}.${column}`);
      }
      const requiredWhere = statement.kind === 'update' ? ['id', 'expected_revision'] : ['id', 'reason', 'expected_revision'];
      for (const column of requiredWhere) {
        if (!Object.prototype.hasOwnProperty.call(statement.where, column)) failProtocol_ACU(`SQL ${statement.table}.WHERE thiếu ${column}`);
      }
      for (const column of Object.keys(statement.where)) {
        if (!requiredWhere.includes(column)) failProtocol_ACU(`SQL ${statement.table}.WHERE không cho phép ${column}`);
      }
    }
    if (statement.table === 'constraint_proposals') {
      if (statement.kind !== 'insert') failProtocol_ACU('constraint_proposals chỉ cho phép INSERT');
      if (Object.keys(statement.values).some(key => key !== 'text')) failProtocol_ACU('constraint_proposals chỉ cho phép trường text');
      const list = (delta.constraintProposals ??= []) as unknown[];
      list.push(requireSqlText_ACU(statement.values.text, 'constraint_proposals.text'));
      continue;
    }
    const module = CONTINUATION_SQL_TABLE_MODULE_ACU[statement.table as keyof typeof CONTINUATION_SQL_TABLE_MODULE_ACU];
    if (!module) failProtocol_ACU(`Bảng SQL không nằm trong danh sách trắng ghi của viết tiếp: ${statement.table}`);
    const list = (delta[module] ??= []) as Array<Record<string, unknown>>;
    const revisionValue = statement.kind === 'insert' ? statement.values.expected_revision : statement.where.expected_revision;
    if (revisionValue !== undefined) {
      if (!Number.isInteger(revisionValue) || Number(revisionValue) < 0) failProtocol_ACU(`SQL ${statement.table}.expected_revision phải là số nguyên không âm`);
      const revision = Number(revisionValue);
      if (revisions[module] !== undefined && revisions[module] !== revision) failProtocol_ACU(`expected_revision của SQL ${statement.table} không nhất quán`);
      revisions[module] = revision;
    }
    if (statement.kind === 'insert') {
      list.push({ action: 'upsert', ...sqlRecord_ACU(statement.values, ['expected_revision']) });
    } else if (statement.kind === 'update') {
      list.push({ action: 'patch', ...sqlRecord_ACU(statement.values), id: requireSqlText_ACU(statement.where.id, `${statement.table}.WHERE id`) });
    } else {
      list.push({ action: 'retire', id: requireSqlText_ACU(statement.where.id, `${statement.table}.WHERE id`), reason: requireSqlText_ACU(statement.where.reason, `${statement.table}.WHERE reason`) });
    }
  }
  return delta;
}

/** write_sql 的逐栏意图不经过最终契约的 upsert 缺省值；不合法栏目逐栏拒绝。 */
export interface AgentModuleSqlFieldIntent_ACU {
  kind: 'insert' | 'update' | 'delete';
  module: AgentWritableModule_ACU;
  id: string;
  fields: Record<string, unknown>;
  /** 省略时由提交规划按当前模块修订号补上。新行 INSERT 会补 0。 */
  expectedRevision?: number;
  reason?: string;
  /** 仅关联本次解析内同一 INSERT 的系统字段拒绝；提交后才可绑定实际条目身份。 */
  rejectedInsertPaths?: string[];
  /** 只能由本次 web-researcher 已抓取的页面句柄回填，不允许模型手写来源。 */
  pageRef?: string;
}

export interface AgentModuleSqlFieldRejection_ACU {
  path: string;
  reason: string;
  /** 被拒系统操作的明确目标；INSERT 只能由提交口在保存并权威回读后绑定。 */
  operationOnlyTarget?: { module: AgentWritableModule_ACU; id: string; expectedRevision: number };
  /** 只关联后续纠错，不参与写入；目标必须唯一匹配且所有对应栏目均有确认回执。 */
  repairTarget?: { module: AgentWritableModule_ACU; column: string; value: RestrictedSqlValue_ACU; fields: string[] };
}

export interface AgentModuleSqlFieldParseResult_ACU {
  intents: AgentModuleSqlFieldIntent_ACU[];
  rejected: AgentModuleSqlFieldRejection_ACU[];
  constraintProposals: string[];
}

const FIELD_SQL_COLUMNS_ACU: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  hooks: { summary: 'summary', status: 'status', importance: 'importance', planted_index: 'plantedIndex', planned_payoff: 'plannedPayoff' },
  info_gap: { topic: 'topic', objective_fact: 'objectiveFact', reader_known: 'readerKnown', character_knowledge: 'characterKnowledge', reveal_status: 'revealStatus', reveal_index: 'revealIndex' },
  story_arc: {
    scope: 'scope', title: 'title', direction: 'direction', escalation: 'escalation', withheld: 'withheld', status: 'status',
    stage_numbers: 'stageNumbers', completion_stage_number: 'completionStageNumber', completion_state: 'completionState',
    continuation_rationale: 'continuationRationale', narrative_role: 'narrativeRole', target_stage_range: 'targetStageRange',
    target_time_span: 'targetTimeSpan', progress_ceiling: 'progressCeiling', sustaining_threads: 'sustainingThreads',
    payoff_targets: 'payoffTargets', completion_rationale: 'completionRationale',
  },
  chronology: { anchor: 'anchor', elapsed: 'elapsed', precision: 'precision', transition: 'transition', evidence_indexes: 'evidenceIndexes' },
  web_refs: { name: 'title', brief: 'brief', tags: 'tags', detail: 'summary', page_ref: 'pageRef' },
};

const FIELD_SQL_ROLE_TABLES_ACU: Readonly<Partial<Record<AgentModuleWriterRole_ACU, readonly string[]>>> = {
  main: ['hooks', 'info_gap', 'chronology', 'story_arc'],
  'arc-architect': ['story_arc'],
  'hook-cognition-maintainer': ['hooks', 'info_gap', 'chronology', 'constraint_proposals'],
  'web-researcher': ['web_refs'],
};

/** 一次性解析语法；语句/栏目错误归入拒绝清单，合法栏保留供提交入口独立领域校验。 */
export function parseAgentModuleSqlFieldWrites_ACU(sql: string, role: AgentModuleWriterRole_ACU): AgentModuleSqlFieldParseResult_ACU {
  const parsed = parseRestrictedSqlDmlTolerant_ACU(sql);
  if (!parsed.statements.length && !parsed.rejected.length) failProtocol_ACU('SQL giới hạn không cho phép tập ghi rỗng');
  const allowed = FIELD_SQL_ROLE_TABLES_ACU[role] ?? [];
  const result: AgentModuleSqlFieldParseResult_ACU = { intents: [], rejected: parsed.rejected.map(item => {
    const target = item.repairTarget;
    const module = target && allowed.includes(target.table)
      ? CONTINUATION_SQL_TABLE_MODULE_ACU[target.table as keyof typeof CONTINUATION_SQL_TABLE_MODULE_ACU] : undefined;
    const columns = target ? FIELD_SQL_COLUMNS_ACU[target.table] : undefined;
    const column = target ? canonicalSqlColumn_ACU(target.table, target.column) : '';
    const field = column === 'id' ? 'id' : columns?.[column];
    const fields = target ? [...new Set(target.columns.map(key => columns?.[canonicalSqlColumn_ACU(target.table, key)])
      .filter((key): key is string => !!key))] : [];
    const identifiable = module && field && ['id', 'summary', 'topic', 'title', 'anchor'].includes(field)
      && typeof target?.value === 'string' && !!target.value.trim() && fields.length > 0;
    return {
      path: `sql[${item.index}]`, reason: `SQL giới hạn phân tích thất bại, câu lệnh này chưa được ghi: ${item.reason}`,
      ...(identifiable ? { repairTarget: { module, column: field, value: target!.value, fields } } : {}),
    };
  }), constraintProposals: [] };
  parsed.statements.forEach((rawStatement, position) => {
    const index = parsed.statementIndexes[position];
    let statement: RestrictedSqlStatement_ACU;
    try { statement = normalizeContinuationSqlStatement_ACU(rawStatement); }
    catch (error) {
      result.rejected.push({ path: `sql[${index}].${rawStatement.table}`, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    const path = `sql[${index}].${statement.table}`;
    const rejectionStart = result.rejected.length;
    const reject = (field: string, reason: string) => result.rejected.push({ path: `${path}${field ? `.${field}` : ''}`, reason });
    if (!allowed.includes(statement.table)) { reject('', `Vai trò ${role} không có quyền ghi ${statement.table}`); return; }
    if (statement.table === 'constraint_proposals') {
      if (statement.kind !== 'insert' || Object.keys(statement.values).some(key => key !== 'text')
        || typeof statement.values.text !== 'string' || !statement.values.text.trim()) {
        reject('', 'constraint_proposals chỉ cho phép INSERT text không rỗng');
      } else result.constraintProposals.push(statement.values.text.trim());
      return;
    }
    const module = CONTINUATION_SQL_TABLE_MODULE_ACU[statement.table as keyof typeof CONTINUATION_SQL_TABLE_MODULE_ACU];
    const columns = FIELD_SQL_COLUMNS_ACU[statement.table];
    if (!module || !columns) { reject('', 'Bảng SQL không nằm trong danh sách trắng ghi theo cột'); return; }
    const values = statement.kind === 'delete' ? {} : statement.values;
    const where = statement.kind === 'insert' ? statement.values : statement.where;
    const expectedWhere = statement.kind === 'insert' ? null : statement.kind === 'delete' ? ['id', 'expected_revision', 'reason'] : ['id', 'expected_revision'];
    if (expectedWhere && Object.keys(where).some(key => !expectedWhere.includes(key))) { reject('WHERE', 'WHERE chứa điều kiện ngoài danh sách trắng'); return; }
    const id = where.id;
    if ((typeof id !== 'string' || !id.trim()) && statement.kind !== 'insert') { reject('id', 'Phải chỉ định ID không rỗng'); return; }
    const revision = where.expected_revision;
    if (revision !== undefined && (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0)) { reject('expected_revision', 'Phải là số nguyên không âm'); return; }
    if (statement.kind === 'delete') {
      const reason = where.reason;
      if (typeof reason !== 'string' || !reason.trim()) { reject('reason', 'Lý do cho nghỉ phải là chuỗi không rỗng'); return; }
      result.intents.push({ kind: 'delete', module, id: String(id).trim(), fields: {}, ...(typeof revision === 'number' ? { expectedRevision: revision } : {}), reason: reason.trim() });
      return;
    }
    const fields: Record<string, unknown> = {};
    let pageRef: string | undefined;
    for (const [column, raw] of Object.entries(values)) {
      if (column === 'reason') { reject(column, 'reason chỉ được dùng trong WHERE của DELETE để cho nghỉ'); continue; }
      if (column === 'id' || column === 'expected_revision') {
        if (statement.kind === 'update') reject(column, 'SET của UPDATE không được chỉ định id hoặc expected_revision');
        continue;
      }
      const field = columns[column];
      if (!field) {
        result.rejected.push({
          path: typeof id === 'string' && id.trim() && !/[.#:]/.test(id.trim())
            ? `${module}#${id.trim()}.${column}` : `${path}.${column}`,
          reason: `Cột không nằm trong danh sách trắng ghi theo cột; các cột SQL ghi được của ${statement.table}: ${Object.keys(columns).join(', ')}`,
        }); continue;
      }
      if (field === 'pageRef') {
        if (typeof raw !== 'string' || !raw.trim()) reject(column, 'page_ref phải là handle trang không rỗng của lần tải này');
        else pageRef = raw.trim();
      } else fields[field] = sqlProtocolValue_ACU(raw);
    }
    if (!Object.keys(fields).length && !pageRef) {
      reject('', 'Không có cột nào có thể nộp');
      // 只识别维护模块的已知系统字段；未知列、混合写入或非法 WHERE 仍保留拒绝。
      const systemOnly = statement.kind === 'update' && ['hooks', 'info_gap', 'chronology'].includes(statement.table)
        && Object.keys(values).length > 0
        && Object.keys(values).every(column => column === 'recent_floor' || column === 'expected_revision')
        && typeof revision === 'number';
      if (systemOnly) for (const item of result.rejected.slice(rejectionStart)) {
        if (item.path === path || item.path.startsWith(`${path}.`) || item.path.startsWith(`${module}#${String(id).trim()}.`)) {
          item.operationOnlyTarget = { module, id: String(id).trim(), expectedRevision: revision };
        }
      }
      return;
    }
    // 混合写入仍拒绝坏列；只登记明确 ID 和本语句涉及的业务栏，供后续合法提交逐栏修复。
    if (statement.kind === 'update' && ['hooks', 'info_gap', 'chronology'].includes(statement.table) && typeof id === 'string'
      && Object.keys(fields).length && !pageRef) {
      for (const item of result.rejected.slice(rejectionStart)) {
        if (item.path === `${module}#${id.trim()}.recent_floor` || item.path === `${path}.expected_revision`) {
          item.repairTarget = { module, column: 'id', value: id.trim(), fields: Object.keys(fields) };
        }
      }
    }
    const rejectedInsertPaths = statement.kind === 'insert' && ['hooks', 'info_gap', 'chronology'].includes(statement.table)
      ? result.rejected.slice(rejectionStart).filter(item => item.path === `${path}.recent_floor`
        || (typeof id === 'string' && item.path === `${module}#${id.trim()}.recent_floor`)).map(item => item.path)
      : [];
    result.intents.push({ kind: statement.kind, module, id: typeof id === 'string' ? id.trim() : '', fields,
      ...(typeof revision === 'number' ? { expectedRevision: revision } : {}), ...(pageRef ? { pageRef } : {}),
      ...(rejectedInsertPaths.length ? { rejectedInsertPaths } : {}) });
  });
  return result;
}

function normalizeMaintainerSqlPayload_ACU(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.sql === undefined) return payload;
  if (typeof payload.sql !== 'string') failProtocol_ACU('sql trong đầu ra loại bảo trì phải là chuỗi');
  if (payload.delta !== undefined) failProtocol_ACU('Đầu ra loại bảo trì không được chứa đồng thời sql và delta');
  for (const field of ['storyArc', 'volumes', 'story_arc', 'expectedRevisions']) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) failProtocol_ACU(`Đầu ra loại bảo trì không được chứa đồng thời sql và trường tập ghi JSON ${field}`);
  }
  try {
    const statements = parseRestrictedSqlDml_ACU(payload.sql);
    if (!statements.length) failProtocol_ACU('SQL giới hạn không cho phép tập ghi rỗng');
    return { ...payload, delta: continuationSqlDelta_ACU(statements, 'maintainer') };
  } catch (error) {
    failProtocol_ACU(`SQL giới hạn phân tích thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeResearcherSqlPayload_ACU(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.sql === undefined) return payload;
  if (typeof payload.sql !== 'string') failProtocol_ACU('sql trong đầu ra của web-researcher phải là chuỗi');
  if (payload.delta !== undefined) failProtocol_ACU('Đầu ra của web-researcher không được chứa đồng thời sql và delta');
  try {
    const statements = parseRestrictedSqlDml_ACU(payload.sql);
    if (!statements.length) failProtocol_ACU('SQL giới hạn không cho phép tập ghi rỗng');
    return { ...payload, delta: continuationSqlDelta_ACU(statements, 'researcher') };
  } catch (error) {
    failProtocol_ACU(`SQL giới hạn phân tích thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 解析维护类子代理的输出。
 * @param payload 已解析的 JSON 载荷
 * @returns 摘要 + 写集事务 + 追加读取请求
 */
export function parseAgentMaintainerOutput_ACU(payload: Record<string, unknown>): AgentMaintainerOutput_ACU {
  const draft = parseAgentMaintainerOutputDraft_ACU(payload);
  if (draft.rejected.length) failProtocol_ACU(draft.rejected[0].reason, { rejected: draft.rejected.length });
  return draft.output;
}

export interface AgentMaintainerOutputDraft_ACU {
  output: AgentMaintainerOutput_ACU;
  rejected: AgentContractRejection_ACU[];
}

/**
 * 维护/总纲契约的草稿解析：合法条目收进 output，单条非法的记进 rejected 而不是整份拒绝，
 * 让运行时只向模型索要需要修正的那几条。数组结构本身非法仍然抛出。
 * @param payload 已解析的 JSON 载荷
 */
/**
 * 把模型常写的错位形状归一化到 delta.storyArc：顶层 storyArc / volumes、delta.volumes、
 * 以 id 为键的对象。这些以前会被静默忽略成“0 条写入”，让一份写满卷台阶的输出白白作废。
 */
function normalizeStoryArcShape_ACU(payload: Record<string, unknown>, rawDelta: Record<string, unknown>): unknown {
  const candidates = [rawDelta.storyArc, rawDelta.volumes, rawDelta.story_arc, payload.storyArc, payload.volumes, payload.story_arc];
  const merged: unknown[] = [];
  let sawAlternative = false;
  candidates.forEach((candidate, index) => {
    if (Array.isArray(candidate)) {
      if (index > 0 && candidate.length) sawAlternative = true;
      merged.push(...candidate);
    } else if (isRecord_ACU(candidate) && Object.keys(candidate).length) {
      sawAlternative = true;
      merged.push(...Object.entries(candidate).map(([id, value]) => (isRecord_ACU(value) ? { id, action: 'upsert', ...value } : value)));
    }
  });
  // 只有标准位置且为空/缺失时保持原值，让“未提供”与“提供了空数组”的语义与其他模块一致。
  if (!sawAlternative && !merged.length) return rawDelta.storyArc;
  return merged;
}

export function parseAgentMaintainerOutputDraft_ACU(payload: Record<string, unknown>): AgentMaintainerOutputDraft_ACU {
  const normalizedPayload = normalizeMaintainerSqlPayload_ACU(payload);
  const rawDelta = isRecord_ACU(normalizedPayload.delta) ? normalizedPayload.delta : {};
  const rejected: AgentContractRejection_ACU[] = [];
  const hooks = parseHookItems_ACU(rawDelta.hooks, rejected);
  const infoGap = parseInfoGapItems_ACU(rawDelta.infoGap, rejected);
  const storyArc = parseStoryArcItems_ACU(normalizeStoryArcShape_ACU(payload, rawDelta), rejected);
  const chronology = parseChronologyItems_ACU(rawDelta.chronology, rejected);
  return {
    output: {
      summary: readText_ACU(normalizedPayload.summary),
      delta: {
        expectedRevisions: parseExpectedRevisions_ACU(rawDelta.expectedRevisions ?? normalizedPayload.expectedRevisions),
        hooks: hooks.items,
        hookPatches: hooks.patches,
        infoGap: infoGap.items,
        infoGapPatches: infoGap.patches,
        storyArc: storyArc.items,
        storyArcPatches: storyArc.patches,
        chronology: chronology.items,
        chronologyPatches: chronology.patches,
        constraintProposals: readTextList_ACU(rawDelta.constraintProposals),
      },
    },
    rejected,
  };
}

/**
 * 按 (模块, id) 把后一份契约草稿合并进前一份：同 id 后者覆盖，新 id 追加，约束提议取并集，
 * 摘要与 expectedRevisions 以首次非空为准。用于截断续写与条目修补的多轮累积。
 * @param base 已累积的输出
 * @param incoming 本轮新收到的输出
 */
export function mergeAgentMaintainerOutputs_ACU(base: AgentMaintainerOutput_ACU, incoming: AgentMaintainerOutput_ACU): AgentMaintainerOutput_ACU {
  const mergeById = <T extends { id: string }>(left: readonly T[], right: readonly T[]): T[] => {
    const byId = new Map<string, T>();
    const order: string[] = [];
    let anonymous = 0;
    for (const item of [...left, ...right]) {
      const key = item.id.trim() || `__anonymous_${anonymous++}`;
      if (!byId.has(key)) order.push(key);
      byId.set(key, item);
    }
    return order.map(key => byId.get(key)!);
  };
  const revisions = { ...incoming.delta.expectedRevisions, ...base.delta.expectedRevisions };
  return {
    summary: base.summary || incoming.summary,
    delta: {
      expectedRevisions: revisions,
      hooks: mergeById(base.delta.hooks, incoming.delta.hooks),
      hookPatches: mergeById(base.delta.hookPatches, incoming.delta.hookPatches),
      infoGap: mergeById(base.delta.infoGap, incoming.delta.infoGap),
      infoGapPatches: mergeById(base.delta.infoGapPatches, incoming.delta.infoGapPatches),
      storyArc: mergeById(base.delta.storyArc, incoming.delta.storyArc),
      storyArcPatches: mergeById(base.delta.storyArcPatches, incoming.delta.storyArcPatches),
      chronology: mergeById(base.delta.chronology, incoming.delta.chronology),
      chronologyPatches: mergeById(base.delta.chronologyPatches, incoming.delta.chronologyPatches),
      constraintProposals: [...new Set([...base.delta.constraintProposals, ...incoming.delta.constraintProposals])],
    },
  };
}

/**
 * 渲染截断/条目修补的续写请求：告诉模型哪些条目已收下（不要重发）、哪些条目要修正、
 * 以及输出是否在中途被截断需要从下一条继续。回复只需含剩余/修正条目。
 */
export function renderAgentContractContinuationRequest_ACU(accepted: AgentMaintainerOutput_ACU, rejected: readonly AgentContractRejection_ACU[], truncated: boolean, toolMode: AgentToolMode_ACU): string {
  const acceptedIds: string[] = [];
  for (const [label, list] of [
    ['Phục bút', [...accepted.delta.hooks, ...accepted.delta.hookPatches]],
    ['Chênh lệch thông tin', [...accepted.delta.infoGap, ...accepted.delta.infoGapPatches]],
    ['Tổng cương', [...accepted.delta.storyArc, ...accepted.delta.storyArcPatches]],
    ['Niên đại học', [...accepted.delta.chronology, ...accepted.delta.chronologyPatches]],
  ] as const) {
    const ids = list.map(item => item.id).filter(Boolean);
    if (ids.length) acceptedIds.push(`${label}: ${ids.join(', ')}`);
  }
  const lines: string[] = [];
  if (truncated) {
    lines.push('Tải giao lần trước của bạn bị cắt giữa chừng. Các mục đầy đủ trước chỗ cắt đã được nhận, đừng gửi lại; hãy bắt đầu từ mục bị cắt và chỉ giao các mục còn lại.');
  } else {
    lines.push('Phần lớn đầu ra lần trước của bạn đã được nhận, chỉ các mục sau không đúng hợp đồng, hãy chỉ gửi lại các mục này (sau khi sửa), phần còn lại đừng gửi lại.');
  }
  if (acceptedIds.length) lines.push(`Các mục đã nhận: ${acceptedIds.join('; ')}.`);
  if (rejected.length) {
    lines.push('Các mục cần sửa:');
    for (const item of rejected) lines.push(`- ${item.module}[${item.index}]${item.id ? ` (id=${item.id})` : ''}: ${item.reason}`);
  }
  lines.push(toolMode === 'tools'
    ? 'Hãy gọi riêng submit, chỉ sửa các mục giao được nêu tên ở trên, tham số tuân theo hợp đồng giao ban đầu, không kèm sql; đừng gửi lại các mục đã nhận. Việc ghi tư liệu thực tế vẫn phải gọi riêng write_sql, không được chung một lần trả lời với việc giao.'
    : 'Hãy xuất riêng đối tượng JSON đúng hợp đồng giao ban đầu, chỉ sửa các mục giao được nêu tên ở trên, không kèm sql; đừng gửi lại các mục đã nhận. Việc ghi tư liệu thực tế vẫn phải xuất riêng {"action":"write_sql","sql":"toàn bộ câu lệnh"}, không được chung một lần trả lời với việc giao.');
  return lines.join('\n');
}

/**
 * 解析策划类子代理的输出。外层字段结构化，创作内容保持自然语言。
 * @param payload 已解析的 JSON 载荷
 * @returns 摘要、建议正文、必须保留项与风险项
 */
export function parseAgentPlannerOutput_ACU(payload: Record<string, unknown>): AgentPlannerOutput_ACU {
  const recommendation = readText_ACU(payload.recommendation);
  if (!recommendation) failProtocol_ACU('Agent phụ hoạch định phải đưa ra recommendation; khi thiếu tư liệu mà vẫn còn hạn mức đọc thì dùng read đã được cấp quyền để bổ sung chỗ thiếu cụ thể, nếu không thì đưa ra đề xuất thận trọng dựa trên tư liệu đã xác nhận và nêu rõ chỗ thiếu');
  return {
    summary: readText_ACU(payload.summary),
    recommendation,
    mustPreserve: readTextList_ACU(payload.mustPreserve),
    risks: readTextList_ACU(payload.risks),
  };
}

/**
 * 解析审查类子代理的输出。
 * @param payload 已解析的 JSON 载荷
 * @returns 判词、理由与修正建议
 */
export function parseAgentReviewerOutput_ACU(payload: Record<string, unknown>): AgentReviewerOutput_ACU {
  const verdict = readText_ACU(payload.verdict);
  if (!(AGENT_REVIEW_VERDICTS_ACU as readonly string[]).includes(verdict)) {
    failProtocol_ACU(`verdict của agent phụ kiểm duyệt phải là pass / revise / block, thực nhận: ${verdict || '(rỗng)'}; khi thiếu tư liệu nên xuất lệnh gọi công cụ read / search trước`);
  }
  return {
    verdict: verdict as AgentReviewerOutput_ACU['verdict'],
    reason: readText_ACU(payload.reason),
    fixes: readTextList_ACU(payload.fixes),
  };
}

/** 解析发送前最终审查的结构化只读反馈。 */
export function parseAgentFinalReviewerOutput_ACU(payload: Record<string, unknown>): AgentFinalReviewerOutput_ACU {
  const verdict = readText_ACU(payload.verdict);
  if (!(AGENT_REVIEW_VERDICTS_ACU as readonly string[]).includes(verdict)) {
    failProtocol_ACU(`verdict của chung thẩm cuối phải là pass / revise / block, thực nhận: ${verdict || '(rỗng)'}; khi thiếu tư liệu nên xuất lệnh gọi công cụ read / search trước`);
  }
  return {
    verdict: verdict as AgentFinalReviewerOutput_ACU['verdict'],
    summary: readText_ACU(payload.summary),
    emotionFindings: readTextList_ACU(payload.emotionFindings),
    worldFindings: readTextList_ACU(payload.worldFindings),
    logicFindings: readTextList_ACU(payload.logicFindings),
    requiredFixes: readTextList_ACU(payload.requiredFixes),
    preserve: readTextList_ACU(payload.preserve),
  };
}

/** 把协议错误压成可回喂给模型的紧凑单行原因串。 */
export function compactAgentProtocolError_ACU(error: unknown): string {
  if (error instanceof ContinuationValidationError_ACU) return `${error.error.code}: ${error.error.message}`;
  return error instanceof Error ? error.message : String(error);
}
