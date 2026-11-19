import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  listTimeBlocksForDate, createTimeBlock, updateTimeBlock, deleteTimeBlock
} from '../utils/timeBlockOperations';

// Phase 15: lưới giờ kéo-thả thật (kiểu Google Calendar), chỉ cho Daily view
// desktop. Kéo từ khay "Chưa xếp lịch" vào lưới -> tạo time_block; kéo 1
// block đã có -> đổi giờ bắt đầu; kéo tay cầm dưới đáy -> đổi thời lượng.
// TUYỆT ĐỐI không đụng task.dueDate ở bất kỳ thao tác nào trong file này -
// đây chính là lý do Phase 15 tồn tại (xem plan).
const HOUR_START = 6;
const HOUR_END = 22;
const ROW_HEIGHT = 60; // px/giờ
const SNAP_MINUTES = 15;
const MIN_DURATION_MINUTES = 15;
const GRID_HEIGHT = (HOUR_END - HOUR_START) * ROW_HEIGHT;

const dayBaseMs = (dateISO) => new Date(`${dateISO}T00:00:00`).getTime();
const minutesFromGridStart = (ms, dateISO) => (ms - dayBaseMs(dateISO)) / 60000 - HOUR_START * 60;
const msFromGridMinutes = (dateISO, minutes) => dayBaseMs(dateISO) + (HOUR_START * 60 + minutes) * 60000;
const snap = (minutes) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
const clampStart = (minutes) => Math.max(0, Math.min((HOUR_END - HOUR_START) * 60 - MIN_DURATION_MINUTES, minutes));

