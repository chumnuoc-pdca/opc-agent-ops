// Server-side port of apps/web/src/utils/aiTools.js - same tool schemas/risk
// tiers/executor pattern, but backed by serverTaskOps.js (direct SQL) instead
// of the browser's localStorage-backed taskOperations.js/boardStorage.js.
import { PRIORITY_LABELS } from '../../../web/src/data/initialData.js';
import {
  getFlatModules, loadAllBoards, loadModuleBoard, isOverdue, todayISO, formatShortDate,
  resolveModuleRef, findTaskLocation, compactTask,
  createTask, updateTask, deleteTask, moveTask, toggleChecklistItem, addChecklistItem, setBlocked
} from './serverTaskOps.js';
import { appendAuditLog, findSuccessfulAuditLog } from './auditLog.js';
import { emitBoardChanged } from '../events.js';
import { getModuleKvData, setModuleKvData } from '../db/moduleKv.js';
import { AI_CONFIG } from '../config.js';
import { uploadBufferToDrive } from '../integrations/googleDrive.js';
import { postToFacebookPage } from '../integrations/facebook.js';
import { postVideoToTikTok } from '../integrations/tiktok.js';
import { publishWordpressPost } from '../integrations/wordpress.js';
import { searchKnowledge } from './knowledgeIndex.js';

const newKvId = (prefix) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

// Which module(s) a given tool call actually touched - so the SSE stream
// (routes/stream.js) can notify a human's open Board tab in near-real-time
// instead of waiting for the 4s poll fallback (see plan Phase 3).
const affectedModuleIds = (name, args) => {
  if (name === 'create_task') return [args.module];
  if (name === 'handoff_to_agent') {
    const from = findTaskLocation(args.fromTaskId)?.module.id;
    return [from, args.targetModule].filter(Boolean);
  }
  if (['update_task_fields', 'move_task_status', 'set_task_blocked', 'delete_task', 'add_checklist_item', 'toggle_checklist_item'].includes(name)) {
    const loc = findTaskLocation(args.taskId);
    return loc ? [loc.module.id] : [];
  }
  if (name === 'bulk_update_tasks') {
    return (args.taskIds || []).map((id) => findTaskLocation(id)?.module.id).filter(Boolean);
  }
  if (['log_case_study', 'create_asset', 'update_asset', 'record_finance_entry', 'update_kpi_result'].includes(name)) {
    const module = resolveModuleRef(args.module);
    return module ? [module.id] : [];
  }
  return [];
};

