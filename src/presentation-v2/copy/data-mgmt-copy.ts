export const dataMgmtCopy = {
  panels: {
    isolation: {
      title: "Cách ly dữ liệu (đã ngừng dùng)",
      description:
        "Cách ly theo nhãn đã bị vô hiệu hóa. Để trống nghĩa là dùng ô dữ liệu mặc định (chuỗi rỗng vẫn là khóa ô hợp lệ). Đừng dựa vào mã cách ly cho tính năng mới, cũng đừng dùng định danh rỗng để biểu thị \"không có dữ liệu\". Các mã định danh cũ chỉ được đọc để tương thích.",
    },
    backup: {
      title: "Sao lưu và khôi phục",
      description:
        "Điều khiển việc nhập/xuất bản sao lưu cấu hình hiện tại. Nhập gộp sẽ ghi đè prompt và mẫu, không trực tiếp sửa các tầng đã có. Ghi đè mẫu sẽ dùng mẫu đang có hiệu lực của cuộc trò chuyện hiện tại để ghi lại tầng AI mới nhất. Xuất đặc biệt: xuất mẫu bảng kèm dữ liệu điền bảng của cuộc trò chuyện, không phải dữ liệu bảng thuần, có thể nhập ở mô-đun \"Mẫu bảng\". Checkpoint dùng để sao lưu và khôi phục đầy đủ bảng, mẫu và bảng hướng dẫn của định danh hiện tại trong cuộc trò chuyện hiện tại. Dữ liệu bảng được chia sẻ theo tầng AI: mọi nhánh swipe của cùng một tầng dùng chung một lịch sử bảng, chuyển swipe không làm đổi trạng thái bảng. Lưu ý: nếu không khôi phục mẫu mặc định hoặc chuyển sang mẫu bảng không có dữ liệu, khi sang cuộc trò chuyện khác có thể bị lẫn dữ liệu.",
      sqliteRuntime: {
        title: "Chẩn đoán runtime SQLite",
        description:
          "Chỉ hiển thị ảnh chụp tình trạng đã ẩn thông tin nhạy cảm của runtime trong bộ nhớ của cuộc trò chuyện hiện tại. Khởi tạo lại chỉ dựng lại cơ sở dữ liệu trong bộ nhớ, không sửa cuộc trò chuyện, Checkpoint, mẫu hay sổ thế giới.",
        reloadLabel: "Khởi tạo lại runtime SQLite của cuộc trò chuyện hiện tại",
        reloadSuccess: "Đã khởi tạo lại runtime SQLite trong bộ nhớ của cuộc trò chuyện hiện tại.",
        reloadDegraded: "Sau khi khởi tạo lại, runtime SQLite trong bộ nhớ đã hạ cấp về native; hãy xem ảnh chụp trạng thái đã ẩn thông tin.",
        reloadFailed: "Khởi tạo lại runtime SQLite trong bộ nhớ thất bại; hãy xem ảnh chụp trạng thái đã ẩn thông tin.",
        healthSnapshot: {
          status: "Trạng thái",
          expectedMode: "Chế độ mong đợi",
          activeMode: "Chế độ thực tế",
          source: "Nguồn tải",
          loadToken: "Số thứ tự tải",
          failureCode: "Mã lỗi",
          unavailable: "Không có",
        },
      },
    },
    cleanup: {
      title: "Xóa và dọn dẹp",
      description:
        "Dùng để dọn dữ liệu cục bộ của plugin trong các tầng của cuộc trò chuyện hiện tại, hoặc khôi phục mẫu cơ sở dữ liệu, prompt và bộ nhớ đệm snapshot của cuộc trò chuyện hiện tại về mặc định; không ảnh hưởng đến nội dung chính của cuộc trò chuyện. Chính sách giữ lại tự động chỉ dọn các tầng cũ sau khi cập nhật tự động kết thúc; nút xóa dữ liệu cục bộ sẽ xóa ngay theo phạm vi tầng AI.",
    },
  },
};
