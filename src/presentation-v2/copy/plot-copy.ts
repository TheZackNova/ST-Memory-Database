export const plotCopy = {
  pageTitle: "Đẩy cốt truyện",
  unsupported: (modeLabel: string) => `Chế độ điền bảng hiện tại là「${modeLabel}」, không hỗ trợ và cũng không cần đẩy cốt truyện.`,
  nav: { settings: "Đẩy cốt truyện", preset: "Preset đẩy cốt truyện", worldbook: "Sổ thế giới đẩy cốt truyện" },
  controls: {
    title: "Đẩy cốt truyện",
    description: "Chế độ truy hồi logic bằng mô hình LLM và chế độ giao hỏa dựa vào đẩy cốt truyện để phân tích trí nhớ trước khi tạo nội dung chính. Khi tắt vẫn giữ truy hồi bảng, nhưng không lập kế hoạch cốt truyện nữa.",
    enableLabel: "Bật đẩy cốt truyện",
    enableHint: "Khi tắt sẽ không gọi thêm LLM trước khi tạo nội dung chính; các hành vi truy hồi khác của chế độ hiện tại không đổi.",
    disguiseDisabledLabel: "Bỏ ngụy trang khi gửi",
    disguiseDisabledHint: "Mặc định tắt. Khi bật, văn bản gốc ở lại trong ô nhập chờ AI cốt truyện trả về, không hiển thị tầng tạm hay giao diện đang tạo; sau khi thành công sẽ ghi vào prompt cuối cùng và SillyTavern tiếp tục lần gửi này.",
  },
  panels: {
    preset: {
      title: "Preset đẩy cốt truyện",
      description:
        "Danh sách thả xuống chuyển preset hiện tại, dấu sao đặt làm mặc định toàn cục. Bấm nút để nhập preset mới hoặc quản lý tất cả preset. Preset mặc định tích hợp không thể sửa, hãy dùng \"Tạo mới từ mặc định\". Preset gồm nhiều tác vụ độc lập, hỗ trợ chạy đồng thời hoặc tuần tự.",
    },
    worldbook: {
      title: "Sổ thế giới đẩy cốt truyện",
      description:
        "Các mục sổ thế giới mà đẩy cốt truyện tham khảo. Mặc định theo sổ thế giới chính của thẻ nhân vật, cũng có thể chỉ định thủ công. Chế độ Agent sẽ lọc các mục sổ thế giới trong mẫu prompt khi chạy, do Agent quyết định mục nào được cho qua ở các kênh cốt truyện, điền bảng và nội dung chính.",
    },
  },
  worldbook: {
    emptyDefault: "Sổ thế giới đã chọn không có mục nào để hiển thị.",
    emptyCharacter:
      "Chưa xác định được sổ thế giới của thẻ nhân vật. Các mục sẽ hiện sau khi mở cuộc trò chuyện; bạn cũng có thể chọn thủ công một sổ.",
    emptyManual: "Hãy chọn một sổ thế giới trước.",
  },
  agentControl: {
    title: "Điều khiển tổng sổ thế giới của Agent",
    description: "Chuyển chế độ sổ thế giới của Agent; chế độ Agent sẽ tiếp quản việc cho qua và lọc các mục sổ thế giới khi đẩy cốt truyện, dọn dẹp và khởi tạo sẽ khôi phục snapshot và tắt chế độ Agent.",
    modes: { disabled: "Tắt", passive: "Chỉ quan sát", agent: "Agent tiếp quản" },
    modeChanged: {
      disabled: "Chế độ sổ thế giới của Agent đã tắt.",
      passive: "Sổ thế giới của Agent đã chuyển sang chế độ chỉ quan sát.",
      agent: "Sổ thế giới của Agent đã chuyển sang chế độ tiếp quản.",
    },
    status: {
      inactive: "Lọc khi chạy chưa bật",
      active: () => "Lọc khi chạy đã bật",
    },
    config: {
      status: (state: { source: string; bookName?: string; writableBookName?: string; reason?: string }) => {
        if (state.source === "worldbook" && state.bookName) return `Cấu hình được lưu trong sổ thế giới: ${state.bookName}`;
        if (state.source === "legacy_settings") {
          return state.writableBookName
            ? `Đang dùng cấu hình toàn cục cũ; lần lưu tiếp theo sẽ ghi vào sổ thế giới: ${state.writableBookName}`
            : "Đang dùng cấu hình toàn cục cũ; hiện không tìm thấy sổ thế giới có thể ghi, không thể lưu thành cấu hình cấp thẻ.";
        }
        if (state.writableBookName) return `Đang dùng cấu hình mặc định; sau khi lưu sẽ ghi vào sổ thế giới: ${state.writableBookName}`;
        return "Đang dùng cấu hình mặc định; không tìm thấy sổ thế giới có thể ghi, không thể lưu cấu hình Agent cấp thẻ.";
      },
      saveFailed: (reason: string) => reason === "no_config_host_book"
        ? "Không tìm thấy sổ thế giới có thể ghi, cấu hình Agent cấp thẻ chưa được lưu."
        : `Lưu cấu hình Agent cấp thẻ thất bại: ${reason || "Lý do không rõ"}`,
    },
    apiPresets: {
      decisionLabel: "API quyết định của Agent",
      decisionHint: "Dùng để Agent xác định có nên bật mục sổ thế giới hay không; để trống sẽ dùng cấu hình API hiện tại.",
      skillLabel: "API Skill hóa của Agent",
      skillHint: "Dùng để tạo nhanh metadata Skill cho sổ thế giới; để trống sẽ dùng cấu hình API hiện tại.",
      followCurrentLabel: "Dùng cấu hình API hiện tại",
    },
    restore: {
      button: "Dọn dẹp và khởi tạo",
      confirm: {
        title: "Dọn dẹp và khởi tạo trạng thái sổ thế giới của Agent",
        message: "Trước tiên sẽ khôi phục theo snapshot trạng thái các mục sổ thế giới bị Agent ghi đè, tắt chế độ Agent, rồi xóa các mục nội bộ snapshot/cài đặt của Agent. Lần dùng sau sẽ được khởi tạo lại.",
        confirmLabel: "Xác nhận dọn dẹp và khởi tạo",
        cancelLabel: "Hủy",
      },
      success: () => "Đã dọn dẹp và khởi tạo trạng thái sổ thế giới của Agent; chế độ Agent đã tắt, lần dùng sau sẽ được khởi tạo lại.",
      noop: "Không có snapshot hay trạng thái nội bộ nào của Agent cần khôi phục; chế độ Agent đã tắt.",
      error: "Dọn dẹp và khởi tạo trạng thái sổ thế giới của Agent thất bại",
      reasons: {
        runtime_filter_only: "Hiện dùng cơ chế lọc khi chạy, không có trạng thái mục sổ thế giới nào cần khôi phục; chế độ Agent đã tắt.",
        legacy_artifacts_cleaned: "Đã dọn các mục nội bộ của Agent và trạng thái còn sót từ phiên bản cũ; chế độ Agent đã tắt.",
        native_worldbook_trigger_restored: "Đã khôi phục theo snapshot trạng thái các mục sổ thế giới bị Agent ghi đè, và đã tắt chế độ Agent.",
        native_worldbook_trigger_restore_failed: "Một số mục sổ thế giới khôi phục thất bại, đã giữ snapshot của Agent để tránh mất vĩnh viễn; chế độ Agent đã tắt.",
        native_worldbook_trigger_restore_skipped: "Một số mục sổ thế giới bị xung đột, đã giữ snapshot của Agent để tránh mất vĩnh viễn; chế độ Agent đã tắt.",
        no_active_snapshot: "Không có snapshot Agent nào để khôi phục; chế độ Agent đã tắt.",
      } as Record<string, string>,
    },
    skillify: {
      button: "Skill hóa nhanh",
      confirm: {
        title: "Tạo nhanh metadata Skill",
        message: "Sẽ gọi API Skill của Agent đã cấu hình để tạo mô tả và thời điểm kích hoạt cho các mục có thể xử lý trong phạm vi sổ thế giới hiện tại. Các mục đã có metadata Skill sẽ tự động bị bỏ qua, bất kể dữ liệu đó do AI tạo hay do người dùng sửa tay.",
        confirmLabel: "Bắt đầu tạo",
        cancelLabel: "Hủy",
      },
      success: (updated: number, skipped: number) => `Skill hóa hoàn tất: cập nhật ${updated} mục, bỏ qua ${skipped} mục.`,
      partial: (updated: number, skipped: number, failed: number) => `Skill hóa hoàn tất một phần: cập nhật ${updated} mục, bỏ qua ${skipped} mục, thất bại ${failed} mục.`,
      noSelection: "Hãy chọn trước các mục sổ thế giới cần Skill hóa.",
      noCandidates: "Phạm vi hiện tại không có mục sổ thế giới nào có thể Skill hóa.",
      error: "Skill hóa nhanh thất bại",
    },
    clearSkillMeta: {
      button: "Xóa Skill hóa",
      confirm: {
        title: "Xóa metadata Skill của sổ thế giới",
        message: "Sẽ xóa khối metadata Skill của các mục trong phạm vi sổ thế giới Agent hiện tại. Thao tác này không khôi phục trạng thái tiếp quản, cũng không xóa nội dung chính của mục sổ thế giới hay mục cấu hình Agent.",
        confirmLabel: "Xác nhận xóa",
        cancelLabel: "Hủy",
      },
      success: (cleared: number) => `Đã xóa metadata Skill của ${cleared} mục sổ thế giới.`,
      partial: (cleared: number, skipped: number, failed: number) => `Xóa metadata Skill hoàn tất một phần: đã xóa ${cleared} mục, bỏ qua ${skipped} mục, thất bại ${failed} mục.`,
      noop: "Phạm vi sổ thế giới Agent hiện tại không có metadata Skill nào để xóa.",
      error: "Xóa metadata Skill thất bại",
    },
    advanced: {
      button: "Cài đặt nâng cao của Agent",
      title: "Cài đặt nâng cao sổ thế giới của Agent",
      description: "Sửa mẫu prompt quyết định và Skill hóa của Agent, đồng thời điều khiển số tầng ngữ cảnh, giới hạn số ứng viên và mức đồng thời gọi độc lập của từng loại.",
    },
    decisionSettings: {
      title: "Tham số thực thi quyết định của Agent",
      description: "Chia các mục đang tiếp quản thành mảnh rồi phân tích đồng thời. Số yêu cầu và số lần thử lại tối đa sẽ nhân lên theo mức đồng thời, đừng coi API như kho tính toán miễn phí.",
      concurrency: {
        label: "Mức đồng thời quyết định của Agent",
        hint: "Mặc định 1, trang không đặt giới hạn cố định; mức đồng thời thực tế không vượt quá số mục có thể phân tích. Các mục được phân tích đồng thời theo số mảnh không rỗng thực tế, ngân sách TK tối thiểu và tối đa của đèn xanh đều được chia chính xác và giao cho từng mảnh hỗ trợ chọn; sau khi gộp vẫn kiểm tra an toàn theo ngân sách tối đa đầy đủ.",
      },
    },
    skillifySettings: {
      title: "Tham số thực thi Skill hóa",
      description: "Điều khiển hành vi thực thi của Skill hóa nhanh. Mức đồng thời càng cao thì áp lực yêu cầu càng lớn; đừng coi API là hố đen có thông lượng vô hạn.",
      maxConcurrency: {
        label: "Mức đồng thời API Skill hóa",
        hint: "Số mục được Skill hóa nhanh gọi API Skill của Agent cùng lúc. Mặc định 3, trang không đặt giới hạn cố định; mức đồng thời thực tế không vượt quá số mục cần xử lý.",
      },
    },
    executionMode: {
      label: "Cách thực thi Agent và đẩy cốt truyện",
      hint: "Chế độ tuần tự giữ cho Agent tiếp quản các tác vụ cốt truyện và đèn xanh sổ thế giới cốt truyện; ở chế độ đồng thời, Agent không quyết định tác vụ cốt truyện nào có hiệu lực, tác vụ cốt truyện cũng đọc sổ thế giới theo kiểu không-Agent, chỉ giữ phán đoán đèn xanh cho nội dung chính.",
      options: {
        sequential: "Tiếp quản tuần tự",
        concurrent: "Song song bỏ qua",
      },
    },
    contextSettings: {
      title: "Tham số ngữ cảnh",
      description: "Các tham số này ảnh hưởng đến quyết định của Agent, Skill hóa sổ thế giới và quét sổ thế giới cốt truyện. Trang không đặt giới hạn cố định; số ứng viên, ngữ cảnh, số lần thử lại hoặc ngân sách quá lớn sẽ làm tăng tiêu hao API và có thể vượt quá khả năng của mô hình và dịch vụ.",
      resetButton: "Khôi phục tham số ngữ cảnh mặc định",
      resetSuccess: "Đã khôi phục tham số ngữ cảnh mặc định.",
      fields: {
        decisionRecentContextCharLimit: {
          label: "Số tầng ngữ cảnh gần nhất",
          hint: "Số tầng hội thoại gần nhất đưa vào prompt quyết định của Agent; 1 tầng = 1 phản hồi AI + 1 tin nhắn người dùng ngay phía trên. Bản ghi đẩy cốt truyện được lưu ở tầng người dùng, sẽ được truyền cùng ngữ cảnh tương ứng.",
        },
        decisionWorldbookCandidateLimit: {
          label: "Số ứng viên sổ thế giới cho quyết định",
          hint: "Số lượng tối đa mục sổ thế giới ứng viên đưa vào prompt quyết định của Agent. Ứng viên chỉ gồm tên mục, từ khóa, mô tả và thời điểm kích hoạt, không còn kèm bản xem trước nội dung chính.",
        },
        skillifyMaxEntries: {
          label: "Số mục Skill hóa tối đa",
          hint: "Số mục sổ thế giới tối đa được xử lý trong một lần Skill hóa nhanh.",
        },
        plotWorldbookScanMessageLimit: {
          label: "Số tin nhắn quét sổ thế giới cốt truyện",
          hint: "Số tin nhắn trò chuyện được xem lại khi đẩy cốt truyện đọc nội dung sổ thế giới; nếu chưa lưu rõ ràng cấu hình cũ thì vẫn lùi về contextTurnCount ban đầu.",
        },
        agentAiMaxRetries: {
          label: "Số lần thử tối đa của AI Agent",
          hint: "Số lần thử gọi AI chung cho quyết định của Agent và Skill hóa nhanh. Đặt quá cao sẽ làm tăng lượng yêu cầu, không làm prompt dở tự nhiên thông minh hơn.",
        },
        greenlightMinTkBudget: {
          label: "Ngân sách TK tối thiểu của đèn xanh",
          hint: "Mức sàn mục tiêu khi Agent chọn các mục đèn xanh. Khi quyết định đồng thời sẽ chia chính xác theo số mảnh không rỗng thực tế, để nhắc từng mảnh đừng chọn quá ít; sẽ không nhồi mục không liên quan chỉ để đủ mức sàn.",
        },
        greenlightMaxTkBudget: {
          label: "Ngân sách TK tối đa của đèn xanh",
          hint: "Giới hạn TK của các mục đèn xanh mà Agent có thể chọn cho mỗi kênh, mỗi tác vụ cốt truyện. Khi quyết định đồng thời sẽ chia chính xác theo số mảnh không rỗng thực tế và giao thẳng cho từng mảnh hỗ trợ chọn; sau khi gộp vẫn kiểm tra an toàn theo giới hạn đầy đủ.",
        },
      },
    },
    prompts: {
      title: "Mẫu prompt",
      description: "Có thể dùng placeholder {{agent.*}} và {{agent.skillify.*}}. Placeholder không xác định sẽ được giữ nguyên, viết sai thì mô hình không tự thông minh lên giúp bạn đâu.",
      scopeHint: "Chỉnh sửa chỉ thay đổi bản nháp lần này. Lưu vào sổ thế giới hiện tại chỉ cập nhật cấu hình hiện tại; lưu thành mẫu toàn cục chỉ cập nhật mẫu toàn cục, không ghi đè sổ thế giới hiện tại.",
      unsavedChanges: "Bản nháp prompt có thay đổi chưa lưu. Đóng sẽ bỏ các thay đổi này.",
      scopeChanged: "Cấu hình Agent bên dưới đã thay đổi, bản nháp hiện tại có thể thuộc vai trò hoặc sổ thế giới cũ. Để tránh ghi nhầm, nút lưu đã bị khóa; hãy đóng, bỏ bản nháp rồi mở lại.",
      loadingNotReady: "Cấu hình sổ thế giới của Agent vẫn đang tải, vui lòng chờ. Trước khi tải xong sẽ không nhận chỉnh sửa hay lưu.",
      loadFailed: "Đọc cấu hình sổ thế giới của Agent thất bại. Để tránh giá trị mặc định ghi đè cấu hình đã lưu, chỉnh sửa và lưu đã bị khóa.",
      retryLoad: "Đọc lại cấu hình",
      saveCurrent: "Lưu vào sổ thế giới hiện tại",
      saveCurrentSuccess: "Đã lưu vào sổ thế giới hiện tại.",
      saveAsGlobal: "Lưu thành mẫu toàn cục",
      saveAsGlobalSuccess: "Đã lưu vào mẫu toàn cục, sổ thế giới hiện tại không thay đổi.",
      decisionTitle: "Prompt quyết định của Agent",
      decisionReset: "Nạp prompt quyết định mặc định tích hợp",
      decisionResetSuccess: "Đã nạp prompt quyết định mặc định tích hợp; bấm lưu mới ghi vào phạm vi đã chọn.",
      skillifyTitle: "Prompt Skill hóa của Agent",
      skillifyReset: "Nạp prompt Skill hóa mặc định tích hợp",
      skillifyResetSuccess: "Đã nạp prompt Skill hóa mặc định tích hợp; bấm lưu mới ghi vào phạm vi đã chọn.",
      emptyText: "Chưa có đoạn prompt nào.",
    },
  },
};