export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_modules',
      description: 'Liệt kê toàn bộ mô hình (module/agent workspace) trong hệ thống kèm mã (code), tên và nhóm. Dùng để tra cứu mã module trước khi tạo/sửa việc hoặc phân việc cho agent phụ trách.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_tasks',
      description: 'Tìm công việc theo từ khoá và/hoặc bộ lọc, trên một module hoặc toàn hệ thống. Đây là cách duy nhất để lấy taskId thật (dùng cho các tool khác) - taskId KHÔNG trùng với mã hiển thị như "M1-07".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khoá khớp với nội dung công việc HOẶC mã công việc (vd "M1-07") - không phân biệt hoa thường' },
          module: { type: 'string', description: 'Mã hoặc id module để giới hạn phạm vi tìm (không bắt buộc)' },
          priority: { type: 'string', enum: ['low', 'medium', 'urgent'] },
          overdueOnly: { type: 'boolean', description: 'Chỉ lấy việc đã quá hạn' },
          blockedOnly: { type: 'boolean', description: 'Chỉ lấy việc đang bị chặn' },
          tag: { type: 'string', description: 'Chỉ lấy việc có đúng nhãn (tags) này, vd "pod-alpha" để gom mọi việc của 1 pod/builder trong module M6' },
          limit: { type: 'number', description: 'Số kết quả tối đa (mặc định 10, tối đa 30)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_detail',
      description: 'Lấy toàn bộ chi tiết một công việc theo taskId (bao gồm ghi chú, checklist, PDCA notes).',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_module_summary',
      description: 'Tóm tắt tiến độ một module: số việc theo từng bảng trạng thái, tỷ lệ hoàn thành, số quá hạn/bị chặn.',
      parameters: { type: 'object', properties: { module: { type: 'string' } }, required: ['module'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_overview_summary',
      description: 'Tóm tắt toàn bộ hệ thống: tổng số module/agent, tổng công việc, tỷ lệ hoàn thành chung, số việc quá hạn.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_upcoming_deadlines',
      description: 'Liệt kê công việc quá hạn hoặc sắp đến hạn trong X ngày tới, trên toàn hệ thống.',
      parameters: { type: 'object', properties: { withinDays: { type: 'number', description: 'Mặc định 7' } }, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Tìm kiếm từ khoá trong ghi chú/kho tri thức (Task Note, Group Note, Knowledge Item) và nội dung công việc thật đã lưu trong hệ thống. Dùng khi người dùng hỏi "tôi đã ghi gì về X", "tổng hợp ghi chú về Y", hoặc cần tra cứu tri thức/hướng dẫn nội bộ đã lưu trước đó. Đây là tìm kiếm từ khoá (không phải ngữ nghĩa) - dùng đúng từ khoá xuất hiện trong nội dung cần tìm.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khoá cần tìm, có thể nhiều từ (mỗi từ được khớp riêng, không cần khớp cụm chính xác)' },
          limit: { type: 'number', description: 'Số kết quả tối đa (mặc định 5, tối đa 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_news_by_keyword',
      description: 'Lấy danh sách tin thật (tiêu đề/link/ngày đăng) từ 1 feed RSS/Atom công khai đã có sẵn URL thật - dùng để lấy tin làm nguồn viết bài, KHÔNG được tự đoán sourceUrl khi không có URL thật nào được cung cấp. Rủi ro thấp (R0), chỉ đọc, không ghi dữ liệu.',
      parameters: {
        type: 'object',
        properties: {
          sourceUrl: { type: 'string', description: 'URL feed RSS/Atom thật, bắt đầu bằng http:// hoặc https://' },
          keyword: { type: 'string', description: 'Lọc theo tiêu đề tin, không phân biệt hoa thường (không bắt buộc)' },
          limit: { type: 'number', description: 'Số tin tối đa (mặc định 10, tối đa 20)' }
        },
        required: ['sourceUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Sinh 1 ảnh THẬT bằng AI (tốn phí thật) rồi lưu lên Google Drive, trả về link xem được. Cần xác nhận vì tốn phí thật (R2).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Mã hoặc id module - dùng để đặt tên file có ngữ cảnh' },
          prompt: { type: 'string', description: 'Mô tả ảnh cần tạo, càng cụ thể càng tốt' },
          fileName: { type: 'string', description: 'Tên file lưu trên Drive, vd "m1-concept-01.png" (không bắt buộc, tự sinh nếu bỏ trống)' }
        },
        required: ['module', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: 'Gửi yêu cầu sinh video THẬT bằng AI (tốn phí thật, xử lý mất vài phút) - trả về videoJobId ngay, KHÔNG chờ xong. Dùng check_video_status để kiểm tra/lấy kết quả sau. Cần xác nhận vì tốn phí thật (R2).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Mã hoặc id module - dùng để đặt tên file có ngữ cảnh' },
          prompt: { type: 'string', description: 'Mô tả video cần tạo' },
          seconds: { type: 'number', description: 'Độ dài video (giây), mặc định theo model nếu bỏ trống' }
        },
        required: ['module', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_video_status',
      description: 'Kiểm tra tiến độ 1 video đã gửi qua generate_video theo videoJobId. Nếu đã xong (completed), tự tải video thật về và lưu lên Google Drive, trả về link xem được. Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          videoJobId: { type: 'string' },
          fileName: { type: 'string', description: 'Tên file lưu trên Drive khi video đã xong (không bắt buộc)' }
        },
        required: ['videoJobId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'post_to_facebook',
      description: 'Đăng bài THẬT lên Facebook Page đã cấu hình (công khai, khó hoàn tác). Luôn cần xác nhận rõ ràng (R3).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          message: { type: 'string', description: 'Nội dung bài đăng' },
          imageUrl: { type: 'string', description: 'Link ảnh công khai (vd link Drive vừa tạo) nếu muốn đăng kèm ảnh' },
          linkUrl: { type: 'string', description: 'Link đính kèm nếu không có ảnh' }
        },
        required: ['module', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'post_to_tiktok',
      description: 'Đăng video THẬT lên TikTok đã cấu hình, kéo video từ 1 URL công khai (vd link Drive vừa tạo). Nếu app TikTok chưa được duyệt Production, chỉ đăng được ở chế độ riêng tư (SELF_ONLY). Luôn cần xác nhận rõ ràng (R3).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          videoUrl: { type: 'string', description: 'URL video công khai thật (vd link Drive)' },
          caption: { type: 'string' },
          privacyLevel: { type: 'string', enum: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS'], description: 'Mặc định SELF_ONLY nếu bỏ trống - chỉ đổi sang công khai khi đã xác nhận app TikTok đã duyệt Production' }
        },
        required: ['module', 'videoUrl']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'publish_to_wordpress',
      description: 'Đăng bài THẬT lên website WordPress đã cấu hình. Mặc định lưu dạng "draft" (bản nháp chưa công khai) trừ khi được yêu cầu rõ "publish". Luôn cần xác nhận rõ ràng (R3).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          title: { type: 'string' },
          contentHtml: { type: 'string', description: 'Nội dung bài viết, dạng HTML' },
          status: { type: 'string', enum: ['draft', 'publish'], description: 'Mặc định "draft"' }
        },
        required: ['module', 'title', 'contentHtml']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Tạo một công việc mới trong module của agent/nhân sự phụ trách. Đây là cách CEO agent giao việc: gọi 1 lần cho mỗi đầu việc, gán assigneeType/assigneeName đúng agent phụ trách. Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Mã hoặc id module/agent workspace nhận việc này' },
          columnId: { type: 'string', description: 'Bỏ trống để dùng bảng "Cần làm"' },
          content: { type: 'string', description: 'Tên/tiêu đề công việc ngắn gọn, súc tích (hiển thị trên thẻ Kanban, tối đa 10-15 từ, vd: "Thiết kế landing page sản phẩm X")' },
          notes: { type: 'string', description: 'Mô tả chi tiết, các bước/yêu cầu cụ thể, tư liệu hoặc bối cảnh đầy đủ của công việc' },
          priority: { type: 'string', enum: ['low', 'medium', 'urgent'] },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
          assigneeType: { type: 'string', enum: ['human', 'agent'] },
          assigneeName: { type: 'string' },
          dependsOn: { type: 'string', description: 'taskId của việc phải xong trước (dùng khi bàn giao chuỗi)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Nhãn phân loại, vd ["meta-proposal"] cho đề xuất của HR meta-agent' }
        },
        required: ['module', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_agent',
      description: 'Bàn giao kết quả sang agent chuyên trách khác: tạo 1 công việc MỚI trong board của agent đích, phụ thuộc (dependsOn) vào công việc hiện tại - không sửa công việc hiện tại. Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          fromTaskId: { type: 'string', description: 'taskId của công việc vừa hoàn tất, làm nguồn bàn giao' },
          targetModule: { type: 'string', description: 'Mã hoặc id module/agent nhận bàn giao' },
          targetAgentName: { type: 'string' },
          content: { type: 'string', description: 'Tên/tiêu đề công việc mới ngắn gọn cho agent tiếp theo (tối đa 10-15 từ)' },
          contextSummary: { type: 'string', description: 'Tóm tắt ngữ cảnh/kết quả cần bàn giao, sẽ đưa vào ghi chú' }
        },
        required: ['fromTaskId', 'targetModule', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_fields',
      description: 'Cập nhật các trường của một công việc đã tồn tại. Ảnh hưởng dữ liệu đang có nên cần xác nhận (R2).',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          content: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'urgent'] },
          dueDate: { type: 'string' },
          startDate: { type: 'string' },
          progress: { type: 'number', description: '0-100' },
          assigneeType: { type: 'string', enum: ['human', 'agent'] },
          assigneeName: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_task_status',
      description: 'Chuyển một công việc sang bảng (cột trạng thái) khác trong module của nó. Cần xác nhận (R2).',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string' }, toColumnId: { type: 'string' } },
        required: ['taskId', 'toColumnId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_task_blocked',
      description: 'Đánh dấu công việc đang bị chặn (hoặc gỡ chặn). Bắt buộc có lý do khi đánh dấu bị chặn. Cần xác nhận (R2).',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          isBlocked: { type: 'boolean' },
          reason: { type: 'string', description: 'Bắt buộc nếu isBlocked = true' }
        },
        required: ['taskId', 'isBlocked']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_checklist_item',
      description: 'Thêm một việc nhỏ (checklist item) vào một công việc. Rủi ro thấp (R1).',
      parameters: { type: 'object', properties: { taskId: { type: 'string' }, text: { type: 'string' } }, required: ['taskId', 'text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_checklist_item',
      description: 'Đánh dấu hoàn thành/chưa hoàn thành một việc nhỏ trong checklist. Rủi ro thấp (R1).',
      parameters: { type: 'object', properties: { taskId: { type: 'string' }, itemId: { type: 'string' } }, required: ['taskId', 'itemId'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Xoá vĩnh viễn một công việc. Rủi ro cao (R3), luôn cần xác nhận rõ ràng.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_update_tasks',
      description: 'Cập nhật hàng loạt nhiều công việc cùng lúc (tối đa 20 việc/lần). Luôn ở mức rủi ro cao (R3), cần xác nhận rõ phạm vi.',
      parameters: {
        type: 'object',
        properties: {
          taskIds: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['low', 'medium', 'urgent'] },
          dueDate: { type: 'string' }
        },
        required: ['taskIds']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_case_study',
      description: 'Ghi lại 1 Case Study mới cho module - CHỈ dùng khi một kết quả/concept đã được xác nhận THẮNG thật sự, không ghi nháp/dự đoán. Rule/Memory/Skill sẽ được nạp lại vào system prompt của agent cho các lần chạy sau. Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Mã hoặc id module' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          context: { type: 'string', description: 'Bối cảnh/vấn đề ban đầu' },
          goal: { type: 'string' },
          execution: { type: 'string', description: 'Đã làm gì' },
          results: { type: 'string', description: 'Kết quả thật (số liệu nếu có)' },
          tactics: { type: 'string' },
          replication: { type: 'string', description: 'Cách nhân bản lại' },
          rule: { type: 'string', description: 'Quy tắc bắt buộc tuân theo cho các lần chạy sau' },
          memory: { type: 'string', description: 'Ngữ cảnh cần nhớ cho các lần chạy sau' },
          skill: { type: 'string', description: 'Quy trình thao tác nên lặp lại' }
        },
        required: ['module', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_asset',
      description: 'Thêm 1 tài sản mới vào kho tài sản của module (nội dung/kênh/công cụ đã tạo ra được). Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          name: { type: 'string' },
          categoryId: { type: 'string', enum: ['code', 'media', 'community', 'platform', 'traffic', 'channel'] },
          metric: { type: 'string', description: 'Chỉ số liên quan nếu có, vd "12.4k view"' },
          link: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'inprogress', 'done'], description: 'Mặc định "planned"' },
          note: { type: 'string' }
        },
        required: ['module', 'name', 'categoryId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_asset',
      description: 'Sửa 1 tài sản đã có sẵn (theo assetId lấy từ create_asset hoặc dữ liệu module). Ảnh hưởng dữ liệu đang có nên cần xác nhận (R2).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          assetId: { type: 'string' },
          name: { type: 'string' },
          categoryId: { type: 'string', enum: ['code', 'media', 'community', 'platform', 'traffic', 'channel'] },
          metric: { type: 'string' },
          link: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'inprogress', 'done'] },
          note: { type: 'string' }
        },
        required: ['module', 'assetId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'record_finance_entry',
      description: 'Ghi 1 dòng doanh thu hoặc chi phí THẬT vào sổ tài chính của module - không tự bịa số liệu, chỉ ghi khi đã có số thật. Rủi ro thấp (R1), tự động chạy.',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          kind: { type: 'string', enum: ['revenue', 'cost'] },
          amount: { type: 'number' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          source: { type: 'string', description: 'Nguồn doanh thu - dùng khi kind = "revenue"' },
          item: { type: 'string', description: 'Khoản chi - dùng khi kind = "cost"' },
          categoryId: { type: 'string', enum: ['production', 'ads', 'tools', 'people', 'other'], description: 'Dùng khi kind = "cost", mặc định "other"' },
          note: { type: 'string' }
        },
        required: ['module', 'kind', 'amount', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_kpi_result',
      description: 'Cập nhật số liệu THẬT (currentValue) của 1 Key Result đã tồn tại trong module - không tự bịa số liệu, không tự tạo Objective/Key Result mới (cấu trúc KPI do người phụ trách curate sẵn). Ảnh hưởng dữ liệu đang có nên cần xác nhận (R2).',
      parameters: {
        type: 'object',
        properties: {
          module: { type: 'string' },
          objectiveId: { type: 'string' },
          keyResultId: { type: 'string' },
          currentValue: { type: 'string', description: 'Giá trị hiện tại mới, vd "42" hoặc "12.4k"' },
          note: { type: 'string' }
        },
        required: ['module', 'objectiveId', 'keyResultId', 'currentValue']
      }
    }
  }
];

