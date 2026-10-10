import { formatWorldSimulationToolAddressHints_ACU } from '../world-simulation-agent-tools';

/** Ví dụ trong văn bản giao thức; các giá trị evidence:/candidate: giữ nguyên vì là định danh mẫu. */
export const WORLD_SIMULATION_PROTOCOL_EXAMPLES_VI_ACU = {
  director: {
    openRound: { summary: 'Chốt tiêu điểm hậu trường của lượt này và khởi động quy trình cố định', focus: 'Đẩy tiến thời gian và áp lực dòng ngầm', dispatchChronicler: false },
    delegate: { delegations: [{ agentName: 'dramatis-keeper', instruction: 'Đối chiếu hồ sơ nhân vật theo yêu cầu của người dùng', reads: ['player:current', 'rumors:current'] }] },
    finalize: { outcome: 'commit', summary: 'Nộp ứng viên đã được rà soát', evidenceRefs: ['evidence:已颁发引用'] },
  },
  reviewer: {
    accept: { verdict: 'accept', summary: 'Ứng viên thỏa mãn các ràng buộc về bằng chứng và quyền hạn', findings: [], acceptedCandidateIds: ['candidate:1'] },
    revise: { verdict: 'revise', summary: 'Ứng viên vẫn cần chỉnh sửa', findings: [{ severity: 'major', reasonCode: 'CAUSE_GAP', path: '$.clock', expected: 'Thời gian và nhân quả liền mạch', actual: 'Thiếu giải thích nhân quả' }], acceptedCandidateIds: [] },
    reject: { verdict: 'reject', summary: 'Ứng viên không thỏa mãn ràng buộc bằng chứng', findings: [{ severity: 'blocking', reasonCode: 'EVIDENCE_GAP', path: '$', expected: 'Bằng chứng có thể xác minh', actual: 'Thiếu' }], acceptedCandidateIds: [] },
  },
} as const;

/**
 * Văn bản giao thức hiện hành (tiếng Việt) cho các vai trò không dùng giao thức một lần:
 * world-director, causality-reviewer và lore-researcher.
 * Mỗi dòng có ba biến thể: runtime (trộn), json (chế độ JSON), tools (chế độ gọi công cụ).
 * Biến thể json/tools được ghép trực tiếp, không suy ra bằng thay chuỗi, nên không phụ thuộc vào văn bản tiếng Trung cũ.
 */
export interface WorldSimulationProtocolVariants_ACU { runtime: string; json: string; tools: string }

type Line = string | readonly [runtime: string, json: string, tools: string];

function join_ACU(lines: readonly Line[]): WorldSimulationProtocolVariants_ACU {
  const pick = (index: 0 | 1 | 2) => lines.map(line => (typeof line === 'string' ? line : line[index])).join('\n');
  return { runtime: pick(0), json: pick(1), tools: pick(2) };
}

const THINK_RUNTIME_ACU = 'Phần suy luận viết trong chuỗi suy nghĩ đã bắt đầu, sau </think> mới gọi hàm hoặc xuất JSON. Không viết suy luận vào JSON, không xuất rào Markdown hay thẻ <WORLD_SIMULATION_ENGINE_SEAM:...>.';
const THINK_JSON_ACU = 'Chỉ xuất JSON giao thức, không kèm Markdown, giải thích hay thẻ suy nghĩ.';
const THINK_TOOLS_ACU = 'Đóng suy luận rồi mới gọi hàm, không nộp trong chính văn, không kèm Markdown.';

