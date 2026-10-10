/**
 * service/continuation/agent/agent-placeholder-resolver.ts — 读写集占位符解析
 *
 * 读集 token 只是资料接口标识符，不是提示词 token：解析结果统一汇成一块材料文本，
 * 通过单个 `$AGENT_READ_MATERIALS` 注入子代理提示词。这样动态表名（$TABLE:xxx）
 * 不需要扩展提示词渲染器的固定 token 表。
 */

import type { StageTurn_ACU, StageTurnPacing_ACU } from '../model';
import { describeStageTempo_ACU } from '../outline-schema';
import type { ContinuationAgentExecutionContext_ACU } from '../stage-execution-engine';
import {
  AGENT_STORY_TAIL_FLOORS_DEFAULT_ACU,
  AGENT_STORY_WINDOW_DEFAULT_ACU,
  type AgentModuleSnapshot_ACU,
  type AgentReadFence_ACU,
  type AgentReadFenceProof_ACU,
  AGENT_MODULE_FIELD_MATRIX_ACU,
} from './agent-model';
import {
  readAgentModuleFoldState_ACU,
  renderAgentChronology_ACU,
  renderAgentChronologyByIds_ACU,
  renderAgentConstraintsByIds_ACU,
  renderAgentHooksByIds_ACU,
  renderAgentInfoGapByIds_ACU,
  renderAgentStoryArcByIds_ACU,
  renderAgentWebRefsByIds_ACU,
} from './agent-module-store';
import { AGENT_TABLE_ALIASES_ACU, findAgentSheetsByAliases_ACU, renderAgentTableByAliases_ACU, renderAgentTableByName_ACU, type AgentTableRowRange_ACU } from './agent-tables';
import {
  buildEmptyAgentWorldbookSnapshot_ACU,
  renderAgentWorldbookEntries_ACU,
  type AgentWorldbookSnapshot_ACU,
} from './agent-worldbook-read';
import { normalizeAmCode_ACU } from '../worldbook-context';
import { applyContextTagFilters_ACU } from '../../runtime/helpers-context-tags';
import { renderAgentUserRequirements_ACU } from './agent-user-requirements';
import { isAiMessage_ACU } from '../../runtime/message-handler';

export const AGENT_TABLE_TOKEN_PREFIX_ACU = '$TABLE:';
export const AGENT_STORY_RANGE_TOKEN_PREFIX_ACU = '$STORY_RANGE:';
export const AGENT_WORLDBOOK_TOKEN_PREFIX_ACU = '$WORLDBOOK:';

/** 每条虚拟/模块/表占位符对应的人类可读标题，进入材料块的分节标题。 */
const READ_TOKEN_TITLES_ACU: Record<string, string> = {
  $STORY_TEXT: 'Chính văn tiểu thuyết đã xảy ra (chỉ gồm tầng AI)',
  $STORY_CATALOG: 'Chỉ mục tầng chính văn',
  $STORY_OVERVIEW: 'Tổng quan sự kiện (từng lượt trong 纪要表)',
  $STORY_TAIL: 'Chính văn gần nhất (các tầng toàn văn ở cuối)',
  $HISTORY_UNSETTLED: 'Lịch sử thật chưa quyết toán',
  $OUTLINE_WINDOW: 'Cửa sổ dàn ý hiện tại',
  $CURRENT_TURN_GOAL: 'Mục tiêu lượt này',
  $CURRENT_TURN_PACING: 'Nhịp lượt này',
  $USER_INTENT: 'Yêu cầu ban đầu của người dùng',
  $USER_REQUIREMENTS: 'Các yêu cầu người dùng từng nêu cho tác vụ',
  $STORY_ARC: 'Tổng cương câu chuyện',
  $HOOKS_LEDGER: 'Sổ phục bút',
  $INFO_GAP: 'Dòng thời gian nhận thức và chênh lệch thông tin',
  $ACTIVE_CONSTRAINTS: 'Ràng buộc dài hạn',
  $CHRONOLOGY: 'Sổ niên đại học câu chuyện',
  $WEB_REFS: 'Kho tư liệu bách khoa',
  $TABLE_GLOBAL: 'Bảng dữ liệu toàn cục (全局数据表)',
  $TABLE_CHARACTERS: 'Bảng nhân vật (角色表)',
  $TABLE_CHRONICLES: 'Kỷ yếu (纪要表)',
};

/** 续写侧的上下文标签提取/排除规则（与剧情推进共用 applyContextTagFilters_ACU 语义）。 */
export interface AgentContextRules_ACU {
  extractRules: { start: string; end: string }[];
  excludeRules: { start: string; end: string }[];
}

export interface AgentResolveContext_ACU {
  chat: any[];
  moduleSnapshot: AgentModuleSnapshot_ACU;
  settledThroughIndex: number;
  execution: ContinuationAgentExecutionContext_ACU;
  originInstruction: string;
  /**
   * Agent 可读/可搜正文窗口：只有最近这么多 AI 楼层可以 read/search，
   * 更早的剧情脉络经事件概览与 $TABLE:纪要表 回溯。缺省用 AGENT_STORY_WINDOW_DEFAULT_ACU。
   */
  storyWindowFloors?: number;
  /** 固定注入全文的末尾 AI 楼层数（$STORY_TAIL）；缺省用 AGENT_STORY_TAIL_FLOORS_DEFAULT_ACU。 */
  storyTailFloors?: number;
  tableData?: unknown;
  /** 运行起点预取的世界书快照；缺省为不可用空快照（如测试环境）。 */
  worldbook?: AgentWorldbookSnapshot_ACU;
  /** 上下文提取/排除规则；缺省不做任何过滤。 */
  contextRules?: AgentContextRules_ACU;
  /** 本轮召回的 AM 码（取自最后一个用户楼层）；缺省为空。 */
  recallCodes?: readonly string[];
}

/** 正文渲染的最小入参：AgentResolveContext 结构性满足，大纲侧可用轻量对象直接调用。 */
export interface AgentStoryFloorSource_ACU {
  chat: any[];
  storyWindowFloors?: number;
  storyTailFloors?: number;
  contextRules?: AgentContextRules_ACU;
}

function applyAgentContextRules_ACU(text: string, rules?: AgentContextRules_ACU): string {
  if (!rules || (!rules.extractRules.length && !rules.excludeRules.length)) return text;
  return applyContextTagFilters_ACU(text, { extractTags: '', extractRules: rules.extractRules, excludeTags: '', excludeRules: rules.excludeRules }).trim();
}

function messageText_ACU(message: any, rules?: AgentContextRules_ACU): string {
  return applyAgentContextRules_ACU(String(message?.mes ?? '').trim(), rules);
}

interface AgentStoryFloor_ACU {
  index: number;
  text: string;
}

function listAgentStoryFloors_ACU(source: AgentStoryFloorSource_ACU): AgentStoryFloor_ACU[] {
  const chat = Array.isArray(source.chat) ? source.chat : [];
  return chat
    .map((message, index) => ({ index, text: messageText_ACU(message, source.contextRules) }))
    .filter(item => chat[item.index] && !chat[item.index].is_user && item.text);
}

/** 与正文目录共用的 AI 正文楼层判断；证据校验不受读取窗口限制。 */
export function agentStoryEvidenceFloorIndexes_ACU(chat: any[]): ReadonlySet<number> {
  return new Set(listAgentStoryFloors_ACU({ chat }).map(floor => floor.index));
}

function agentStoryWindowSize_ACU(source: AgentStoryFloorSource_ACU): number {
  return Math.max(0, source.storyWindowFloors ?? AGENT_STORY_WINDOW_DEFAULT_ACU);
}

/** Agent 可读/可搜的正文窗口：最近 storyWindowFloors 个 AI 楼层。同时供搜索工具划定 story 域。 */
export function listAgentStoryWindowFloors_ACU(source: AgentStoryFloorSource_ACU): AgentStoryFloor_ACU[] {
  const window = agentStoryWindowSize_ACU(source);
  return window > 0 ? listAgentStoryFloors_ACU(source).slice(-window) : [];
}