export const TOOL_RISK = {
  list_modules: 'R0',
  search_tasks: 'R0',
  get_task_detail: 'R0',
  get_module_summary: 'R0',
  get_overview_summary: 'R0',
  get_upcoming_deadlines: 'R0',
  search_knowledge: 'R0',
  fetch_news_by_keyword: 'R0',
  generate_image: 'R2',
  generate_video: 'R2',
  check_video_status: 'R1',
  post_to_facebook: 'R3',
  post_to_tiktok: 'R3',
  publish_to_wordpress: 'R3',
  create_task: 'R1',
  handoff_to_agent: 'R1',
  add_checklist_item: 'R1',
  toggle_checklist_item: 'R1',
  update_task_fields: 'R2',
  move_task_status: 'R2',
  set_task_blocked: 'R2',
  delete_task: 'R4',
  bulk_update_tasks: 'R3',
  log_case_study: 'R1',
  create_asset: 'R1',
  update_asset: 'R2',
  record_finance_entry: 'R1',
  update_kpi_result: 'R2'
};

export const needsConfirmation = (name) => TOOL_RISK[name] === 'R2' || TOOL_RISK[name] === 'R3';

// R4 = "không cho phép qua AI dù có duyệt" (PDCA spec mục 33) - xoá vĩnh
// viễn/hàng loạt chỉ làm được qua UI người dùng. Lọc cấu trúc ở đây (không
// chỉ dựa vào từng agent tự giác không khai `allowedTools`) để không agent
// nào - kể cả cấu hình sai - có thể được LLM nhìn thấy tool này.
export const AGENT_AVAILABLE_TOOLS = AI_TOOLS.filter((t) => TOOL_RISK[t.function.name] !== 'R4');

