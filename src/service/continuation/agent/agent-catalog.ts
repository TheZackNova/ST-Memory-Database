/**
 * service/continuation/agent/agent-catalog.ts — 子代理能力目录与资料模块目录
 *
 * 主 Agent 只看到摘要：代理能做什么、何时该用、职责固定写什么。
 * 子代理种子与工具调阅遵守角色 profile；主 Agent 保留自身的读取权限。
 * 写入范围由职责（kind）固定推得，读写均须通过运行时校验。
 * 子代理的完整系统提示词不暴露给主 Agent，避免主 Agent 被无关细节淹没。
 */

import { AGENT_FINAL_REVIEWER_NAME_ACU, AGENT_INSTRUCTION_COMPOSER_NAME_ACU, AGENT_OUTLINE_AGENT_NAME_ACU, AGENT_WEB_RESEARCHER_NAME_ACU, type AgentSubagentKind_ACU, type AgentSubagentName_ACU } from './agent-model';
import type { AgentWritableModule_ACU } from './agent-model';
import type { AgentNativeToolName_ACU } from '../../ai/native-tool';
import type { AgentToolMode_ACU } from '../../ai/agent-tool-mode';

export interface AgentSubagentDefinition_ACU {
  name: AgentSubagentName_ACU;
  kind: AgentSubagentKind_ACU;
  description: string;
  triggers: string[];
  promptKey: 'arcArchitect' | 'maintainer' | 'mainlinePlanner' | 'beatPlanner' | 'webResearcher' | 'instructionComposer';
}

/** 目录渲染的可选开关：网页检索关闭时，web-researcher 及其资料模块不进主 Agent 视野。 */
export interface AgentCatalogOptions_ACU {
  webResearchEnabled?: boolean;
}

/**
 * 角色化资料访问 profile：快照保留、read 地址授权和原生工具白名单必须从同一份契约派生。
 * readPrefixes 只描述地址轴前缀；具体正文仍由 resolver 的完整性证明和批次门禁决定。
 */
export interface AgentSubagentAccessProfile_ACU {
  snapshotTokens: readonly string[];
  readPrefixes: readonly string[];
  tools: readonly AgentNativeToolName_ACU[];
  allowSearch: boolean;
}

