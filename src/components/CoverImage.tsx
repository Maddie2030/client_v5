import { useEffect, useState } from 'react';
import { getPageImageURL } from '@/lib/dataAccess';
import { BookOpen } from 'lucide-react';

interface Props {
  path: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export default function CoverImage({ path, alt, className = '', fallbackClassName = '' }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSrc(null);
    if (!path) {
      setLoading(false);
      return;
    }
    if (path.startsWith('http')) {
      setSrc(path);
      setLoading(false);
      return;
    }
    (async () => {
      const url = await getPageImageURL(path);
      if (active) {
        setSrc(url);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [path]);

  if (loading) {
    return <div className={`animate-pulse bg-ink-800 ${className}`} />;
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-ink-800 ${className} ${fallbackClassName}`}>
        <BookOpen className="h-8 w-8 text-ink-600" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
