import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../lib/cn';

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: number;
}

export default function CopyButton({ value, className, iconSize = 14 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('클립보드에 복사되었습니다.', { id: 'copy-success' });
      
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error('복사에 실패했습니다.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5 transition-colors',
        copied 
          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
        className
      )}
      title="복사하기"
    >
      {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
    </button>
  );
}