export const AGENT_SUBAGENT_ACCESS_PROFILES_ACU: Record<AgentSubagentKind_ACU, AgentSubagentAccessProfile_ACU> = {
  arc: {
    snapshotTokens: ['$STORY_ARC', '$OUTLINE_WINDOW', '$STORY_TAIL', '$STORY_OVERVIEW', '$WORLDBOOK_CATALOG', '$USER_REQUIREMENTS'],
    readPrefixes: ['$STORY_ARC', '$STORY_RANGE', '$TABLE', '$WORLDBOOK'],
    tools: ['read', 'search'],
    allowSearch: true,
  },
  maintain: {
    snapshotTokens: ['$HISTORY_UNSETTLED', '$HOOKS_LEDGER', '$INFO_GAP', '$CHRONOLOGY', '$USER_REQUIREMENTS'],
    readPrefixes: ['$HISTORY_UNSETTLED', '$STORY_RANGE', '$TABLE'],
    tools: ['read'],
    allowSearch: false,
  },
  plan: {
    snapshotTokens: ['$OUTLINE_WINDOW', '$STORY_TAIL', '$STORY_OVERVIEW', '$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$USER_REQUIREMENTS'],
    readPrefixes: ['$OUTLINE_WINDOW', '$HISTORY_UNSETTLED', '$STORY_RANGE', '$TABLE', '$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$WORLDBOOK'],
    tools: ['read'],
    allowSearch: false,
  },
  review: {
    snapshotTokens: ['$OUTLINE_WINDOW', '$STORY_TAIL', '$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$WORLDBOOK_HITS', '$USER_REQUIREMENTS'],
    readPrefixes: ['$OUTLINE_WINDOW', '$STORY_RANGE', '$TABLE', '$STORY_ARC', '$FIELD:storyArc', '$HOOKS_LEDGER', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$WEB_REFS', '$WORLDBOOK'],
    tools: ['read'],
    allowSearch: false,
  },
  research: {
    snapshotTokens: ['$WEB_REFS', '$WEB_TOOL_CATALOG', '$STORY_TAIL', '$TABLE_CATALOG', '$USER_REQUIREMENTS'],
    readPrefixes: ['$STORY_RANGE', '$TABLE', '$STORY_ARC', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$WEB_REFS', '$WORLDBOOK'],
    tools: ['read', 'search', 'encyclopedia_search', 'encyclopedia_read', 'web_search', 'web_read'],
    allowSearch: true,
  },
  compose: {
    snapshotTokens: ['$OUTLINE_WINDOW', '$STORY_ARC', '$STORY_TAIL', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY', '$USER_REQUIREMENTS'],
    readPrefixes: [],
    tools: [],
    allowSearch: false,
  },
};

const AGENT_MODULE_READ_PREFIXES_ACU: Record<AgentWritableModule_ACU, readonly string[]> = {
  storyArc: ['$STORY_ARC', '$FIELD:storyArc'],
  hooks: ['$HOOKS_LEDGER', '$FIELD:hooks'],
  infoGap: ['$INFO_GAP', '$FIELD:infoGap'],
  chronology: ['$CHRONOLOGY', '$FIELD:chronology'],
  constraints: ['$ACTIVE_CONSTRAINTS', '$FIELD:constraints'],
  webRefs: ['$WEB_REFS', '$FIELD:webRefs'],
  userRequirements: ['$USER_REQUIREMENTS'],
};

export function getAgentSubagentAccessProfile_ACU(kind: AgentSubagentKind_ACU): AgentSubagentAccessProfile_ACU {
  return AGENT_SUBAGENT_ACCESS_PROFILES_ACU[kind];
}

export function getAgentSubagentReadPrefixes_ACU(kind: AgentSubagentKind_ACU, writes: readonly AgentWritableModule_ACU[]): string[] {
  return [...new Set([
    ...AGENT_SUBAGENT_ACCESS_PROFILES_ACU[kind].readPrefixes,
    ...writes.flatMap(module => AGENT_MODULE_READ_PREFIXES_ACU[module]),
  ])];
}

export interface AgentModuleDefinition_ACU {
  token: string;
  description: string;
  triggers: string[];
  writableBy: AgentSubagentName_ACU[];
}

/**
 * 终审只允许由 finalize 前的受控运行时入口调用，绝不能出现在主 Agent 的 delegate 目录中。
 */
export const AGENT_FINAL_REVIEWER_DEFINITION_ACU = {
  name: AGENT_FINAL_REVIEWER_NAME_ACU,
  kind: 'review' as const,
  description: 'Chung duyệt trước khi gửi: đối chiếu cảm xúc nhân vật, bằng chứng World Info và ranh giới logic, chỉ đọc không ghi',
  promptKey: 'finalReviewer' as const,
};

export const AGENT_SUBAGENT_DEFINITIONS_ACU: readonly AgentSubagentDefinition_ACU[] = [
  {
    name: 'arc-architect',
    kind: 'arc',
    description: 'Bảo trì tổng cương câu chuyện: hướng đi toàn sách, bậc thang cấp tập (mỗi tập đẩy lên cao đến đâu, kết ở đâu), át chủ bài cấm lật sớm, và tiến độ các tập đã được những giai đoạn nào đảm nhận',
    triggers: ['Khi trạng thái tổng cương hiển thị «chưa có tổng cương câu chuyện» thì phải phân công nó trước', 'Sau khi một giai đoạn hoàn tất thì ghi lại tiến độ, khi cần thì chuyển tập tiếp theo thành active', 'Khi cốt truyện thật đã lệch rõ khỏi hướng định sẵn, cần sửa bậc thang', 'Khi át chủ bài bị chính văn lật sớm, danh sách cấm lật của tổng cương cần cập nhật', 'Khi mục tiêu của tập hiện tại đã thực sự khép lại hoặc rõ ràng sớm/muộn hơn, cần điều chỉnh cách chia bậc thang'],
    promptKey: 'arcArchitect',
  },
  {
    name: 'hook-cognition-maintainer',
    kind: 'maintain',
    description: 'Kết toán chính văn đã xảy ra: bảo trì sổ phục bút, dòng thời gian chênh lệch nhận thức và sổ niên đại học câu chuyện, chỉ đăng ký những thay đổi đã thực sự xảy ra trong lịch sử thật',
    triggers: ['Có lịch sử thật chưa kết toán', 'Chính văn mới xuất hiện manh mối bất thường, bí mật, chi tiết khác thường', 'Phục bút đã có bị chạm lại', 'Trạng thái hiểu biết của một nhân vật thay đổi', 'Trong chính văn thực sự đã trôi qua thời gian qua đêm, vài ngày hoặc lâu hơn'],
    promptKey: 'maintainer',
  },
  {
    name: 'mainline-planner',
    kind: 'plan',
    description: 'Lên kế hoạch cảnh theo pacing lượt này: pressure/turn đưa bậc thang xung đột, lựa chọn của nhân vật chính và biến động giá trị thực chất; setup/cooldown đưa hành động đời sống cụ thể, tương tác nhân vật và thay đổi không phải khủng hoảng, cho phép mạch chính hold. Xuất đề xuất về chức năng tự sự, gia tăng mạch chính và quan hệ thời gian, không viết chính văn, không sửa tài liệu',
    triggers: ['Mỗi lượt đều cần đề xuất kế hoạch cảnh của lượt này (khi phân công ghi rõ pacing)', 'Lượt pressure/turn cần phương án leo thang xung đột hoặc chuyển dịch giá trị', 'Lượt setup/cooldown cần nội dung đời thường, hồi phục hoặc kinh doanh cụ thể thay vì nhận xét sáo rỗng'],
    promptKey: 'mainlinePlanner',
  },
  {
    name: 'beat-planner',
    kind: 'plan',
    description: 'Lên kế hoạch thao tác phục bút và nhịp cảm xúc lượt này: đưa thủ pháp cụ thể để gài, củng cố, đánh lạc hướng, hiện thực hóa, chênh lệch thông tin đi đến bước nào và đề xuất cách kết; lượt áp lực thấp cho phép không thao tác, khép lại yên tĩnh, không viết chính văn, không sửa tài liệu',
    triggers: ['Lượt này dự định thao tác phục bút', 'Chênh lệch thông tin lượt này cần thiết lập, sử dụng hoặc tiết lộ (sau khi tiết lộ được phép kết thúc, không ép bổ sung bí ẩn mới)', 'Nhịp cảm xúc cần nối tiếp phần dư của lượt trước'],
    promptKey: 'beatPlanner',
  },
  {
    name: AGENT_WEB_RESEARCHER_NAME_ACU,
    kind: 'research',
    description: 'Tra nguyên tác và thiết lập công khai từ Internet: ưu tiên Moegirl (萌娘百科), Wikipedia, Baidu Baike (百度百科), không tra được thì dùng công cụ tìm kiếm và thu thập trang web; viết các trang hữu ích thành mục thư viện bách khoa có tóm tắt ($WEB_REFS) cho các agent khác đọc. Chỉ đăng ký thường thức nguyên tác/công khai, không viết cốt truyện của câu chuyện này',
    triggers: ['Khi nhiệm vụ bật tra cứu mở đầu và thư viện trống thì runtime tự phân công, không cần bạn phân công', 'Chính văn hoặc dàn ý mới xuất hiện nhân vật, tổ chức, địa điểm, năng lực, thuật ngữ của nguyên tác mà cả thư viện bách khoa lẫn World Info đều không có mục tương ứng', 'Cần đối chiếu một thiết lập nguyên tác (quan hệ, ranh giới năng lực, dòng thời gian, điều cấm kỵ) mà tài liệu hiện có không trả lời được'],
    promptKey: 'webResearcher',
  },
  {
    name: AGENT_INSTRUCTION_COMPOSER_NAME_ACU,
    kind: 'compose',
    description: 'Đọc toàn bộ tài liệu sau kết toán, đề xuất kế hoạch, kết luận kiểm duyệt, yêu cầu người dùng và ràng buộc đang hoạt động, tạo ra chỉ thị viết của lượt này. Do quy trình cố định gọi, Agent chính không được phân công.',
    triggers: ['Quy trình cố định tự động gọi sau khi lên kế hoạch và kiểm duyệt'],
    promptKey: 'instructionComposer',
  },
];

export const AGENT_MODULE_DEFINITIONS_ACU: readonly AgentModuleDefinition_ACU[] = [
  {
    token: '$STORY_ARC',
    description: 'Tổng cương câu chuyện: hướng đi toàn sách (duy nhất một mục) và bậc thang cấp tập. Bậc thang tập gồm trách nhiệm cấu trúc, dung lượng giai đoạn, thời gian câu chuyện, giới hạn tiến độ mạch chính, tuyến kinh doanh dài hạn, mục tiêu hiện thực hóa, trạng thái khép lại và tiến độ giai đoạn thật',
    triggers: ['Trước khi sắp dàn ý giai đoạn mới, xác nhận giai đoạn này nên rơi vào bậc thang nào', 'Đánh giá giai đoạn này có được lật một át chủ bài nào đó không', 'Sau khi một giai đoạn hoàn tất thì ghi lại tiến độ'],
    writableBy: ['arc-architect'],
  },
  {
    token: '$HOOKS_LEDGER',
    description: 'Sổ phục bút: các phục bút đã vào chính văn thật cùng trạng thái vòng đời (gài/củng cố/đánh lạc hướng/hiện thực hóa một phần/hiện thực hóa/từ bỏ), tầng gài và mức quan trọng',
    triggers: ['Chính văn chạm tới manh mối bất thường', 'Lượt này dự định củng cố, đánh lạc hướng hoặc hiện thực hóa phục bút', 'Đánh giá một hồi hộp nào đó đã nợ quá lâu chưa'],
    writableBy: ['hook-cognition-maintainer'],
  },
  {
    token: '$INFO_GAP',
    description: 'Dòng thời gian nhận thức và chênh lệch thông tin: sự thật khách quan, điều độc giả đã biết, trạng thái hiểu biết của từng nhân vật và tiến độ tiết lộ',
    triggers: ['Thiết kế việc tiết lộ thông tin cục bộ', 'Đánh giá lúc này một nhân vật có nên biết một việc nào đó không', 'Tránh vạch trần hậu trường sớm'],
    writableBy: ['hook-cognition-maintainer'],
  },
  {
    token: '$ACTIVE_CONSTRAINTS',
    description: 'Ràng buộc dài hạn: lằn ranh đỏ của khế ước, át chủ bài cấm tung ra sớm, rủi ro liên tục đã biết. Agent phụ chỉ được đề xuất, do Agent chính phân xử rồi mới đăng ký',
    triggers: ['Hành động lượt này có thể vượt lằn ranh đỏ đã định', 'Cần xác nhận những át chủ bài nào lượt này không được lật'],
    writableBy: [],
  },
  {
    token: '$CHRONOLOGY',
    description: 'Sổ niên đại học câu chuyện: các sự thật thời gian câu chuyện do chính văn đã xảy ra kết toán — mốc thời gian tương đối hiện tại, thời gian tích lũy từ điểm bắt đầu câu chuyện, độ chính xác (exact/approximate/unknown), mỗi lần chuyển đổi thời gian và tầng chính văn làm bằng chứng. Trường thời gian trong dàn ý là kế hoạch, không nằm trong sổ này',
    triggers: ['Lên kế hoạch hoặc kiểm duyệt bước nhảy thời gian qua đêm, vài ngày, vài tuần và lâu hơn', 'Đối chiếu hồi phục thương tích, chu kỳ huấn luyện/sản xuất, thời gian hành trình, mùa và thời tiết, độ quen thuộc quan hệ có tương thích với thời gian tích lũy không', 'Chỉ dẫn cuối cùng cần đưa ra mốc thời gian tương đối đáng tin'],
    writableBy: ['hook-cognition-maintainer'],
  },
  {
    token: '$WEB_REFS',
    description: 'Thư viện bách khoa: thiết lập nguyên tác/công khai mà web-researcher tra được từ Moegirl (萌娘百科), Wikipedia, Baidu Baike (百度百科) hoặc trang web, chia mục theo thực thể (nhân vật, phép thuật, vật phẩm, tổ chức, sự kiện…), mỗi mục cố định có tên và giới thiệu một câu, ngoài ra có chi tiết tự do và liên kết nguồn. Danh mục và đọc toàn bộ chỉ cho xem trước «tên + giới thiệu», chi tiết đọc kỹ theo ID; nguyên văn trang web không được lưu. Đây là tham khảo bên ngoài, không phải sự thật đã xảy ra trong câu chuyện này; khi xung đột với World Info hoặc chính văn thì lấy World Info và chính văn làm chuẩn',
    triggers: ['Viết đồng nhân cần đối chiếu quan hệ nhân vật, ranh giới năng lực, thiết lập tổ chức và địa điểm của nguyên tác', 'Dàn ý hoặc kế hoạch liên quan thuật ngữ nguyên tác mà World Info không bao phủ', 'Kiểm duyệt chỉ dẫn ứng viên có trái thường thức nguyên tác không'],
    writableBy: [AGENT_WEB_RESEARCHER_NAME_ACU],
  },
  {
    token: '$USER_REQUIREMENTS',
    description: 'Vùng tài liệu yêu cầu người dùng: các yêu cầu người dùng từng nêu cho nhiệm vụ trong phiên Agent, chia từng dòng. Khi tạo nhiệm vụ thì ghi máy móc originInstruction làm mục đầu; sau đó do người dùng tự bảo trì trong bảng tài liệu, AI không ghi',
    triggers: ['Lên kế hoạch, kiểm duyệt hoặc viết cần tuân thủ các yêu cầu nhiệm vụ mà người dùng đã nêu tích lũy', 'Người dùng giữa chừng bổ sung, sửa hoặc ghi đè các yêu cầu trước đó'],
    writableBy: [],
  },
];

/** 子代理目录里的类型中文名。 */
const KIND_DISPLAY_LABELS_ACU: Record<AgentSubagentKind_ACU, string> = {
  arc: 'Tổng cương',
  maintain: 'Bảo trì kết toán',
  plan: 'Lên kế hoạch',
  review: 'Kiểm duyệt',
  research: 'Tra cứu web',
  compose: 'Chỉ thị viết',
};

/** 按职责固定的写入说明，进子代理目录的「写入」行。 */
const KIND_WRITE_LABELS_ACU: Record<AgentSubagentKind_ACU, string> = {
  arc: '$STORY_ARC (trách nhiệm cố định; không đụng phục bút, chênh lệch thông tin và ràng buộc)',
  maintain: '$HOOKS_LEDGER, $INFO_GAP, $CHRONOLOGY (trách nhiệm cố định; ràng buộc chỉ được đề xuất, do Agent chính phân xử rồi đăng ký)',
  plan: 'Không (chỉ trả về đề xuất)',
  review: 'Không (chỉ trả về phán quyết)',
  research: '$WEB_REFS (trách nhiệm cố định; chỉ ghi tài liệu tham khảo bên ngoài, không đụng module tự sự)',
  compose: 'Không (chỉ tạo chỉ thị viết; phần tăng thêm của constraints do runtime đăng ký có dung sai)',
};

function isDefinitionVisible_ACU(name: AgentSubagentName_ACU, options?: AgentCatalogOptions_ACU): boolean {
  // 写作指令由固定工作流交付；总纲可由主会话按剧情变化要求维护。
  if (name === AGENT_INSTRUCTION_COMPOSER_NAME_ACU) return false;
  if (name === AGENT_WEB_RESEARCHER_NAME_ACU) return options?.webResearchEnabled === true;
  return true;
}

/**
 * 渲染子代理能力目录。
 * @returns 主 Agent 可见的摘要文本，不含子代理内部提示词
 */
export function renderAgentSubagentCatalog_ACU(options?: AgentCatalogOptions_ACU): string {
  const blocks = AGENT_SUBAGENT_DEFINITIONS_ACU
    .filter(definition => isDefinitionVisible_ACU(definition.name, options))
    .map(definition => [
      `- name: ${definition.name}`,
      `  Loại: ${KIND_DISPLAY_LABELS_ACU[definition.kind]}`,
      `  Trách nhiệm: ${definition.description}`,
      `  Thời điểm áp dụng: ${definition.triggers.join('; ')}`,
      definition.kind === 'research'
        ? '  Đọc: tra cứu tài liệu cục bộ theo profile vai trò, và có thể ra ngoài (API bách khoa, công cụ tìm kiếm, thu thập trang web); prompt phân công ghi rõ tác phẩm, nhân vật hoặc tên thiết lập cần tra, reads có thể để trống'
        : `  Đọc: chỉ giới hạn địa chỉ riêng/liên quan chặt của profile vai trò; khi phân công dùng reads đưa địa chỉ hạt giống${getAgentSubagentAccessProfile_ACU(definition.kind).allowSearch ? ', và có thể dùng search để định vị' : ', không cung cấp công cụ search'}`,
      `  Ghi: ${KIND_WRITE_LABELS_ACU[definition.kind]}`,
    ].join('\n'));
  return [...blocks, `- name: ${AGENT_OUTLINE_AGENT_NAME_ACU}\n  Loại: Dàn ý giai đoạn\n  Trách nhiệm: tạo, tiếp tục hoặc lập lại dàn ý giai đoạn hiện tại theo căn cứ cốt truyện do phiên chính đưa ra\n  Ghi: bản sửa đổi mới của giai đoạn hiện tại; giữ phần tiền tố hoàn tất đã xảy ra\n  Gọi: delegate riêng, prompt ghi rõ hướng sửa; sửa tổng cương xong rồi mới phân công dàn ý giai đoạn`].join('\n');
}

/**
 * 渲染资料模块目录。
 * @param options 网页检索关闭且资料库为空时不列 $WEB_REFS，避免主 Agent 去读一个不存在的库
 * @returns 主 Agent 可见的模块摘要文本，只说模块是什么、何时用、谁能写
 */
export function renderAgentModuleCatalog_ACU(options?: AgentCatalogOptions_ACU & { webRefsPresent?: boolean }): string {
  const blocks = AGENT_MODULE_DEFINITIONS_ACU
    .filter(definition => definition.token !== '$WEB_REFS' || options?.webResearchEnabled === true || options?.webRefsPresent === true)
    .map(definition => [
      `- Placeholder: ${definition.token}`,
      `  Nội dung: ${definition.description}`,
      `  Thời điểm áp dụng: ${definition.triggers.join('; ')}`,
      `  Agent được ghi: ${definition.writableBy.length ? definition.writableBy.join(', ') : 'chỉ đăng ký sau khi Agent chính phân xử'}`,
    ].join('\n'));
  return blocks.join('\n');
}

/**
 * 渲染读集地址词汇表：read / search 工具能用的全部地址体系。
 * 主 Agent 与子代理共用同一份（$AGENT_READ_CATALOG），保证派工 reads 里写的地址
 * 子代理一定解析得了。各资料的具体可用地址以对应目录（正文/表格/世界书）为准。
 * @returns 词汇表文本
 */
export function renderAgentReadCatalog_ACU(toolMode: AgentToolMode_ACU): string {
  return [
    'read dùng khi đã có địa chỉ; chưa biết địa chỉ thì search trước. Tham số reads có thể trộn nhiều loại địa chỉ, lấy dữ liệu hàng loạt một lần:',
    '- $STORY_RANGE:tầng_đầu-tầng_cuối: khoảng tầng chính văn AI trong cửa sổ có thể đọc, toàn văn từng tầng. Tầng khả dụng và phạm vi cửa sổ xem trong danh mục chính văn.',
    '- $TABLE:tên_bảng / $TABLE:tên_bảng:hàng_đầu-hàng_cuối: cả bảng hoặc khoảng hàng. Tên bảng và số hàng khả dụng xem trong danh mục bảng.',
    '- $STORY_ARC / $STORY_ARC:ID,ID: toàn bộ mục đang hoạt động của tổng cương câu chuyện (hướng đi toàn sách và bậc thang tập), hoặc đọc kỹ theo ID (gồm cả mục đã bãi bỏ).',
    '- $HOOKS_LEDGER / $HOOKS_LEDGER:ID,ID: toàn bộ mục đang hoạt động của sổ phục bút, hoặc đọc kỹ theo ID (gồm cả mục đã ngừng dùng).',
    '- $INFO_GAP / $INFO_GAP:ID,ID: toàn bộ mục đang hoạt động của dòng thời gian nhận thức và chênh lệch thông tin, hoặc đọc kỹ theo ID.',
    '- $ACTIVE_CONSTRAINTS / $ACTIVE_CONSTRAINTS:ID,ID: toàn bộ mục ràng buộc dài hạn, hoặc đọc kỹ theo ID.',
    '- $CHRONOLOGY / $CHRONOLOGY:ID,ID: sổ niên đại học câu chuyện (mốc thời gian, thời gian tích lũy và bằng chứng chuyển đổi do chính văn đã xảy ra kết toán), hoặc đọc kỹ theo ID (gồm cả mục đã vô hiệu).',
    '- $WEB_REFS / $WEB_REFS:ID,ID: thư viện bách khoa — đọc toàn bộ chỉ cho xem trước «tên + giới thiệu một câu» của mỗi mục; đọc kỹ theo ID mới có chi tiết tự do và liên kết nguồn, không lưu nguyên văn trang web. Đây là tham khảo bên ngoài về thiết lập nguyên tác/công khai, không phải sự thật của câu chuyện này.',
    '- $USER_REQUIREMENTS: các yêu cầu nhiệm vụ người dùng đã nêu tích lũy trong phiên Agent, chia từng dòng; do hệ thống bảo trì sau khi nén lịch sử, không phải sự thật chính văn.',
    '- $WORLDBOOK:tên_sách:uid[,uid]: toàn văn mục World Info đã bật. Nội dung đã kích hoạt xem trong ảnh chụp ở cuối, không cần read lại; mục chưa trúng có thể lấy địa chỉ từ danh mục hoặc search (scope=["worldbook"]) rồi đọc kỹ. Danh mục ghi số token để phân bổ ngân sách.',
    '- $STORY_CATALOG / $STORY_OVERVIEW / $STORY_TAIL / $OUTLINE_WINDOW / $HISTORY_UNSETTLED: chỉ mục tầng, tổng quan sự kiện, toàn văn chính văn cuối, cửa sổ dàn ý đầy đủ, toàn bộ chính văn chưa kết toán.',
    '- Kỷ yếu chi tiết của cốt truyện sớm nằm trong bảng kỷ yếu: $TABLE:纪要表:hàng_đầu-hàng_cuối đọc kỹ theo khoảng hàng (số hàng xem trong tổng quan sự kiện và danh mục bảng).',
    toolMode === 'tools'
      ? 'search dùng lệnh gọi hàm. Ví dụ tham số: {"query":"từ khóa hoặc regex","scope":["story","tables","modules","outline","worldbook"],"isRegex":false,"maxResults":30}.'
      : 'search xuất hành động JSON: {"action":"search","query":"từ khóa hoặc regex","scope":["story","tables","modules","outline","worldbook"],"isRegex":false,"maxResults":30}; read xuất {"action":"read","reads":["địa chỉ được ủy quyền"]}.',
    'Dòng trúng kèm địa chỉ có thể sao chép thẳng vào read; search định vị trước rồi đọc kỹ bằng địa chỉ hẹp sẽ tiết kiệm ngân sách hơn đọc nguyên khối.',
  ].join('\n');
}

/**
 * 按名称查子代理定义。
 * @param name 代理名
 * @returns 命中的定义；未知代理返回 null
 */
export function findAgentSubagentDefinition_ACU(name: string): AgentSubagentDefinition_ACU | null {
  return AGENT_SUBAGENT_DEFINITIONS_ACU.find(definition => definition.name === name) ?? null;
}

/**
 * 渲染 web-researcher 的出网工具说明：按设置列出启用的百科来源、搜索提供方与页数上限。
 * 只注入该子代理，主 Agent 与其它子代理看不到这些动作名。
 */
export function renderAgentWebToolCatalog_ACU(input: { sources: string[]; provider: string; maxPages: number; pageCharLimit: number; pagesUsed: number }, toolMode: AgentToolMode_ACU): string {
  const sourceText = input.sources.length ? input.sources.join(', ') : '(toàn bộ nguồn bách khoa đã tắt, chỉ dùng được web_search / web_read)';
  return [
    toolMode === 'tools'
      ? 'Các công cụ ra ngoài encyclopedia_search, encyclopedia_read, web_search, web_read đều là lệnh gọi hàm, giống read/search cục bộ, có thể gọi song song trong cùng một phản hồi, không viết thành JSON. Trang trong kết quả có tay cầm P1, P2…, trong khế ước dùng pageRef để tham chiếu. Khi tiếp tục gọi công cụ, đặt các sự thật cần giữ lại của lô trang trước vào tham số notes.'
      : 'Các công cụ ra ngoài encyclopedia_search, encyclopedia_read, web_search, web_read đều xuất hành động JSON, action điền tên công cụ, các trường còn lại điền tham số dưới đây, có thể cùng read/search cục bộ xuất nhiều đối tượng trong cùng một phản hồi. Ví dụ {"action":"encyclopedia_search","query":"tên nhân vật","notes":"thiết lập cần xác minh"}. Trang trong kết quả có tay cầm P1, P2…, dùng pageRef để tham chiếu. Khi tiếp tục tra cứu, đặt các sự thật cần giữ lại của lô trang trước vào trường notes.',
    `- Gọi encyclopedia_search, tham số query là «tên nhân vật hoặc tên tác phẩm», sources ví dụ ["moegirl","wikipedia_zh"]. Bỏ sources thì dùng toàn bộ nguồn đã bật: ${sourceText}. Moegirl khớp theo tiền tố tiêu đề, Baidu khớp theo tên mục từ chính xác, không tra được thì đổi sang tên đầy đủ hoặc tên dịch trong tác phẩm.`,
    '- Gọi encyclopedia_read, tham số source là moegirl, title là tiêu đề chính xác trong danh sách ứng viên. Đọc kỹ chính văn mục từ, trả về trang kèm tay cầm.',
    `- Gọi web_search, tham số query là từ khóa. Tìm kiếm chung (nhà cung cấp: ${input.provider}), trả về tiêu đề, liên kết và tóm tắt; thiết lập ít người biết mà bách khoa không tra được thì mới dùng nó.`,
    '- Gọi web_read, tham số url là URL đầy đủ. Thu thập chính văn trang web bất kỳ. Mạng nội bộ, chính SillyTavern và tên miền trong danh sách đen sẽ bị từ chối.',
    `Mỗi lần đọc kỹ/thu thập tính là một trang, lần phân công này tối đa ${input.maxPages} trang (đã dùng ${input.pagesUsed}), nguyên văn mỗi trang cắt còn ${input.pageCharLimit} chữ. Không thu thập lặp cùng một trang.`,
  ].join('\n');
}