const MAX_BULK = 20;

export const describeToolCall = (name, args = {}) => {
  switch (name) {
    case 'create_task':
      return `Tạo công việc mới trong ${args.module}: "${args.content}"` +
        `${args.priority ? ` · ưu tiên ${PRIORITY_LABELS[args.priority] || args.priority}` : ''}` +
        `${args.dueDate ? ` · hạn ${args.dueDate}` : ''}.`;
    case 'handoff_to_agent':
      return `Bàn giao từ việc ${args.fromTaskId} sang ${args.targetModule}: "${args.content}".`;
    case 'update_task_fields': {
      const parts = [];
      if (args.content) parts.push(`nội dung → "${args.content}"`);
      if (args.priority) parts.push(`ưu tiên → ${PRIORITY_LABELS[args.priority] || args.priority}`);
      if (args.dueDate) parts.push(`hạn chót → ${args.dueDate}`);
      if (args.startDate) parts.push(`bắt đầu → ${args.startDate}`);
      if (args.progress !== undefined) parts.push(`tiến độ → ${args.progress}%`);
      if (args.assigneeName) parts.push(`phụ trách → ${args.assigneeName}`);
      return `Cập nhật công việc ${args.taskId}: ${parts.join(', ') || 'không có thay đổi rõ ràng'}.`;
    }
    case 'move_task_status':
      return `Chuyển công việc ${args.taskId} sang bảng "${args.toColumnId}".`;
    case 'set_task_blocked':
      return args.isBlocked
        ? `Đánh dấu công việc ${args.taskId} đang BỊ CHẶN: "${args.reason || '(chưa nêu lý do)'}".`
        : `Gỡ trạng thái bị chặn khỏi công việc ${args.taskId}.`;
    case 'delete_task':
      return `XOÁ VĨNH VIỄN công việc ${args.taskId}. Không thể hoàn tác.`;
    case 'bulk_update_tasks':
      return `Cập nhật hàng loạt ${args.taskIds?.length || 0} công việc` +
        `${args.priority ? ` → ưu tiên ${args.priority}` : ''}${args.dueDate ? ` → hạn ${args.dueDate}` : ''}.`;
    case 'log_case_study':
      return `Ghi Case Study mới cho ${args.module}: "${args.title}".`;
    case 'create_asset':
      return `Thêm tài sản mới cho ${args.module}: "${args.name}" (${args.categoryId}).`;
    case 'update_asset':
      return `Cập nhật tài sản ${args.assetId} của ${args.module}.`;
    case 'record_finance_entry':
      return `Ghi ${args.kind === 'cost' ? 'chi phí' : 'doanh thu'} ${args.amount} cho ${args.module} (${args.date}).`;
    case 'update_kpi_result':
      return `Cập nhật Key Result ${args.keyResultId} của ${args.module} → ${args.currentValue}.`;
    case 'fetch_news_by_keyword':
      return `Lấy tin từ nguồn ${args.sourceUrl}${args.keyword ? ` (lọc: "${args.keyword}")` : ''}.`;
    case 'generate_image':
      return `Sinh ảnh AI cho ${args.module}: "${args.prompt}" (tốn phí thật).`;
    case 'generate_video':
      return `Gửi yêu cầu sinh video AI cho ${args.module}: "${args.prompt}" (tốn phí thật, xử lý mất vài phút).`;
    case 'post_to_facebook':
      return `ĐĂNG BÀI CÔNG KHAI lên Facebook Page: "${args.message}".`;
    case 'post_to_tiktok':
      return `ĐĂNG VIDEO lên TikTok (${args.privacyLevel || 'SELF_ONLY'}): "${args.caption || ''}".`;
    case 'publish_to_wordpress':
      return `${args.status === 'publish' ? 'ĐĂNG CÔNG KHAI' : 'Lưu bản nháp'} bài WordPress: "${args.title}".`;
    default:
      return `Thực hiện ${name}.`;
  }
};

