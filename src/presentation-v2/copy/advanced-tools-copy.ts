export const advancedToolsCopy = {
  nav: {
    sql: "Bảng điều khiển SQL",
    logs: "Nhật ký chạy",
  },
  panels: {
    sql: {
      title: "Bảng điều khiển SQL",
      description:
        "Thực thi trực tiếp trên cơ sở dữ liệu SQLite runtime của cuộc trò chuyện hiện tại. Khi gặp lỗi, hãy xem khu vực kết quả trước, rồi kiểm tra tên bảng, tên cột và xem cuộc trò chuyện hiện tại đã nạp bảng hay chưa.",
    },
    logs: {
      title: "Nhật ký chạy",
      description:
        "Xem nhật ký chạy của cơ sở dữ liệu. Công tắc yêu cầu API thu thập riêng yêu cầu và phản hồi của từng kênh, mặc định tắt; Debug điều khiển quá trình gỡ lỗi và chẩn đoán tự động điền bảng, Warn điều khiển việc thu thập cảnh báo, lỗi luôn được ghi. Tắt thu thập không xóa nhật ký đã có, có thể dùng nút xóa để gỡ bỏ. Nhật ký API hiển thị tách dòng giữa cấu trúc và nội dung, bản ghi gọi bọc của host cho thấy tham số và giá trị trả về, không đại diện cho yêu cầu mạng cuối cùng. Thông tin xác thực được ẩn, nhưng nhật ký chứa đầy đủ prompt và phản hồi, hãy kiểm tra quyền riêng tư trước khi chia sẻ hoặc xuất. Bộ lọc chỉ ảnh hưởng đến hiển thị và xuất, khi thiếu dung lượng sẽ loại bỏ nguyên các mục cũ. Dưới mỗi lỗi có gợi ý xử lý có thể mở rộng.",
    },
  },
};
