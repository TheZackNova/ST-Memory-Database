import type { StorageMode } from "../../shared/table-storage-provider";

export const dashboardCopy = {
  pageTitle: "Bảng điều khiển",
  panels: {
    healthTitle: "Tổng quan hoạt động",
    healthDescription:
      "Hiển thị trạng thái của cuộc trò chuyện hiện tại và các chức năng đã bật. Chỉ những mục được đánh dấu \"Cần xử lý\" mới ảnh hưởng đến việc sử dụng; mục chưa bật hoặc đang chờ chuẩn bị thường không cần thao tác.",
    togglesTitle: "Công tắc",
    togglesDescription:
      "Cài đặt cơ bản: các chức năng có thể bật/tắt bất cứ lúc nào trong cuộc trò chuyện hiện tại. Cài đặt nâng cao: thay đổi có thể ảnh hưởng đến hoạt động của cơ sở dữ liệu, hãy sửa cẩn thận.",
  },
  groups: {
    ariaLabel: "Chuyển nhóm công tắc",
    basic: "Cài đặt cơ bản",
    advanced: "Cài đặt nâng cao",
  },
  developerToggle: {
    label: "Bật tùy chọn nhà phát triển",
    description: "Mặc định tắt. Hiển thị trang nhà phát triển, không khuyến khích người dùng chưa có kinh nghiệm bật.",
  },
  storage: {
    sectionLabel: "Chế độ lưu trữ",
    description:
      "Chọn cách lưu dữ liệu bảng. Chuyển đổi sẽ đặt lại prompt điền bảng. Khi điền bảng bất thường, có thể chuyển về chế độ cũ để kiểm tra.",
    modeLabel(mode: StorageMode): string {
      return mode === "sqlite" ? "SQLite" : "JSON gốc";
    },
    optionDescription: {
      native: "Tương thích cao, phù hợp bảng cơ bản.",
      sqlite: "Độ chính xác cao, phù hợp bảng phức tạp và liên kết nhiều bảng.",
    },
    switchLabel(mode: StorageMode): string {
      return mode === "sqlite" ? "SQL" : "Gốc";
    },
    badge(mode: StorageMode): string {
      return mode === "native" ? "Tương thích tốt nhất" : "Hợp bảng phức tạp";
    },
    switched(mode: StorageMode): string {
      return `Đã chuyển sang chế độ ${dashboardCopy.storage.modeLabel(mode)}.`;
    },
    switchFailed: "Chuyển chế độ lưu trữ thất bại.",
  },
  api: {
    title: "API",
    action: "Cấu hình API",
    unavailableBadge: "Không khả dụng",
    unavailableSummary: "Plugin chưa lấy được giao diện chạy phía SillyTavern, không thể xác nhận trạng thái API hiện tại.",
    unconfiguredBadge: "Chưa cấu hình",
    configuredBadge: "Đã cấu hình",
    tavernPresetLabel(name: string): string {
      return `Preset kết nối SillyTavern ${name}`;
    },
    tavernPresetMissingLabel: "Preset kết nối SillyTavern",
    tavernPresetMissingIssue: "Chưa chọn preset kết nối SillyTavern",
    mainApiLabel: "API chính của SillyTavern",
    customApiLabel: "API tùy chỉnh",
    endpointField: "Endpoint",
    modelField: "Mô hình",
    missingIssue(fields: string): string {
      return `Thiếu ${fields}`;
    },
    namedPresetNotReady(name: string, issue: string): string {
      return `Preset hiện tại "${name}" ở trang API chưa thể gửi yêu cầu: ${issue}.`;
    },
    noUsablePreset(issue: string): string {
      return `Trang API hiện không có preset khả dụng, cấu hình kết nối hiện tại cũng chưa đầy đủ: ${issue}.`;
    },
    namedPresetReady(name: string, statusLabel: string): string {
      return `Preset hiện tại "${name}" ở trang API đã được cấu hình, dùng ${statusLabel}.`;
    },
    configReadyWithoutPreset(statusLabel: string): string {
      return `Cấu hình kết nối hiện tại đã được thiết lập, dùng ${statusLabel}, nhưng chưa chọn preset API.`;
    },
  },
  tableHealth: {
    title: "Cập nhật bảng",
    noChatBadge: "Chưa nạp cuộc trò chuyện",
    noChatSummary:
      "Hiện chưa nạp cuộc trò chuyện SillyTavern nào, tạm thời không thể đọc bảng cơ sở dữ liệu tương ứng hay tính tầng cập nhật tự động.",
    notLoadedBadge: "Chờ chuẩn bị",
    notLoadedSummary(totalAi: number): string {
      return `Cuộc trò chuyện hiện tại chưa nạp bảng cơ sở dữ liệu. Sau lần điền bảng đầu tiên hoặc khi khởi tạo, trạng thái cập nhật sẽ tự hiển thị ở đây; hiện đã có ${totalAi} phản hồi AI.`;
    },
    updateSettingsAction: "Xem bàn làm việc điền bảng",
    statusAction: "Xem trạng thái bảng",
    overdueBadge: "Chờ cập nhật",
    dueRowsDetail(count: number): string {
      return `${count} bảng đã đến điểm kích hoạt nhưng tầng cập nhật cuối chưa tiến lên`;
    },
    initialDueRowsDetail(count: number): string {
      return `${count} bảng đủ điều kiện cập nhật lần đầu nhưng chưa từng ghi nhận cập nhật`;
    },
    maxOverdueDetail(count: number): string {
      return `Tồn đọng tối đa ${count} tầng`;
    },
    overdueSummary(issueCount: number, detail: string): string {
      return detail
        ? `${issueCount} bảng đã đủ điều kiện cập nhật tự động, sẽ tiếp tục được xử lý trong lần điền bảng hoặc kiểm tra thủ công sau: ${detail}.`
        : `${issueCount} bảng đã đủ điều kiện cập nhật tự động, sẽ tiếp tục được xử lý trong lần điền bảng hoặc kiểm tra thủ công sau.`;
    },
    okBadge: "Bình thường",
    okSummary(
      activeCount: number,
      totalAi: number,
      disabledCount: number,
    ): string {
      return activeCount
        ? `Hiện ${activeCount} bảng cập nhật tự động không bị tồn đọng; đã có ${totalAi} phản hồi AI${disabledCount ? `, ngoài ra có ${disabledCount} bảng không tham gia cập nhật tự động` : ""}.`
        : `Hiện không có bảng nào tham gia cập nhật tự động; đã có ${totalAi} phản hồi AI.`;
    },
  },
  sqlHealth: {
    title: "Chế độ SQL",
    action: "Xem mẫu bảng",
    tableNameSamples(visibleNames: string, totalCount: number): string {
      return totalCount > 3
        ? `${visibleNames} và ${totalCount} bảng`
        : visibleNames;
    },
    noChatBadge: "Chưa nạp cuộc trò chuyện",
    noChatSummary(sqlEnabled: boolean): string {
      return sqlEnabled
        ? "Hiện chưa nạp cuộc trò chuyện SillyTavern nào, tạm thời không thể kiểm tra mẫu bảng của cuộc trò chuyện hiện tại có phù hợp hay không."
        : "Hiện chưa nạp cuộc trò chuyện SillyTavern nào, tạm thời không thể kiểm tra mẫu bảng của cuộc trò chuyện hiện tại có phù hợp hay không.";
    },
    pendingBadge: "Chờ kiểm tra",
    disabledBadge: "Chưa bật",
    noTemplatesSummary(sqlEnabled: boolean): string {
      return sqlEnabled
        ? "Chế độ lưu trữ hiện tại là SQLite, chưa nạp mẫu bảng. Trước lần điền bảng đầu tiên, hãy xác nhận mẫu đã được bổ sung thông tin cấu trúc bảng SQL."
        : "Chế độ lưu trữ hiện tại là JSON gốc, chưa nạp mẫu bảng. Khi tiếp tục dùng JSON gốc thì không cần xử lý thông tin mẫu SQL.";
    },
    looksSqlBadge: "Gợi ý cho nhà phát triển",
    looksSqlSummary(ddlCount: number, total: number): string {
      return `Chế độ lưu trữ hiện tại là JSON gốc, kiểm tra của nhà phát triển phát hiện ${ddlCount}/${total} bảng chứa thông tin cấu trúc SQL. Nếu muốn dùng SQLite, hãy chọn \"SQLite\" trong cài đặt nâng cao; khi tiếp tục dùng JSON gốc thường không cần xử lý.`;
    },
    nativeModeBadge: "JSON gốc",
    nativeModeSummary(total: number): string {
      return `Chế độ lưu trữ hiện tại là JSON gốc, đã nạp ${total} bảng. Thông tin SQL trong mẫu không ảnh hưởng đến việc chạy chế độ JSON gốc; khi cần chuyển sang SQLite hãy kiểm tra mẫu.`;
    },
    nativeMatchBadge: "Mẫu phù hợp",
    nativeMatchSummary(total: number): string {
      return `Chế độ lưu trữ hiện tại là JSON gốc, ${total} bảng hiện tại cũng đều là mẫu bảng thông thường, chế độ và mẫu phù hợp nhau.`;
    },
    missingDdlBadge: "Mẫu chưa phù hợp",
    missingDdlSummary(count: number, total: number, names: string): string {
      return `Chế độ lưu trữ hiện tại là SQLite, nhưng ${count}/${total} bảng chưa phải mẫu SQL đầy đủ: ${names}. Các bảng này có thể không lưu đúng vào SQLite, hãy vào \"Mẫu bảng\" bổ sung thông tin cấu trúc bảng SQL, hoặc chuyển về JSON gốc.`;
    },
    invalidDdlBadge: "Mẫu không phù hợp",
    invalidDdlSummary(count: number, total: number, names: string): string {
      return `Chế độ lưu trữ hiện tại là SQLite, nhưng thông tin cấu trúc bảng SQL của ${count}/${total} bảng không khớp với tiêu đề bảng: ${names}. Điều này có thể khiến ghi dữ liệu thất bại, hãy chỉnh lại mẫu trước.`;
    },
    templateMatchBadge: "Mẫu phù hợp",
    templateMatchSummary(total: number): string {
      return `Chế độ lưu trữ hiện tại là SQLite, ${total} bảng hiện tại đều là mẫu bảng phù hợp với SQL, cấu trúc bảng cũng khớp với tiêu đề bảng.`;
    },
  },
  vectorHealth: {
    title: "Vector giao hỏa",
    configureAction: "Đến chế độ điền bảng",
    disabledBadge: "Chưa bật",
    disabledSummary: "Chế độ điền bảng hiện tại không dùng truy hồi vector, không cần cấu hình dịch vụ vector.",
    incompleteBadge: "Cấu hình chưa đầy đủ",
    incompleteSummary(errors: string[]): string {
      return errors.length
        ? `Chế độ điền bảng hiện tại cần dịch vụ vector, nhưng nó chưa thể dùng bình thường: ${errors.join("; ")}.`
        : "Chế độ điền bảng hiện tại cần dịch vụ vector, nhưng nó chưa thể dùng bình thường.";
    },
    configuredBadge: "Đã cấu hình",
    configuredSummary:
      "Chế độ điền bảng hiện tại dùng truy hồi vector, dịch vụ vector hóa bắt buộc đã được cấu hình đầy đủ.",
    readFailedBadge: "Đọc thất bại",
    readFailedSummary(message: string): string {
      return `Đọc cấu hình vector giao hỏa thất bại: ${message}.`;
    },
    readFailedFallback: "Hãy vào bàn làm việc điền bảng để kiểm tra lại cấu hình dịch vụ vector",
    missingEmbeddingEndpoint: "Thiếu \"URL vector hóa\"",
    missingEmbeddingModel: "Thiếu \"Tên mô hình vector hóa\"",
    rerankPairRequired: "\"URL rerank\" và \"Tên mô hình rerank\" cần điền cùng lúc, hoặc cùng để trống",
  },
  logs: {
    title: "Nhật ký chạy",
    action: "Xem nhật ký chạy",
    noErrorBadge: "Không có lỗi",
    noErrorSummary(warnCount: number, showDeveloperDiagnostics = false): string {
      return showDeveloperDiagnostics && warnCount
        ? `Phiên giao diện lần này không ghi nhận nhật ký cấp Error; ở chế độ nhà phát triển có thể thấy ${warnCount} dòng Warn.`
        : "Phiên giao diện lần này không ghi nhận nhật ký cấp Error.";
    },
    errorBadge(errorCount: number): string {
      return `${errorCount} lỗi`;
    },
    errorSummary(
      reason: string,
      errorCount: number,
      warnCount: number,
      tag: string,
    ): string {
      return `${reason} Phiên giao diện lần này tích lũy ${errorCount} dòng Error, ${warnCount} dòng Warn, dòng gần nhất đến từ ${tag}.`;
    },
    apiIssue: "Nhật ký gần đây chỉ ra vấn đề về cấu hình hoặc kết nối API, yêu cầu điền bảng có thể chưa được gửi thành công.",
    outputFormatIssue:
      "Nhật ký gần đây chỉ ra vấn đề định dạng đầu ra của điền bảng, nội dung mô hình trả về có thể chưa được nhận là chỉnh sửa bảng hợp lệ.",
    commandParseIssue: "Nhật ký gần đây chỉ ra vấn đề phân tích lệnh điền bảng, một số chỉnh sửa có thể chưa được áp dụng.",
    sqlIssue:
      "Nhật ký gần đây chỉ ra vấn đề về SQL hoặc cấu trúc bảng, hãy kiểm tra mẫu bảng, tên cột và prompt điền bảng SQL.",
    saveIssue: "Nhật ký gần đây chỉ ra lỗi lưu, bảng có thể đã tạo thay đổi nhưng chưa ghi lại vào lịch sử trò chuyện.",
    genericError: "Nhật ký chạy có lỗi, hãy vào công cụ nâng cao để xem chi tiết.",
    genericWarning: "Nhật ký chạy có cảnh báo, hãy vào công cụ nâng cao để xác nhận có cần xử lý hay không.",
  },
  tableStatus: {
    none: "Không có",
    notInitialized: "Chưa khởi tạo",
    pendingInitial: "Chờ khởi tạo",
  },
  toggles: {
    autoUpdate: {
      label: "Cập nhật tự động",
      description:
        "Mặc định bật. Sau khi tắt cần cập nhật bảng thủ công. Chỉ nên tắt khi thử nghiệm hoặc chơi tự do.",
    },
    silentMode: {
      label: "Chế độ im lặng",
      description:
        "Mặc định tắt. Khi bật sẽ không hiện bất kỳ bong bóng thông báo nào (kể cả lỗi và tiến độ), hộp xác nhận và hộp nhập vẫn hiện như thường; lỗi vẫn được ghi vào nhật ký.",
    },
    desktopPet: {
      label: "Thú cưng màn hình",
      description:
        "Mặc định bật. Thú cưng màn hình sẽ chảy nước miếng khi làm việc, thông báo hiện thành bong bóng bên cạnh nó và có thể kéo để đặt chỗ; khi tắt, bong bóng trở về góc trên bên phải.",
    },
    deskPetJokes: {
      label: "Chèn truyện cười nhạt",
      description:
        "Mặc định bật. Khi thú cưng màn hình rảnh hoặc giữa các lượt thông báo luân phiên sẽ chèn truyện cười nhạt; khi tắt sẽ không còn xuất hiện.",
    },
    deskPetRealWork: {
      label: "Hiển thị nội dung công việc thật",
      description:
        "Mặc định tắt. Khi bật, bong bóng hiển thị trực tiếp thông báo và tiến độ tác vụ hiện tại, không còn dùng từ trạng thái \"Đang XXXX…\"; có hiệu lực cả khi tắt thú cưng màn hình, nội dung giống phần chi tiết trước đây phải bấm để mở rộng.",
    },
    zeroTk: {
      label: "Chế độ chiếm 0TK",
      description: "Mặc định bật. Khi bật, tổng quan kỷ yếu không chiếm ngữ cảnh.",
    },
    streaming: {
      label: "Bật xuất streaming",
      description:
        "Khi bật, việc tạo văn bản hỗ trợ streaming sẽ trả về dần khi đang tạo; khi tắt sẽ chờ kết quả đầy đủ rồi mới trả về.",
    },
    continuation: {
      label: "Viết tiếp thông minh",
      description: "Chức năng thủ công. Thay bạn tự động gửi prompt, AI viết tiếp liên tục dựa theo nội dung.",
    },
    worldSimulation: {
      label: "Mô phỏng thế giới",
      description: "Kiểm toán sổ cái suy diễn, kế hoạch giai đoạn và bằng chứng, rồi sau khi xác nhận sẽ ghi các tín hiệu ngoài cảnh có thể cảm nhận được vào nội dung chính.",
    },
    externalImport: {
      label: "Nhập từ bên ngoài",
      description:
        "Chức năng thủ công. Nhanh chóng chuyển tiểu thuyết TXT thành các mục sổ thế giới chưa tinh chỉnh, tiện cho việc làm thẻ nhân vật.",
    },
    contentReplace: {
      label: "Thay thế nội dung chính",
      description:
        "Mặc định tắt. Khi bật, sau mỗi lượt tạo nội dung chính sẽ tự động kiểm tra và tối ưu nội dung phản hồi của AI.",
    },
  },
  templatePreset: {
    defaultName: "Preset mặc định",
    globalScope: "Toàn cục",
    readFailed: "Đọc thất bại",
  },
};
