/**
 * log-error-hints — 把运行日志里的报错翻译成「大概是什么问题 + 可以怎么处理」。
 *
 * 规则按顺序匹配：越靠前越具体（明确短语、HTTP 状态码），越靠后越宽泛（按功能模块兜底），
 * 最后一条是通用兜底，保证每条 error 级日志都有一份处理建议。
 * 只做字符串匹配，不依赖 DOM 与 Vue，方便单测。
 */
import type { LogEntry } from '../../shared/log-buffer';

export interface LogErrorHint {
  /** 规则 ID，便于测试与后续针对性调整文案。 */
  id: string;
  /** 一句话说明这条报错大致意味着什么。 */
  summary: string;
  /** 用户可以直接照做的处理步骤，按先后顺序排列。 */
  steps: string[];
}

interface HintRule {
  id: string;
  /** 在小写化后的 `tag + message` 上匹配。 */
  test: RegExp | ((haystack: string) => boolean);
  summary: string;
  steps: string[];
}

const RETRY_LATER = 'Chờ một lát rồi thử lại; nhiều sự cố chỉ là chập chờn tạm thời của nhà cung cấp.';
const SEE_PREVIOUS_LOG = 'Xem nhật ký ngay trước đó, thường sẽ cho biết nguyên nhân cụ thể hơn (mã trạng thái HTTP, nội dung phân tích thất bại, v.v.).';
const EXPORT_LOGS = 'Nếu lỗi lặp lại, bấm「Xuất」ở bảng nhật ký để gửi nhật ký kèm các bước tái hiện cho tác giả.';

