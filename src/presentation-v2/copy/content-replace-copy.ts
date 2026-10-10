export const contentReplaceCopy = {
  nav: {
    basic: "Cài đặt cơ bản",
    mode: "Chế độ thay thế",
    preset: "Preset",
    filter: "Lọc theo thẻ",
    test: "Kiểm thử thủ công",
  },
  panels: {
    basic: {
      title: "Cài đặt cơ bản",
      description: "Điều khiển dùng bộ API nào, cũng như giới hạn cho văn bản ngắn và thử lại khi thất bại.",
    },
    mode: {
      title: "Chế độ thay thế",
      description:
        "Chế độ không cảm nhận: cố gắng ghi kết quả đã tối ưu trực tiếp vào cuộc trò chuyện, tắt thì cần xác nhận thủ công. Khi kiểm tra thay thế nhầm, nên tắt chế độ không cảm nhận và tự động áp dụng, giữ lại bản đối chiếu.",
    },
    preset: {
      title: "Preset thay thế nội dung",
      description:
        "Danh sách thả xuống chuyển API chung hiện tại, dấu sao đặt làm mặc định toàn cục. Bấm nút để nhập preset mới hoặc quản lý tất cả preset. Preset mặc định tích hợp không thể sửa, hãy dùng \"Tạo mới từ mặc định\".",
    },
    filter: {
      title: "Lọc theo thẻ",
      description:
        "Trích nội dung theo thẻ để điền bảng chính xác hơn. Trích xuất chỉ giữ lại phạm vi chỉ định, loại trừ sẽ bỏ phạm vi chỉ định.",
    },
    test: {
      title: "Kiểm thử thủ công",
      description:
        "Dùng cấu hình hiện tại để kiểm thử văn bản, không ghi lại vào cuộc trò chuyện. Thất bại thường do API, định dạng prompt hoặc bộ lọc, hãy kiểm tra lỗi và điều chỉnh cấu hình.",
    },
  },
};
