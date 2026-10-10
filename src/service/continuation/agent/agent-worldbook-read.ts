/**
 * service/continuation/agent/agent-worldbook-read.ts — Agent 的世界书只读接入
 *
 * 运行起点一次性预取启用条目做运行内快照，之后目录 / 精读 / 命中提示 / 搜索都基于
 * 同一份快照（世界书读取是异步宿主调用，预取后地址在一次运行内不漂移）。
 *
 * 暴露范围：已启用集合内除纪要与纪要索引外的条目全部可读可搜；
 * 未启用条目不进目录、不进搜索、不可读。
 */

import { getIsolationPrefix_ACU } from '../../worldbook/injection-engine-state';
import { getLorebookEntriesByNames_ACU } from '../../worldbook/pipeline';
import { getCurrentWorldbookConfig_ACU } from '../../settings/settings-readers';
import { isEntryBlocked_ACU, logWarn_ACU } from '../../../shared/utils';
import { getWorldbookEntryKeywords_ACU } from '../../worldbook/pipeline';
import {
  isSummaryIndexEntryComment_ACU,
  isSummaryEntryComment_ACU,
  normalizeGeneratedComment_ACU,
  resolveRelevantBookNames_ACU,
} from '../worldbook-context';
import { countAgentTokens_ACU } from './agent-token-budget';
import { resolveFillPlanForCurrentChat_ACU } from '../../fill-mode/fill-mode-gate';

/** 一条已启用的普通世界书条目。 */
export interface AgentWorldbookEntryView_ACU {
  bookName: string;
  uid: string;
  title: string;
  keys: string[];
  constant: boolean;
  /** 为真时，本条目正文不参与后续关键词迭代。对应世界书 prevent_recursion。 */
  preventRecursion?: boolean;
  /** 为真时，只对照最初扫描文本，不看后触发条目的正文。对应世界书 exclude_recursion。 */
  excludeRecursion?: boolean;
  content: string;
  /** 条目全文的 token 估算，供 AI 判断读取预算。 */
  tokens: number;
}

/** 一次 Agent 运行内的世界书快照。 */
export interface AgentWorldbookSnapshot_ACU {
  entries: AgentWorldbookEntryView_ACU[];
  /** 读取宿主失败时为 false；目录会如实标注，不当成「没有条目」。 */
  available: boolean;
}

export function buildEmptyAgentWorldbookSnapshot_ACU(available = true): AgentWorldbookSnapshot_ACU {
  return { entries: [], available };
}

