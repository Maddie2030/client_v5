import { MessageCircle, Reply, Trash2 } from "lucide-react";

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

function UserAvatar({ username }) {
  const initials = username
    .split(/[\s_]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-xs font-semibold text-brand-300"
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}

export default function CommentItem({
  comment,
  replies = [],
  currentUser,
  onReply,
  onDelete,
}) {
  return (
    <article className="group">
      <div className="flex gap-3">
        <UserAvatar username={comment.author_username} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-ink-100">{comment.author_username}</span>
            <time className="text-xs text-ink-500" dateTime={comment.created_at}>
              {relativeTime(comment.created_at)}
            </time>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">
            {comment.content}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-brand-300"
            >
              <Reply size={14} /> Reply
            </button>
            {currentUser?.id === comment.user_id && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                className="inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-red-300"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>

          {replies.length > 0 && (
            <div className="mt-4 space-y-4 border-l border-ink-800 pl-4">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-3">
                  <UserAvatar username={reply.author_username} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-ink-100">{reply.author_username}</span>
                      <time className="text-xs text-ink-500" dateTime={reply.created_at}>
                        {relativeTime(reply.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">
                      {reply.content}
                    </p>
                    {currentUser?.id === reply.user_id && (
                      <button
                        type="button"
                        onClick={() => onDelete(reply)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-red-300"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}