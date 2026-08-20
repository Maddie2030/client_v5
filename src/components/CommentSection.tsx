import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Send, Trash2, CornerDownRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getComments, createComment, deleteComment } from '@/lib/dataAccess';
import type { Comment } from '@/types';

interface Props {
  seriesId: string;
  chapterId?: string;
}

export default function CommentSection({ seriesId, chapterId }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getComments(seriesId, chapterId ?? null);
      setComments(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [seriesId, chapterId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent, parentId?: string) => {
    e.preventDefault();
    if (!user) return;
    if (parentId) {
      if (!replyContent.trim()) return;
      setSubmitting(true);
      try {
        await createComment(user.id, seriesId, replyContent, chapterId, parentId);
        setReplyContent('');
        setReplyTo(null);
        await load();
      } catch { /* ignore */ } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await createComment(user.id, seriesId, content, chapterId);
      setContent('');
      await load();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComment(id);
      await load();
    } catch { /* ignore */ }
  };

  const renderComment = (comment: Comment, depth = 0) => (
    <div key={comment.id} className={`${depth > 0 ? 'ml-6 border-l border-ink-800 pl-4' : ''}`}>
      <div className="card p-4 mb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/20 text-sm font-medium text-brand-400">
              {comment.username?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-ink-200">{comment.username}</span>
            <span className="text-xs text-ink-500">{new Date(comment.created_at).toLocaleDateString()}</span>
          </div>
          {user?.id === comment.user_id && (
            <button onClick={() => handleDelete(comment.id)} className="text-ink-500 hover:text-accent-400" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-ink-300">{comment.content}</p>
        {user && depth < 3 && (
          <button
            onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
            className="mt-2 flex items-center gap-1 text-xs text-ink-500 hover:text-brand-400"
          >
            <CornerDownRight className="h-3 w-3" /> Reply
          </button>
        )}
        {replyTo === comment.id && (
          <form onSubmit={(e) => handleSubmit(e, comment.id)} className="mt-3 flex gap-2">
            <input
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              className="input-field flex-1"
              autoFocus
            />
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        )}
      </div>
      {comment.children?.map((child) => renderComment(child, depth + 1))}
    </div>
  );

  return (
    <div className="mt-8">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="h-5 w-5 text-brand-500" /> Comments ({comments.length})
      </h3>

      {user ? (
        <form onSubmit={(e) => handleSubmit(e)} className="mb-6 flex gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={2000}
            className="input-field flex-1"
          />
          <button type="submit" disabled={submitting || !content.trim()} className="btn-primary">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      ) : (
        <p className="mb-6 rounded-lg bg-ink-800/50 px-4 py-3 text-center text-sm text-ink-400">
          Sign in to leave a comment.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-ink-500" /></div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">No comments yet. Be the first!</p>
      ) : (
        <div>{comments.map((c) => renderComment(c))}</div>
      )}
    </div>
  );
}
