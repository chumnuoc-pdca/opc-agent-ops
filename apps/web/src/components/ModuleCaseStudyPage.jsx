import React, { useEffect, useState } from 'react';
import {
  BookOpen, CheckCircle, Lightbulb, Target, Sparkles, TrendingUp, Layers, ArrowRight,
  Plus, Trash2, Bot, ShieldCheck, Brain, Wrench
} from 'lucide-react';
import { loadModuleCaseStudies, saveModuleCaseStudies, createEmptyCaseStudy } from '../utils/caseStudyStorage';

// Field labels stay fixed - only their content is editable per case study.
// Narrative/metric fields - written for a human reader.
const FIELD_DEFS = [
  { key: 'context', label: 'Bối cảnh & Thách thức', icon: Layers, box: 'box-context' },
  { key: 'goal', label: 'Mục tiêu chiến lược', icon: Target, box: 'box-goal' },
  { key: 'execution', label: 'Quy trình & Cách triển khai', icon: CheckCircle, box: 'box-execution full-width' },
  { key: 'results', label: 'Kết quả / Số liệu doanh thu', icon: TrendingUp, box: 'box-results full-width', highlight: true },
  { key: 'tactics', label: 'Bài học chiến thuật', icon: Lightbulb, box: 'box-tactics' },
  { key: 'replication', label: 'Quyền sổ tay: Cách tái tạo', icon: ArrowRight, box: 'box-replication' }
];

// Agent-input fields - nạp trực tiếp vào system prompt của agent phụ trách
// module này (xem apps/server/src/orchestrator/systemPrompt.js), không phải
// văn bản tường thuật cho người đọc.
const AGENT_FIELD_DEFS = [
  { key: 'rule', label: 'Rule — quy tắc bắt buộc', icon: ShieldCheck, placeholder: 'Những điều agent PHẢI/KHÔNG ĐƯỢC làm khi xử lý việc thuộc module này...' },
  { key: 'memory', label: 'Memory — ngữ cảnh cần nhớ', icon: Brain, placeholder: 'Thông tin nền, giọng thương hiệu, đối tượng khách hàng, quyết định trước đó agent cần nhớ...' },
  { key: 'skill', label: 'Skill — quy trình thao tác', icon: Wrench, placeholder: 'Các bước cụ thể agent làm theo, giống 1 skill/playbook đóng gói sẵn...' }
];

export default function ModuleCaseStudyPage({ module }) {
  const [data, setData] = useState(() => loadModuleCaseStudies(module));

  useEffect(() => {
    setData(loadModuleCaseStudies(module));
  }, [module]);

  const persist = (items) => {
    const next = { items, updatedAt: Date.now() };
    setData(next);
    saveModuleCaseStudies(module.id, next);
  };

  const updateField = (idx, field, value) => {
    persist(data.items.map((cs, i) => (i === idx ? { ...cs, [field]: value } : cs)));
  };

  const addCaseStudy = () => {
    persist([...data.items, createEmptyCaseStudy()]);
  };

  const deleteCaseStudy = (idx) => {
    persist(data.items.filter((_, i) => i !== idx));
  };

  const caseStudies = data.items;

  return (
    <div className="case-study-page">
      <div className="case-study-header-banner">
        <div className="banner-title-group">
          <h3><BookOpen size={20} /> Case Study Tiêu Biểu & Thực Chiến — {module.code}</h3>
          <p>Các ví dụ thực tế, số liệu thực chiến và quy trình tái tạo đã được chứng minh hiệu quả cho mô hình <strong>{module.title}</strong>.</p>
        </div>
        <div className="banner-badge">
          <Sparkles size={14} /> {caseStudies.length} Case Studies Độc Quyền
        </div>
      </div>

      <div className="case-studies-list">
        {caseStudies.map((cs, idx) => (
          <div key={idx} className="case-study-card">
            <div className="cs-card-header">
              <div className="cs-card-header-top">
                <div className="cs-badge">Case Study #{idx + 1}</div>
                <button className="cs-delete-btn" onClick={() => deleteCaseStudy(idx)} title="Xoá case study này">
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="text"
                className="cs-title-input"
                placeholder="Tiêu đề case study..."
                value={cs.title}
                onChange={e => updateField(idx, 'title', e.target.value)}
              />
              <input
                type="text"
                className="cs-subtitle-input"
                placeholder="Mô tả ngắn (subtitle)..."
                value={cs.subtitle}
                onChange={e => updateField(idx, 'subtitle', e.target.value)}
              />
            </div>

            <div className="cs-card-grid">
              {FIELD_DEFS.map(({ key, label, icon: Icon, box, highlight }) => (
                <div key={key} className={`cs-info-box ${box}`}>
                  <h5><Icon size={14} /> {label}</h5>
                  <textarea
                    className={`cs-field-textarea ${highlight ? 'cs-results-textarea' : ''}`}
                    placeholder={`Điền ${label.toLowerCase()}...`}
                    value={cs[key]}
                    onChange={e => updateField(idx, key, e.target.value)}
                    rows={highlight ? 2 : 3}
                  />
                </div>
              ))}
            </div>

            <div className="cs-agent-input-section">
              <div className="cs-agent-input-header">
                <Bot size={14} /> Đầu vào cho Agent — nạp thẳng vào bộ nhớ/hệ thống khi agent lập kế hoạch
              </div>
              <div className="cs-card-grid">
                {AGENT_FIELD_DEFS.map(({ key, label, icon: Icon, placeholder }) => (
                  <div key={key} className="cs-info-box cs-agent-info-box full-width">
                    <h5><Icon size={14} /> {label}</h5>
                    <textarea
                      className="cs-field-textarea"
                      placeholder={placeholder}
                      value={cs[key] || ''}
                      onChange={e => updateField(idx, key, e.target.value)}
                      rows={3}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {caseStudies.length === 0 && (
          <div className="chat-empty-state">
            <span className="page-icon-badge accent-indigo lg"><BookOpen size={26} /></span>
            <p>Chưa có case study nào. Dùng nút "Thêm Case Study" bên dưới để bắt đầu.</p>
          </div>
        )}

        <button className="add-kr-btn" onClick={addCaseStudy}>
          <Plus size={15} /> Thêm Case Study
        </button>
      </div>
    </div>
  );
}
