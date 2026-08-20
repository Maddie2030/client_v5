const BASE = "";

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw data || new Error("Request failed");
  return data;
}

export const api = {
  // Auth
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  getProfile: () => request("/api/auth/profile"),
  updateProfile: (body) => request("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) }),

  // Catalog
  listSeries: (params = "") => request(`/api/catalog/series${params}`),
  getSeries: (slug, params = "") => request(`/api/catalog/series/${slug}${params}`),
  getGenres: () => request("/api/catalog/genres"),
  getChapter: (slug, chapterSlug) => request(`/api/catalog/series/${slug}/chapters/${chapterSlug}`),
  createSeries: (body) => request("/api/catalog/series", { method: "POST", body: JSON.stringify(body) }),
  updateSeries: (id, body) => request(`/api/catalog/series/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSeries: (id) => request(`/api/catalog/series/${id}`, { method: "DELETE" }),
  createChapter: (seriesId, body) => request(`/api/catalog/series/${seriesId}/chapters`, { method: "POST", body: JSON.stringify(body) }),
  deleteChapter: (seriesId, chapterId) => request(`/api/catalog/series/${seriesId}/chapters/${chapterId}`, { method: "DELETE" }),
  deleteChapterFiles: (seriesSlug, chapterSlug) => request(`/api/upload/${seriesSlug}/${chapterSlug}`, { method: "DELETE" }),
  publishChapter: (seriesId, chapterId) => request(`/api/catalog/series/${seriesId}/chapters/${chapterId}/publish`, { method: "POST" }),
  uploadSeriesThumbnail: (seriesSlug, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/upload/series/${seriesSlug}/thumbnail`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then((res) => {
      if (!res.ok) return res.json().then((data) => { throw data; });
      return res.json();
    });
  },
  deleteSeriesThumbnail: (seriesSlug, thumbnailName) => request(
    `/api/upload/series/${seriesSlug}/thumbnail/${encodeURIComponent(thumbnailName)}`,
    { method: "DELETE" },
  ),

  // Reader
  getReader: (seriesSlug, chapterSlug) => request(`/api/reader/${seriesSlug}/${chapterSlug}`),
  saveProgress: (chapterId, body) => request(`/api/reader/progress/${chapterId}`, { method: "POST", body: JSON.stringify(body) }),
  getProgress: (chapterId) => request(`/api/reader/progress/${chapterId}`),
  getHistory: (params = "") => request(`/api/reader/history${params}`),
  refreshToken: (path, oldToken) => request(`/api/token/refresh?path=${encodeURIComponent(path)}&old_token=${encodeURIComponent(oldToken)}`),

  // Social
  addBookmark: (seriesId) => request(`/api/social/bookmarks/${seriesId}`, { method: "POST" }),
  removeBookmark: (seriesId) => request(`/api/social/bookmarks/${seriesId}`, { method: "DELETE" }),
  listBookmarks: (params = "") => request(`/api/social/bookmarks${params}`),
  bookmarkStatus: (seriesId) => request(`/api/social/bookmarks/${seriesId}/status`),
  subscribe: (seriesId) => request(`/api/social/subscriptions/${seriesId}`, { method: "POST" }),
  unsubscribe: (seriesId) => request(`/api/social/subscriptions/${seriesId}`, { method: "DELETE" }),
  listSubscriptions: (params = "") => request(`/api/social/subscriptions${params}`),
  subscriptionStatus: (seriesId) => request(`/api/social/subscriptions/${seriesId}/status`),
  listComments: ({ seriesId, chapterId }) => {
    const params = new URLSearchParams();
    if (seriesId) params.set("seriesId", seriesId);
    if (chapterId) params.set("chapterId", chapterId);
    return request(`/api/social/comments?${params.toString()}`);
  },
  createComment: (body) => request("/api/social/comments", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  deleteComment: (id) => request(`/api/social/comments/${id}`, { method: "DELETE" }),

  // Notifications
  listNotifications: (params = "") => request(`/api/notifications${params}`),
  notificationCount: () => request("/api/notifications/count"),
  markRead: (id) => request(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => request("/api/notifications/read-all", { method: "POST" }),

  // Upload
  uploadChapter: (seriesSlug, chapterSlug, file, chapterNumber = 1, title = null) => {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({ chapter_number: String(chapterNumber) });
    if (title) params.set("title", title);
    return fetch(`/api/upload/upload/${seriesSlug}/${chapterSlug}?${params}`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then((res) => {
      if (!res.ok) return res.json().then((d) => { throw d; });
      return res.json();
    });
  },

  // Scraper — parent (series metadata from source)
  scrapeParent: (url) => request("/api/scraper/parent/scrape", { method: "POST", body: JSON.stringify({ url }) }),
  listScrapedParents: (params = "") => request(`/api/scraper/parent${params}`),
  getScrapedParent: (id) => request(`/api/scraper/parent/${id}`),
  getChapterList: (parentId) => request(`/api/scraper/parent/${parentId}/chapter-list`),
  downloadParentCover: (parentId) => request(`/api/scraper/parent/${parentId}/download-cover`, { method: "POST" }),
  deleteScrapedParent: (id) => request(`/api/scraper/parent/${id}`, { method: "DELETE" }),

  // Scraper — child (chapter images → MinIO)
  scrapeChild: (body) => request("/api/scraper/child/scrape", { method: "POST", body: JSON.stringify(body) }),
  listScrapedChildren: (parentId) => request(`/api/scraper/child/parent/${parentId}`),
  getScrapedChild: (id) => request(`/api/scraper/child/${id}`),
  getScrapedPageUrl: (childId, pageNumber) => `/api/scraper/child/${childId}/page/${pageNumber}`,
  deleteScrapedChild: (id) => request(`/api/scraper/child/${id}`, { method: "DELETE" }),

  // Scraper — sync to catalog (Postgres)
  syncParentToCatalog: (parentId) => request(`/api/scraper/sync/parent/${parentId}`, { method: "POST" }),
  syncChildToCatalog: (childId) => request(`/api/scraper/sync/child/${childId}`, { method: "POST" }),
  syncAllToCatalog: (parentId) => request(`/api/scraper/sync/parent/${parentId}/all`, { method: "POST" }),

  // MinIO asset URL builder (for covers and page images stored in MinIO)
  minioAssetUrl: (bucket, objectKey) => `/minio-assets/${bucket}/${objectKey}`,
};