const decodeXmlEntities = (str) => str
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .trim();

const parseNewsFeed = (xml) => {
  const items = [];
  const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/g;
  let block;
  while ((block = blockRe.exec(xml)) !== null) {
    const chunk = block[0];
    const title = chunk.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const linkTag = chunk.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/) || chunk.match(/<link\b[^>]*>([\s\S]*?)<\/link>/);
    const pubDate = chunk.match(/<(?:pubDate|updated|published)\b[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published)>/)?.[1];
    if (!title) continue;
    items.push({
      title: decodeXmlEntities(title),
      link: linkTag ? decodeXmlEntities(linkTag[1]) : null,
      pubDate: pubDate ? decodeXmlEntities(pubDate) : null
    });
  }
  return items;
};

export const executeAiTool = async (name, rawArgs = {}) => {
  const args = rawArgs || {};

  if (TOOL_RISK[name] === 'R4') {
    throw new Error(`"${name}" ở mức rủi ro R4 - không cho phép thực hiện qua AI dù đã duyệt, chỉ làm được qua giao diện người dùng.`);
  }

  switch (name) {
    case 'fetch_news_by_keyword': {
      const sourceUrl = args.sourceUrl || '';
      if (!/^https?:\/\//i.test(sourceUrl)) throw new Error('sourceUrl phải là URL http:// hoặc https:// thật, không được để trống/đoán.');
      const limit = Math.min(args.limit || 10, 20);
      let text;
      try {
        const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch (err) {
        throw new Error(`Không lấy được tin từ nguồn đã cho (${sourceUrl}): ${err.message}`);
      }
      let items = parseNewsFeed(text);
      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        items = items.filter((i) => i.title.toLowerCase().includes(kw));
      }
      return { sourceUrl, keyword: args.keyword || null, items: items.slice(0, limit) };
    }

    case 'generate_image': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.prompt?.trim()) throw new Error('Thiếu prompt mô tả ảnh cần tạo.');

      const genRes = await fetch(`${AI_CONFIG.baseUrl.replace(/\/$/, '')}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: args.prompt, n: 1, size: '1024x1024' }),
        signal: AbortSignal.timeout(240000)
      });
      if (!genRes.ok) {
        const detail = await genRes.text().catch(() => '');
        throw new Error(`Sinh ảnh thất bại (mã ${genRes.status}). ${detail.slice(0, 300)}`);
      }
      const genData = await genRes.json();
      const item = genData?.data?.[0];
      if (!item) throw new Error('Sinh ảnh không trả về kết quả.');

      let buffer;
      if (item.b64_json) {
        buffer = Buffer.from(item.b64_json, 'base64');
      } else if (item.url) {
        const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
        if (!imgRes.ok) throw new Error(`Không tải được ảnh vừa sinh (mã ${imgRes.status}).`);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        throw new Error('Kết quả sinh ảnh không có b64_json hoặc url.');
      }

      const fileName = args.fileName || `${module.code}-image-${Date.now()}.png`;
      const drive = await uploadBufferToDrive({ buffer, filename: fileName, mimeType: 'image/png' });
      return { module: module.id, prompt: args.prompt, driveFileId: drive.fileId, driveViewLink: drive.webViewLink };
    }

    case 'generate_video': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.prompt?.trim()) throw new Error('Thiếu prompt mô tả video cần tạo.');

      const body = { model: 'agnes-video-v2.0', prompt: args.prompt };
      if (args.seconds) body.seconds = String(args.seconds);
      const genRes = await fetch(`${AI_CONFIG.baseUrl.replace(/\/$/, '')}/videos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      if (!genRes.ok) {
        const detail = await genRes.text().catch(() => '');
        throw new Error(`Gửi yêu cầu sinh video thất bại (mã ${genRes.status}). ${detail.slice(0, 300)}`);
      }
      const genData = await genRes.json();
      return { module: module.id, prompt: args.prompt, videoJobId: genData.id, status: genData.status };
    }

    case 'check_video_status': {
      if (!args.videoJobId) throw new Error('Thiếu videoJobId.');
      const statusRes = await fetch(`${AI_CONFIG.baseUrl.replace(/\/$/, '')}/videos/${args.videoJobId}`, {
        headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!statusRes.ok) {
        const detail = await statusRes.text().catch(() => '');
        throw new Error(`Không kiểm tra được trạng thái video (mã ${statusRes.status}). ${detail.slice(0, 300)}`);
      }
      const statusData = await statusRes.json();
      if (statusData.status !== 'completed') {
        return { videoJobId: args.videoJobId, status: statusData.status, progress: statusData.progress ?? null };
      }
      const videoUrl = statusData.metadata?.url || statusData.url;
      if (!videoUrl) throw new Error('Video đã hoàn tất nhưng không thấy URL kết quả.');
      const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
      if (!videoRes.ok) throw new Error(`Không tải được video đã hoàn tất (mã ${videoRes.status}).`);
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      const fileName = args.fileName || `video-${args.videoJobId}.mp4`;
      const drive = await uploadBufferToDrive({ buffer, filename: fileName, mimeType: 'video/mp4' });
      return { videoJobId: args.videoJobId, status: 'completed', driveFileId: drive.fileId, driveViewLink: drive.webViewLink };
    }

    case 'post_to_facebook': {
      if (!resolveModuleRef(args.module)) throw new Error(`Không tìm thấy module "${args.module}".`);
      const result = await postToFacebookPage({ message: args.message, imageUrl: args.imageUrl, linkUrl: args.linkUrl });
      return result;
    }

    case 'post_to_tiktok': {
      if (!resolveModuleRef(args.module)) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.videoUrl) throw new Error('Thiếu videoUrl thật để đăng.');
      const result = await postVideoToTikTok({ videoUrl: args.videoUrl, caption: args.caption, privacyLevel: args.privacyLevel });
      return result;
    }

    case 'publish_to_wordpress': {
      if (!resolveModuleRef(args.module)) throw new Error(`Không tìm thấy module "${args.module}".`);
      const result = await publishWordpressPost({ title: args.title, contentHtml: args.contentHtml, status: args.status });
      return result;
    }

    case 'list_modules': {
      const modules = getFlatModules().map((m) => ({ moduleId: m.id, code: m.code, title: m.title, group: m.groupTitle, agentId: m.agentId }));
      return { modules };
    }

    case 'search_tasks': {
      const limit = Math.min(args.limit || 10, 30);
      const q = (args.query || '').toLowerCase();
      const scopeModule = args.module ? resolveModuleRef(args.module) : null;
      if (args.module && !scopeModule) throw new Error(`Không tìm thấy module "${args.module}".`);
      const boards = scopeModule ? [{ module: scopeModule, board: loadModuleBoard(scopeModule) }] : loadAllBoards(getFlatModules());

      const results = [];
      for (const { module, board } of boards) {
        for (const task of Object.values(board.tasks)) {
          if (q && !task.content.toLowerCase().includes(q) && !task.code.toLowerCase().includes(q)) continue;
          if (args.priority && task.priority !== args.priority) continue;
          if (args.overdueOnly && !isOverdue(task.dueDate)) continue;
          if (args.blockedOnly && !task.blocked?.isBlocked) continue;
          if (args.tag && !(task.tags || []).includes(args.tag)) continue;
          results.push(compactTask(module, task));
          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }
      return { count: results.length, tasks: results };
    }

    case 'search_knowledge': {
      const limit = Math.min(args.limit || 5, 10);
      const items = searchKnowledge(args.query, limit);
      return { count: items.length, items };
    }

    case 'get_task_detail': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      const { module, task } = loc;
      return {
        taskId: task.id, code: task.code, moduleCode: module.code, moduleTitle: module.title,
        content: task.content, notes: task.notes, priority: task.priority, progress: task.progress,
        startDate: task.startDate, dueDate: task.dueDate, overdue: isOverdue(task.dueDate),
        assignee: task.assignee, blocked: task.blocked, dependsOn: task.dependsOn,
        checklist: task.checklist, pdca: task.pdca, createdAt: task.createdAt
      };
    }

    case 'get_module_summary': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      const board = loadModuleBoard(module);
      const columns = board.columnOrder.map((colId) => ({
        columnId: colId, title: board.columns[colId].title, taskCount: board.columns[colId].taskIds.length
      }));
      const allTasks = Object.values(board.tasks);
      const doneCount = board.columns[board.columnOrder[board.columnOrder.length - 1]]?.taskIds.length || 0;
      return {
        moduleCode: module.code, moduleTitle: module.title, totalTasks: allTasks.length, columns,
        overdueCount: allTasks.filter((t) => isOverdue(t.dueDate)).length,
        blockedCount: allTasks.filter((t) => t.blocked?.isBlocked).length,
        completionRateApprox: allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : 0
      };
    }

    case 'get_overview_summary': {
      const flat = getFlatModules();
      const boards = loadAllBoards(flat);
      let totalTasks = 0, overdueCount = 0, blockedCount = 0;
      boards.forEach(({ board }) => {
        const tasks = Object.values(board.tasks);
        totalTasks += tasks.length;
        overdueCount += tasks.filter((t) => isOverdue(t.dueDate)).length;
        blockedCount += tasks.filter((t) => t.blocked?.isBlocked).length;
      });
      return { totalModules: flat.length, totalTasks, overdueCount, blockedCount, asOf: todayISO() };
    }

    case 'get_upcoming_deadlines': {
      const withinDays = args.withinDays || 7;
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() + withinDays);
      const limitISO = limitDate.toISOString().slice(0, 10);
      const boards = loadAllBoards(getFlatModules());
      const results = [];
      boards.forEach(({ module, board }) => {
        Object.values(board.tasks).forEach((task) => {
          if (task.dueDate && task.dueDate <= limitISO) {
            results.push({ ...compactTask(module, task), dueDateDisplay: formatShortDate(task.dueDate) });
          }
        });
      });
      results.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      return { withinDays, count: results.length, tasks: results.slice(0, 30) };
    }

    case 'create_task': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.content?.trim()) throw new Error('Thiếu nội dung công việc.');
      const board = loadModuleBoard(module);
      const columnId = args.columnId && board.columns[args.columnId] ? args.columnId : board.columnOrder[0];
      const assignee = args.assigneeName ? { type: args.assigneeType || 'human', name: args.assigneeName } : null;
      const { task } = createTask(module.id, columnId, {
        content: args.content.trim(),
        notes: args.notes || '',
        priority: args.priority || 'medium',
        dueDate: args.dueDate || null,
        assignee,
        dependsOn: args.dependsOn || null,
        tags: Array.isArray(args.tags) ? args.tags : []
      });
      return { created: compactTask(module, task) };
    }

    case 'handoff_to_agent': {
      const fromLoc = findTaskLocation(args.fromTaskId);
      if (!fromLoc) throw new Error(`Không tìm thấy công việc nguồn "${args.fromTaskId}".`);
      const targetModule = resolveModuleRef(args.targetModule);
      if (!targetModule) throw new Error(`Không tìm thấy module đích "${args.targetModule}".`);
      if (!args.content?.trim()) throw new Error('Thiếu nội dung công việc bàn giao.');
      const board = loadModuleBoard(targetModule);
      const columnId = board.columnOrder[0];
      const notes = args.contextSummary
        ? `Bàn giao từ ${fromLoc.task.code}: ${args.contextSummary}`
        : `Bàn giao từ ${fromLoc.task.code}.`;
      const { task } = createTask(targetModule.id, columnId, {
        content: args.content.trim(),
        notes,
        priority: 'medium',
        assignee: { type: 'agent', name: args.targetAgentName || targetModule.agentId || targetModule.title },
        dependsOn: args.fromTaskId
      });
      return { handoff: compactTask(targetModule, task) };
    }

    case 'update_task_fields': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      const patch = {};
      if (args.content !== undefined) patch.content = args.content;
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
      if (args.startDate !== undefined) patch.startDate = args.startDate;
      if (args.progress !== undefined) patch.progress = Number(args.progress);
      if (args.assigneeName !== undefined) {
        patch.assignee = args.assigneeName ? { type: args.assigneeType || 'human', name: args.assigneeName } : null;
      }
      const { module, task } = updateTask(loc.module.id, args.taskId, patch);
      return { updated: compactTask(module, task) };
    }

    case 'move_task_status': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      const { module, board } = moveTask(loc.module.id, args.taskId, args.toColumnId);
      return { moved: true, toColumn: board.columns[args.toColumnId]?.title, moduleCode: module.code };
    }

    case 'set_task_blocked': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      const { module, task } = setBlocked(loc.module.id, args.taskId, Boolean(args.isBlocked), args.reason || '');
      return { updated: compactTask(module, task) };
    }

    case 'add_checklist_item': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      if (!args.text?.trim()) throw new Error('Thiếu nội dung việc nhỏ.');
      const { task } = addChecklistItem(loc.module.id, args.taskId, args.text.trim());
      return { checklist: task.checklist };
    }

    case 'toggle_checklist_item': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      const { task } = toggleChecklistItem(loc.module.id, args.taskId, args.itemId);
      return { checklist: task.checklist };
    }

    case 'delete_task': {
      const loc = findTaskLocation(args.taskId);
      if (!loc) throw new Error(`Không tìm thấy công việc "${args.taskId}".`);
      deleteTask(loc.module.id, args.taskId);
      return { deleted: args.taskId };
    }

    case 'bulk_update_tasks': {
      const ids = (args.taskIds || []).slice(0, MAX_BULK);
      if (ids.length === 0) throw new Error('Danh sách công việc trống.');
      const updated = [];
      ids.forEach((taskId) => {
        const loc = findTaskLocation(taskId);
        if (!loc) return;
        const patch = {};
        if (args.priority !== undefined) patch.priority = args.priority;
        if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
        const { module, task } = updateTask(loc.module.id, taskId, patch);
        updated.push(compactTask(module, task));
      });
      return { updatedCount: updated.length, updated };
    }

    case 'log_case_study': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.title?.trim()) throw new Error('Thiếu tiêu đề Case Study.');
      const data = getModuleKvData('module_case_studies', module.id);
      const items = Array.isArray(data.items) ? data.items : [];
      const caseStudy = {
        title: args.title.trim(),
        subtitle: args.subtitle || '',
        context: args.context || '',
        goal: args.goal || '',
        execution: args.execution || '',
        results: args.results || '',
        tactics: args.tactics || '',
        replication: args.replication || '',
        rule: args.rule || '',
        memory: args.memory || '',
        skill: args.skill || ''
      };
      setModuleKvData('module_case_studies', module.id, { items: [...items, caseStudy], updatedAt: Date.now() });
      return { caseStudy };
    }

    case 'create_asset': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!args.name?.trim()) throw new Error('Thiếu tên tài sản.');
      const data = getModuleKvData('module_assets', module.id);
      const items = Array.isArray(data.items) ? data.items : [];
      const asset = {
        id: newKvId(`asset-${module.id}`),
        name: args.name.trim(),
        categoryId: args.categoryId || 'platform',
        metric: args.metric || '',
        link: args.link || '',
        status: args.status || 'planned',
        note: args.note || '',
        documents: [],
        updatedAt: Date.now()
      };
      setModuleKvData('module_assets', module.id, { items: [...items, asset], updatedAt: Date.now() });
      return { asset };
    }

    case 'update_asset': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      const data = getModuleKvData('module_assets', module.id);
      const items = Array.isArray(data.items) ? data.items : [];
      const index = items.findIndex((it) => it.id === args.assetId);
      if (index === -1) throw new Error(`Không tìm thấy tài sản "${args.assetId}" trong ${args.module}.`);
      const updatedAsset = { ...items[index] };
      if (args.name !== undefined) updatedAsset.name = args.name;
      if (args.categoryId !== undefined) updatedAsset.categoryId = args.categoryId;
      if (args.metric !== undefined) updatedAsset.metric = args.metric;
      if (args.link !== undefined) updatedAsset.link = args.link;
      if (args.status !== undefined) updatedAsset.status = args.status;
      if (args.note !== undefined) updatedAsset.note = args.note;
      updatedAsset.updatedAt = Date.now();
      const nextItems = [...items];
      nextItems[index] = updatedAsset;
      setModuleKvData('module_assets', module.id, { ...data, items: nextItems, updatedAt: Date.now() });
      return { asset: updatedAsset };
    }

    case 'record_finance_entry': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      if (!['revenue', 'cost'].includes(args.kind)) throw new Error('kind phải là "revenue" hoặc "cost".');
      if (args.amount === undefined || Number.isNaN(Number(args.amount))) throw new Error('Thiếu amount hợp lệ.');
      if (!args.date) throw new Error('Thiếu date.');
      const data = getModuleKvData('module_finance', module.id);
      let entry;
      let nextData;
      if (args.kind === 'revenue') {
        entry = {
          id: newKvId(`rev-${module.id}`), source: args.source || '', amount: Number(args.amount),
          date: args.date, note: args.note || ''
        };
        nextData = { ...data, revenues: [...(data.revenues || []), entry] };
      } else {
        entry = {
          id: newKvId(`cost-${module.id}`), item: args.item || '', categoryId: args.categoryId || 'other',
          amount: Number(args.amount), date: args.date, note: args.note || ''
        };
        nextData = { ...data, costs: [...(data.costs || []), entry] };
      }
      setModuleKvData('module_finance', module.id, { ...nextData, updatedAt: Date.now() });
      return { entry, kind: args.kind };
    }

    case 'update_kpi_result': {
      const module = resolveModuleRef(args.module);
      if (!module) throw new Error(`Không tìm thấy module "${args.module}".`);
      const data = getModuleKvData('module_okr', module.id);
      const objectives = Array.isArray(data.objectives) ? data.objectives : [];
      const objIndex = objectives.findIndex((o) => o.id === args.objectiveId);
      if (objIndex === -1) throw new Error(`Không tìm thấy Objective "${args.objectiveId}" trong ${args.module}.`);
      const keyResults = objectives[objIndex].keyResults || [];
      const krIndex = keyResults.findIndex((kr) => kr.id === args.keyResultId);
      if (krIndex === -1) throw new Error(`Không tìm thấy Key Result "${args.keyResultId}" trong ${args.module}.`);
      const updatedKr = {
        ...keyResults[krIndex],
        previousValue: keyResults[krIndex].currentValue,
        currentValue: args.currentValue,
        updatedAt: Date.now()
      };
      if (args.note !== undefined) updatedKr.note = args.note;
      const nextKeyResults = [...keyResults];
      nextKeyResults[krIndex] = updatedKr;
      const nextObjectives = [...objectives];
      nextObjectives[objIndex] = { ...objectives[objIndex], keyResults: nextKeyResults };
      setModuleKvData('module_okr', module.id, { ...data, objectives: nextObjectives, updatedAt: Date.now() });
      return { keyResult: updatedKr };
    }

    default:
      throw new Error(`Không hỗ trợ tool "${name}".`);
  }
};

