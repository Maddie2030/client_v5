import type {
  ScrapeRequest,
  ScrapeResponse,
  HistoryResponse,
  HistoryEntryDetail,
  SaveRequest,
  SaveResponse,
  ImageItem,
  EditableTextField,
} from '@/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {
      // response wasn't JSON, use default message
    }
    throw new Error(message);
  }
  const data = await response.json();
  return data as T;
}

export async function scrape(req: ScrapeRequest): Promise<ScrapeResponse> {
  return request<ScrapeResponse>(`${API_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function saveScrape(req: SaveRequest): Promise<SaveResponse> {
  return request<SaveResponse>(`${API_BASE}/scrape/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function attachToParent(childId: string, parentId: string): Promise<{ success: boolean }> {
  return request(`${API_BASE}/scrape/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId, parentId }),
  });
}

export async function reorderChildren(parentId: string, childIds: string[]): Promise<{ success: boolean }> {
  return request(`${API_BASE}/scrape/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId, childIds }),
  });
}

export async function editRecord(
  id: string,
  payload: { editedText?: EditableTextField[]; editedImages?: ImageItem[] },
): Promise<{ success: boolean }> {
  return request(`${API_BASE}/scrape/edit/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getChildren(parentId: string): Promise<{ children: unknown[]; count: number }> {
  return request(`${API_BASE}/scrape/children/${parentId}`);
}

export async function getHistory(limit = 20, mode?: string, parentsOnly = false): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (mode) params.set('mode', mode);
  if (parentsOnly) params.set('parentsOnly', 'true');
  return request<HistoryResponse>(`${API_BASE}/history?${params}`);
}

export async function getHistoryEntry(id: string): Promise<HistoryEntryDetail> {
  return request(`${API_BASE}/history/${id}`);
}

export async function deleteHistoryEntry(id: string): Promise<{ success: boolean }> {
  return request(`${API_BASE}/history/${id}`, { method: 'DELETE' });
}

export async function clearHistory(): Promise<{ success: boolean }> {
  return request(`${API_BASE}/history`, { method: 'DELETE' });
}

export async function downloadImagesZip(images: ImageItem[], sourceUrl: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/download/images-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, sourceUrl }),
  });
  if (!response.ok) {
    throw new Error('Failed to download images zip');
  }
  return response.blob();
}
