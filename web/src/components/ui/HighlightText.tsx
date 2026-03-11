import { useMemo } from 'react';

interface HighlightTextProps {
  text: string;
  highlight: string;
  className?: string;
  highlightClassName?: string;
}

export default function HighlightText({ 
  text, 
  highlight, 
  className = '', 
  highlightClassName = 'bg-yellow-500/30 text-yellow-200 rounded px-0.5' 
}: HighlightTextProps) {
  
  const parts = useMemo(() => {
    if (!highlight.trim()) {
      return [{ text, isHighlight: false }];
    }

    // 대소문자를 구분하지 않고 하이라이트할 문자열을 찾기 위한 정규식
    try {
      const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const tokens = text.split(regex);

      return tokens.map((token) => ({
        text: token,
        // split된 결과 중 매칭된 부분은 검색어와 길이/내용이(대소문자 무시) 같음
        isHighlight: token.toLowerCase() === highlight.toLowerCase()
      }));
    } catch (e) {
      // 정규식 생성 실패 시 안전하게 원본 텍스트 반환
      return [{ text, isHighlight: false }];
    }
  }, [text, highlight]);

  return (
    <span className={className}>
      {parts.map((part, i) => (
        part.isHighlight ? (
          <mark key={i} className={highlightClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </span>
  );
}