export const runAiToolWithAudit = async (name, args, { requestId, actorType, agentRunId } = {}) => {
  const risk = TOOL_RISK[name] || 'R0';
  if (risk !== 'R0') {
    const cached = findSuccessfulAuditLog(requestId);
    if (cached !== null) return { ok: true, result: cached, idempotentReplay: true };
  }
  let before = null;
  let taskId = args.taskId || args.fromTaskId || null;
  if (['update_task_fields', 'move_task_status', 'set_task_blocked', 'delete_task'].includes(name) && args.taskId) {
    const loc = findTaskLocation(args.taskId);
    before = loc ? compactTask(loc.module, loc.task) : null;
  }
  // Resolved BEFORE execution so delete_task can still find its own module.
  const moduleIdsToNotify = affectedModuleIds(name, args);
  try {
    const result = await executeAiTool(name, args);
    if (risk !== 'R0') {
      appendAuditLog({
        actorType: actorType || 'agent', action: name, riskLevel: risk, args, before, after: result,
        summary: describeToolCall(name, args), requestId, status: 'success', taskId, agentRunId
      });
    }
    moduleIdsToNotify.forEach(emitBoardChanged);
    return { ok: true, result };
  } catch (err) {
    if (risk !== 'R0') {
      appendAuditLog({
        actorType: actorType || 'agent', action: name, riskLevel: risk, args, before,
        summary: describeToolCall(name, args), requestId, status: 'error', error: err.message, taskId, agentRunId
      });
    }
    return { ok: false, error: err.message };
  }
};
