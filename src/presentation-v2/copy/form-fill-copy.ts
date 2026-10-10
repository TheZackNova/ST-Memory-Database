export const formFillCopy = {
  nav: {
    status: "Trạng thái bảng",
    update: "Cập nhật tự động",
    manual: "Điền bảng thủ công",
    filter: "Lọc theo thẻ",
    prompt: "Prompt",
  },
  panels: {
    status: {
      title: "Trạng thái bảng",
      description:
        "Xem tiến độ cập nhật bảng. Khi cập nhật bị gián đoạn, có thể dựa vào \"Lần cập nhật trước\" để điều chỉnh \"Cài đặt cập nhật tự động\".",
    },
    update: {
      title: "Cài đặt cập nhật tự động",
      description: "Điều khiển các tham số của việc tự động điền bảng. Thông thường không cần chỉnh tay các tham số nâng cao.",
    },
    filter: {
      title: "Lọc theo thẻ",
      description:
        "Trích nội dung theo thẻ để điền bảng chính xác hơn. Trích xuất chỉ giữ lại phạm vi chỉ định, loại trừ sẽ bỏ phạm vi chỉ định.",
    },
    prompt: {
      title: "Prompt điền bảng",
      description:
        "Điều khiển cách AI hiểu và ghi vào bảng. Nên giữ mặc định hoặc nhập prompt điền bảng của người khác, không khuyến khích sửa tay.",
    },
    manual: {
      title: "Điền bảng thủ công",
      description:
        "Có thể điền lại bảng đã chọn theo ngữ cảnh chỉ định, hoặc theo mốc đã commit để bắt kịp các tầng phía sau chưa được điền. API điền bảng dùng cấu hình trong \"Cài đặt cập nhật tự động\".",
      runLabel: "Chạy điền bảng thủ công",
      catchUpLabel: "Bắt kịp các tầng chưa điền của bảng đã chọn",
      catchUpBusyLabel: "Đang bắt kịp...",
      catchUpBoundary:
        "Bắt kịp chỉ bù phần thiếu ở phía sau mốc liên tục đã commit của mỗi bảng, không quét các khoảng trống nội bộ nằm trước mốc lịch sử.",
      syncPending:
        "Dữ liệu bắt kịp đã được lưu, nhưng việc đồng bộ sổ thế giới đang chờ thử lại.",
      syncRetryLabel: "Chỉ thử đồng bộ lại",
    },
  },
};
