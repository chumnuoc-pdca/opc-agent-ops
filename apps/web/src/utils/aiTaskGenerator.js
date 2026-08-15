import { loadAiSettings } from './aiSettings';
import { streamChatCompletion } from './aiClient';

// Intelligent fallback sub-tasks generator when offline or API is unavailable
export function generateFallbackSubtasks(goalTitle, moduleTitle = '') {
  const isTraining = goalTitle.toLowerCase().includes('đào tạo') || goalTitle.toLowerCase().includes('khoá học') || goalTitle.toLowerCase().includes('workshop');
  const isLocationMentioned = goalTitle.toLowerCase().includes('ninh bình') || goalTitle.toLowerCase().includes('tỉnh') || goalTitle.toLowerCase().includes('địa phương');

  const today = new Date();
  const dateStr = (d) => d.toISOString().slice(0, 10);

  const d1 = new Date(today); d1.setDate(d1.getDate() + 1);
  const d2 = new Date(today); d2.setDate(d2.getDate() + 3);
  const d3 = new Date(today); d3.setDate(d3.getDate() + 5);
  const d4 = new Date(today); d4.setDate(d4.getDate() + 8);

  if (isTraining || isLocationMentioned) {
    return [
      {
        content: `Kế hoạch & Chuẩn bị nội dung đào tạo theo nhu cầu khách hàng (${goalTitle.slice(0, 40)}...)`,
        priority: 'urgent',
        startDate: dateStr(today),
        dueDate: dateStr(d1),
        assignee: { type: 'human', name: 'Đội Nội Dung & Giảng Viên' },
        notes: `Nghiên cứu đặc thù tệp học viên, chuẩn bị giáo trình 20% lý thuyết + 30% mẫu câu lệnh + 50% thực hành theo yêu cầu.`,
        checklist: [
          'Khảo sát trình độ và nhu cầu thực tế của học viên',
          'Biên soạn bài giảng & slide đào tạo gắn với công việc thực tế',
          'Soạn bộ template câu lệnh (prompt) và bài tập thực hành mẫu'
        ],
        pdca: {
          plan: 'Mục tiêu: hoàn thiện giáo trình đạt tiêu chuẩn 80% thực hành trước ngày diễn ra.',
          do: 'Soạn thảo tài liệu và bài tập mẫu.',
          check: 'Rà soát quy định dữ liệu và phê duyệt nội dung trước khi in.',
          act: 'Chốt bản thảo giáo trình cuối cùng.'
        }
      },
      {
        content: `Liên hệ đơn vị hỗ trợ địa điểm & Hậu cần tổ chức tại Ninh Bình`,
        priority: 'urgent',
        startDate: dateStr(today),
        dueDate: dateStr(d2),
        assignee: { type: 'human', name: 'Ban Hậu Cần & Ban Tổ Chức' },
        notes: `Chốt hội trường trang thiết bị (máy chiếu, âm thanh, wifi, chỗ ngồi), lập danh sách học viên cán bộ viên chức và in ấn phẩm tài liệu.`,
        checklist: [
          'Liên hệ làm việc với đơn vị đón tiếp/hỗ trợ tại tỉnh Ninh Bình',
          'Đặt hội trường, kiểm tra đường truyền Wifi & máy chiếu',
          'Chốt danh sách học viên cán bộ viên chức đăng ký',
          'In ấn phẩm, tài liệu hướng dẫn và bảng tên học viên'
        ],
        pdca: {
          plan: 'Mục tiêu: chốt 100% địa điểm, thiết bị và danh sách học viên 3 ngày trước sự kiện.',
          do: 'Làm việc với đối tác địa phương và nhà in.',
          check: 'Kiểm tra hạ tầng kỹ thuật tại hội trường.',
          act: 'Xác nhận kế hoạch di chuyển và đưa đón đoàn đào tạo.'
        }
      },
      {
        content: `Thông báo kế hoạch & Phát hành tài liệu đọc trước cho học viên`,
        priority: 'medium',
        startDate: dateStr(d1),
        dueDate: dateStr(d3),
        assignee: { type: 'human', name: 'Bộ Phận Truyền Thông & CSKH' },
        notes: `Gửi thông báo lịch học 2 ngày (Thứ 7 & Chủ Nhật), gửi tài liệu khảo sát và hướng dẫn cài đặt/tài khoản công cụ AI trước cho cán bộ.`,
        checklist: [
          'Gửi văn bản/thông báo kế hoạch đào tạo chính thức',
          'Gửi tài liệu giới thiệu và hướng dẫn chuẩn bị tài khoản AI',
          'Tổng hợp câu hỏi và đề xuất ban đầu từ cán bộ viên chức'
        ],
        pdca: {
          plan: 'Mục tiêu: 100% học viên nhận được thông báo và tài khoản AI trước 2 ngày.',
          do: 'Phát hành thông báo và hỗ trợ học viên.',
          check: 'Kiểm tra tỷ lệ học viên đã truy cập tài khoản thành công.',
          act: 'Nhắc nhở học viên chưa hoàn thành khảo sát.'
        }
      },
      {
        content: `Tổ chức 2 ngày đào tạo thực chiến & Thu thập phản hồi đánh giá`,
        priority: 'urgent',
        startDate: dateStr(d3),
        dueDate: dateStr(d4),
        assignee: { type: 'human', name: 'Giảng Viên & Trợ Giảng' },
        notes: `Triển khai giảng dạy 2 ngày (T7 & CN), hướng dẫn cán bộ thao tác công việc thật bằng AI, chấm bài thực hành và phát phiếu đánh giá cuối khóa.`,
        checklist: [
          'Điểm danh và điều phối lớp học 2 ngày đào tạo tại Ninh Bình',
          'Hướng dẫn học viên tạo ra sản phẩm công việc thực tế ngay tại lớp',
          'Tổng hợp phản hồi đánh giá chất lượng và phiếu khảo sát sau đào tạo',
          'Báo cáo tổng kết kết quả đào tạo cho lãnh đạo đơn vị'
        ],
        pdca: {
          plan: 'Mục tiêu: trên 80% học viên tạo được sản phẩm công việc thật và đánh giá hài lòng.',
          do: 'Điều hành lớp học và hỗ trợ từng học viên.',
          check: 'Thu thập phiếu đánh giá và đo tỷ lệ hoàn thành bài tập.',
          act: 'Lập báo cáo tổng kết và gửi tài liệu chuẩn hóa sau khóa học.'
        }
      }
    ];
  }

  // Generic fallback subtasks for any high-level task
  return [
    {
      content: `Nghiên cứu & Lập kế hoạch chi tiết: ${goalTitle.slice(0, 50)}`,
      priority: 'urgent',
      startDate: dateStr(today),
      dueDate: dateStr(d1),
      assignee: { type: 'agent', name: 'Alex Research' },
      notes: `Phân tích yêu cầu, khảo sát các yếu tố cần thiết và xác định tiêu chí thành công cho công việc.`,
      checklist: [
        'Xác định rõ mục tiêu và kết quả cần đạt',
        'Liệt kê tài nguyên và nhân sự phụ trách',
        'Chốt danh sách các công việc thành phần'
      ],
      pdca: {
        plan: 'Tiêu chí: kế hoạch hành động rõ ràng và phân công công việc cụ thể.',
        do: 'Viết bản mô tả kế hoạch.',
        check: 'Review kế hoạch với người quản lý.',
        act: 'Thực thi các bước theo kế hoạch.'
      }
    },
    {
      content: `Thực thi & Sản xuất các tài sản công việc cho: ${goalTitle.slice(0, 50)}`,
      priority: 'medium',
      startDate: dateStr(d1),
      dueDate: dateStr(d3),
      assignee: { type: 'human', name: 'Thành Viên Dự Án' },
      notes: `Tiến hành triển khai công việc theo đúng quy trình và tiêu chí chất lượng.`,
      checklist: [
        'Sản xuất bản nháp nội dung / sản phẩm',
        'Kiểm tra chất lượng và tuân thủ tiêu chí',
        'Hoàn thiện bản cuối sẵn sàng bàn giao'
      ],
      pdca: {
        plan: 'Mục tiêu hoàn thành sản phẩm đúng hạn.',
        do: 'Triển khai công việc.',
        check: 'Kiểm tra lỗi và sự phù hợp.',
        act: 'Bàn giao và ghi nhận kinh nghiệm.'
      }
    },
    {
      content: `Đo lường kết quả & Cập nhật SOP / Báo cáo cho: ${goalTitle.slice(0, 50)}`,
      priority: 'medium',
      startDate: dateStr(d3),
      dueDate: dateStr(d4),
      assignee: { type: 'agent', name: 'Nova Analytics' },
      notes: `Đánh giá hiệu quả, đo lường các chỉ số đạt được và đóng gói thành quy trình SOP tái sử dụng.`,
      checklist: [
        'Thu thập chỉ số hiệu quả thực tế',
        'Tổng hợp bài học kinh nghiệm',
        'Cập nhật tài liệu SOP chuẩn hóa'
      ],
      pdca: {
        plan: 'Mục tiêu có báo cáo tổng kết và SOP chuẩn.',
        do: 'Lập báo cáo và tài liệu SOP.',
        check: 'Đối chiếu chỉ số với mục tiêu ban đầu.',
        act: 'Chuẩn hóa cách làm cho các dự án sau.'
      }
    }
  ];
}

