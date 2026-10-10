/**
 * service/continuation/agent/agent-search.ts — 五域 grep 式搜索工具
 *
 * 搜索域即资料域：story（窗口内 AI 正文）、tables（全部表格行）、modules（伏笔/信息差/约束/
 * 总纲/年代学/百科资料库，含退休条目）、outline（当前修订的大纲文本）、worldbook（已启用条目全文）。
 * 互联网检索不在此列——那是 web-researcher 专用的出网工具，见 agent-web-client.ts。
 *
 * 核心原则「地址即读法」：每条命中都附带可直接复制进 read 的读取地址。
 * 三层护栏（照抄奶龙code search_in_files 思路）：单行居中截断、maxResults 条数上限、
 * 结果总量字符预算，超出即停止收集并如实标注截断。
 *
 * 执行零成本：运行时本地执行，不发 AI 调用。
 */

import type { AgentSearchCall_ACU, AgentSearchScope_ACU } from './agent-model';
import {
  listAgentStoryWindowFloors_ACU,
  type AgentResolveContext_ACU,
} from './agent-placeholder-resolver';
import { buildEmptyAgentWorldbookSnapshot_ACU } from './agent-worldbook-read';
import { currentJsonTableData_ACU } from '../../runtime/state-manager';
import { readAgentTableData_ACU } from './agent-tables';

/** 单行片段上限：匹配词居中开窗。 */
const SEARCH_LINE_SNIPPET_LIMIT_ACU = 300;
/** 结果总量字符预算：超出即停止收集。 */
const SEARCH_TOTAL_CHAR_BUDGET_ACU = 20000;
/** 每条命中的结构开销估算（标签、地址、分隔符）。 */
const SEARCH_HIT_OVERHEAD_ACU = 60;
/** isRegex 模式的正则长度上限：模型产出的超长模式几乎必然是错误或病态回溯，直接拒绝并要求修正。 */
const SEARCH_REGEX_MAX_LENGTH_ACU = 300;

interface AgentSearchLine_ACU {
  /** 人类可读位置，如「楼层12 第3行」「角色表 第5行」。 */
  label: string;
  /** 可直接复制进 read 的读取地址。 */
  address: string;
  text: string;
}

interface AgentSearchHit_ACU {
  scope: AgentSearchScope_ACU;
  label: string;
  address: string;
  snippet: string;
}

