import { db } from '../db/client.js';

// Nạp system prompt thật cho 1 agent: phần .md tĩnh (vai trò/nguyên tắc) +
// thông tin module + đúng những gì admin đã curate trong Case Study (rule/
// memory/skill) - đây chính là "đầu vào cho agent lập kế hoạch" theo yêu cầu
// (xem ModuleCaseStudyPage.jsx's "cs-agent-input-section").
export function buildSystemPrompt(agentDef) {
  if (!agentDef.moduleId) {
    // CEO/agent không gắn với module cụ thể - .md body đã đủ (tự gọi
    // list_modules để biết registry thay vì nhồi tĩnh vào đây).
    return agentDef.systemPromptBody;
  }

  const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(agentDef.moduleId);
  const sections = [agentDef.systemPromptBody];

  if (module) {
    sections.push(
      `## Thông tin module ${module.code}\n${module.title}\n\n${module.description || ''}\n\n${module.details || ''}`.trim()
    );
  }

  const csRow = db.prepare('SELECT data_json FROM module_case_studies WHERE module_id = ?').get(agentDef.moduleId);
  if (csRow) {
    const items = JSON.parse(csRow.data_json)?.items || [];
    const withAgentInput = items.filter((cs) => cs.rule?.trim() || cs.memory?.trim() || cs.skill?.trim());
    if (withAgentInput.length > 0) {
      const blocks = withAgentInput.map((cs, i) => {
        const parts = [`### Case Study #${i + 1}: ${cs.title || '(chưa đặt tên)'}`];
        if (cs.rule?.trim()) parts.push(`**Rule (bắt buộc tuân theo):** ${cs.rule.trim()}`);
        if (cs.memory?.trim()) parts.push(`**Memory (ngữ cảnh cần nhớ):** ${cs.memory.trim()}`);
        if (cs.skill?.trim()) parts.push(`**Skill (quy trình thao tác):** ${cs.skill.trim()}`);
        return parts.join('\n');
      });
      sections.push(`## Đầu vào từ Case Study (do admin curate cho module này)\n${blocks.join('\n\n')}`);
    }
  }

  return sections.join('\n\n---\n\n');
}
