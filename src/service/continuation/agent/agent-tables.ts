/**
 * service/continuation/agent/agent-tables.ts — 表格系统的只读投影
 *
 * 表名由用户模板决定，不能硬编码物理标识。三张保底表按别名列表匹配，
 * 别名取值与工程既有惯例一致（如纪要表在多处按 name === '纪要表' 取表）。
 * 命中零张或多张都如实标注，绝不猜测目标表。
 */

import { currentJsonTableData_ACU } from '../../runtime/state-manager';
import { getCurrentFlightModeState_ACU } from '../../flight-mode/flight-mode-state';
import { projectFlightModeHiddenChronicleRows_ACU } from '../../flight-mode/flight-mode-hidden-rows';

export const AGENT_TABLE_ALIASES_ACU = {
  global: ['全局数据表', '全局表', '总体大纲'],
  characters: ['角色表', '重要人物表', '人物表'],
  chronicles: ['纪要表', '总结表'],
} as const;

export type AgentGuaranteedTable_ACU = keyof typeof AGENT_TABLE_ALIASES_ACU;

const TABLE_LABELS_ACU: Record<AgentGuaranteedTable_ACU, string> = {
  global: '全局数据表',
  characters: '角色表',
  chronicles: '纪要表',
};

interface AgentSheetView_ACU {
  name: string;
  header: string[];
  rows: string[][];
}

/**
 * Agent 读取的表格数据。经典表格模式下只保留未被大总结归纳的纪要行，与世界书常驻条目一致；
 * 投影失败时不暴露纪要表（fail-closed），已归纳的纪要改由大总结承载。
 */
export function readAgentTableData_ACU(tableData?: unknown): Record<string, any> {
  const source = tableData ?? currentJsonTableData_ACU;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const data = source as Record<string, any>;
  let state: ReturnType<typeof getCurrentFlightModeState_ACU>;
  try {
    state = getCurrentFlightModeState_ACU();
  } catch (_) {
    return data;
  }
  if (!state.enabled || state.hiddenRowIds.length === 0) return data;
  try {
    return projectFlightModeHiddenChronicleRows_ACU(data, state);
  } catch (_) {
    return Object.fromEntries(Object.entries(data)
      .filter(([key, sheet]: [string, any]) => !(key.startsWith('sheet_') && sheet?.name === '纪要表')));
  }
}

function readTableData_ACU(tableData?: unknown): Record<string, any> {
  return readAgentTableData_ACU(tableData);
}

function toSheetView_ACU(sheet: any): AgentSheetView_ACU | null {
  if (!sheet || typeof sheet !== 'object') return null;
  const name = String(sheet.name ?? '').trim();
  const content = Array.isArray(sheet.content) ? sheet.content : [];
  if (!name || !Array.isArray(content[0])) return null;
  const header = content[0].map((cell: unknown) => String(cell ?? '').trim());
  const rows = content.slice(1)
    .filter((row: unknown) => Array.isArray(row))
    .map((row: any[]) => row.map(cell => String(cell ?? '').trim()));
  return { name, header, rows };
}

function listSheetViews_ACU(tableData?: unknown): AgentSheetView_ACU[] {
  return Object.entries(readTableData_ACU(tableData))
    .filter(([key]) => key !== 'mate')
    .flatMap(([, sheet]) => { const view = toSheetView_ACU(sheet); return view ? [view] : []; });
}

/**
 * 按别名列表查找 sheet。
 * @param aliases 候选表名
 * @param tableData 表格数据对象，缺省取运行时快照
 * @returns 命中的 sheet 视图列表，可能为空或多条
 */
export function findAgentSheetsByAliases_ACU(aliases: readonly string[], tableData?: unknown): AgentSheetView_ACU[] {
  return listSheetViews_ACU(tableData).filter(view => aliases.includes(view.name));
}

/** 行区间，1 基且含两端。 */
export interface AgentTableRowRange_ACU {
  start: number;
  end: number;
}

/**
 * 把一张表渲染成紧凑文本。
 * @param view sheet 视图
 * @param range 可选行区间（1 基含两端）；只渲染区间内的行，行号保持全表口径
 * @returns 形如「表名（共 N 行）\n列: a | b\n1. x | y」的文本
 */
