export const vectorIndexCopy = {
  nav: {
    status: "Trạng thái chỉ mục",
    keyword: "Từ khóa",
    api: "Dịch vụ vector",
    prompt: "Prompt",
    recall: "Tham số truy hồi",
    archive: "Lưu trữ và chia khối",
  },
  panels: {
    status: {
      title: "Trạng thái chỉ mục",
      description: "Hiển thị thông tin chỉ mục hiện tại. Xóa bộ nhớ đệm chỉ xóa dữ liệu tạm; xóa chỉ mục thì phải dựng lại.",
    },
    keyword: {
      title: "Tạo từ khóa",
      description: "Trước khi gửi, dùng AI nhẹ để tạo từ khóa hỗ trợ truy hồi. Nếu thất bại sẽ lùi về cách cũ, không ảnh hưởng việc gửi.",
    },
    api: {
      title: "Embedding / Rerank",
      description:
        "Cấu hình vector dùng chung cho bảng vector và chế độ giao hỏa. Embedding phụ trách truy hồi vector; Rerank là tùy chọn tăng cường trong chế độ giao hỏa, và bắt buộc trong bảng vector.",
    },
    prompt: {
      title: "Prompt tạo từ khóa",
      description: "Điều khiển cách AI hiểu từ khóa. Nên giữ mặc định.",
    },
    recall: {
      title: "Tham số truy hồi",
      description:
        "Điều khiển điều kiện bật truy hồi kỷ yếu, số mục chèn mỗi lần và số mục chèn cố định. Cấu hình sai (như giới hạn ứng viên < TopK) sẽ được tự sửa; nên giữ \"ngưỡng kích hoạt ≥ số mục cố định gần nhất + TopK\" để tránh làm việc vô ích.",
    },
    archive: {
      title: "Lưu trữ và chia khối",
      description:
        "Sau khi lưu kỷ yếu sẽ tự tách câu và tải lên theo lô. Giá trị càng nhỏ thì truy hồi càng tinh, số mảnh càng nhiều. Giới hạn đồng thời thấp sẽ làm việc lưu trữ chậm hơn.",
    },
  },
};