function isRecord_ACU(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readEntryKeys_ACU(entry: Record<string, unknown>): string[] {
  return getWorldbookEntryKeywords_ACU(entry);
}

/** 与 pipeline 的 isSelected 语义一致：插件侧勾选表缺书/缺列表都视为全选。 */
function isEntrySelected_ACU(bookName: string, uid: string, enabledEntriesMap: unknown): boolean {
  if (!isRecord_ACU(enabledEntriesMap) || !Object.keys(enabledEntriesMap).length) return true;
  const list = enabledEntriesMap[bookName];
  if (typeof list === 'undefined' || !Array.isArray(list)) return true;
  return list.some(item => String(item) === uid);
}

/** 条目 token 数跨运行缓存；等长改写也必须重新计量，不能误用过期的容量估算。 */
const entryTokenCache_ACU = new Map<string, { content: string; tokens: number }>();

async function countEntryTokens_ACU(bookName: string, uid: string, content: string): Promise<number> {
  const key = JSON.stringify([bookName, uid]);
  const cached = entryTokenCache_ACU.get(key);
  if (cached?.content === content) return cached.tokens;
  const counted = await countAgentTokens_ACU(content);
  entryTokenCache_ACU.set(key, { content, tokens: counted });
  return counted;
}

/**
 * 预取当前已启用的世界书条目为运行内快照。
 *
 * 启用判定与提示词注入管线一致：条目自身 enabled 为真、且通过插件侧 enabledEntries
 * 勾选表、且不属于屏蔽名单（当前屏蔽词为空，逻辑保留备用）。纪要与纪要索引直接跳过。
 * 其余已启用条目按正常世界书资料域暴露。
 * 每条条目在预取时统计 token 数（结果缓存跨运行复用），供目录标注读取预算。
 * @returns 快照；宿主读取失败时返回 available=false 的空快照
 */
export interface AgentWorldbookSnapshotOptions_ACU {
  /** 经典/向量模式下纪要以世界书常量条目注入时，续写需要读取纪要与纪要索引条目。 */
  includeChronicleEntries?: boolean;
}

export async function loadAgentWorldbookSnapshot_ACU(options: AgentWorldbookSnapshotOptions_ACU = {}): Promise<AgentWorldbookSnapshot_ACU> {
  const includeChronicleEntries = options.includeChronicleEntries === true;
  try {
    const bookNames = await resolveRelevantBookNames_ACU();
    if (!bookNames.length) return buildEmptyAgentWorldbookSnapshot_ACU();
    const entriesByBook = await getLorebookEntriesByNames_ACU(bookNames);
    const isolationPrefix = getIsolationPrefix_ACU();
    const enabledEntriesMap = getCurrentWorldbookConfig_ACU()?.enabledEntries;

    const entries: AgentWorldbookEntryView_ACU[] = [];
    for (const bookName of bookNames) {
      for (const raw of entriesByBook[bookName] ?? []) {
        if (!isRecord_ACU(raw)) continue;
        if (raw.enabled !== true) continue;
        const uid = String(raw.uid ?? '').trim();
        const title = normalizeGeneratedComment_ACU(raw, isolationPrefix);
        const content = typeof raw.content === 'string' ? raw.content : '';
        // 纪要另由快照显示，不在世界书资料域重复暴露。
        if (!includeChronicleEntries && isSummaryEntryComment_ACU(title)) continue;
        if (!uid || !content.trim()) continue;
        if (!isEntrySelected_ACU(bookName, uid, enabledEntriesMap)) continue;
        if (isEntryBlocked_ACU(raw)) continue;
        // 纪要索引及其分片由快照单独显示。
        if (!includeChronicleEntries && isSummaryIndexEntryComment_ACU(title)) continue;
        // 其余已启用条目交由正常世界书读取方案处理，不按插件前缀额外屏蔽。
        entries.push({
          bookName,
          uid,
          title: title || `Mục ${uid}`,
          keys: readEntryKeys_ACU(raw),
          constant: raw.type === 'constant',
          preventRecursion: raw.prevent_recursion === true,
          excludeRecursion: raw.exclude_recursion === true,
          content,
          tokens: await countEntryTokens_ACU(bookName, uid, content),
        });
      }
    }
    return { entries, available: true };
  } catch (error) {
    logWarn_ACU('[Continuation][Agent] 世界书快照预取失败，本轮目录与搜索将不含世界书。', { error: error instanceof Error ? error.message : String(error) });
    return buildEmptyAgentWorldbookSnapshot_ACU(false);
  }
}

/** 当前填表模式是否要求续写读取纪要世界书条目；推导失败时保持原屏蔽行为。 */
export function shouldIncludeChronicleEntriesForContinuation_ACU(): boolean {
  try {
    return resolveFillPlanForCurrentChat_ACU().unmaskChronicleEntriesForContinuation;
  } catch (error) {
    logWarn_ACU('[Continuation][Agent] 填表模式推导失败，续写保持纪要条目屏蔽。', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** 续写专用快照：按填表模式决定是否临时解除纪要条目屏蔽。世界推演仍使用默认屏蔽快照。 */
export function loadContinuationWorldbookSnapshot_ACU(): Promise<AgentWorldbookSnapshot_ACU> {
  return loadAgentWorldbookSnapshot_ACU({ includeChronicleEntries: shouldIncludeChronicleEntriesForContinuation_ACU() });
}

/** 目录行里的内容摘要：压平空白后取前 10 个字符。 */
function entryExcerpt_ACU(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length <= 10 ? flat : `${flat.slice(0, 10)}…`;
}

/**
 * 渲染世界书目录：每条一行「标题｜关键词｜10 字摘要｜token 估算 → 精读地址」。
 * token 标注让 AI 在动手读之前就能对照读取预算分配额度。
 * @param snapshot 运行内快照
 * @returns 目录文本，进入主 Agent 骨架的 $WORLDBOOK_CATALOG
 */
export function renderAgentWorldbookCatalog_ACU(snapshot: AgentWorldbookSnapshot_ACU): string {
  if (!snapshot.available) return 'Đọc sổ thế giới lượt này thất bại, danh mục không khả dụng; đừng suy đoán nội dung sổ thế giới, vẫn có thể dùng các miền tư liệu khác như bình thường.';
  if (!snapshot.entries.length) return 'Hiện không có mục sổ thế giới nào đang bật.';
  const lines = snapshot.entries.map(entry => {
    const keys = entry.keys.length ? entry.keys.join(', ') : '(không có)';
    return `- ${entry.title}｜từ khóa: ${keys}｜tóm tắt: ${entryExcerpt_ACU(entry.content)}｜khoảng ${entry.tokens} token → địa chỉ đọc $WORLDBOOK:${entry.bookName}:${entry.uid}`;
  });
  return `## Các mục sổ thế giới đang bật (tổng ${snapshot.entries.length} mục, chỉ các mục liệt kê ở đây đọc được; số token cuối dòng dùng để ước tính ngân sách đọc)\n${lines.join('\n')}`;
}

/**
 * 渲染本轮语境命中的世界书条目提示：常开条目始终列出，关键词条目在扫描文本
 * 命中任一关键词（大小写不敏感的包含匹配）时列出。
 * 这是「该读哪些设定」的直接信号——命中条目与本轮剧情高度相关，应优先精读。
 * @param snapshot 运行内快照
 * @param scanText 扫描文本（本轮目标 + 未结算正文 + 尾部楼层 + 用户初始要求）
 * @returns 命中提示文本；无命中/世界书不可用时如实说明
 */
/**
 * 与剧情推进、填表共用的触发规则。
 * 常量条目直接纳入；关键词条目最多迭代 10 轮，已触发且允许递归的正文会继续触发别的条目。
 * includeConstantContentInBaseScan 与剧情推进一致：常量正文也进入最初扫描文本，供排除递归的条目使用。
 */
export function selectTriggeredWorldbookEntries_ACU(
  entries: readonly AgentWorldbookEntryView_ACU[],
  scanText: string,
  options?: { includeConstantContentInBaseScan?: boolean },
): AgentWorldbookEntryView_ACU[] {
  const includeConstantContent = options?.includeConstantContentInBaseScan !== false;
  let baseScanText = String(scanText ?? '').toLowerCase();
  const constantEntries = entries.filter(entry => entry.constant);
  let keywordEntries = entries.filter(entry => !entry.constant);
  if (includeConstantContent) {
    const constantBaseText = constantEntries
      .filter(entry => entry.preventRecursion !== true)
      .map(entry => entry.content)
      .join('\n')
      .toLowerCase();
    if (constantBaseText) baseScanText = [baseScanText, constantBaseText].filter(Boolean).join('\n');
  }
  const triggered = new Set<AgentWorldbookEntryView_ACU>(constantEntries);
  for (let depth = 0; depth < 10; depth += 1) {
    const recursionSource = [...triggered]
      .filter(entry => entry.preventRecursion !== true)
      .map(entry => entry.content)
      .join('\n')
      .toLowerCase();
    const fullSearchText = `${baseScanText}\n${recursionSource}`;
    let changed = false;
    const remaining: AgentWorldbookEntryView_ACU[] = [];
    for (const entry of keywordEntries) {
      const keywords = entry.keys.map(key => key.toLowerCase()).filter(Boolean);
      const haystack = entry.excludeRecursion === true ? baseScanText : fullSearchText;
      if (keywords.length > 0 && keywords.some(keyword => haystack.includes(keyword))) {
        triggered.add(entry);
        changed = true;
      } else {
        remaining.push(entry);
      }
    }
    keywordEntries = remaining;
    if (!changed) break;
  }
  return entries.filter(entry => triggered.has(entry));
}

export function renderAgentWorldbookHits_ACU(snapshot: AgentWorldbookSnapshot_ACU, scanText: string): string {
  if (!snapshot.available) return 'Đọc sổ thế giới lượt này thất bại, không thể đưa ra gợi ý khớp; đừng suy đoán nội dung sổ thế giới.';
  if (!snapshot.entries.length) return 'Hiện không có mục sổ thế giới nào đang bật, không có gợi ý khớp.';
  const hits = selectTriggeredWorldbookEntries_ACU(snapshot.entries, scanText);
  if (!hits.length) return 'Ngữ cảnh lượt này không khớp từ khóa của mục sổ thế giới nào, cũng không có mục luôn bật. Khi cần thiết lập thì chọn đọc kỹ từ danh mục sổ thế giới.';
  const lines = hits.map(entry =>
    `- ${entry.title} (${entry.constant ? 'luôn bật' : 'khớp từ khóa'}｜khoảng ${entry.tokens} token) → $WORLDBOOK:${entry.bookName}:${entry.uid}`);
  return `Các mục sau liên quan trực tiếp đến ngữ cảnh lượt này (mục luôn bật + khớp từ khóa), khi lượt này đụng tới thiết lập tương ứng thì nên đọc kỹ:\n${lines.join('\n')}`;
}

/** 总纲与大纲看到的是目录，由它们自己决定读哪一条。 */
export const WORLDBOOK_BROWSE_NOTE_ACU = 'Đây là danh mục toàn bộ mục sổ thế giới đang bật, không phải danh sách khớp, chưa tiêm toàn văn các mục. Cần mục nào thì read theo địa chỉ cuối dòng. Cũng có thể dùng search, đặt scope là ["worldbook"], tìm theo từ khóa trong miền sổ thế giới.';

const WORLDBOOK_TRIGGERED_NOTE_ACU = 'Sau đây là toàn văn các mục sổ thế giới được kích hoạt trong lượt này theo cùng quy tắc với đẩy cốt truyện và điền bảng: mục hằng được đưa thẳng vào; mục từ khóa kích hoạt lặp, nội dung của mục đã kích hoạt có thể tiếp tục kéo theo các mục từ khóa khác. Mục đã tiêm không cần read lại; nội dung chưa khớp chỉ có thể lấy qua danh mục tư liệu và công cụ mà vai trò hiện tại được cấp quyền, khi không thể xác minh phải nêu rõ chỗ thiếu.';

/** 总纲、大纲使用的已启用目录。不附带命中条目全文。 */
export function renderAgentWorldbookBrowseCatalog_ACU(snapshot: AgentWorldbookSnapshot_ACU): string {
  return `${WORLDBOOK_BROWSE_NOTE_ACU}\n${renderAgentWorldbookCatalog_ACU(snapshot)}`;
}

/**
 * 本轮关键词已触发的世界书全文。
 * 常量条目直接纳入；关键词条目按已触发正文迭代，规则与剧情推进、填表相同。
 */
export function renderAgentWorldbookTriggeredInjection_ACU(snapshot: AgentWorldbookSnapshot_ACU, scanText: string): string {
  if (!snapshot.available) return `Sổ thế giới lượt này không khả dụng. Đừng suy đoán thiết lập.\n${WORLDBOOK_TRIGGERED_NOTE_ACU}`;
  return `${WORLDBOOK_TRIGGERED_NOTE_ACU}\n${renderAgentWorldbookHitBodies_ACU(snapshot, scanText)}`;
}

/** 格林推演整轮共用的触发注入。世界书不可用或没有已启用条目时不追加空段。 */
export async function loadTriggeredWorldbookInjection_ACU(scanText: string): Promise<string> {
  const snapshot = await loadAgentWorldbookSnapshot_ACU();
  if (!snapshot.available || !snapshot.entries.length) return '';
  return renderAgentWorldbookTriggeredInjection_ACU(snapshot, scanText);
}

/** 本轮命中的世界书条目全文。 */
export function renderAgentWorldbookHitBodies_ACU(snapshot: AgentWorldbookSnapshot_ACU, scanText: string): string {
  if (!snapshot.available) return 'Sổ thế giới lượt này không khả dụng.';
  if (!snapshot.entries.length) return 'Hiện không có mục sổ thế giới nào đang bật.';
  const hits = selectTriggeredWorldbookEntries_ACU(snapshot.entries, scanText);
  if (!hits.length) return 'Lượt này không khớp mục sổ thế giới nào.';
  const byBook = new Map<string, string[]>();
  for (const hit of hits) {
    const list = byBook.get(hit.bookName) ?? [];
    list.push(hit.uid);
    byBook.set(hit.bookName, list);
  }
  return [...byBook].map(([book, uids]) => renderAgentWorldbookEntries_ACU(snapshot, book, uids)).join('\n\n');
}

/**
 * 按书名 + uid 列表精读世界书条目全文，支撑 `$WORLDBOOK:书名:uid1,uid2`。
 * @returns 条目全文；未知书名/uid 或条目未启用时回灌可修正的错误文本
 */
export function renderAgentWorldbookEntries_ACU(snapshot: AgentWorldbookSnapshot_ACU, bookName: string, uids: readonly string[]): string {
  if (!snapshot.available) return 'Đọc sổ thế giới lượt này thất bại, không thể đọc kỹ mục.';
  const book = String(bookName ?? '').trim();
  const wanted = uids.map(uid => String(uid ?? '').trim()).filter(Boolean);
  if (!book || !wanted.length) return 'Địa chỉ đọc sổ thế giới không đầy đủ: cần $WORLDBOOK:tên_sách:uid (nhiều uid ngăn cách bằng dấu phẩy). Hãy sao chép địa chỉ từ danh mục sổ thế giới.';
  const inBook = snapshot.entries.filter(entry => entry.bookName === book);
  if (!inBook.length) return `Trong các mục đang bật không có sổ thế giới "${book}". Địa chỉ khả dụng xem trong danh mục sổ thế giới; mục chưa bật không đọc được.`;
  const found = inBook.filter(entry => wanted.includes(entry.uid));
  const missing = wanted.filter(uid => !inBook.some(entry => entry.uid === uid));
  const parts: string[] = found.map(entry => `### ${entry.title} (${entry.bookName}#${entry.uid})\n${entry.content}`);
  if (missing.length) parts.push(`Các uid sau không tồn tại trong các mục đang bật của "${book}": ${missing.join(', ')}. Hãy sao chép địa chỉ từ danh mục sổ thế giới.`);
  return parts.join('\n\n');
}