export function worldSimulationDirectorProtocolVi_ACU(): WorldSimulationProtocolVariants_ACU {
  const addresses = (via: string) => `Địa chỉ read chỉ được dùng: ${formatWorldSimulationToolAddressHints_ACU()}. Địa chỉ trường phải chứa tên module và ID mục, ví dụ field:dimensions:dim-a; không được dùng địa chỉ module trần như field:dimensions. Mọi mục trong danh mục đều có thể xem chi tiết ${via} theo địa chỉ (mục đang dùng như seeds:{id}, trạng thái theo từng cột phải dùng field:seeds:{id} hoặc field:seeds:{id}:title; tóm tắt lưu trữ như chronicle-archive:{archiveRef}; không được bỏ ID mục trong địa chỉ field). Tham số reads là mảng địa chỉ.`;
  const ex = WORLD_SIMULATION_PROTOCOL_EXAMPLES_VI_ACU.director;
  const call = (name: string, args: unknown) => `gọi ${name}, tham số ${JSON.stringify(args)}`;
  const readArgs = { reads: ['ledger:current', 'summary:current'] };
  return join_ACU([
    [
      'read và search dùng lời gọi hàm, không viết thành JSON. Quyết định chỉ xuất một JSON hành động chính: open_round, delegate, finalize hoặc block.',
      'Chỉ xuất một JSON hành động chính: read, search, open_round, delegate, finalize hoặc block.',
      'Thu thập tài liệu gọi read / search; quyết định gọi riêng một trong open_round / delegate / finalize / block. Việc thu thập và quyết định không được gọi trong cùng một phản hồi.',
    ],
    [
      'Bạn là người ra quyết định mở màn chứ không phải người ghi ledger: writableModules=[] là sự cách ly trách nhiệm, không phải sự cố quyền hạn hay điều kiện chặn. Mô phỏng thông thường sau khi thu thập bằng chứng thì xuất open_round, quy trình cố định tự chủ ghi sổ cái; revision=0 cũng theo quy trình này.',
      'Bạn là người ra quyết định mở màn chứ không phải người ghi ledger: writableModules=[] là sự cách ly trách nhiệm, không phải sự cố quyền hạn hay điều kiện chặn. Mô phỏng thông thường sau khi thu thập bằng chứng thì xuất open_round, quy trình cố định tự chủ ghi sổ cái; revision=0 cũng theo quy trình này.',
      'Bạn là người ra quyết định mở màn chứ không phải người ghi ledger: writableModules=[] là sự cách ly trách nhiệm, không phải sự cố quyền hạn hay điều kiện chặn. Mô phỏng thông thường sau khi thu thập bằng chứng thì gọi open_round, quy trình cố định tự chủ ghi sổ cái; revision=0 cũng theo quy trình này.',
    ],
    'Các lỗi giao thức như MISSING_FIELD, REQUIRED_TEXT_LIST, INVALID_SPECIALIST_STATUS trong hội thoại lịch sử chỉ dùng để chẩn đoán, không có nghĩa lượt hiện tại vẫn thất bại. Chỉ được dựa vào runtimeContext hiện tại, bằng chứng hiện tại và pendingFixes để quyết định có chặn hay không.',
    'Chỉ khi bằng chứng hiện tại thiếu và quy trình cố định cũng không thể tiếp tục mới được block; không được block chỉ vì bản thân world-director không có quyền ghi trực tiếp.',
    [
      'Khi gọi read, tham số reads phải là mảng địa chỉ không rỗng; khi gọi search, tham số query là bắt buộc, scope, maxResults, isRegex là tùy chọn. Không viết read hay search thành JSON.',
      'Đối tượng read chứa action, reads, trong đó reads là mảng địa chỉ không rỗng; đối tượng search chứa action, query, scope, maxResults, isRegex là tùy chọn.',
      'Tham số reads của read là mảng địa chỉ không rỗng; tham số query của search là bắt buộc, scope, maxResults, isRegex là tùy chọn.',
    ],
    [addresses('bằng cách gọi hàm read'), addresses('bằng đối tượng hành động read'), addresses('bằng cách gọi read')],
    'evidenceRef do phía máy chủ cấp sau khi đọc thành công, không được ghi vào yêu cầu read/search; không thêm purpose hay trường nào khác.',
    [
      'open_round phải chứa action, summary, focus, dispatchChronicler; skipModules là tùy chọn và chỉ được dùng tên module sổ cái. Mô phỏng tự động thông thường phải dùng open_round, trong lúc quy trình thực thi thì giữa chừng không quay lại phiên chính để giao việc.',
      'open_round phải chứa action, summary, focus, dispatchChronicler; skipModules là tùy chọn và chỉ được dùng tên module sổ cái. Mô phỏng tự động thông thường phải dùng open_round, trong lúc quy trình thực thi thì giữa chừng không quay lại phiên chính để giao việc.',
      'Tham số open_round phải chứa summary, focus, dispatchChronicler; skipModules là tùy chọn và chỉ được dùng tên module sổ cái. Mô phỏng tự động thông thường phải dùng open_round, trong lúc quy trình thực thi thì giữa chừng không quay lại phiên chính để giao việc.',
    ],
    [
      'delegate chỉ được chứa action, delegations, mục trong delegations chỉ được chứa agentName, instruction, reads; khi người dùng yêu cầu rõ ràng bảo trì một tài liệu, hoặc sau khi quy trình nâng cấp cần sửa có định hướng một module theo phương án sửa chữa, thì delegate cho specialist phụ trách module đó; instruction ghi rõ sửa bản ghi nào, cột nào, dựa vào đoạn chính văn nào, không được làm gì. block chỉ được chứa action, reason, unresolved, unresolved phải là mảng chuỗi không rỗng.',
      'delegate chỉ được chứa action, delegations, mục trong delegations chỉ được chứa agentName, instruction, reads; khi người dùng yêu cầu rõ ràng bảo trì một tài liệu, hoặc sau khi quy trình nâng cấp cần sửa có định hướng một module theo phương án sửa chữa, thì delegate cho specialist phụ trách module đó; instruction ghi rõ sửa bản ghi nào, cột nào, dựa vào đoạn chính văn nào, không được làm gì. block chỉ được chứa action, reason, unresolved, unresolved phải là mảng chuỗi không rỗng.',
      'Tham số delegate chỉ được chứa delegations, mục trong delegations chỉ được chứa agentName, instruction, reads; khi người dùng yêu cầu rõ ràng bảo trì một tài liệu, hoặc sau khi quy trình nâng cấp cần sửa có định hướng một module theo phương án sửa chữa, thì delegate cho specialist phụ trách module đó; instruction ghi rõ sửa bản ghi nào, cột nào, dựa vào đoạn chính văn nào, không được làm gì. Tham số block chỉ được chứa reason, unresolved, unresolved phải là mảng chuỗi không rỗng.',
    ],
    'Niên biểu do guidance-composer bảo trì thống nhất ở lô hai; dispatchChronicler chỉ là trường tương thích, điền false. Khi pendingFixes không rỗng, focus phải ghi rõ module cần ưu tiên sửa.',
    [
      'Hết ngân sách giao việc thì kết thúc và xuất thẻ block. Trên đường bảo trì của người dùng, việc giao việc bị chặn sẽ không gọi agent phụ; khi ngân sách đã cạn thì finalize bằng ứng viên hiện có hoặc xuất block.',
      'Hết ngân sách giao việc thì kết thúc và xuất thẻ block. Trên đường bảo trì của người dùng, việc giao việc bị chặn sẽ không gọi agent phụ; khi ngân sách đã cạn thì finalize bằng ứng viên hiện có hoặc xuất block.',
      'Hết ngân sách giao việc thì kết thúc và gọi thẻ block. Trên đường bảo trì của người dùng, việc giao việc bị chặn sẽ không gọi agent phụ; khi ngân sách đã cạn thì finalize bằng ứng viên hiện có hoặc gọi block.',
    ],
    [
      'evidenceRefs chỉ được xuất hiện ở cấp cao nhất của finalize; read, search, open_round, delegate, block đều cấm mang evidenceRefs hay trường khác chưa liệt kê.',
      'evidenceRefs chỉ được xuất hiện ở cấp cao nhất của finalize; read, search, open_round, delegate, block đều cấm mang evidenceRefs hay trường khác chưa liệt kê.',
      'evidenceRefs chỉ được xuất hiện ở tham số của finalize; read, search, open_round, delegate, block đều cấm mang evidenceRefs hay trường khác chưa liệt kê.',
    ],
    [
      `Ví dụ thu thập: ${call('hàm read', readArgs)}.`,
      `Ví dụ thu thập: ${JSON.stringify({ action: 'read', ...readArgs })}.`,
      `Ví dụ thu thập: ${call('read', readArgs)}.`,
    ],
    [
      `Ví dụ quyết định mở màn: ${JSON.stringify({ action: 'open_round', ...ex.openRound })}`,
      `Ví dụ quyết định mở màn: ${JSON.stringify({ action: 'open_round', ...ex.openRound })}`,
      `Ví dụ quyết định mở màn: ${call('open_round', ex.openRound)}`,
    ],
    [
      `Ví dụ bảo trì của người dùng: ${JSON.stringify({ action: 'delegate', ...ex.delegate })}`,
      `Ví dụ bảo trì của người dùng: ${JSON.stringify({ action: 'delegate', ...ex.delegate })}`,
      `Ví dụ bảo trì của người dùng: ${call('delegate', ex.delegate)}`,
    ],
    [
      'finalize cấp cao nhất chỉ được chứa action, outcome, summary, evidenceRefs; outcome phải chính xác là một trong commit, no_change, blocked. candidateId, acceptedCandidateIds, status, verdict thuộc kết quả giao việc hoặc rà soát, cấm chép vào finalize.',
      'finalize cấp cao nhất chỉ được chứa action, outcome, summary, evidenceRefs; outcome phải chính xác là một trong commit, no_change, blocked. candidateId, acceptedCandidateIds, status, verdict thuộc kết quả giao việc hoặc rà soát, cấm chép vào finalize.',
      'Tham số finalize chỉ được chứa outcome, summary, evidenceRefs; outcome phải chính xác là một trong commit, no_change, blocked. candidateId, acceptedCandidateIds, status, verdict thuộc kết quả giao việc hoặc rà soát, cấm chép vào finalize.',
    ],
    [
      `Ví dụ nộp: ${JSON.stringify({ action: 'finalize', ...ex.finalize })}`,
      `Ví dụ nộp: ${JSON.stringify({ action: 'finalize', ...ex.finalize })}`,
      `Ví dụ nộp: ${call('finalize', ex.finalize)}`,
    ],
    [THINK_RUNTIME_ACU, THINK_JSON_ACU, THINK_TOOLS_ACU],
  ]);
}

