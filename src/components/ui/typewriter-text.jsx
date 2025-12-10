import React, { useState, useEffect } from 'react';

export const Typewriter = ({ text, speed = 100, loop = true, className = '' }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!Array.isArray(text)) {
      return;
    }

    const currentText = text[currentIndex] || '';
    
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentText.length) {
          setDisplayText(currentText.slice(0, displayText.length + 1));
        } else {
          // 완성 후 잠시 대기
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          setIsDeleting(false);
          if (loop) {
            setCurrentIndex((prev) => (prev + 1) % text.length);
          }
        }
      }
    }, isDeleting ? speed / 2 : speed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentIndex, text, speed, loop]);

  // 단일 텍스트인 경우
  if (!Array.isArray(text)) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">|</span>
    </span>
  );
};

