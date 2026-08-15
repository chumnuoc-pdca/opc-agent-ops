import React, { useState, useEffect } from 'react';

export default function GlobalTooltip() {
  const [tooltipState, setTooltipState] = useState({
    visible: false,
    text: '',
    top: 0,
    left: 0
  });

  useEffect(() => {
    const handleMouseOver = (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;

      const text = target.getAttribute('data-tooltip');
      if (!text) return;

      const rect = target.getBoundingClientRect();
      // Position above the hovered element
      const left = rect.left + rect.width / 2;
      const top = Math.max(10, rect.top - 12); // slightly above element

      setTooltipState({
        visible: true,
        text,
        top,
        left
      });
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        setTooltipState(prev => ({ ...prev, visible: false }));
      }
    };

    const handleScroll = () => {
      setTooltipState(prev => ({ ...prev, visible: false }));
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  if (!tooltipState.visible || !tooltipState.text) return null;

  return (
    <div
      className="global-hover-tooltip-box"
      style={{
        position: 'fixed',
        top: `${tooltipState.top}px`,
        left: `${tooltipState.left}px`,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999999
      }}
    >
      <div className="tooltip-text-content">{tooltipState.text}</div>
      <div className="tooltip-arrow" />
    </div>
  );
}