export function worldSimulationReviewerProtocolVi_ACU(): WorldSimulationProtocolVariants_ACU {
  const ex = WORLD_SIMULATION_PROTOCOL_EXAMPLES_VI_ACU.reviewer;
  const example = (label: string, record: unknown): Line => [
    `${label}: ${JSON.stringify(record)}`,
    `${label}: ${JSON.stringify(record)}`,
    `${label}: gọi submit, tham số ${JSON.stringify(record)}`,
  ];
  return join_ACU([
    [
      'Chỉ xuất một đối tượng JSON rà soát, phần suy luận viết trong chuỗi suy nghĩ. Sau khi đóng không kèm Markdown, giải thích hay trường khác.',
      'Chỉ xuất một đối tượng JSON rà soát, không kèm Markdown, giải thích, thẻ suy nghĩ hay trường khác.',
      'Gọi riêng submit để nộp kết quả rà soát, không kèm Markdown, giải thích, thẻ suy nghĩ hay trường khác.',
    ],
    [
      'Cấp cao nhất phải và chỉ được chứa verdict, summary, findings, acceptedCandidateIds; không được xuất guidance.',
      'Cấp cao nhất phải và chỉ được chứa verdict, summary, findings, acceptedCandidateIds; không được xuất guidance.',
      'Tham số submit phải và chỉ được chứa verdict, summary, findings, acceptedCandidateIds; không được xuất guidance.',
    ],
    'verdict phải chính xác là một trong accept, revise, reject; cấm dùng các bí danh như approve, approved, pass, success, done.',
    'findings phải là mảng; mỗi mục phải và chỉ được chứa severity, reasonCode, path, expected, actual, severity phải chính xác là một trong blocking, major, minor.',
    'accept phải chấp nhận ít nhất một ứng viên; acceptedCandidateIds của reject phải rỗng; revise có thể giữ các ứng viên đã đạt và dùng findings để nêu các mục cần sửa.',
    'Bạn chỉ rà soát thời gian, không gian, nhân quả, revision, quyền hạn và bằng chứng; phép chiếu do guidance-composer chuyên trách, không được viết signals trong giao thức này.',
    example('Ví dụ accept', ex.accept),
    example('Ví dụ revise', ex.revise),
    example('Ví dụ reject', ex.reject),
    [THINK_RUNTIME_ACU, THINK_JSON_ACU, THINK_TOOLS_ACU],
  ]);
}

