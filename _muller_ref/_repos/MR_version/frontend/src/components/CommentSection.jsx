import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle, MessageCircle, Send } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import CommentItem from "./CommentItem.jsx";

export default function CommentSection({ seriesId, chapterId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setComments(await api.listComments({ seriesId, chapterId }));
    } catch (err) {
      setError(err?.detail || "We couldn't load the comments.");
    } finally {
      setLoading(false);
    }
  }, [chapterId, seriesId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const repliesByParent = useMemo(() => {
    const grouped = new Map();
    for (const comment of comments) {
      if (!comment.parent_id) continue;
      const replies = grouped.get(comment.parent_id) || [];
      replies.push(comment);
      grouped.set(comment.parent_id, replies);
    }
    return grouped;
  }, [comments]);

  const topLevelComments = comments.filter((comment) => !comment.parent_id);

  const submitComment = async (event) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !user) return;

    setSubmitting(true);
    setError("");
    try {
      const created = await api.createComment({
        content: trimmed,
        series_id: seriesId,
        chapter_id: chapterId,
        parent_id: replyingTo?.id || null,
      });
      setComments((current) => [...current, created]);
      setContent("");
      setReplyingTo(null);
    } catch (err) {
      setError(err?.detail || "We couldn't post your comment.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (comment) => {
    setError("");
    try {
      await api.deleteComment(comment.id);
      setComments((current) =>
        current.filter((item) => item.id !== comment.id && item.parent_id !== comment.id),
      );
    } catch (err) {
      setError(err?.detail || "We couldn't delete that comment.");
    }
  };

  return (
    <section className="max-w-3xl mx-auto px-4 pb-12" aria-labelledby="comments-heading">
      <div className="border-t border-ink-800 pt-8">
        <div className="mb-5 flex items-center gap-2">
          <MessageCircle size={20} className="text-brand-400" />
          <h2 id="comments-heading" className="text-xl font-semibold text-ink-50">
            Discussion
          </h2>
          {!loading && <span className="text-sm text-ink-500">{comments.length}</span>}
        </div>

        {user ? (
          <form onSubmit={submitComment} className="mb-7">
            {replyingTo && (
              <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
                <span>Replying to {replyingTo.author_username}</span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-brand-400 hover:text-brand-300"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={replyingTo ? "Write a reply..." : "Share your thoughts..."}
                rows={3}
                maxLength={2000}
                className="min-w-0 flex-1 resize-y rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-brand-600"
              />
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="self-end rounded-lg bg-brand-600 p-2.5 text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={replyingTo ? "Post reply" : "Post comment"}
              >
                {submitting ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </form>
        ) : (
          <p className="mb-7 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm text-ink-400">
            <Link to="/login" className="text-brand-400 hover:text-brand-300">
              Sign in
            </Link>{" "}
            to join the discussion.
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            {error}
            <button type="button" onClick={loadComments} className="ml-2 underline hover:no-underline">
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-5" aria-label="Loading comments">
            {[1, 2].map((item) => (
              <div key={item} className="flex gap-3">
                <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-32 rounded" />
                  <div className="skeleton h-4 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : topLevelComments.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-500">
            No comments yet. Start the discussion.
          </div>
        ) : (
          <div className="space-y-7">
            {topLevelComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={repliesByParent.get(comment.id)}
                currentUser={user}
                onReply={setReplyingTo}
                onDelete={deleteComment}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}