// Generate smart sub-tasks using Agnes AI API with prompt engineering
export async function generateSmartSubtasks(goalTitle, moduleTitle = '') {
  const settings = loadAiSettings();
  if (!settings.apiKey) {
    return generateFallbackSubtasks(goalTitle, moduleTitle);
  }

  const prompt = `
Bạn là Trợ lý Quản lý Dự án AI thông minh.
Người dùng vừa thêm một mục tiêu / dự án mới: "${goalTitle}".
Mô hình hiện tại: "${moduleTitle}".

Nhiệm vụ: Hãy phân chẻ mục tiêu trên thành 3 đến 5 thẻ công việc (sub-tasks) chi tiết, cụ thể và khả thi để đưa vào bảng To-Do từ nay đến cuối tháng.
Đặc biệt nếu mục tiêu có đề cập đến sự kiện, địa phương (ví dụ Ninh Bình), khóa đào tạo, offline hay ra mắt sản phẩm, hãy gợi ý đầy đủ các khâu chuẩn bị nội dung, liên hệ hậu cần, hội trường, khảo sát, tài liệu, thông báo kế hoạch, ấn phẩm, tổ chức...

Yêu cầu định dạng: Trả về một chuỗi JSON Array nguyên bản [ {...}, {...} ] (KHÔNG chứa mã markdown \`\`\`json) với cấu trúc mỗi thẻ công việc như sau:
[
  {
    "content": "Tên công việc cụ thể...",
    "priority": "urgent" | "medium" | "low",
    "startDate": "2026-07-23",
    "dueDate": "2026-07-28",
    "assignee": { "type": "human" | "agent", "name": "Tên người hoặc AI Agent phụ trách" },
    "notes": "Mô tả chi tiết hướng dẫn thực hiện, các bước cần chú ý...",
    "checklist": ["Việc nhỏ 1", "Việc nhỏ 2", "Việc nhỏ 3"],
    "pdca": {
      "plan": "Mục tiêu và tiêu chí đạt...",
      "do": "Công việc sẽ thực thi...",
      "check": "Cách kiểm tra và đánh giá...",
      "act": "Hướng xử lý và chuẩn hóa..."
    }
  }
]
`;

  return new Promise((resolve) => {
    let responseText = '';
    const controller = new AbortController();

    streamChatCompletion({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'Bạn là chuyên gia phân chẻ công việc dự án AI. Chỉ xuất ra JSON Array không kèm định dạng markdown.' },
        { role: 'user', content: prompt }
      ],
      signal: controller.signal,
      onDelta: (chunk) => {
        responseText += chunk;
      },
      onDone: () => {
        try {
          // Clean possible markdown quotes if present
          let cleanJson = responseText.trim();
          if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```(json)?/, '').replace(/```$/, '').trim();
          }
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            resolve(parsed);
            return;
          }
        } catch {
          // parse failed
        }
        resolve(generateFallbackSubtasks(goalTitle, moduleTitle));
      },
      onError: () => {
        resolve(generateFallbackSubtasks(goalTitle, moduleTitle));
      }
    });

    // Timeout fallback after 8 seconds
    setTimeout(() => {
      controller.abort();
      resolve(generateFallbackSubtasks(goalTitle, moduleTitle));
    }, 8000);
  });
}