/** Vai trò chỉ đọc (không có module ghi), ví dụ lore-researcher. */
export function worldSimulationReadOnlyProtocolVi_ACU(name: string): WorldSimulationProtocolVariants_ACU {
  const catalog = (via: string) => `Mọi mục trong danh mục đều có thể xem chi tiết ${via} theo địa chỉ (mục đang dùng như seeds:{id}, trạng thái theo từng cột như field:seeds:{id} hoặc field:seeds:{id}:title, tóm tắt lưu trữ như chronicle-archive:{archiveRef}).`;
  return join_ACU([
    [
      'Chỉ xuất một đối tượng JSON specialist, phần suy luận viết trong chuỗi suy nghĩ, sau khi đóng mới xuất JSON giao thức, không kèm Markdown hay giải thích.',
      'Chỉ xuất một đối tượng JSON specialist, không kèm Markdown, giải thích hay thẻ suy nghĩ.',
      'Gọi riêng submit để nộp kết quả specialist, không kèm Markdown, giải thích hay thẻ suy nghĩ.',
    ],
    'status phải chính xác là một trong candidate, no_change, failed, blocked; cấm dùng các trạng thái tự đặt như success, complete, done, ok, error.',
    `agentName phải chính xác là ${name}.`,
    [
      'Vai trò hiện tại không có quyền ghi sổ cái, không được xuất candidate; chỉ được xuất no_change, failed hoặc blocked.',
      'Vai trò hiện tại không có quyền ghi sổ cái, không được xuất candidate; chỉ được xuất no_change, failed hoặc blocked.',
      'Vai trò hiện tại không có quyền ghi sổ cái, không được gọi submit để nộp candidate; chỉ được gọi submit để nộp no_change, failed hoặc blocked.',
    ],
    [catalog('bằng công cụ read'), catalog('bằng công cụ read'), catalog('bằng cách gọi read')],
    'no_change phải chứa summary, evidenceRefs, uncertainties.',
    'failed phải chứa reasonCode, message. blocked phải chứa mảng unresolved không rỗng.',
  ]);
}