function escapeRegex_ACU(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 匹配词居中开窗截断单行，沿用奶龙code createMatchLineSnippet 的思路。 */
export function createAgentMatchSnippet_ACU(line: string, matchStart: number, matchLength: number, limit = SEARCH_LINE_SNIPPET_LIMIT_ACU): string {
  if (line.length <= limit) return line;
  const start = Math.max(0, matchStart);
  const end = Math.max(start, start + Math.max(0, matchLength));
  const half = Math.floor(limit / 2);
  let windowStart = Math.max(0, start - half);
  let windowEnd = windowStart + limit;
  if (windowEnd < end) {
    windowEnd = Math.min(line.length, end + half);
    windowStart = Math.max(0, windowEnd - limit);
  }
  if (windowEnd > line.length) {
    windowEnd = line.length;
    windowStart = Math.max(0, windowEnd - limit);
  }
  let snippet = line.slice(windowStart, windowEnd);
  if (windowStart > 0) snippet = `…${snippet}`;
  if (windowEnd < line.length) snippet = `${snippet}…`;
  return snippet;
}

function splitLines_ACU(text: string): string[] {
  return text.split(/\r?\n/);
}

function collectStoryLines_ACU(context: AgentResolveContext_ACU): AgentSearchLine_ACU[] {
  return listAgentStoryWindowFloors_ACU(context).flatMap(floor =>
    splitLines_ACU(floor.text).map((line, lineIndex) => ({
      label: `Tầng ${floor.index} dòng ${lineIndex + 1}`,
      address: `$STORY_RANGE:${floor.index}-${floor.index}`,
      text: line,
    })));
}

function collectTableLines_ACU(context: AgentResolveContext_ACU): AgentSearchLine_ACU[] {
  const source = readAgentTableData_ACU(context.tableData ?? currentJsonTableData_ACU);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  const lines: AgentSearchLine_ACU[] = [];
  for (const [key, sheet] of Object.entries(source as Record<string, any>)) {
    if (key === 'mate' || !sheet || typeof sheet !== 'object') continue;
    const name = String(sheet.name ?? '').trim();
    const content = Array.isArray(sheet.content) ? sheet.content : [];
    if (!name || !Array.isArray(content[0])) continue;
    content.slice(1).forEach((row: unknown, rowIndex: number) => {
      if (!Array.isArray(row)) return;
      const rowNumber = rowIndex + 1;
      lines.push({
        label: `${name} hàng ${rowNumber}`,
        address: `$TABLE:${name}:${rowNumber}-${rowNumber}`,
        text: row.map(cell => String(cell ?? '').trim()).join(' | '),
      });
    });
  }
  return lines;
}

function collectModuleLines_ACU(context: AgentResolveContext_ACU): AgentSearchLine_ACU[] {
  const snapshot = context.moduleSnapshot;
  const lines: AgentSearchLine_ACU[] = [];
  for (const entry of snapshot.storyArc) {
    lines.push({
      label: `Tổng cương câu chuyện [${entry.id}]${entry.retired ? ' (đã bãi bỏ)' : ''}`,
      address: `$STORY_ARC:${entry.id}`,
      text: [
        entry.title,
        entry.narrativeRole,
        entry.targetStageRange ? `targetStageRange=${entry.targetStageRange.min}-${entry.targetStageRange.max}` : '',
        entry.targetTimeSpan,
        entry.direction,
        entry.escalation,
        entry.progressCeiling,
        ...(entry.sustainingThreads ?? []),
        ...(entry.payoffTargets ?? []),
        entry.withheld,
        entry.completionRationale,
        entry.retiredReason,
      ].filter(Boolean).join('｜'),
    });
  }
  for (const hook of snapshot.hooks) {
    lines.push({
      label: `Sổ phục bút [${hook.id}]${hook.retired ? ' (đã cho nghỉ)' : ''}`,
      address: `$HOOKS_LEDGER:${hook.id}`,
      text: [hook.summary, hook.plannedPayoff, hook.retiredReason].filter(Boolean).join('｜'),
    });
  }
  for (const entry of snapshot.infoGap) {
    lines.push({
      label: `Chênh lệch thông tin [${entry.id}]${entry.retired ? ' (đã cho nghỉ)' : ''}`,
      address: `$INFO_GAP:${entry.id}`,
      text: [entry.topic, entry.objectiveFact, entry.readerKnown, ...entry.characterKnowledge.map(item => `${item.name}=${item.knows}`)].filter(Boolean).join('｜'),
    });
  }
  for (const constraint of snapshot.constraints) {
    lines.push({
      label: `Ràng buộc dài hạn [${constraint.id}]`,
      address: `$ACTIVE_CONSTRAINTS:${constraint.id}`,
      text: [constraint.text, constraint.reason].filter(Boolean).join('｜'),
    });
  }
  for (const entry of snapshot.webRefs) {
    const head = `Kho tư liệu bách khoa [${entry.id}]${entry.retired ? ' (đã cho nghỉ)' : ''}`;
    const address = `$WEB_REFS:${entry.id}`;
    lines.push({ label: `${head} (tên/giới thiệu/nhãn/chi tiết)`, address, text: [entry.title, entry.brief, ...entry.tags, entry.summary].filter(Boolean).join('｜') });
  }
  for (const entry of snapshot.chronology) {
    lines.push({
      label: `Niên đại học câu chuyện [${entry.id}]${entry.retired ? ' (đã vô hiệu)' : ''}`,
      address: `$CHRONOLOGY:${entry.id}`,
      text: [
        entry.anchor,
        entry.elapsed,
        `precision=${entry.precision}`,
        entry.transition,
        entry.evidenceIndexes.length ? `tầng bằng chứng=${entry.evidenceIndexes.join(', ')}` : '',
        entry.retiredReason,
      ].filter(Boolean).join('｜'),
    });
  }
  return lines;
}

function collectOutlineLines_ACU(context: AgentResolveContext_ACU): AgentSearchLine_ACU[] {
  const revision = context.execution.revision;
  if (!revision) return [];
  const lines: AgentSearchLine_ACU[] = [{
    label: 'Dàn ý, tiêu đề giai đoạn',
    address: '$OUTLINE_WINDOW',
    text: `${revision.outline.title}｜${revision.outline.goal}｜tempo=${revision.outline.tempo}｜role=${revision.outline.role ?? 'chưa đánh dấu'}｜timeSpan=${revision.outline.timeSpanGoal ?? 'chưa đặt'}`,
  }];
  for (const node of revision.outline.nodes) {
    lines.push({ label: `Dàn ý, nút [${node.id}]`, address: '$OUTLINE_WINDOW', text: `${node.title}｜${node.goal}` });
    for (const turn of node.turns) {
      const metadata = `pacing=${turn.pacing}｜function=${turn.function ?? 'chưa đánh dấu'}｜mainline=${turn.mainlineDelta ?? 'chưa đánh dấu'}｜time=${turn.timeAdvance ?? 'chưa đánh dấu'}${turn.timeAnchor ? `｜anchor=${turn.timeAnchor}` : ''}`;
      // 搜索器匹配 text 而不是 label；元数据必须进入正文，不能只做不可检索的展示装饰。
      lines.push({ label: `Dàn ý, lượt [${turn.id}]`, address: '$OUTLINE_WINDOW', text: `${metadata}｜${turn.goal}` });
    }
  }
  return lines;
}

function collectWorldbookLines_ACU(context: AgentResolveContext_ACU): AgentSearchLine_ACU[] {
  const worldbook = context.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
  const lines: AgentSearchLine_ACU[] = [];
  for (const entry of worldbook.entries) {
    const address = `$WORLDBOOK:${entry.bookName}:${entry.uid}`;
    const head = `Sổ thế giới "${entry.bookName}" mục ${entry.title}`;
    lines.push({ label: `${head} (tiêu đề/từ khóa)`, address, text: `${entry.title}｜${entry.keys.join(', ')}` });
    splitLines_ACU(entry.content).forEach((line, lineIndex) => {
      lines.push({ label: `${head} dòng ${lineIndex + 1}`, address, text: line });
    });
  }
  return lines;
}

const SCOPE_COLLECTORS_ACU: Record<AgentSearchScope_ACU, (context: AgentResolveContext_ACU) => AgentSearchLine_ACU[]> = {
  story: collectStoryLines_ACU,
  tables: collectTableLines_ACU,
  modules: collectModuleLines_ACU,
  outline: collectOutlineLines_ACU,
  worldbook: collectWorldbookLines_ACU,
};

const SCOPE_LABELS_ACU: Record<AgentSearchScope_ACU, string> = {
  story: 'chính văn',
  tables: 'bảng',
  modules: 'mô-đun tư liệu',
  outline: 'dàn ý',
  worldbook: 'sổ thế giới',
};

/**
 * 执行一次 grep 式搜索。
 * @param call 已通过协议校验的 search 调用
 * @param context 解析上下文（与 read 共用同一份数据快照，地址不漂移）
 * @returns 结果文本：每条命中一行「[域] 位置：片段｜读取地址」；正则非法/无命中时返回可修正的说明
 */
export function runAgentSearch_ACU(call: AgentSearchCall_ACU, context: AgentResolveContext_ACU): string {
  if (call.isRegex && call.query.length > SEARCH_REGEX_MAX_LENGTH_ACU) {
    return `Regex tìm kiếm quá dài (${call.query.length} > ${SEARCH_REGEX_MAX_LENGTH_ACU} ký tự), đã từ chối thực thi. Hãy rút gọn regex, hoặc tách thành nhiều lần tìm.`;
  }
  let regex: RegExp;
  try {
    regex = call.isRegex ? new RegExp(call.query, 'i') : new RegExp(escapeRegex_ACU(call.query), 'i');
  } catch (error) {
    return `Regex tìm kiếm "${call.query}" biên dịch thất bại: ${error instanceof Error ? error.message : String(error)}. Hãy sửa regex, hoặc bỏ isRegex để tìm theo từ khóa nguyên văn.`;
  }

  const hits: AgentSearchHit_ACU[] = [];
  let budget = SEARCH_TOTAL_CHAR_BUDGET_ACU;
  let truncated = false;
  for (const scope of call.scope) {
    if (truncated) break;
    for (const line of SCOPE_COLLECTORS_ACU[scope](context)) {
      if (hits.length >= call.maxResults || budget <= 0) {
        truncated = true;
        break;
      }
      const matched = regex.exec(line.text);
      if (!matched) continue;
      const snippet = createAgentMatchSnippet_ACU(line.text, matched.index, matched[0].length);
      const cost = snippet.length + line.label.length + line.address.length + SEARCH_HIT_OVERHEAD_ACU;
      if (budget - cost < 0) {
        truncated = true;
        break;
      }
      budget -= cost;
      hits.push({ scope, label: line.label, address: line.address, snippet });
    }
  }

  const scopeText = call.scope.map(scope => SCOPE_LABELS_ACU[scope]).join(', ');
  if (!hits.length) {
    return `Tìm "${call.query}" trong miền ${scopeText} không có kết quả khớp. Có thể thử: dùng từ khóa ngắn hơn, mở rộng scope, hoặc chuyển sang regex (isRegex: true). Lưu ý chính văn chỉ tìm được các tầng trong cửa sổ đọc được, mạch cốt truyện sớm hơn hãy xem tổng quan sự kiện hoặc dùng $TABLE:纪要表:khoảng hàng để đọc kỹ.`;
  }
  const lines = hits.map(hit => `- [${SCOPE_LABELS_ACU[hit.scope]}] ${hit.label}: ${hit.snippet}｜địa chỉ đọc ${hit.address}`);
  const tail = truncated
    ? `\n(Kết quả đã bị cắt: đạt giới hạn số mục ${call.maxResults} hoặc ngân sách tổng. Hãy dùng từ khóa chính xác hơn để thu hẹp phạm vi, hoặc tìm theo từng miền.)`
    : '';
  return `Tìm "${call.query}" khớp ${hits.length} chỗ (miền: ${scopeText}). Bên phải dòng khớp có kèm địa chỉ đọc, có thể sao chép thẳng vào read:\n${lines.join('\n')}${tail}`;
}