const RULES: HintRule[] = [
  // ─── 主动中止 ───
  {
    id: 'aborted',
    test: /request aborted|aborterror|the user aborted|已中止|已取消|用户取消|用户中止|abort signal|signal is aborted|đã bị hủy|đã hủy|bị người dùng (?:hủy|dừng)|người dùng đã (?:hủy|dừng)/,
    summary: 'Yêu cầu bị chủ động hủy (thường do bạn bấm dừng, đổi cuộc trò chuyện hoặc đóng bảng điều khiển).',
    steps: [
      'Nếu bạn tự dừng thì có thể bỏ qua bản ghi này.',
      'Nếu không dừng thủ công mà vẫn bị hủy, hãy kiểm tra mạng có bị ngắt giữa chừng không rồi thử lại.',
    ],
  },

  // ─── 浏览器存储 ───
  {
    id: 'storage-quota',
    test: /quotaexceeded|exceeded the quota|storage.*full|out of storage|存储空间不足|localstorage/,
    summary: 'Bộ nhớ cục bộ của trình duyệt đã đầy, không ghi được cài đặt hoặc bộ nhớ đệm.',
    steps: [
      'Vào trang「Quản lý dữ liệu」để dọn dữ liệu lịch sử hoặc bộ nhớ đệm nhập không còn cần.',
      'Dọn dung lượng lưu trữ do các trang / tiện ích khác chiếm trong trình duyệt.',
      'Ở chế độ riêng tư / ẩn danh, bộ nhớ bị giới hạn, hãy dùng cửa sổ thường.',
    ],
  },

  // ─── 启动 / 宿主 ───
  {
    id: 'startup',
    test: /等待 ?sillytavern|core apis not available|getcontext\(\)|not ready after|jquery|#extensionsmenu|failed to initialize\. core|插件启动|插件无法启动|host doc|failed to load one or more critical apis/,
    summary: 'Khởi tạo tiện ích thất bại: chưa chờ được API lõi của SillyTavern sẵn sàng.',
    steps: [
      'Làm mới trang (Ctrl+F5).',
      'Xác nhận SillyTavern không quá cũ và đã bật tiện ích này trong trình quản lý tiện ích mở rộng.',
      'Cài nhiều tiện ích sẽ tải chậm, hãy chờ tải xong rồi mới mở tiện ích; nếu vẫn lỗi, kiểm tra lỗi của các tiện ích khác trong console trình duyệt.',
    ],
  },
  {
    id: 'ui-not-ready',
    test: /ui元素未初始化|cannot find .*dom|popup dom|ui surface is not registered|界面未初始化/,
    summary: 'Giao diện chưa tải xong đã kích hoạt thao tác.',
    steps: [
      'Đóng rồi mở lại bảng điều khiển của tiện ích.',
      'Nếu vẫn xảy ra thì làm mới trang.',
    ],
  },

  // ─── 酒馆侧 API 配置 ───
  {
    id: 'tavern-profile',
    test: /未选择酒馆连接预设|无法找到id为|没有配置api|没有选择预设|连接预设.*(不存在|无效|失败)|connection profile|chưa chọn preset kết nối|không tìm thấy preset kết nối|chưa cấu hình api|preset kết nối.*(?:không tồn tại|không hợp lệ|thất bại|không phải)/,
    summary: '「Preset kết nối」của SillyTavern đã chọn không dùng được: bị xóa, đổi tên hoặc chưa cấu hình API bên trong.',
    steps: [
      'Mở「Kết nối API」→「Cấu hình kết nối」ở góc trên bên trái SillyTavern, xác nhận preset tồn tại và đã gắn API cùng preset.',
      'Quay lại trang「API」của tiện ích, chọn lại preset kết nối một lần rồi lưu.',
      'Hoặc chuyển sang「API tùy chỉnh」và nhập trực tiếp địa chỉ, khóa và mô hình.',
    ],
  },
  {
    id: 'tavern-helper-missing',
    test: /tavernhelper\.generateraw|未检测到酒馆助手|主api生成不可用|connectionmanagerrequestservice 不可用|请检查酒馆版本|js-slash-runner|không phát hiện tavern ?helper|không thể tạo bằng api chính|connectionmanagerrequestservice không khả dụng|kiểm tra phiên bản sillytavern/,
    summary: 'Thiếu tiện ích「Trợ lý SillyTavern (TavernHelper)」, hoặc SillyTavern quá cũ nên không gọi được API chính.',
    steps: [
      'Cài và bật「Trợ lý SillyTavern (JS-Slash-Runner)」trong trình quản lý tiện ích mở rộng.',
      'Cập nhật SillyTavern lên bản mới nhất rồi làm mới trang.',
      'Giải pháp tạm: vào trang「API」chuyển sang「API tùy chỉnh」, không phụ thuộc API chính của SillyTavern.',
    ],
  },
  {
    id: 'api-config-incomplete',
    test: /url或模型未配置|缺少 ?embedding ?endpoint|缺少 ?embedding ?model|rerank endpoint 为空|rerank model 为空|api.*(未配置|未填写)|endpoint.*(为空|missing)|未配置api|thiếu ?embedding ?endpoint|thiếu ?embedding ?model|rerank endpoint rỗng|rerank model rỗng|api.*(?:chưa được cấu hình|chưa cấu hình|chưa điền)|endpoint.*(?:rỗng|trống)/,
    summary: 'Cấu hình API chưa đầy đủ: thiếu địa chỉ giao diện, khóa hoặc tên mô hình.',
    steps: [
      'Vào trang「API」bổ sung địa chỉ giao diện, API Key và tên mô hình cho preset đó rồi lưu preset.',
      'Với lỗi liên quan vector, hãy kiểm tra địa chỉ và mô hình Embedding / Rerank trong bảng「Embedding / Rerank」của「Bàn điền bảng」.',
      'Xác nhận các chức năng tương ứng (điền bảng / đẩy cốt truyện / viết tiếp) đang chọn đúng preset đã bổ sung đầy đủ này.',
    ],
  },
  // 交火 rerank 回退：runtime 会把网关的具体原因（HTTP 状态 / 网络失败）包在这条消息里，
  // 必须排在 HTTP / 网络通用规则之前，否则用户只会看到泛泛的「网络问题」而不知道是 rerank 被跳过了。
  {
    id: 'vector-rerank-fallback',
    test: /rerank 调用失败|rerank 响应没有任何可用的评分/,
    summary: 'Rerank không có hiệu lực, lượt giao hỏa này đã quay về chỉ sắp xếp theo độ tương đồng Embedding.',
    steps: [
      'Kiểm tra địa chỉ giao diện Rerank (phải điền địa chỉ đầy đủ đến cấp /rerank), API Key và tên mô hình trong bảng「Embedding / Rerank」của「Bàn điền bảng」.',
      'Khi lỗi có「Network failure / Failed to fetch」thường là nhà cung cấp không cho trình duyệt kết nối trực tiếp liên miền; hãy dùng dịch vụ rerank hỗ trợ CORS hoặc địa chỉ reverse proxy.',
      'Khi lỗi có「không có điểm số khả dụng」nghĩa là định dạng trả về không phải results[].index / relevance_score; hãy đổi sang nhà cung cấp tương thích định dạng Jina / Cohere.',
      'Nếu không muốn dùng rerank, hãy xóa trống cả địa chỉ và mô hình Rerank, nhật ký sẽ không còn báo lỗi này.',
    ],
  },

  // ─── HTTP 状态码 ───
  {
    id: 'http-401',
    test: /\b401\b|unauthorized|invalid[ _-]?api[ _-]?key|incorrect api key|invalid x-api-key|authentication[ _-]?error|invalid_api_key|no auth credentials|令牌无效|密钥无效|api key 无效/,
    summary: 'API từ chối yêu cầu: khóa không hợp lệ, nhập sai hoặc đã hết hạn (401).',
    steps: [
      'Vào trang「API」, mở preset đang dùng, kiểm tra API Key có đầy đủ và không thừa khoảng trắng.',
      'Xác nhận nhà cung cấp của Key khớp với địa chỉ giao diện (ví dụ Key của OpenAI không thể điền vào địa chỉ Claude).',
      'Nếu dùng trạm trung chuyển, đăng nhập trang đó để xác nhận Key còn hiệu lực và số dư đủ.',
    ],
  },
  {
    id: 'http-403',
    test: /\b403\b|forbidden|permission[ _-]?denied|not allowed to|access denied|无权访问|权限不足/,
    summary: 'Nhà cung cấp từ chối truy cập (403): Key không có quyền, hoặc nguồn yêu cầu bị hạn chế.',
    steps: [
      'Xác nhận Key có quyền dùng mô hình đã chọn (một số mô hình cần kích hoạt riêng).',
      'Một số nhà cung cấp từ chối yêu cầu kết nối trực tiếp từ trình duyệt: hãy đổi preset API đó sang dùng「Preset kết nối SillyTavern」để backend SillyTavern chuyển tiếp.',
      'Nếu dùng trạm trung chuyển, liên hệ chủ trạm để xác nhận tài khoản có bị hạn chế không.',
    ],
  },
  {
    id: 'http-404',
    test: /\b404\b|not[ _]found.*(model|endpoint|route)|model.*(not found|does not exist|not exist)|no such model|unknown model|invalid model|模型不存在|找不到模型/,
    summary: 'Địa chỉ giao diện hoặc tên mô hình không tồn tại (404).',
    steps: [
      'Vào trang「API」kiểm tra địa chỉ giao diện có đầy đủ không; mỗi nhà cung cấp yêu cầu khác nhau về việc có đuôi /v1 hay không, hãy điền theo tài liệu của họ.',
      'Bấm「Lấy danh sách mô hình」để chọn lại mô hình, tránh gõ sai tên mô hình.',
      'Xác nhận nhà cung cấp vẫn cung cấp mô hình đó, mô hình cũ có thể đã ngừng hoạt động.',
    ],
  },
  {
    id: 'http-429',
    test: /\b429\b|rate[ _-]?limit|too many requests|\bquota\b|insufficient (balance|funds)|exceeded your current|resource[ _-]?exhausted|请求过于频繁|限流|额度不足|余额不足|欠费|配额/,
    summary: 'Yêu cầu quá dày bị giới hạn tốc độ, hoặc hạn mức / số dư tài khoản đã hết (429).',
    steps: [
      'Chờ 1–2 phút rồi thử lại; thử lại liên tục trong thời gian ngắn chỉ khiến bị giới hạn lâu hơn.',
      'Đăng nhập trang quản trị của nhà cung cấp để xác nhận số dư và hạn mức còn đủ.',
      'Trong cài đặt của chức năng tương ứng, tăng「Độ trễ thử lại」/「Độ trễ giữa các vòng」, hoặc giảm số luồng đồng thời và kích thước lô.',
      'Viết tiếp thông minh sẽ gửi liên tục nhiều yêu cầu, hãy dùng API hỗ trợ RPM cao, đừng dùng trạm công cộng.',
    ],
  },
  {
    id: 'http-5xx',
    test: /\b(500|502|503|504|529)\b|bad gateway|service unavailable|gateway time-?out|internal server error|overloaded|server error|服务器错误|服务不可用|上游.*(错误|超时)|lỗi từ upstream/,
    summary: 'Máy chủ của nhà cung cấp bị lỗi hoặc quá tải (5xx), không phải vấn đề cấu hình cục bộ.',
    steps: [
      RETRY_LATER,
      'Nếu lỗi kéo dài, hãy đổi mô hình hoặc đổi kênh API.',
      'Nếu dùng trạm trung chuyển, xem thông báo của trạm để xác nhận có đang bảo trì không.',
    ],
  },
  {
    id: 'context-length',
    test: /context[ _-]?length|maximum context|context window|too many tokens|tokens? (exceed|limit|too long)|prompt is too long|input is too long|max_tokens.*(exceed|invalid)|超出.*(上下文|长度)|上下文.*(超限|过长)|token.*超|vượt.*(?:ngữ cảnh|độ dài)|ngữ cảnh.*(?:vượt|quá dài)|token.*vượt/,
    summary: 'Nội dung gửi cho mô hình quá dài, vượt giới hạn ngữ cảnh của mô hình.',
    steps: [
      'Điền bảng: vào「Quy tắc điền bảng」giảm「Kích thước lô」/「Số tầng ngữ cảnh」.',
      'Viết tiếp thông minh: giảm「Số tầng cửa sổ đọc nội dung」「Ngưỡng tự động tóm tắt phiên」và các ngân sách đọc.',
      'Dùng mô hình có ngữ cảnh lớn hơn, hoặc rút gọn prompt tùy chỉnh và các mục sổ thế giới quá dài.',
    ],
  },
  {
    id: 'http-400',
    test: /\b400\b|bad request|invalid_request_error|unsupported parameter|invalid parameter|unrecognized request argument|unknown parameter|参数错误|请求参数无效/,
    summary: 'Nhà cung cấp cho rằng nội dung yêu cầu có vấn đề (400): thường là tên mô hình hoặc một tham số không được hỗ trợ.',
    steps: [
      'Vào trang「API」xác nhận tên mô hình viết đúng, tốt nhất chọn qua「Lấy danh sách mô hình」.',
      'Nếu đã chỉnh các tham số nâng cao như temperature / top_p hoặc bật「JSON nghiêm ngặt」, hãy khôi phục mặc định rồi thử lại.',
      'Thử đổi mô hình: một số mô hình không hỗ trợ vai trò system hoặc một số trường.',
    ],
  },

  // ─── 网络 ───
  {
    id: 'network-cors',
    test: /\bcors\b|cross-origin|access-control-allow-origin|preflight/,
    summary: 'Trình duyệt chặn liên miền (CORS): nhà cung cấp này không cho trang web gọi trực tiếp.',
    steps: [
      'Đổi preset API đó sang dùng「Preset kết nối SillyTavern」để backend SillyTavern chuyển tiếp thay.',
      'Hoặc dùng dịch vụ trung chuyển hỗ trợ kết nối trực tiếp từ trình duyệt.',
    ],
  },
  {
    id: 'network',
    test: /failed to fetch|networkerror|network error|net::err|econnrefused|econnreset|enotfound|etimedout|getaddrinfo|socket hang up|fetch failed|timed? ?out|timeout|无法连接|连接被拒绝|网络错误|请求超时|超时|hết thời gian/,
    summary: 'Không kết nối được tới dịch vụ đích, hoặc chờ phản hồi bị quá thời gian.',
    steps: [
      'Kiểm tra mạng máy, proxy / VPN có bình thường không; sao chép địa chỉ giao diện vào thanh địa chỉ trình duyệt xem có mở được không.',
      'Quá thời gian thường do mô hình phản hồi quá chậm: thử lại sau, hoặc dùng mô hình phản hồi nhanh hơn.',
      'Nếu SillyTavern triển khai trên máy chủ từ xa, xác nhận bản thân máy chủ truy cập được địa chỉ API đó.',
    ],
  },

  // ─── 内容审查 ───
  {
    id: 'content-filter',
    test: /content[ _-]?filter|content_policy|safety (setting|filter|system)|blocked by|flagged|prohibited_content|recitation|内容审查|违规内容|敏感内容|安全策略/,
    summary: 'Nội dung bị kiểm duyệt an toàn của nhà cung cấp chặn, mô hình từ chối hoặc cắt bớt đầu ra.',
    steps: [
      'Dùng mô hình hoặc kênh kiểm duyệt lỏng hơn; kênh chính thức thường rất nghiêm với nội dung người lớn / bạo lực.',
      'Điều chỉnh cách diễn đạt trong prompt hoặc sổ thế giới gây kích hoạt kiểm duyệt.',
      'Nếu điền bảng bị chặn, có thể điền bảng thủ công để bỏ qua bước này.',
    ],
  },

  // ─── 模板变量 / 表达式 ───
  {
    id: 'template-vars',
    test: /\[条件模板\]|\[db\.(expr|rand|calc|max|min)\]|\[orm\]|模板变量|evaluatecondexpression|表达式执行失败|随机数生成失败/,
    summary: 'Biểu thức biến mẫu ({{db.xxx}} hoặc mẫu điều kiện) trong sổ thế giới / prompt phân tích thất bại.',
    steps: [
      'Mở mục sổ thế giới hoặc prompt tương ứng, kiểm tra cách viết biểu thức nêu trong nhật ký: ngoặc, dấu nháy có khớp cặp không, tên bảng tên cột có đúng không.',
      'Đối chiếu tên hàm và tham số với tài liệu cú pháp (syntax-reference) đi kèm tiện ích.',
      'Thay biểu thức bằng một ví dụ đơn giản nhất để xác nhận chạy được, rồi tăng dần độ phức tạp.',
    ],
  },

  // ─── V2 历史回放 / 恢复 ───
  // 必须排在 sql-constraint 之前：这类错误正文里会原样带着「UNIQUE constraint failed」，
  // 但根因不是这次 SQL，而是聊天历史只能宽容回放；「重试让模型重新生成」修不好它。
  {
    id: 'v2-write-guard',
    test: /写入时基底与回放基底不一致|不可严格回放的历史|không thể phát lại nghiêm ngặt|không khớp trạng thái phát lại lịch sử/,
    summary: 'Phần tăng thêm của bảng lần này không khớp với trạng thái phát lại lịch sử trò chuyện, tiện ích đã chặn trước khi ghi (lịch sử không bị hỏng).',
    steps: [
      'Thường do mô hình điền trùng hàng: câu INSERT nó sinh ra xung đột row_id với hàng đã có khi phát lại theo tầng. Điền bảng / bắt kịp sẽ phản hồi lỗi này cho mô hình tự thử lại, thường không cần xử lý.',
      'Nếu cùng một tầng liên tục thất bại, nghĩa là nội dung bảng mô hình thấy không khớp với trạng thái lịch sử của tầng đó (hay gặp khi bắt kịp thủ công các tầng đầu); hãy đổi điểm bắt đầu bắt kịp hoặc thu hẹp phạm vi chọn bảng rồi thử lại.',
      EXPORT_LOGS,
    ],
  },
  {
    id: 'v2-compat-readonly',
    test: /兼容宽容回放读出|仅可经兼容|compat_tolerant_replay|v2 恢复收敛|固化为过渡根|兼容过渡根|khoan dung tương thích|tương thích khoan dung|hội tụ khôi phục|gốc chuyển tiếp|chuyển tiếp tương thích/,
    summary: 'Lịch sử bảng trong cuộc trò chuyện chỉ đọc được ở chế độ tương thích (khoan dung): một phần tăng thêm lịch sử thất bại khi phát lại nghiêm ngặt (thường do chèn trùng cùng một row_id). Việc đọc vẫn bình thường, nhưng ghi, bắt kịp và gửi mẫu sẽ bị từ chối.',
    steps: [
      'Đây không phải vấn đề của đầu ra AI lần này, thử sinh lại không sửa được lịch sử nên tiện ích không tự động thử lại.',
      'Vào「Quản lý dữ liệu」→「Chẩn đoán khôi phục dữ liệu V2」, bấm「Cố định phát lại tương thích thành gốc chuyển tiếp」: ghi kết quả đọc tương thích hiện tại thành gốc có thể phát lại nghiêm ngặt, sau đó ghi và bắt kịp trở lại bình thường (khi gộp danh tính sheetKey cần xác nhận thêm).',
      'Việc cố định không ghi đè bất kỳ storage frame gốc nào; nếu cần đối chiếu thủ công, hãy dùng「Xuất bản sao lưu frame gốc đã lưu」trước.',
    ],
  },

  // ─── 表格结构 ───
  {
    id: 'column-not-found',
    test: /column .* not found|no such column|column mapping is unavailable|absent from canonical headers|cannot find .* column|column index .* out of bounds|找不到.*列|列.*不存在|列名.*无效/,
    summary: 'Không tìm thấy cột được chỉ định: tên cột không khớp với tiêu đề bảng hiện tại.',
    steps: [
      'Vào「Công cụ nâng cao」→ Bảng điều khiển SQL, bấm「Xem cấu trúc bảng」để đối chiếu tên cột chính xác.',
      'Tên cột trong prompt hoặc mẫu phải khớp hoàn toàn với tiêu đề bảng (bao gồm khoảng trắng, dấu ngoặc).',
      'Nếu vừa sửa mẫu, hãy mở trình chỉnh sửa bảng và lưu lại một lần để đồng bộ cấu trúc vào cơ sở dữ liệu.',
    ],
  },
  {
    id: 'sqlite-ddl-exec',
    test: /ddl.*(执行|apply|run|fail|失败|error)|执行.*ddl|apply.*ddl|建表失败|创建表失败|alter table.*(失败|fail)|drop table.*(失败|fail)|完整 candidate sqlite hydrate 失败|candidate.*hydrate 失败|ddl.*(?:thất bại|không thể thực thi)|không thể chèn row_id vào ddl|sqlite hydrate.*thất bại|hydrate.*candidate.*thất bại/,
    summary: 'Tạo bảng / sửa bảng (DDL) của SQLite thất bại, cấu trúc mẫu không thể hiện thực trong SQLite.',
    steps: [
      'Thường do mẫu có tên cột trùng, xung đột ràng buộc hoặc không tương thích với bảng vật lý lịch sử.',
      'Vào trang「Quản lý dữ liệu」xem mẫu và cấu trúc bảng lịch sử, hoặc dùng công cụ hiệu chuẩn / khôi phục cấu trúc để dựng lại.',
      'Nếu vừa đổi mẫu, hãy làm mới trang rồi thử lại; nếu vẫn lỗi, xuất nhật ký để phản hồi.',
    ],
  },
  {
    id: 'table-not-found',
    test: /table "[^"]*" not found|no such table|has no content|表格?\s*[「"“]?[^\s」"”]{0,40}[」"”]?\s*(不存在|未找到)|找不到表|表不存在|không tìm thấy bảng|bảng\s*[「\"“]?[^\s」\"”]{0,40}[」\"”]?\s*(?:không tồn tại|không tìm thấy)/,
    summary: 'Không tìm thấy bảng được chỉ định (hoặc bảng trống).',
    steps: [
      'Kiểm tra tên bảng viết đúng chưa; tên bảng tiếng Trung và tiếng Anh không dùng lẫn.',
      'Xác nhận cuộc trò chuyện hiện tại đã nạp mẫu bảng (trang「Quy tắc điền bảng」hiển thị danh sách bảng).',
      'Vào「Công cụ nâng cao」→ Bảng điều khiển SQL, bấm「Xem tất cả bảng」và thử lại với tên bảng được liệt kê.',
    ],
  },
  {
    id: 'row-out-of-bounds',
    test: /row index .* out of bounds|row_id not found|cannot (modify|delete) header row|行号.*越界|行.*不存在|找不到.*行|hàng .* không tồn tại|không tìm thấy.*hàng/,
    summary: 'Số hàng vượt giới hạn, hoặc không tìm thấy hàng tương ứng.',
    steps: [
      'Số hàng đếm từ 1, 0 là hàng tiêu đề, không thể sửa hoặc xóa.',
      'Mở trình chỉnh sửa bảng để xác nhận hàng mục tiêu có thật sự tồn tại.',
      'Nếu là lệnh chỉnh sửa do AI sinh ra, phần lớn là mô hình bịa, thử lại là được.',
    ],
  },

  // ─── SQLite ───
  {
    id: 'sqlite-init',
    test: /sql\.js|wasm|sqlite.*(初始化|init|加载|load).*(失败|fail|异常)|sqlite runtime unavailable|fallback 到原生|回退.*原生|sqlite mode expected|exported no table data|sqlite provider|sqlite 不可用|khởi tạo lại runtime sqlite|(?:khởi tạo|tải).*sqlite.*thất bại|lùi về chế độ gốc|quay về chế độ gốc|sqlite.*không khả dụng|chuyển chế độ sqlite thất bại|tải lại sqlite runtime chưa hoàn tất/,
    summary: 'Công cụ SQLite tải thất bại, đã tự động quay về chế độ lưu trữ gốc (JSON).',
    steps: [
      'Làm mới trang SillyTavern (Ctrl+F5) rồi thử lại.',
      'Kiểm tra trình chặn quảng cáo / tiện ích bảo mật của trình duyệt có chặn tải tệp .wasm không.',
      'Cài lại tiện ích này để đảm bảo tệp đầy đủ. Trong thời gian quay về chế độ gốc bảng vẫn dùng được, chỉ các chức năng liên quan SQL bị hạn chế.',
    ],
  },
  {
    id: 'schema-mismatch',
    test: /schema_missing|未在 sqlite runtime 中创建|未在 sqlite 运行时|缺列|缺少列|runtime 中不存在|结构不一致|schema 不一致|表结构.*(不一致|缺失|不匹配)|hydrate 失败.*(schema|列)|schema.*(fail|mismatch|不一致)|chưa được tạo trong sqlite runtime|schema.*không khớp|không khớp.*schema|cấu trúc.*(?:không khớp|không nhất quán)|thiếu cột/,
    summary: 'Cấu trúc bảng (cột / bảng vật lý) không khớp với kết quả tạo bảng thực tế của SQLite, đây là vấn đề dữ liệu hoặc cấu trúc mẫu, không phải lỗi tải công cụ.',
    steps: [
      'Đây không phải vấn đề tải wasm / công cụ, không cần kiểm tra việc chặn tải.',
      'Vào trang「Quản lý dữ liệu」chạy công cụ chẩn đoán / khôi phục để tiện ích dựng lại hoặc hiệu chuẩn cấu trúc runtime theo mẫu hiện tại.',
      'Nếu vừa đổi mẫu, hãy làm mới trang và nạp lại cuộc trò chuyện hiện tại; nếu vẫn lỗi, xuất nhật ký để phản hồi.',
    ],
  },
  {
    id: 'identity-conflict',
    test: /表身份.*(失败|冲突|歧义)|身份冲突|identity conflict|多对一冲突|同时指向|同名.*(冲突|重复)|物理表名冲突|sheetkey.*(冲突|歧义)|表名.*(冲突|歧义)|schema 身份|danh tính bảng.*(?:thất bại|xung đột|mơ hồ)|danh tính.*xung đột|xung đột danh tính|nhiều-một|(?:cùng lúc|đồng thời|cùng) trỏ tới|tên bảng.*(?:xung đột|mơ hồ)|xung đột tên bảng|sheetkey.*(?:xung đột|mơ hồ)/,
    summary: 'Danh tính bảng bị xung đột hoặc mơ hồ: cùng một tên bảng chuẩn / bí danh tương ứng nhiều bảng, hoặc sheetKey cũ và mới chưa được gộp đúng.',
    steps: [
      'Thường do sau khi đổi mẫu, key cũ và key mới cùng tồn tại.',
      'Vào trang「Quản lý dữ liệu」dùng công cụ chẩn đoán / khôi phục, ưu tiên chọn khôi phục bảo toàn giữ được dữ liệu cả hai bên.',
      'Đừng tự xóa bảng lịch sử; hãy xuất nhật ký kèm các bước đổi mẫu để dễ định vị ánh xạ danh tính.',
    ],
  },
  {
    id: 'sql-constraint',
    test: /unique constraint|constraint failed|not null constraint|foreign key constraint|datatype mismatch|主键冲突|唯一约束/,
    summary: 'Ghi SQL vi phạm ràng buộc bảng (trùng khóa chính / giá trị rỗng / sai kiểu).',
    steps: [
      'Hàng chèn vào trùng row_id với hàng đã có: hãy dùng UPDATE, hoặc để hệ thống tự cấp row_id.',
      'Nếu là câu lệnh do AI sinh, thử lại một lần để mô hình sinh lại.',
      'Khi tự viết SQL, hãy xác nhận kiểu cột khớp với giá trị điền vào.',
    ],
  },
  {
    id: 'sql-syntax',
    test: /syntax error|near "|sql.*(执行失败|failed|error)|sqlite_error|execute failed|批量执行失败|快照 sql|thực thi (?:staging )?sql thất bại|sql.*thất bại|lỗi thực thi sql|câu lệnh thứ.*thất bại|ghi sqlite thất bại/,
    summary: 'Thực thi câu lệnh SQL thất bại: sai cú pháp, hoặc tham chiếu bảng / cột không tồn tại.',
    steps: [
      'Nếu là câu lệnh bạn tự viết trong bảng điều khiển SQL, kiểm tra chính tả, dấu nháy có khớp cặp không và dấu chấm phẩy cuối câu.',
      'Nếu là câu lệnh do AI sinh, phần lớn là mô hình xuất sai, thử lại là được.',
      'Dùng「Xem tất cả bảng」「Xem cấu trúc bảng」để đối chiếu tên bảng và tên cột.',
    ],
  },

  // ─── 表格数据状态 ───
  {
    id: 'table-data-not-loaded',
    test: /tabledata is not loaded|currentjsontabledata_acu is (null|not (loaded|available))|chat history is empty|表格数据.*(未加载|不可用)|聊天记录为空|获取聊天记录失败|save aborted|(?:lịch sử trò chuyện|bản ghi cuộc trò chuyện(?: hiện tại)?)(?: đang)? trống|dữ liệu bảng.*(?:chưa được nạp|chưa được tải|không khả dụng)|csdl chưa được tải/,
    summary: 'Dữ liệu bảng chưa được nạp, hoặc cuộc trò chuyện hiện tại chưa có tin nhắn.',
    steps: [
      'Xác nhận cuộc trò chuyện hiện tại có ít nhất một phản hồi của AI; cuộc trò chuyện mới cần gửi một tin nhắn trước.',
      'Chuyển cuộc trò chuyện một lần hoặc làm mới trang để bảng được nạp lại.',
      'Nếu lặp lại, vào trang「Quản lý dữ liệu」kiểm tra trạng thái bảng của cuộc trò chuyện hiện tại.',
    ],
  },
  {
    id: 'table-persist-model',
    test: /table persistence requires|direct unsafe writes/,
    summary: 'Có script cố bỏ qua kênh ghi an toàn để sửa bảng trực tiếp, đã bị tiện ích từ chối.',
    steps: [
      'Thường đến từ script bên thứ ba hoặc script thẻ nhân vật phiên bản cũ; dữ liệu của tiện ích này không bị ảnh hưởng.',
      'Hãy nhờ tác giả script chuyển sang dùng API bảng mà tiện ích này công khai (updateCell / updateRow / executeSql, v.v.).',
    ],
  },

  // ─── 设置持久化 ───
  {
    id: 'settings-persist',
    test: /failed to (save|persist|load).*settings|settings.*(save|load|persist).*fail|保存.*(设置|预设|配置|阈值|次数|频率|大小|并发|楼层|保留数).*失败|设置.*(保存|读取).*失败|failed to load or parse settings|lưu.*(?:cài đặt|preset|cấu hình|ngưỡng|số lần|tần suất|kích thước|đồng thời|tầng).*thất bại|cài đặt.*(?:lưu|đọc).*thất bại/,
    summary: 'Lưu hoặc đọc cài đặt thất bại.',
    steps: [
      'Làm mới trang, sửa và lưu lại một lần.',
      'Nếu đọc thất bại và đã quay về giá trị mặc định, vào trang「Quản lý dữ liệu」khôi phục bằng cấu hình đã xuất trước đó.',
      'Kiểm tra bộ nhớ trình duyệt có đầy hoặc bị giới hạn bởi cài đặt riêng tư không.',
    ],
  },

  // ─── JSON / 解析 ───
  {
    id: 'json-import',
    // 第二组限定「文件导入」语境：TemplateAssistant 这类 AI 草稿解析失败不算导入问题。
    test: haystack => /json|parse|解析|phân tích|unexpected token|unexpected end/.test(haystack)
      && /导入|import|\[模板|模板文件|template (file|json)|预设|preset|主题|theme|合并配置|json đã nhập|nhập tệp|\[mẫu|tệp mẫu|tệp giao diện|cấu hình gộp/.test(haystack),
    summary: 'Tệp nhập không phải JSON hợp lệ, hoặc cấu trúc không khớp với yêu cầu của tiện ích.',
    steps: [
      'Xác nhận bạn nhập tệp JSON do chức năng「Xuất」của tiện ích này tạo ra, không phải của tiện ích khác hoặc tệp đã sửa tay.',
      'Mở tệp bằng Notepad, kiểm tra có bị cắt cụt không, dấu ngoặc nhọn đầu cuối có đầy đủ không.',
      'Nếu nội dung sao chép từ cuộc trò chuyện / trang web, hãy dán vào trình soạn thảo kiểm tra trước rồi lưu thành .json.',
    ],
  },
  {
    id: 'json-ai-output',
    test: /json.*(解析|parse|sanitiz)|parse.*json|unexpected token|unexpected end of json|is not valid json|sanitization|loose row object|failed to parse (command|or apply)|解析\/应用失败|解析失败|解析出错|解析异常|json.*phân tích|phân tích json|phân tích.*thất bại|lỗi phân tích|không thể phân tích/,
    summary: 'JSON / định dạng lệnh do AI xuất không đúng, tiện ích không phân tích được.',
    steps: [
      'Thường là mô hình chập chờn ngẫu nhiên, thử lại ngay một lần.',
      'Nếu xảy ra thường xuyên, hãy dùng mô hình tuân thủ chỉ dẫn tốt hơn (tham số lớn hơn, hoặc kênh chính thức).',
      'Với điền bảng, có thể vào「Quy tắc điền bảng」bật「JSON nghiêm ngặt」hoặc hạ temperature; kiểm tra prompt tùy chỉnh có yêu cầu định dạng đầu ra bổ sung không.',
    ],
  },
  {
    id: 'empty-response',
    test: /未返回预期的文本响应|返回无效响应|unknown response format|failed to parse response|empty response|响应为空|返回为空|空响应|返回内容为空|已返回 null|trả về rỗng|phản hồi rỗng|đầu ra.*rỗng/,
    summary: 'AI trả về nội dung rỗng hoặc định dạng không nhận diện được.',
    steps: [
      RETRY_LATER,
      'Có thể đã kích hoạt kiểm duyệt nội dung của nhà cung cấp (một số mô hình bị chặn sẽ âm thầm trả rỗng), hãy đổi mô hình hoặc chỉnh nội dung rồi thử lại.',
      'Nếu đã bật xuất luồng, vào trang「API」tắt luồng của preset đó rồi thử lại.',
    ],
  },

  // ─── 向量 / 存储 / 检查点 ───
  {
    id: 'vector',
    test: /\bembedding\b|\brerank\b|向量|\bvector\b|chỉ mục vector/,
    summary: 'Thao tác liên quan chế độ giao hỏa (chỉ mục vector) thất bại.',
    steps: [
      'Kiểm tra địa chỉ giao diện, khóa và tên mô hình Embedding / Rerank trong bảng「Embedding / Rerank」của「Bàn điền bảng」, xác nhận nhà cung cấp hỗ trợ giao diện đó.',
      SEE_PREVIOUS_LOG,
      'Có thể chuyển sang chế độ bảng cổ điển hoặc chế độ truy hồi logic mô hình LLM ở trang chế độ điền bảng, không ảnh hưởng các chức năng cơ bản như điền bảng.',
    ],
  },
  {
    id: 'storage-mode-switch',
    test: /存储模式.*(切换|回滚)|storage mode (switch|rollback)|chuyển chế độ lưu trữ|chế độ lưu trữ.*(?:chuyển|lùi|khôi phục)/,
    summary: 'Chuyển chế độ lưu trữ thất bại, đã thử khôi phục về trạng thái trước khi chuyển.',
    steps: [
      'Xác nhận hiện không có tác vụ điền bảng hoặc viết tiếp đang chạy, chờ chúng kết thúc rồi mới chuyển.',
      'Làm mới trang rồi thử lại một lần.',
      'Trước khi chuyển nên vào trang「Quản lý dữ liệu」xuất một bản sao lưu dữ liệu.',
    ],
  },
  {
    id: 'checkpoint-replay',
    test: /checkpoint|v2 replay|replay|snapshot hydrate|数据库重建|回放|增量更新流程失败|merge base|compaction|staging|provisional|临时根|phát lại|gốc tạm|gốc chuyển tiếp/,
    summary: 'Phát lại lịch sử bảng / xử lý checkpoint thất bại, dữ liệu đang hiển thị có thể không phải mới nhất.',
    steps: [
      'Làm mới trang trước, hoặc chuyển sang cuộc trò chuyện khác rồi quay lại để tiện ích nạp lại.',
      'Vào trang「Quản lý dữ liệu」xuất một bản sao lưu dữ liệu để tránh thao tác sau ghi đè.',
      'Dùng công cụ chẩn đoán / khôi phục trong「Quản lý dữ liệu」để sửa; nếu vẫn không được, hãy xuất nhật ký để phản hồi.',
    ],
  },

  // ─── 世界书 ───
  {
    id: 'worldbook',
    test: /world ?book|lorebook|世界书|worldbook|sổ thế giới/,
    summary: 'Đọc hoặc ghi sổ thế giới thất bại.',
    steps: [
      'Xác nhận nhân vật hiện tại đã gắn sổ thế giới, và sổ thế giới đích không bị xóa hay đổi tên.',
      'Mở bảng sổ thế giới có sẵn của SillyTavern, xác nhận sổ thế giới đó mở bình thường.',
      'Nếu vừa đổi liên kết, vào trang chức năng tương ứng chọn lại sổ thế giới đích một lần.',
    ],
  },

  // ─── 外部脚本调用 ───
  {
    id: 'deprecated-api',
    test: /已弃用|deprecated/,
    summary: 'Có script khác gọi giao diện đã bị tiện ích này ngừng hỗ trợ.',
    steps: [
      'Không ảnh hưởng hoạt động bình thường của tiện ích, có thể bỏ qua.',
      'Nếu là script bạn tự viết, hãy đổi sang giao diện mới theo gợi ý nhật ký; nếu là thẻ nhân vật hoặc tiện ích bên thứ ba, hãy liên hệ tác giả cập nhật.',
    ],
  },
  {
    id: 'invalid-params',
    test: /must be (an? )?(array|object|non-empty|integer)|is required\.?|invalid (params|input|rowindex|preset name|context settings)|received invalid input|参数无效|参数不合法/,
    summary: 'Tham số khi script bên ngoài gọi giao diện của tiện ích không hợp lệ.',
    steps: [
      'Loại lệnh gọi này thường đến từ script thẻ nhân vật hoặc tiện ích khác, dữ liệu của tiện ích này không bị ảnh hưởng.',
      'Nếu là script bạn viết, hãy sửa kiểu tham số theo gợi ý (ví dụ rowIndex phải là số nguyên bắt đầu từ 1).',
      'Nếu không, hãy liên hệ tác giả script xử lý.',
    ],
  },
  {
    id: 'preset-not-found',
    test: /preset .* not found|预设.*(不存在|未找到|找不到)|无法找到.*预设|找不到.*预设|không tìm thấy.*preset|preset.*(?:không tồn tại|không còn tồn tại|không tìm thấy)/,
    summary: 'Không tìm thấy preset có tên được chỉ định.',
    steps: [
      'Kiểm tra tên preset viết đúng chưa, chú ý chữ hoa chữ thường và khoảng trắng.',
      'Vào trang chức năng tương ứng (API / Quy tắc điền bảng / Đẩy cốt truyện) xác nhận preset còn tồn tại, có thể đã bị xóa hoặc đổi tên.',
      'Chọn lại preset một lần và lưu.',
    ],
  },
  {
    id: 'callback',
    test: /callback/,
    summary: 'Hàm callback mà script bên thứ ba đăng ký vào tiện ích này chạy bị lỗi.',
    steps: [
      'Lỗi đến từ bên trong script khác, không ảnh hưởng kết quả điền bảng của tiện ích này.',
      'Liên hệ tác giả script / thẻ nhân vật đó để kiểm tra.',
    ],
  },

  // ─── 按功能模块兜底 ───
  {
    id: 'template',
    test: /模板|template|\bmẫu\b/,
    summary: 'Xử lý mẫu bảng thất bại.',
    steps: [
      'Xác nhận bạn nhập JSON mẫu do tiện ích này xuất, và mỗi bảng đều có hàng tiêu đề.',
      'Vào trang「Quy tắc điền bảng」chọn lại mẫu, hoặc khôi phục mẫu mặc định rồi mới nhập mẫu tùy chỉnh.',
      SEE_PREVIOUS_LOG,
    ],
  },
  {
    id: 'content-optimization',
    test: /正文优化|正文替换|content replace|reoptimize|重新优化|tối ưu nội dung|thay thế nội dung/,
    summary: 'Thay thế nội dung / tối ưu lại thực thi thất bại.',
    steps: [
      SEE_PREVIOUS_LOG,
      'Vào trang「Thay thế nội dung」xác nhận quy tắc và preset API đã chọn có bình thường không.',
      'Có thể tạm tắt chức năng này để kiểm tra vấn đề có biến mất không.',
    ],
  },
  {
    id: 'plot',
    test: /剧情推进|plot|đẩy cốt truyện/,
    summary: 'Tác vụ đẩy cốt truyện thực thi thất bại.',
    steps: [
      'Vào trang「Đẩy cốt truyện」kiểm tra preset API đã chọn và cấu hình sổ thế giới.',
      'Nếu vừa sửa prompt tác vụ, kiểm tra placeholder (bắt đầu bằng $) viết đúng chưa.',
      SEE_PREVIOUS_LOG,
    ],
  },
  {
    id: 'import',
    test: /外部导入|import|导入|nhập từ ngoài|nhập (?:tệp|mẫu|txt)/,
    summary: 'Quy trình nhập từ ngoài thất bại.',
    steps: [
      'Xác nhận tệp nhập mã hóa UTF-8, và kích thước khối không đặt quá lớn.',
      'Trước khi nhập, xác nhận đã chọn sổ thế giới đích.',
      'Vào trang「Nhập từ ngoài」bấm「Xóa bộ nhớ đệm nhập」trước rồi thử lại.',
    ],
  },
  {
    id: 'fill',
    test: /manual (refill|update)|重填|填表|update process|\bbatch\b|merge|合并|fillfirstlayer|数据加载|triggerupdate|manualupdate|điền bảng|điền lại|bắt kịp/,
    summary: 'Quy trình điền bảng / gộp dữ liệu thất bại.',
    steps: [
      SEE_PREVIOUS_LOG,
      'Vào「Quy tắc điền bảng」giảm kích thước lô rồi thử lại.',
      'Có thể vào「Bàn điền bảng」dùng điền bảng thủ công / điền lại.',
    ],
  },
  {
    id: 'continuation',
    test: /continuation|续写|agent|viết tiếp/,
    summary: 'Thao tác liên quan Agent / viết tiếp thông minh bị lỗi.',
    steps: [
      'Viết tiếp thông minh: xem thông báo lỗi trong luồng phiên ở trang「Viết tiếp thông minh」, và mở rộng「Các kênh Agent」để xác nhận preset API của từng kênh vẫn tồn tại.',
      'Nếu vượt ngân sách / quá thời gian, hãy tăng ngân sách hoặc độ trễ tương ứng; nếu thật sự kẹt, có thể「Xóa trống một chạm」rồi bắt đầu lại tác vụ.',
      'Sổ thế giới Agent: vào trang「Agent」xác nhận chế độ tiếp quản và cấu hình sổ thế giới đích.',
    ],
  },
  {
    id: 'export',
    test: /导出|export|xuất (?:tệp|mẫu|nhật ký|dữ liệu)/,
    summary: 'Xuất thất bại.',
    steps: [
      'Kiểm tra trình duyệt có chặn tải tệp không (thường có thông báo ở bên phải thanh địa chỉ).',
      'Làm mới trang rồi thử lại; nếu vẫn lỗi, xuất nhật ký để phản hồi.',
    ],
  },

  // ─── 通用兜底 ───
  {
    id: 'generic',
    test: () => true,
    summary: 'Tác vụ nội bộ của tiện ích thất bại.',
    steps: [
      'Thử lại một lần; nếu liên quan API, chờ một lát rồi thử.',
      'Làm mới trang rồi thực hiện lại cùng thao tác.',
      EXPORT_LOGS,
    ],
  },
];

/**
 * 为一条日志匹配处理建议。只对 error 级日志给建议；warn / debug 返回 null。
 */
export function resolveLogErrorHint(entry: Pick<LogEntry, 'level' | 'tag' | 'message'>): LogErrorHint | null {
  if (entry.level !== 'error') return null;
  const haystack = `${entry.tag} ${entry.message}`.toLowerCase();
  for (const rule of RULES) {
    const matched = typeof rule.test === 'function' ? rule.test(haystack) : rule.test.test(haystack);
    if (matched) return { id: rule.id, summary: rule.summary, steps: rule.steps };
  }
  return null;
}

/** 供测试与调试使用：规则 ID 列表（按匹配优先级排序）。 */
export const LOG_ERROR_HINT_RULE_IDS: readonly string[] = RULES.map(rule => rule.id);
