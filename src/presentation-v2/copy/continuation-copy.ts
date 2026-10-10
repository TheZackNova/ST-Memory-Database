export const continuationCopy = {
  panels: {
    conditions: {
      title: "Điều kiện lặp",
      description: "Điều khiển điều kiện viết tiếp và thời gian viết tiếp.",
    },
    prompts: {
      title: "Prompt lặp",
      description:
        "Tự động gửi lần lượt theo thứ tự, hết hàng đợi sẽ lặp lại từ đầu. Nếu rỗng sẽ không khởi động được, hãy đảm bảo có ít nhất một nội dung có thể gửi.",
    },
    controls: {
      title: "Điều khiển chạy",
      description:
        "Sau khi khởi động sẽ tự điền prompt tiếp theo và gửi, tiếp tục sau mỗi lần AI trả lời. Dừng chỉ chặn các lần sau, không ảnh hưởng nội dung đã gửi.",
    },
  },
  workflow: {
    title: "Quy trình cố định",
    description: "Phiên chính mỗi vòng chỉ ra quyết định mở đầu. Việc quyết toán, lập kế hoạch, thẩm định điều kiện, commit chịu lỗi và chỉ thị viết do chương trình thực hiện theo thứ tự cố định. Ở đây chỉ sửa cấu hình, prompt vẫn được sửa trong các nhóm vai trò bên dưới.",
  },
  composer: {
    title: "Prompt của agent phụ biên soạn chỉ thị viết (instruction-composer)",
    note: "Quy trình cố định gọi sau khi lập kế hoạch và thẩm định, là vai trò duy nhất tạo ra chỉ thị viết cho vòng này. Không nằm trong danh mục có thể điều phối của Agent chính. JSON hợp đồng là {instruction, summary, constraints}.",
  },
};