/**
 * 从最后一个用户楼层提取本轮召回的 AM 码。
 * 剧情推进 AI 的召回结果（<recall>AMxxxx</recall> 等）就落在这层文本里，直接复用即可，
 * 不需要续写侧再发一次召回调用。取原始文本而非过滤后的文本：召回码可能位于会被规则剥掉的标签内。
 * @param chat 聊天数组
 * @returns 去重后的规范化 AM 码列表；没有用户楼层或无命中时为空数组
 */
export function extractAgentRecallCodesFromChat_ACU(chat: readonly any[]): string[] {
  const list = Array.isArray(chat) ? chat : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (!message || !message.is_user) continue;
    const matches = String(message.mes ?? '').match(/AM\d+/gi) ?? [];
    return [...new Set(matches
      .map(code => normalizeAmCode_ACU(code))
      .filter((code): code is string => code !== null))];
  }
  return [];
}

function renderStoryFloors_ACU(floors: readonly AgentStoryFloor_ACU[]): string {
  return floors.map(floor => `【Tầng ${floor.index}】\n${floor.text}`).join('\n\n');
}

function storyOpening_ACU(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 40 ? flat : `${flat.slice(0, 40)}…`;
}

/** 事件概览的最小入参。 */
export interface AgentStoryOverviewSource_ACU {
  tableData?: unknown;
  recallCodes?: readonly string[];
}