const formatHM = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function TimeBlockGrid({ dateISO, unscheduledItems, onOpenTask, refreshSignal }) {
  const [blocks, setBlocks] = useState([]);
  const gridRef = useRef(null);
  // Trạng thái kéo hiện tại - chỉ 1 loại tại 1 thời điểm: 'create' (từ khay)
  // | 'move' (đổi giờ bắt đầu) | 'resize' (đổi thời lượng). null = không kéo.
  const [drag, setDrag] = useState(null);

  const loadBlocks = useCallback(() => {
    listTimeBlocksForDate(dateISO).then(setBlocks).catch(() => {});
  }, [dateISO]);

  useEffect(() => { loadBlocks(); }, [loadBlocks, refreshSignal]);

  const getGridMinutesFromClientY = useCallback((clientY) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clientY - rect.top;
    return snap((y / ROW_HEIGHT) * 60);
  }, []);

  // Chỉ tạo block khi con trỏ THỰC SỰ đang ở trong vùng lưới lúc thả chuột -
  // tránh trường hợp bắt đầu kéo từ khay rồi thả ngay gần đó (chưa vào lưới)
  // mà vẫn lỡ tạo lịch.
  const isClientPointInGrid = useCallback((clientX, clientY) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  // ---- Kéo từ khay "Chưa xếp lịch" để tạo block mới ----
  const startCreateDrag = (e, item) => {
    e.preventDefault();
    setDrag({ type: 'create', task: item.task, module: item.module, previewStartMin: null });
  };

  // ---- Kéo 1 block đã có để đổi giờ bắt đầu ----
  const startMoveDrag = (e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const startMin = minutesFromGridStart(block.startsAt, dateISO);
    const durationMin = (block.endsAt - block.startsAt) / 60000;
    const grabOffsetMin = getGridMinutesFromClientY(e.clientY) - startMin;
    setDrag({
      type: 'move', block, durationMin, grabOffsetMin, previewStartMin: startMin,
      moved: false, initialClientY: e.clientY
    });
  };

  // ---- Kéo tay cầm dưới đáy để đổi thời lượng ----
  const startResizeDrag = (e, block) => {
    e.preventDefault();
    e.stopPropagation();
    const startMin = minutesFromGridStart(block.startsAt, dateISO);
    setDrag({ type: 'resize', block, startMin, previewEndMin: minutesFromGridStart(block.endsAt, dateISO) });
  };

  useEffect(() => {
    if (!drag) return undefined;

    const handleMove = (e) => {
      const minutesAtCursor = getGridMinutesFromClientY(e.clientY);
      if (drag.type === 'create') {
        const overGrid = isClientPointInGrid(e.clientX, e.clientY);
        setDrag((d) => ({ ...d, previewStartMin: overGrid ? clampStart(minutesAtCursor) : null }));
      } else if (drag.type === 'move') {
        const nextStart = clampStart(minutesAtCursor - drag.grabOffsetMin);
        // Ngưỡng 4px để phân biệt click (mở chi tiết) với kéo thật (đổi giờ)
        // - chuột người dùng luôn rung nhẹ vài px ngay cả khi chỉ định click.
        const movedEnough = Math.abs(e.clientY - drag.initialClientY) > 4;
        setDrag((d) => ({ ...d, previewStartMin: nextStart, moved: d.moved || movedEnough }));
      } else if (drag.type === 'resize') {
        const nextEnd = Math.max(drag.startMin + MIN_DURATION_MINUTES, minutesAtCursor);
        setDrag((d) => ({ ...d, previewEndMin: Math.min((HOUR_END - HOUR_START) * 60, nextEnd) }));
      }
    };

    const handleUp = async () => {
      try {
        if (drag.type === 'create' && drag.previewStartMin != null) {
          const startsAt = msFromGridMinutes(dateISO, drag.previewStartMin);
          const endsAt = startsAt + 60 * 60000;
          await createTimeBlock(drag.task.id, startsAt, endsAt);
          loadBlocks();
        } else if (drag.type === 'move' && drag.moved) {
          const startsAt = msFromGridMinutes(dateISO, drag.previewStartMin);
          const endsAt = startsAt + drag.durationMin * 60000;
          await updateTimeBlock(drag.block.id, { startsAt, endsAt });
          loadBlocks();
        } else if (drag.type === 'resize') {
          const endsAt = msFromGridMinutes(dateISO, drag.previewEndMin);
          await updateTimeBlock(drag.block.id, { endsAt });
          loadBlocks();
        } else if (drag.type === 'move' && !drag.moved) {
          // Không thực sự kéo (chỉ click) - mở chi tiết task thay vì gọi API.
          onOpenTask?.(drag.block.task, drag.block);
        }
      } catch (err) {
        alert(err.message || 'Không lưu được thay đổi lịch làm việc.');
      }
      setDrag(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, dateISO, getGridMinutesFromClientY, isClientPointInGrid, loadBlocks, onOpenTask]);

  const handleDeleteBlock = async (e, blockId) => {
    e.stopPropagation();
    try {
      await deleteTimeBlock(blockId);
      loadBlocks();
    } catch (err) {
      alert(err.message || 'Không xoá được lịch làm việc.');
    }
  };

  const hourRows = useMemo(() => {
    const rows = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) rows.push(h);
    return rows;
  }, []);

  const now = new Date();
  const isToday = dateISO === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMinutes = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
  const showNowLine = isToday && nowMinutes >= 0 && nowMinutes <= (HOUR_END - HOUR_START) * 60;

  const scheduledTaskIds = useMemo(() => new Set(blocks.map(b => b.taskId)), [blocks]);
  const unscheduled = (unscheduledItems || []).filter(({ task }) => !scheduledTaskIds.has(task.id));

  return (
    <div className="time-block-layout">
      <div className="time-block-unscheduled">
        <div className="time-block-unscheduled-title">Chưa xếp lịch ({unscheduled.length})</div>
        {unscheduled.length === 0 ? (
          <p className="time-block-unscheduled-empty">Mọi việc hôm nay đã được xếp lịch.</p>
        ) : (
          <div className="time-block-unscheduled-list">
            {unscheduled.map(({ module, task }) => (
              <div
                key={task.id}
                className={`time-block-tray-chip accent-${module.accent || 'indigo'}`}
                onMouseDown={(e) => startCreateDrag(e, { task, module })}
                title="Kéo vào lưới giờ bên phải để xếp lịch"
              >
                <span className="chip-code-badge">{task.code || module.code}</span>
                <span className="chip-text-content">{task.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="time-block-grid-scroll">
        <div className="time-block-grid" ref={gridRef} style={{ height: GRID_HEIGHT }}>
          {hourRows.map((h) => (
            <div key={h} className="time-block-hour-row" style={{ top: (h - HOUR_START) * ROW_HEIGHT }}>
              <span className="time-block-hour-label">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}

          {showNowLine && (
            <div className="time-block-now-line" style={{ top: (nowMinutes / 60) * ROW_HEIGHT }} />
          )}

          {blocks.map((block) => {
            const isDraggingThis = drag && drag.block?.id === block.id;
            const startMin = isDraggingThis && drag.type === 'move' ? drag.previewStartMin : minutesFromGridStart(block.startsAt, dateISO);
            const endMin = isDraggingThis && drag.type === 'resize' ? drag.previewEndMin : minutesFromGridStart(block.endsAt, dateISO);
            const top = (startMin / 60) * ROW_HEIGHT;
            const height = Math.max(18, ((endMin - startMin) / 60) * ROW_HEIGHT);
            const startsAtPreview = isDraggingThis && drag.type === 'move' ? msFromGridMinutes(dateISO, drag.previewStartMin) : block.startsAt;
            const endsAtPreview = isDraggingThis && drag.type === 'resize' ? msFromGridMinutes(dateISO, drag.previewEndMin) : block.endsAt;

            return (
              <div
                key={block.id}
                className={`time-block-item accent-${block.task.moduleAccent || 'indigo'} ${isDraggingThis ? 'dragging' : ''}`}
                style={{ top, height }}
                onMouseDown={(e) => startMoveDrag(e, block)}
              >
                <button type="button" className="time-block-remove-btn" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleDeleteBlock(e, block.id)} title="Bỏ lịch">
                  <X size={11} />
                </button>
                <span className="time-block-item-code">{block.task.code}</span>
                <span className="time-block-item-title">{block.task.content}</span>
                <span className="time-block-item-time">{formatHM(startsAtPreview)}–{formatHM(endsAtPreview)}</span>
                <div className="time-block-resize-handle" onMouseDown={(e) => startResizeDrag(e, block)} />
              </div>
            );
          })}

          {drag?.type === 'create' && drag.previewStartMin != null && (
            <div
              className="time-block-item accent-indigo drag-ghost"
              style={{ top: (drag.previewStartMin / 60) * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <span className="time-block-item-code">{drag.task.code}</span>
              <span className="time-block-item-title">{drag.task.content}</span>
              <span className="time-block-item-time">
                {formatHM(msFromGridMinutes(dateISO, drag.previewStartMin))}–{formatHM(msFromGridMinutes(dateISO, drag.previewStartMin + 60))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