export function renderAgentSheet_ACU(view: AgentSheetView_ACU, range?: AgentTableRowRange_ACU): string {
  const lines = [`Tên bảng: ${view.name} (tổng ${view.rows.length} hàng)`, `Cột: ${view.header.join(' | ')}`];
  if (!view.rows.length) {
    lines.push('(bảng này chưa có hàng dữ liệu)');
    return lines.join('\n');
  }
  if (!range) {
    view.rows.forEach((row, index) => lines.push(`${index + 1}. ${row.join(' | ')}`));
    return lines.join('\n');
  }
  const start = Math.max(1, range.start);
  const end = Math.min(view.rows.length, range.end);
  if (start > end) {
    lines.push(`Khoảng hàng yêu cầu ${range.start}-${range.end} vượt phạm vi: bảng này chỉ có hàng 1-${view.rows.length}. Hãy sửa khoảng rồi đọc lại.`);
    return lines.join('\n');
  }
  lines.push(`(chỉ liệt kê hàng ${start}-${end})`);
  for (let index = start; index <= end; index += 1) lines.push(`${index}. ${view.rows[index - 1].join(' | ')}`);
  return lines.join('\n');
}

/**
 * 渲染一张保底表。缺失或同名多张都如实标注。
 * @param table 保底表标识
 * @param tableData 表格数据对象，缺省取运行时快照
 * @returns 自然语言文本
 */
export function renderAgentTableByAliases_ACU(table: AgentGuaranteedTable_ACU, tableData?: unknown): string {
  const matched = findAgentSheetsByAliases_ACU(AGENT_TABLE_ALIASES_ACU[table], tableData);
  if (!matched.length) {
    return `Cuộc trò chuyện hiện tại không có ${TABLE_LABELS_ACU[table]} (đã tìm theo các tên bảng ứng viên ${AGENT_TABLE_ALIASES_ACU[table].join(', ')}). Đừng suy diễn nội dung từ đó, khi cần loại thông tin này hãy dùng bảng thực sự tồn tại trong danh mục bảng.`;
  }
  if (matched.length === 1) return renderAgentSheet_ACU(matched[0]);
  const header = `Khớp ${matched.length} bảng cùng tên hoặc cùng loại, liệt kê tất cả, hãy tự phán đoán dùng bảng nào:`;
  return [header, ...matched.map(view => renderAgentSheet_ACU(view))].join('\n\n');
}

/**
 * 按精确表名渲染一张表，支撑 `$TABLE:<表名>` 与 `$TABLE:<表名>:a-b` 形式的读集。
 * @param name 表名
 * @param tableData 表格数据对象，缺省取运行时快照
 * @param range 可选行区间（1 基含两端）
 * @returns 自然语言文本；不存在时如实标注
 */
export function renderAgentTableByName_ACU(name: string, tableData?: unknown, range?: AgentTableRowRange_ACU): string {
  const target = String(name ?? '').trim();
  if (!target) return 'Tên bảng trong tập đọc rỗng, không thể đọc.';
  const matched = listSheetViews_ACU(tableData).filter(view => view.name === target);
  if (!matched.length) return `Cuộc trò chuyện hiện tại không có bảng tên "${target}". Tên bảng khả dụng xem trong danh mục bảng.`;
  if (matched.length === 1) return renderAgentSheet_ACU(matched[0], range);
  return [`Khớp ${matched.length} bảng tên "${target}", liệt kê tất cả:`, ...matched.map(view => renderAgentSheet_ACU(view, range))].join('\n\n');
}

/**
 * 渲染表格目录。目录是权威来源：主 Agent 据此知道当前聊天到底有哪些表可读。
 * @param tableData 表格数据对象，缺省取运行时快照
 * @returns 每行一张表的目录文本
 */
export function renderAgentTableCatalog_ACU(tableData?: unknown): string {
  const views = listSheetViews_ACU(tableData);
  if (!views.length) return 'Cuộc trò chuyện hiện tại không có bảng nào đọc được.';
  const lines = views.map(view => `- ${view.name} (${view.rows.length} hàng) cột: ${view.header.join(' | ')}｜đọc cả bảng: $TABLE:${view.name}｜đọc theo khoảng hàng: $TABLE:${view.name}:hàng_đầu-hàng_cuối`);
  return ['Sau đây là toàn bộ bảng thực sự tồn tại trong cuộc trò chuyện hiện tại; chỉ các bảng được liệt kê ở đây mới đọc được:', ...lines].join('\n');
}