/** 定位纪要表的一列：按表头包含关系匹配候选名，命中第一个。 */
function findColumnIndex_ACU(header: readonly string[], candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const index = header.findIndex(cell => cell.includes(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

/** 事件概览的渲染选项。 */
export interface AgentStoryOverviewOptions_ACU {
  /**
   * 只保留最新的 N 行概览（按纪要表行序取尾部）。窗口外被本轮召回码命中的行不受截断
   * 影响——它们以纪要全文按行序前置展示，保证召回机制在截断下仍然完整。
   * 缺省为不限（主会话/大纲子代理/read 工具路径全量注入）。
   */
  maxRows?: number;
}

/**
 * 渲染事件概览：纪要表逐轮的「概览」列注入，命中本轮召回 AM 码的行升级为「纪要」全文。
 *
 * 这是主会话与策划类子代理掌握全局剧情脉络的固定来源——概览按剧情轮记录（每轮一行），
 * 与楼层号没有一一映射，精确正文要走 $STORY_RANGE 或楼层索引。
 * @param source 表格数据与本轮召回码
 * @param options 渲染选项；maxRows 见 AgentStoryOverviewOptions_ACU
 * @returns 概览文本；纪要表缺失/为空时如实说明
 */
export function renderAgentStoryOverview_ACU(source: AgentStoryOverviewSource_ACU, options?: AgentStoryOverviewOptions_ACU): string {
  const sheets = findAgentSheetsByAliases_ACU(AGENT_TABLE_ALIASES_ACU.chronicles, source.tableData);
  if (!sheets.length) {
    return 'Cuộc trò chuyện hiện tại không có 纪要表, không thể cung cấp tổng quan sự kiện. Mạch cốt truyện chỉ có thể dựa vào chỉ mục tầng và chính các tầng chính văn.';
  }
  const recall = new Set((source.recallCodes ?? []).map(code => normalizeAmCode_ACU(code)).filter(Boolean));
  const maxRows = options?.maxRows && options.maxRows > 0 ? Math.floor(options.maxRows) : null;
  let anyExpanded = false;
  const sections = sheets.map(sheet => {
    if (!sheet.rows.length) return `Bảng "${sheet.name}" tồn tại nhưng không có hàng dữ liệu.`;
    const codeColumn = findColumnIndex_ACU(sheet.header, ['编码索引', '编码']);
    const overviewColumn = findColumnIndex_ACU(sheet.header, ['概览', '概要']);
    const digestColumn = sheet.header.findIndex(cell => cell.includes('纪要') && !cell.includes('概'));
    const renderRow = (row: readonly string[], rowIndex: number): string => {
      const code = codeColumn >= 0 ? normalizeAmCode_ACU(row[codeColumn]) : null;
      const overview = overviewColumn >= 0 ? row[overviewColumn] : '';
      const digest = digestColumn >= 0 ? row[digestColumn] : '';
      const label = code ?? `Hàng ${rowIndex + 1}`;
      if (code && recall.has(code) && digest) {
        anyExpanded = true;
        return `- ${label}｜【纪要全文】${digest}`;
      }
      return `- ${label}｜${overview || digest || '(hàng trống)'}`;
    };
    const windowStart = maxRows !== null ? Math.max(0, sheet.rows.length - maxRows) : 0;
    const windowLines = sheet.rows.slice(windowStart).map((row, offset) => renderRow(row, windowStart + offset));
    const parts: string[] = [];
    if (windowStart > 0) {
      parts.push(`Tổng quan ${windowStart} lượt sớm hơn đã được lược bỏ (ứng với hàng 1-${windowStart} của "${sheet.name}"), khi cần thì đọc kỹ bằng $TABLE:${sheet.name}:khoảng hàng.`);
      // 窗口外被召回命中的行按行序前置：召回命中说明与本轮直接相关，不能被截断静默丢掉。
      const recalledEarlier = sheet.rows.slice(0, windowStart)
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => {
          const code = codeColumn >= 0 ? normalizeAmCode_ACU(row[codeColumn]) : null;
          return code !== null && recall.has(code);
        });
      if (recalledEarlier.length) {
        parts.push(`Sau đây là các lượt sớm hơn được truy hồi trong lượt này (không bị ảnh hưởng bởi cắt bớt):\n${recalledEarlier.map(({ row, rowIndex }) => renderRow(row, rowIndex)).join('\n')}`);
      }
    }
    parts.push(windowLines.join('\n'));
    const head = sheets.length > 1 ? `## Bảng "${sheet.name}"\n` : '';
    return `${head}${parts.join('\n\n')}`;
  });
  const expandedNote = anyExpanded
    ? 'Các hàng có dấu 【纪要全文】 đã được mở rộng thành kỷ yếu chi tiết theo mã truy hồi của lượt này.'
    : '';
  return [
    'Sau đây là tổng quan sự kiện từng lượt của 纪要表 (mỗi hàng ứng với một lượt cốt truyện, không ánh xạ một-một với số tầng; khi cần kỷ yếu chi tiết của một lượt thì đọc kỹ bằng $TABLE:纪要表:khoảng hàng):',
    ...sections,
    expandedNote,
  ].filter(Boolean).join('\n\n');
}

/**
 * 渲染最近正文：末尾 storyTailFloors 个 AI 楼层的全文（已过上下文提取/排除规则）。
 * 这是承接锚点——续写必须无缝衔接的最新正文。
 * @param source 正文楼层来源
 * @returns 逐楼全文；storyTailFloors=0 或无 AI 楼层时如实标注
 */
export function renderAgentStoryTail_ACU(source: AgentStoryFloorSource_ACU): string {
  const windowFloors = listAgentStoryWindowFloors_ACU(source);
  if (!windowFloors.length) return 'Hiện không có tầng chính văn nào để tiêm (trong cuộc trò chuyện chưa có chính văn AI, hoặc cửa sổ đọc được bằng 0).';
  const tailCount = Math.max(0, source.storyTailFloors ?? AGENT_STORY_TAIL_FLOORS_DEFAULT_ACU);
  if (tailCount === 0) return 'Chưa tiêm toàn văn các tầng chính văn (số tầng ở cuối được đặt là 0). Khi cần chính văn thì đọc bằng $STORY_RANGE:tầng_đầu-tầng_cuối.';
  const tailFloors = windowFloors.slice(-tailCount);
  return `Toàn văn ${tailFloors.length} tầng gần nhất (phần viết tiếp phải nối liền mạch với phần kết ở đây):\n${renderStoryFloors_ACU(tailFloors)}`;
}

/**
 * 渲染正文楼层索引：纯索引，不含任何正文全文（全文见 $STORY_TAIL，脉络见 $STORY_OVERVIEW）。
 * 每楼一行「楼层号 + 约字数 + 读取地址」；纪要表缺失时退回附带开头摘要的形式以保底可导航。
 * @param source 正文楼层来源 + 表格数据（用于判断纪要表是否存在）
 * @returns 索引文本，进入主 Agent 骨架的 $STORY_CATALOG
 */
export function renderAgentStoryCatalog_ACU(source: AgentStoryFloorSource_ACU & { tableData?: unknown }): string {
  const allFloors = listAgentStoryFloors_ACU(source);
  if (!allFloors.length) return 'Cuộc trò chuyện hiện tại chưa có tầng chính văn do AI tạo ra.';
  const windowFloors = listAgentStoryWindowFloors_ACU(source);
  if (!windowFloors.length) return 'Cửa sổ đọc chính văn được đặt là 0 tầng: không thể đọc trực tiếp các tầng chính văn; mạch cốt truyện hãy dựa vào tổng quan sự kiện và $TABLE:纪要表.';
  const hiddenCount = allFloors.length - windowFloors.length;
  const headNote = hiddenCount > 0
    ? `${hiddenCount} tầng AI sớm hơn nằm ngoài cửa sổ đọc được; mạch cốt truyện của chúng hãy xem ở tổng quan sự kiện, hoặc dùng $TABLE:纪要表:khoảng hàng để đọc kỹ kỷ yếu tương ứng.`
    : 'Toàn bộ tầng AI hiện đều nằm trong cửa sổ đọc được.';
  const hasChronicleRows = findAgentSheetsByAliases_ACU(AGENT_TABLE_ALIASES_ACU.chronicles, source.tableData)
    .some(sheet => sheet.rows.length > 0);
  const lines = windowFloors.map(floor => hasChronicleRows
    ? `- Tầng ${floor.index}｜khoảng ${floor.text.length} chữ｜địa chỉ đọc $STORY_RANGE:${floor.index}-${floor.index}`
    : `- Tầng ${floor.index}｜khoảng ${floor.text.length} chữ｜mở đầu: ${storyOpening_ACU(floor.text)}｜địa chỉ đọc $STORY_RANGE:${floor.index}-${floor.index}`);
  return [
    `${headNote}\nChỉ mục tầng trong cửa sổ đọc được (đọc theo khoảng thì viết $STORY_RANGE:tầng_đầu-tầng_cuối; tìm tầng theo nội dung thì dùng search story):`,
    lines.join('\n'),
    'Lưu ý: tổng quan sự kiện ghi theo lượt cốt truyện, không ánh xạ một-một với số tầng; khi cần chính văn chính xác thì đọc theo khoảng của chỉ mục này.',
  ].join('\n');
}

/**
 * 按楼层区间读取窗口内的 AI 正文全文，支撑 `$STORY_RANGE:a-b`。
 * @param context 解析上下文
 * @param startRaw 起始楼层号
 * @param endRaw 结束楼层号
 * @returns 区间内逐楼全文；区间非法/落在窗口外时回灌可修正的错误文本
 */
export function renderAgentStoryRange_ACU(context: AgentResolveContext_ACU, startRaw: string, endRaw: string): string {
  const start = Number.parseInt(startRaw, 10);
  const end = Number.parseInt(endRaw, 10);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return `Khoảng tầng "${startRaw}-${endRaw}" không hợp lệ: cách viết là $STORY_RANGE:tầng_đầu-tầng_cuối (hai đầu đều là số tầng, đầu không lớn hơn cuối). Các tầng khả dụng xem trong danh mục chính văn.`;
  }
  const windowFloors = listAgentStoryWindowFloors_ACU(context);
  if (!windowFloors.length) return 'Cửa sổ đọc chính văn hiện đang trống, không thể đọc chính văn; mạch cốt truyện sớm hãy xem tổng quan sự kiện hoặc dùng $TABLE:纪要表:khoảng hàng để đọc kỹ.';
  const hit = windowFloors.filter(floor => floor.index >= start && floor.index <= end);
  if (!hit.length) {
    const first = windowFloors[0].index;
    const last = windowFloors[windowFloors.length - 1].index;
    return `Trong khoảng ${start}-${end} không có tầng AI nào đọc được. Cửa sổ đọc được hiện bao phủ các tầng ${first}-${last} (chỉ gồm tầng AI); mạch cốt truyện sớm hơn hãy xem tổng quan sự kiện hoặc dùng $TABLE:纪要表:khoảng hàng để đọc kỹ.`;
  }
  return renderStoryFloors_ACU(hit);
}

/**
 * 未结算正文与目录、区间读取共用最近 AI 楼层窗口。
 * 返回实际处理起点，供工作流记录完成范围；窗口外的旧正文并不代表已被资料模块吸收。
 */
export function resolveAgentUnsettledStoryWindow_ACU(context: AgentResolveContext_ACU) {
  const allFloors = listAgentStoryFloors_ACU(context);
  const window = agentStoryWindowSize_ACU(context);
  const windowFloors = window > 0 ? allFloors.slice(-window) : [];
  const completion = context.moduleSnapshot.materialCompletion;
  const completedRange = completion
    && (completion.state === 'complete_changed' || completion.state === 'complete_no_change')
    && completion.rangeStartIndex >= 0 && completion.rangeEndIndex >= completion.rangeStartIndex
    ? completion : null;
  const boundary = context.moduleSnapshot.settlementBoundary?.startIndex ?? 0;
  const isUnsettled = (floor: AgentStoryFloor_ACU) => floor.index > context.settledThroughIndex
    && floor.index >= boundary
    && !(completedRange && floor.index >= completedRange.rangeStartIndex && floor.index <= completedRange.rangeEndIndex);
  const unsettledFloors = allFloors.filter(isUnsettled);
  const floors = windowFloors.filter(isUnsettled);
  const hiddenCount = unsettledFloors.length - floors.length;
  let startIndex = hiddenCount > 0
    ? floors[0]?.index ?? context.chat.length
    : Math.max(boundary, context.settledThroughIndex + 1);
  // 最近窗口已完成后，只处理其后新增的正文；保留连续水位与窗口完成区间的区别。
  if (floors.length && completedRange && windowFloors[0].index >= completedRange.rangeStartIndex
    && windowFloors[0].index <= completedRange.rangeEndIndex
    && floors[0].index > completedRange.rangeEndIndex) {
    startIndex = completedRange.rangeEndIndex + 1;
  }
  if (!floors.length) startIndex = Math.max(boundary, windowFloors[0]?.index ?? context.chat.length);
  return { floors, hiddenCount, startIndex };
}

function renderUnsettledWindow_ACU(selection: ReturnType<typeof resolveAgentUnsettledStoryWindow_ACU>): string {
  if (!selection.hiddenCount && !selection.floors.length) {
    return 'Không có lịch sử thật chưa quyết toán; chính văn hiện tại đã quyết toán xong.';
  }
  const note = selection.hiddenCount > 0
    ? `${selection.hiddenCount} tầng AI chưa quyết toán sớm hơn nằm ngoài cửa sổ đọc chính văn, lần này không được tiêm và cũng không thuộc phạm vi quyết toán từng tầng lần này; không thể dựa vào đó để tuyên bố chính văn cũ đã được quyết toán đầy đủ. Cốt truyện sớm hơn hãy truy lại qua tổng quan sự kiện hoặc $TABLE:纪要表:khoảng hàng.`
    : '';
  return [note, selection.floors.length
    ? renderStoryFloors_ACU(selection.floors)
    : 'Trong cửa sổ đọc được hiện không có chính văn chờ quyết toán (cửa sổ bằng 0 hoặc chính văn trong cửa sổ đã xử lý); lần này không tiêm hay quyết toán từng tầng chính văn.'].filter(Boolean).join('\n\n');
}

/** 已发生正文只注入可读窗口内的 AI 楼层，已结算与未结算两段共用同一个上限。 */
export function renderAgentStoryText_ACU(context: AgentResolveContext_ACU): string {
  if (!context.chat.length) return 'Cuộc trò chuyện hiện tại chưa có tầng nào, nên cũng chưa có chính văn đã xảy ra.';
  const allFloors = listAgentStoryFloors_ACU(context);
  if (!allFloors.length) return 'Cuộc trò chuyện hiện tại chưa có tầng chính văn do AI tạo ra.';
  const selection = resolveAgentUnsettledStoryWindow_ACU(context);
  const pendingIndexes = new Set(selection.floors.map(floor => floor.index));
  const shownSettled = listAgentStoryWindowFloors_ACU(context).filter(floor => !pendingIndexes.has(floor.index));
  const settled = allFloors.filter(floor => floor.index <= context.settledThroughIndex);
  const hiddenSettled = settled.length - shownSettled.length;
  const sections: string[] = [];
  const settledHead = hiddenSettled > 0
    ? `## Chính văn đã quyết toán (${shownSettled.length} tầng trong cửa sổ; ${hiddenSettled} tầng sớm hơn chưa tiêm, khi cần thì truy lại qua tổng quan sự kiện và kỷ yếu)`
    : '## Chính văn đã quyết toán';
  if (shownSettled.length) sections.push(`${settledHead}\n${renderStoryFloors_ACU(shownSettled)}`);
  else if (settled.length) sections.push(`${settledHead}\n(Lần này không tiêm chính văn đã quyết toán nào.)`);
  sections.push(`## Chính văn mới nhất chưa quyết toán (trong cửa sổ đọc chính văn)\n${renderUnsettledWindow_ACU(selection)}`);
  return sections.join('\n\n');
}

/**
 * 渲染可读窗口内尚未结算的 AI 正文。冷启动不回灌全部旧楼层；
 * 省略范围明确说明，结算工作流用同一选择结果记录实际完成范围。
 */
export function renderAgentUnsettledHistory_ACU(context: AgentResolveContext_ACU): string {
  return renderUnsettledWindow_ACU(resolveAgentUnsettledStoryWindow_ACU(context));
}

/** 世界书触发只扫描最近一个用户楼层与最近一个 AI 楼层；不拼入任务或旧历史。 */
export function buildRecentWorldbookScanText_ACU(chat: readonly any[], rules?: AgentContextRules_ACU): string {
  let user = '';
  let assistant = '';
  let foundUser = false;
  let foundAssistant = false;
  for (let index = chat.length - 1; index >= 0 && (!foundUser || !foundAssistant); index -= 1) {
    const message = chat[index];
    if (!foundUser && message?.is_user === true) { user = messageText_ACU(message, rules); foundUser = true; }
    if (!foundAssistant && isAiMessage_ACU(message)) { assistant = messageText_ACU(message, rules); foundAssistant = true; }
  }
  return [user, assistant].filter(Boolean).join('\n');
}

export function buildAgentWorldbookScanText_ACU(context: AgentResolveContext_ACU): string {
  return buildRecentWorldbookScanText_ACU(context.chat, context.contextRules);
}

/** 四档节奏标签的语义与写作指导。低压轮的约束写成禁令，否则模型会习惯性地往每一轮里塞冲突。 */
const TURN_PACING_GUIDANCE_ACU: Record<StageTurnPacing_ACU, string> = {
  setup: 'Lượt đời thường dọn nền: cho phép mạch chính hold, thông qua hành động sinh hoạt cụ thể và tương tác giữa các nhân vật, khiến quan hệ, thói quen, hiểu biết về thế giới, tài nguyên, thân thể hoặc nhận thức có thay đổi quan sát được; khi không có khủng hoảng cần xử lý ngay thì có thể bắt đầu sau một đêm, vài ngày hoặc lâu hơn. Lượt này cấm tạo khủng hoảng mới, đưa phe đối địch mới vào hoặc làm tình thế leo thang, cho phép khép lại yên tĩnh hoặc để lại kỳ vọng đời thường bình thường.',
  pressure: 'Lượt đẩy xung đột: áp lực bên ngoài tăng, khủng hoảng, đối kháng hoặc truy đuổi tiến thêm một bước. Lượt này chỉ đẩy một xung đột, đừng mở thêm mặt trận mới cùng lúc.',
  turn: 'Lượt chuyển ngoặt và tiết lộ: đảo ngược, lộ thông tin hoặc thu hồi phục bút. Tiết lộ phải rơi vào thứ đã được chôn từ trước, đừng tạm bịa ra một sự thật.',
  cooldown: 'Lượt tiêu hóa dư chấn: cho phép mạch chính hold, xử lý trọn vẹn thương tích, cái giá, cảm xúc và thay đổi quan hệ của đợt trước; có thể để một đêm hoặc vài ngày cần cho hồi phục trôi qua tự nhiên. Lượt này cấm tạo khủng hoảng mới, để hậu quả thực sự được nhìn thấy, và cho phép khép lại yên tĩnh.',
};

/**
 * 渲染某一轮的节奏指导。
 * @param pacing 轮次节奏标签；无可执行轮次时传 null
 * @returns 标签名与对应的写作指导
 */
export function renderAgentTurnPacingGuidance_ACU(pacing: StageTurnPacing_ACU | null): string {
  if (!pacing) return 'Nhịp lượt này: chưa có lượt dàn ý khả thi, nhịp sẽ được xác định sau khi dàn ý được tạo hoặc tiếp tục.';
  return `Nhịp lượt này: ${pacing}. ${TURN_PACING_GUIDANCE_ACU[pacing]}`;
}

const TURN_FUNCTION_LABELS_ACU: Record<NonNullable<StageTurn_ACU['function']>, string> = {
  daily_bond: 'đời thường quan hệ',
  daily_world: 'đời thường thế giới',
  recovery: 'hồi phục dư chấn',
  preparation: 'chuẩn bị',
  training: 'luyện tập/trưởng thành',
  economy: 'kinh doanh',
  side_thread: 'tuyến phụ',
  conflict: 'xung đột',
  reveal: 'tiết lộ',
  payoff: 'thu hồi',
  transition: 'chuyển tiếp',
};

const TURN_MAINLINE_LABELS_ACU: Record<NonNullable<StageTurn_ACU['mainlineDelta']>, string> = {
  hold: 'mạch chính dừng chân',
  micro: 'mạch chính nhích nhẹ',
  step: 'mạch chính tiến một bước',
  milestone: 'cột mốc mạch chính',
};

const TURN_TIME_LABELS_ACU: Record<NonNullable<StageTurn_ACU['timeAdvance']>, string> = {
  continuous: 'nối liền lượt trước',
  same_day: 'cùng ngày, muộn hơn một chút',
  overnight: 'qua đêm',
  days: 'vài ngày sau',
  weeks: 'vài tuần sau',
  months: 'vài tháng sau',
  years: 'vài năm sau',
};

const LONG_TIME_ADVANCES_ACU: ReadonlySet<string> = new Set(['days', 'weeks', 'months', 'years']);

/**
 * 渲染本轮的完整四维标记与由此触发的义务：pacing 指导 + 叙事功能 / 主线增量 / 时间关系 / 时间锚。
 * 时间跨度较大时把 V26 的时间跳跃义务直接写在这里，主 Agent 不必再去大纲窗口的箭头行比对。
 * 系统补全的字段单独点名，避免把推断值当成作者意图。
 * @param turn 当前轮次；无可执行轮次时传 null
 */
export function renderAgentTurnGuidance_ACU(turn: StageTurn_ACU | null): string {
  if (!turn) return renderAgentTurnPacingGuidance_ACU(null);
  const lines = [renderAgentTurnPacingGuidance_ACU(turn.pacing)];
  const marks: string[] = [];
  if (turn.function) marks.push(`chức năng tự sự=${turn.function} (${TURN_FUNCTION_LABELS_ACU[turn.function]})`);
  if (turn.mainlineDelta) marks.push(`gia tăng mạch chính=${turn.mainlineDelta} (${TURN_MAINLINE_LABELS_ACU[turn.mainlineDelta]})`);
  if (turn.timeAdvance) marks.push(`quan hệ thời gian=${turn.timeAdvance} (${TURN_TIME_LABELS_ACU[turn.timeAdvance]})`);
  if (turn.timeAnchor) marks.push(`mốc thời gian=${turn.timeAnchor}`);
  if (marks.length) lines.push(`Đánh dấu lượt này: ${marks.join('; ')}.`);
  if (turn.inferred?.length) {
    lines.push(`Lưu ý: ${turn.inferred.join(', ')} là giá trị suy đoán do hệ thống bổ sung thận trọng theo mức nhịp, không phải ý đồ rõ ràng của tác giả dàn ý; khi mâu thuẫn với thực tế chính văn thì lấy chính văn làm chuẩn.`);
  }
  if (turn.timeAdvance && LONG_TIME_ADVANCES_ACU.has(turn.timeAdvance)) {
    lines.push('Nghĩa vụ nhảy thời gian: lượt này dự định vượt qua khoảng thời gian truyện khá dài, instruction của finalize phải ghi rõ mốc thời gian tương đối mới, ít nhất hai thay đổi có thể cảm nhận (mùa và thời tiết, thương tích thân thể, trang phục và môi trường, mức thân quen trong quan hệ, kinh doanh tài nguyên, trạng thái xã hội, v.v.), cùng cầu nối liên tục giải thích vì sao vấn đề cấp bách trước đó được phép bỏ qua; không được dùng tóm tắt để bỏ qua các cảnh then chốt đã cam kết trước đó. Trước hết read $CHRONOLOGY để đối chiếu thời gian tích lũy.');
  }
  if (turn.mainlineDelta === 'hold') {
    lines.push('Mạch chính lượt này được phép dừng chân: không đẩy mâu thuẫn cốt lõi, không tiết lộ tình báo trọng đại, không tạo hành động của phe địch, nhưng phải có một thay đổi quan sát được không thuộc khủng hoảng.');
  }
  return lines.join('\n');
}

/**
 * 渲染当前大纲窗口：本阶段目标、当前节点与本节点全部轮次目标。
 * 大纲缺失或当前阶段已完成时如实说明状态，并指出必须先派工大纲子代理。
 * @param context 解析上下文
 * @returns 自然语言文本
 */
function renderTurnSemanticMeta_ACU(turn: StageTurn_ACU): string {
  const parts = [
    `pacing=${turn.pacing}`,
    `function=${turn.function ?? 'chưa đánh dấu'}`,
    `mainline=${turn.mainlineDelta ?? 'chưa đánh dấu'}`,
    `time=${turn.timeAdvance ?? 'chưa đánh dấu'}`,
  ];
  if (turn.timeAnchor) parts.push(`anchor=${turn.timeAnchor}`);
  if (turn.inferred?.length) parts.push(`hệ thống bổ sung=${turn.inferred.join(',')}`);
  return parts.join('｜');
}

export function renderAgentOutlineWindow_ACU(context: AgentResolveContext_ACU): string {
  const { execution } = context;
  if (!execution.stage) {
    return 'Tác vụ hiện tại chưa có dàn ý giai đoạn. Có thể delegate riêng outline-architect để tạo, hoặc dùng quy trình cố định open_round để chuẩn bị giai đoạn khả thi rồi chuyển sang điều phối chỉ thị viết.';
  }
  if (execution.stage.status === 'completed') {
    return `Giai đoạn ${execution.stage.stageNumber} đã hoàn thành toàn bộ (tổng ${execution.stage.completedTurns} lượt). Sau khi xuất open_round, quy trình cố định sẽ tiếp tục dàn ý giai đoạn kế tiếp, rồi chuyển sang quy trình tư liệu và điều phối chỉ thị viết.`;
  }
  if (!execution.revision || !execution.node || !execution.turn) {
    return `Dàn ý của giai đoạn ${execution.stage.stageNumber} hiện không khả thi (có thể đang chờ người dùng xác nhận hoặc con trỏ không hợp lệ). Lượt này không thể giao chỉ dẫn viết.`;
  }
  const nodes = execution.revision.outline.nodes?.length ? execution.revision.outline.nodes : [execution.node];
  const nodeBlocks = nodes.map(node => {
    const turns = node.turns
      .map((turn, index) => `${index + 1}. [${turn.id}] (${renderTurnSemanticMeta_ACU(turn)}) ${turn.goal}${turn.id === execution.turn!.id ? '  ← lượt này' : ''}`)
      .join('\n');
    return [`Nút: [${node.id}] ${node.title}`, `Mục tiêu nút: ${node.goal}`, turns].join('\n');
  });
  return [
    `Giai đoạn ${execution.stage.stageNumber}: ${execution.revision.outline.title} [${execution.stage.stageId}] revision=${execution.stage.activeRevision}`,
    `Mục tiêu giai đoạn: ${execution.revision.outline.goal}`,
    `Hình thái nhịp giai đoạn: ${describeStageTempo_ACU(execution.revision.outline.tempo)} — nó quyết định mức sàn của các lượt áp lực thấp trong giai đoạn này, cũng quyết định giai đoạn kế tiếp không được chọn hình thái nào.`,
    `Chức trách cấu trúc giai đoạn: ${execution.revision.outline.role ?? 'snapshot cũ chưa đánh dấu'}`,
    `Mục tiêu thời gian giai đoạn: ${execution.revision.outline.timeSpanGoal ?? 'chưa đặt'}`,
    `Tiến độ lượt trong giai đoạn: lượt ${execution.turnNumber} / ${execution.revision.outline.totalTurns}`,
    'Dàn ý giai đoạn đang bật (toàn bộ nút và lượt; trong ngoặc lần lượt nêu pacing, function, mainline, time và anchor tùy chọn):',
    nodeBlocks.join('\n\n'),
    renderAgentTurnPacingGuidance_ACU(execution.turn.pacing),
    'Lưu ý: dàn ý là kế hoạch, không phải sự thật đã xảy ra.',
  ].join('\n');
}

/**
 * 渲染大纲游标的一行状态，进入主 Agent 骨架的 $OUTLINE_STATE。
 * 完整大纲窗口靠 read $OUTLINE_WINDOW 调阅，骨架只保留「现在在哪」。
 * @param context 解析上下文
 * @returns 一行状态文本
 */
export function renderAgentOutlineState_ACU(context: AgentResolveContext_ACU): string {
  const { execution } = context;
  const catalog = execution.task.stages.map(stage => `Giai đoạn ${stage.stageNumber} [${stage.stageId}] revision=${stage.activeRevision} status=${stage.status} đã hoàn thành ${stage.completedTurns} lượt`).join('; ');
  const state = renderCurrentAgentOutlineState_ACU(context);
  return catalog ? `${state}\nDanh mục tiến độ giai đoạn: ${catalog}. Dùng adjust_progress để chọn giai đoạn và lượt kế, hoặc sửa trạng thái hoàn tất của giai đoạn; tổng cương có thể sửa bằng correct_materials hoặc delegate arc-architect, dàn ý giai đoạn thì delegate riêng outline-architect.` : state;
}

function renderCurrentAgentOutlineState_ACU(context: AgentResolveContext_ACU): string {
  const { execution } = context;
  if (!execution.stage) return 'Trạng thái dàn ý: chưa có dàn ý giai đoạn (quy trình cố định open_round tạo trước, sau đó mới có thể giao).';
  if (execution.stage.status === 'completed') {
    return `Trạng thái dàn ý: giai đoạn ${execution.stage.stageNumber} đã hoàn thành toàn bộ, quy trình cố định open_round chuẩn bị dàn ý giai đoạn kế tiếp.`;
  }
  if (!execution.revision || !execution.node || !execution.turn) {
    return `Trạng thái dàn ý: dàn ý của giai đoạn ${execution.stage.stageNumber} hiện không khả thi (có thể đang chờ xác nhận hoặc con trỏ không hợp lệ).`;
  }
  return `Trạng thái dàn ý: giai đoạn ${execution.stage.stageNumber} "${execution.revision.outline.title}" (hình thái nhịp ${describeStageTempo_ACU(execution.revision.outline.tempo)}, chức trách cấu trúc ${execution.revision.outline.role ?? 'chưa đánh dấu'}), lượt ${execution.turnNumber}/${execution.revision.outline.totalTurns}, nút hiện tại [${execution.node.id}], lượt hiện tại [${execution.turn.id}], ${renderTurnSemanticMeta_ACU(execution.turn)}. Cửa sổ dàn ý đầy đủ xem bằng read $OUTLINE_WINDOW.`;
}

const ROW_RANGE_PATTERN_ACU = /^(\d+)-(\d+)$/;

function parseRowRange_ACU(raw: string): AgentTableRowRange_ACU | null {
  const matched = ROW_RANGE_PATTERN_ACU.exec(raw.trim());
  if (!matched) return null;
  return { start: Number.parseInt(matched[1], 10), end: Number.parseInt(matched[2], 10) };
}

function splitIdSuffix_ACU(token: string, prefix: string): string[] | null {
  if (token === prefix) return [];
  if (!token.startsWith(`${prefix}:`)) return null;
  return token.slice(prefix.length + 1).split(/[,，]/).map(id => id.trim()).filter(Boolean);
}

function resolveTableToken_ACU(token: string, context: AgentResolveContext_ACU): { title: string; text: string; status?: 'failed' } {
  const body = token.slice(AGENT_TABLE_TOKEN_PREFIX_ACU.length).trim();
  // 末段若形如 a-b 视为行区间，其余部分是表名——表名本身可能含冒号之外的任意字符。
  const lastColon = body.lastIndexOf(':');
  const rangeCandidate = lastColon >= 0 ? parseRowRange_ACU(body.slice(lastColon + 1)) : null;
  const name = rangeCandidate ? body.slice(0, lastColon).trim() : body;
  const title = rangeCandidate ? `Bảng "${name}" hàng ${rangeCandidate.start}-${rangeCandidate.end}` : `Bảng "${name}"`;
  const sheets = findAgentSheetsByAliases_ACU([name], context.tableData);
  if (!name || sheets.length !== 1) return { title, text: `Địa chỉ bảng "${token}" không thể định vị duy nhất bảng đã tải, hãy đối chiếu danh mục bảng.`, status: 'failed' };
  if (rangeCandidate && (!Number.isSafeInteger(rangeCandidate.start) || !Number.isSafeInteger(rangeCandidate.end)
    || rangeCandidate.start < 1 || rangeCandidate.end < rangeCandidate.start || rangeCandidate.end > sheets[0].rows.length)) {
    return { title, text: `Khoảng hàng của địa chỉ bảng "${token}" không hợp lệ hoặc vượt phạm vi bảng (tổng ${sheets[0].rows.length} hàng), hãy sửa rồi đọc lại.`, status: 'failed' };
  }
  return { title, text: renderAgentTableByName_ACU(name, context.tableData, rangeCandidate ?? undefined) };
}

function resolveWorldbookToken_ACU(token: string, context: AgentResolveContext_ACU): { title: string; text: string; status?: 'failed' } {
  const worldbook = context.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
  const body = token.slice(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU.length);
  const lastColon = body.lastIndexOf(':');
  if (lastColon <= 0) {
    return { title: 'Mục sổ thế giới', text: 'Địa chỉ đọc sổ thế giới không đầy đủ: cách viết là $WORLDBOOK:tên_sách:uid (nhiều uid ngăn cách bằng dấu phẩy), hãy sao chép địa chỉ từ danh mục sổ thế giới.', status: 'failed' };
  }
  const bookName = body.slice(0, lastColon).trim();
  const uids = body.slice(lastColon + 1).split(/[,，]/).map(uid => uid.trim());
  if (!worldbook.available) return { title: 'Mục sổ thế giới', text: 'Đọc snapshot sổ thế giới thất bại, không được coi là không có mục nào.', status: 'failed' };
  if (!bookName || uids.some(uid => !uid || !worldbook.entries.some(entry => entry.bookName === bookName && entry.uid === uid))) {
    return { title: 'Mục sổ thế giới', text: `Địa chỉ sổ thế giới "${token}" không khớp đầy đủ với các mục đã bật, hãy đối chiếu tên sách và uid từ danh mục sổ thế giới.`, status: 'failed' };
  }
  return { title: `Sổ thế giới "${bookName}" mục ${uids.join(', ')}`, text: renderAgentWorldbookEntries_ACU(worldbook, bookName, uids) };
}

/**
 * 解析一个读集 token 的内容。
 *
 * 支持的地址体系（与各资料目录里给出的读取地址一一对应）：
 * - `$STORY_RANGE:a-b` 窗口内正文楼层区间；`$STORY_CATALOG` 楼层索引
 * - `$STORY_OVERVIEW` 事件概览；`$STORY_TAIL` 尾部全文楼层
 * - `$TABLE:表名` / `$TABLE:表名:a-b` 整表或行区间
 * - `$STORY_ARC[:ID,ID]` / `$HOOKS_LEDGER[:ID,ID]` / `$INFO_GAP[:ID,ID]` / `$ACTIVE_CONSTRAINTS[:ID,ID]` 模块全量或按 ID 精读
 * - `$WORLDBOOK:书名:uid[,uid]` 已启用世界书条目全文
 * - 旧固定 token（$STORY_TEXT / $OUTLINE_WINDOW 等）保留兼容
 * @param token 读集标识符
 * @param context 解析上下文
 * @returns { title, text } 分节标题与正文；未知 token 的 text 会明确说明不可读
 */
export function resolveAgentReadToken_ACU(token: string, context: AgentResolveContext_ACU): { title: string; text: string; status?: 'failed' } {
  const normalized = String(token ?? '').trim();
  if (normalized.startsWith(AGENT_TABLE_TOKEN_PREFIX_ACU)) return resolveTableToken_ACU(normalized, context);
  if (normalized.startsWith(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU)) return resolveWorldbookToken_ACU(normalized, context);
  if (normalized.startsWith(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU)) {
    const body = normalized.slice(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU.length).trim();
    const matched = /^(\d+)-(\d+)$/.exec(body);
    const start = matched ? Number(matched[1]) : NaN;
    const end = matched ? Number(matched[2]) : NaN;
    const invalidSyntax = !matched || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end;
    const floors = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end
      ? listAgentStoryWindowFloors_ACU(context) : [];
    const valid = floors.length > 0 && start >= floors[0].index && end <= floors[floors.length - 1].index
      && floors.some(floor => floor.index >= start && floor.index <= end);
    return {
      title: matched ? `Tầng chính văn ${matched[1]}-${matched[2]}` : 'Khoảng tầng chính văn',
      text: invalidSyntax
        ? `Khoảng tầng "${normalized}" không hợp lệ: cách viết là $STORY_RANGE:tầng_đầu-tầng_cuối (hai đầu đều là số tầng, đầu không lớn hơn cuối). Các tầng khả dụng xem trong danh mục chính văn.`
        : valid
        ? renderAgentStoryRange_ACU(context, matched![1], matched![2])
        : `Khoảng tầng "${normalized}" không thể đọc đầy đủ: cách viết là $STORY_RANGE:tầng_đầu-tầng_cuối, phạm vi phải nằm trong cửa sổ đọc chính văn hiện tại. Các tầng khả dụng xem trong danh mục chính văn; mạch cốt truyện sớm hơn hãy xem tổng quan sự kiện hoặc dùng $TABLE:纪要表:khoảng hàng để đọc kỹ.`,
      ...(!valid ? { status: 'failed' as const } : {}),
    };
  }

  if (normalized.startsWith('$FIELD:')) {
    const match = /^\$FIELD:(storyArc|hooks|infoGap|chronology|webRefs|constraints):([^:]+)(?::([^:]+))?$/.exec(normalized);
    if (!match) return { title: 'Cột tư liệu', text: 'Địa chỉ cột không hợp lệ: $FIELD:mô-đun:ID[:cột].', status: 'failed' };
    const [, moduleName, id, field] = match;
    const module = moduleName as keyof typeof AGENT_MODULE_FIELD_MATRIX_ACU;
    if (field && !AGENT_MODULE_FIELD_MATRIX_ACU[module].fields.includes(field)) return { title: 'Cột tư liệu', text: `Cột ${module}.${field} không nằm trong ma trận trường được kiểm soát.`, status: 'failed' };
    const folded = readAgentModuleFoldState_ACU(context.chat);
    if (folded.salvaged || folded.candidates.some(item => !item.valid)) return { title: 'Đọc cột tư liệu thất bại', text: 'Kiểm tra khung tư liệu thất bại; không được diễn giải dữ liệu hỏng thành trạng thái rỗng.', status: 'failed' };
    const record = folded.fields.records[module]?.[id];
    return { title: `Cột tư liệu ${module}#${id}`, text: JSON.stringify(record
      ? { module, id, status: record.status, missingFields: record.missingFields,
        fields: field ? { [field]: record.fields[field] ?? null } : record.fields,
        revisions: folded.snapshot.revisions[module] }
      : { module, id, status: 'unwritten', missingFields: AGENT_MODULE_FIELD_MATRIX_ACU[module].required, revisions: folded.snapshot.revisions[module] }) };
  }

  const storyArcIds = splitIdSuffix_ACU(normalized, '$STORY_ARC');
  if (storyArcIds !== null) {
    const completedStageNumbers = context.execution.task.stages
      .filter(stage => stage.status === 'completed')
      .map(stage => stage.stageNumber);
    return { title: storyArcIds.length ? `Mục tổng cương câu chuyện ${storyArcIds.join(', ')}` : 'Tổng cương câu chuyện (toàn bộ mục đang hoạt động)', text: renderAgentStoryArcByIds_ACU(context.moduleSnapshot, storyArcIds.length ? storyArcIds : undefined, completedStageNumbers) };
  }
  const hookIds = splitIdSuffix_ACU(normalized, '$HOOKS_LEDGER');
  if (hookIds !== null) {
    return { title: hookIds.length ? `Mục sổ phục bút ${hookIds.join(', ')}` : 'Sổ phục bút (toàn bộ mục đang hoạt động)', text: renderAgentHooksByIds_ACU(context.moduleSnapshot, hookIds.length ? hookIds : undefined) };
  }
  const infoGapIds = splitIdSuffix_ACU(normalized, '$INFO_GAP');
  if (infoGapIds !== null) {
    return { title: infoGapIds.length ? `Mục chênh lệch thông tin ${infoGapIds.join(', ')}` : 'Dòng thời gian nhận thức và chênh lệch thông tin (toàn bộ mục đang hoạt động)', text: renderAgentInfoGapByIds_ACU(context.moduleSnapshot, infoGapIds.length ? infoGapIds : undefined) };
  }
  const constraintIds = splitIdSuffix_ACU(normalized, '$ACTIVE_CONSTRAINTS');
  if (constraintIds !== null) {
    return { title: constraintIds.length ? `Mục ràng buộc dài hạn ${constraintIds.join(', ')}` : 'Ràng buộc dài hạn (toàn bộ mục)', text: renderAgentConstraintsByIds_ACU(context.moduleSnapshot, constraintIds.length ? constraintIds : undefined) };
  }
  const chronologyIds = splitIdSuffix_ACU(normalized, '$CHRONOLOGY');
  if (chronologyIds !== null) {
    return chronologyIds.length
      ? { title: `Mục niên đại học câu chuyện ${chronologyIds.join(', ')}`, text: renderAgentChronologyByIds_ACU(context.moduleSnapshot, chronologyIds) }
      : { title: 'Sổ niên đại học câu chuyện (các sự thật thời gian được quyết toán từ chính văn đã xảy ra)', text: renderAgentChronology_ACU(context.moduleSnapshot) };
  }
  const webRefIds = splitIdSuffix_ACU(normalized, '$WEB_REFS');
  if (webRefIds !== null) {
    return {
      title: webRefIds.length ? `Mục kho tư liệu bách khoa ${webRefIds.join(', ')} (tham khảo bên ngoài, không phải sự thật của câu chuyện này)` : 'Kho tư liệu bách khoa (tóm tắt toàn bộ mục đang hoạt động; tham khảo bên ngoài, không phải sự thật của câu chuyện này)',
      text: renderAgentWebRefsByIds_ACU(context.moduleSnapshot, webRefIds.length ? webRefIds : undefined),
    };
  }

  const title = READ_TOKEN_TITLES_ACU[normalized] ?? normalized;
  switch (normalized) {
    case '$STORY_TEXT': return { title, text: renderAgentStoryText_ACU(context) };
    case '$STORY_CATALOG': return { title, text: renderAgentStoryCatalog_ACU(context) };
    case '$STORY_OVERVIEW': return { title, text: renderAgentStoryOverview_ACU(context) };
    case '$STORY_TAIL': return { title, text: renderAgentStoryTail_ACU(context) };
    case '$HISTORY_UNSETTLED': return { title, text: renderAgentUnsettledHistory_ACU(context) };
    case '$OUTLINE_WINDOW': return { title, text: renderAgentOutlineWindow_ACU(context) };
    case '$CURRENT_TURN_GOAL': return { title, text: context.execution.turn?.goal || '(chưa có lượt dàn ý khả thi, mục tiêu lượt này sẽ được xác định sau khi dàn ý được tạo hoặc tiếp tục)' };
    case '$CURRENT_TURN_PACING': return { title, text: renderAgentTurnGuidance_ACU(context.execution.turn ?? null) };
    case '$USER_INTENT': return { title, text: context.originInstruction || '(Người dùng chưa cung cấp yêu cầu ban đầu)' };
    case '$USER_REQUIREMENTS': return { title, text: renderAgentUserRequirements_ACU(context.moduleSnapshot, context.originInstruction) };
    case '$TABLE_GLOBAL': return { title, text: renderAgentTableByAliases_ACU('global', context.tableData) };
    case '$TABLE_CHARACTERS': return { title, text: renderAgentTableByAliases_ACU('characters', context.tableData) };
    case '$TABLE_CHRONICLES': return { title, text: renderAgentTableByAliases_ACU('chronicles', context.tableData) };
    default: return { title, text: `Placeholder ${normalized || '(rỗng)'} không phải giao diện tư liệu đọc được, lần này không cung cấp nội dung nào cho bạn. Hãy sao chép địa chỉ đọc từ các danh mục tư liệu.`, status: 'failed' };
  }
}

export interface AgentResolvedRead_ACU {
  title: string;
  text: string;
  status?: 'failed';
  proof?: AgentReadFenceProof_ACU;
}

function fingerprintAgentReadText_ACU(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function readModuleRevisionKey_ACU(token: string): keyof AgentModuleSnapshot_ACU['revisions'] | null {
  if (token.startsWith('$STORY_ARC') || token.startsWith('$FIELD:storyArc:')) return 'storyArc';
  if (token.startsWith('$HOOKS_LEDGER') || token.startsWith('$FIELD:hooks:')) return 'hooks';
  if (token.startsWith('$INFO_GAP') || token.startsWith('$FIELD:infoGap:')) return 'infoGap';
  if (token.startsWith('$ACTIVE_CONSTRAINTS') || token.startsWith('$FIELD:constraints:')) return 'constraints';
  if (token.startsWith('$CHRONOLOGY') || token.startsWith('$FIELD:chronology:')) return 'chronology';
  if (token.startsWith('$WEB_REFS') || token.startsWith('$FIELD:webRefs:')) return 'webRefs';
  if (token === '$USER_REQUIREMENTS') return 'userRequirements';
  return null;
}

function resolvedFenceForReadToken_ACU(token: string, context: AgentResolveContext_ACU): AgentReadFence_ACU {
  const storyRange = token.startsWith(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU)
    ? /^(\d+)-(\d+)$/.exec(token.slice(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU.length).trim())
    : null;
  if (storyRange) return { lower: Number(storyRange[1]), upper: Number(storyRange[2]) };

  if (token.startsWith(AGENT_TABLE_TOKEN_PREFIX_ACU)) {
    const body = token.slice(AGENT_TABLE_TOKEN_PREFIX_ACU.length).trim();
    const lastColon = body.lastIndexOf(':');
    const range = lastColon >= 0 ? parseRowRange_ACU(body.slice(lastColon + 1)) : null;
    const name = range ? body.slice(0, lastColon).trim() : body;
    const sheets = findAgentSheetsByAliases_ACU([name], context.tableData);
    if (sheets.length === 1) {
      return range
        ? { lower: range.start, upper: range.end }
        : sheets[0].rows.length ? { lower: 1, upper: sheets[0].rows.length } : { lower: 0, upper: 0 };
    }
  }

  if (token.startsWith(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU)) {
    const body = token.slice(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU.length);
    const lastColon = body.lastIndexOf(':');
    const uids = lastColon > 0 ? body.slice(lastColon + 1).split(/[,，]/).map(uid => uid.trim()).filter(Boolean) : [];
    if (uids.length) return { lower: uids[0], upper: uids[uids.length - 1] };
  }

  for (const prefix of ['$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$WEB_REFS'] as const) {
    const ids = splitIdSuffix_ACU(token, prefix);
    if (ids !== null) return ids.length ? { lower: ids[0], upper: ids[ids.length - 1] } : { lower: '*', upper: '*' };
  }
  return { lower: token, upper: token };
}

function fenceContains_ACU(resolved: AgentReadFence_ACU, requested?: AgentReadFence_ACU): boolean {
  if (!requested) return true;
  const compare = (actual: string | number, boundary: string | number, lower: boolean): boolean => {
    if (typeof actual !== typeof boundary) return false;
    if (typeof actual === 'number' && typeof boundary === 'number') return lower ? actual >= boundary : actual <= boundary;
    if (actual === '*' || boundary === '*') return actual === boundary;
    const result = String(actual).localeCompare(String(boundary));
    return lower ? result >= 0 : result <= 0;
  };
  if (requested.lower !== undefined && (resolved.lower === undefined || !compare(resolved.lower, requested.lower, true))) return false;
  if (requested.upper !== undefined && (resolved.upper === undefined || !compare(resolved.upper, requested.upper, false))) return false;
  return true;
}

/**
 * 解析资料并附带可回溯的围栏证明。旧调用方继续使用 resolveAgentReadToken_ACU；
 * 原生 read 运行时必须使用本函数，不能把“已解析正文”冒充成 proof。
 */
export function resolveAgentReadTokenWithProof_ACU(
  token: string,
  context: AgentResolveContext_ACU,
  requestedFence?: AgentReadFence_ACU,
): AgentResolvedRead_ACU {
  const resolved = resolveAgentReadToken_ACU(token, context);
  if (resolved.status === 'failed') return resolved;
  const stableAddress = String(token ?? '').trim();
  const resolvedFence = resolvedFenceForReadToken_ACU(stableAddress, context);
  const completeWithinFence = fenceContains_ACU(resolvedFence, requestedFence);
  const revisionKey = readModuleRevisionKey_ACU(stableAddress);
  const revision = revisionKey
    ? context.moduleSnapshot.revisions[revisionKey]
    : fingerprintAgentReadText_ACU(resolved.text);
  const proof: AgentReadFenceProof_ACU = {
    ...(requestedFence === undefined ? {} : { requestedFence }),
    resolvedFence,
    stableAddress,
    revision,
    completeWithinFence,
  };
  if (!completeWithinFence) {
    return {
      title: resolved.title,
      text: `Phạm vi thực tế của địa chỉ đọc "${stableAddress}" vượt quá requestedFence, đã từ chối tiêm.`,
      status: 'failed',
      proof,
    };
  }
  return { ...resolved, proof };
}

/**
 * 可按前缀收窄的读取地址坐标轴：共 length 个坐标点，addressAt(i) 是恰好覆盖前 i+1 个坐标点的稳定地址，
 * remainderAfter(i) 是覆盖其余坐标点的稳定地址（i 已是末点时为 null）。
 */
export interface AgentReadAddressAxis_ACU {
  length: number;
  addressAt: (index: number) => string;
  remainderAfter: (index: number) => string | null;
}

/**
 * 把读取地址映射成整数坐标轴，供 60% 默认上围栏在地址自身坐标系内解析子范围。
 * 楼层区间与表格行区间是连续整数坐标；世界书 uid 与模块 ID 是字符串坐标，按列表位置映射为长度上界——
 * token 预算只决定取前几项，从不写进字符串坐标本身。整模块、字段帧和固定资料没有可证明的子范围，
 * 只有一个坐标点的地址也无可收窄，二者都返回 null（原子地址）。
 */
export function resolveAgentReadAddressAxis_ACU(token: string, context: AgentResolveContext_ACU): AgentReadAddressAxis_ACU | null {
  const normalized = String(token ?? '').trim();
  if (normalized.startsWith(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU)) {
    const matched = /^(\d+)-(\d+)$/.exec(normalized.slice(AGENT_STORY_RANGE_TOKEN_PREFIX_ACU.length).trim());
    if (!matched) return null;
    const start = Number(matched[1]);
    const end = Number(matched[2]);
    const hit = listAgentStoryWindowFloors_ACU(context).filter(floor => floor.index >= start && floor.index <= end);
    return hit.length > 1 ? {
      length: hit.length,
      addressAt: index => `${AGENT_STORY_RANGE_TOKEN_PREFIX_ACU}${start}-${hit[index].index}`,
      remainderAfter: index => (index + 1 < hit.length ? `${AGENT_STORY_RANGE_TOKEN_PREFIX_ACU}${hit[index + 1].index}-${end}` : null),
    } : null;
  }
  if (normalized.startsWith(AGENT_TABLE_TOKEN_PREFIX_ACU)) {
    const body = normalized.slice(AGENT_TABLE_TOKEN_PREFIX_ACU.length).trim();
    const lastColon = body.lastIndexOf(':');
    const range = lastColon >= 0 ? parseRowRange_ACU(body.slice(lastColon + 1)) : null;
    const name = range ? body.slice(0, lastColon).trim() : body;
    const sheets = name ? findAgentSheetsByAliases_ACU([name], context.tableData) : [];
    if (sheets.length !== 1) return null;
    const start = range?.start ?? 1;
    const end = range?.end ?? sheets[0].rows.length;
    return end > start ? {
      length: end - start + 1,
      addressAt: index => `${AGENT_TABLE_TOKEN_PREFIX_ACU}${name}:${start}-${start + index}`,
      remainderAfter: index => (start + index < end ? `${AGENT_TABLE_TOKEN_PREFIX_ACU}${name}:${start + index + 1}-${end}` : null),
    } : null;
  }
  if (normalized.startsWith(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU)) {
    const body = normalized.slice(AGENT_WORLDBOOK_TOKEN_PREFIX_ACU.length);
    const lastColon = body.lastIndexOf(':');
    if (lastColon <= 0) return null;
    const bookName = body.slice(0, lastColon).trim();
    const uids = body.slice(lastColon + 1).split(/[,，]/).map(uid => uid.trim());
    return uids.length > 1 && uids.every(Boolean)
      ? {
        length: uids.length,
        addressAt: index => `${AGENT_WORLDBOOK_TOKEN_PREFIX_ACU}${bookName}:${uids.slice(0, index + 1).join(',')}`,
        remainderAfter: index => (index + 1 < uids.length ? `${AGENT_WORLDBOOK_TOKEN_PREFIX_ACU}${bookName}:${uids.slice(index + 1).join(',')}` : null),
      }
      : null;
  }
  for (const prefix of ['$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$WEB_REFS'] as const) {
    const ids = splitIdSuffix_ACU(normalized, prefix);
    if (ids !== null) {
      return ids.length > 1 ? {
        length: ids.length,
        addressAt: index => `${prefix}:${ids.slice(0, index + 1).join(',')}`,
        remainderAfter: index => (index + 1 < ids.length ? `${prefix}:${ids.slice(index + 1).join(',')}` : null),
      } : null;
    }
  }
  return null;
}

/**
 * 把一批读集 token 渲染成一整块注入材料。
 * @param tokens 读集标识符列表
 * @param context 解析上下文
 * @returns 分节材料文本；读集为空时如实标注
 */
export function renderAgentReadMaterials_ACU(tokens: readonly string[], context: AgentResolveContext_ACU): string {
  const unique = [...new Set(tokens.map(token => String(token ?? '').trim()).filter(Boolean))];
  if (!unique.length) return 'Lần này không tiêm tư liệu nào cho bạn. Bạn chỉ có thể trả lời dựa trên mô tả tác vụ, thông tin còn thiếu phải đánh dấu "thiếu thông tin".';
  return unique
    .map(token => { const resolved = resolveAgentReadToken_ACU(token, context); return `### ${resolved.title} (${token})\n${resolved.text}`; })
    .join('\n\n');
}
