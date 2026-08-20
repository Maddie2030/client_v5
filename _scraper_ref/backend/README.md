# ScrapeHub Backend

Node.js/Express backend for the hybrid web scraper.

## Architecture

- **Express** — REST API server
- **MongoDB (Mongoose)** — Scrape history persistence
- **Cheerio** — HTML parsing and extraction
- **Mozilla Readability** — Article/reader-mode extraction
- **pdf-parse** — PDF text extraction
- **Axios** — HTTP fetching

## API Endpoints

### `POST /api/scrape`
Scrape a URL with a specified mode.

**Body:**
```json
{
  "url": "https://example.com",
  "mode": "article",
  "recursive": false,
  "maxDepth": 1,
  "maxPages": 10
}
```

Modes: `article`, `text`, `links`, `images`, `metadata`, `pdf`, `full`

### `GET /api/history`
Get scrape history (query: `?limit=20&mode=article`)

### `GET /api/history/:id`
Get a specific history entry with full result

### `DELETE /api/history/:id`
Delete a history entry

### `DELETE /api/history`
Clear all history

### `GET /api/health`
Health check

## Running

```bash
npm install
npm start
```

Or with Docker (from project root):
```bash
docker-compose up
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/scrapper` | MongoDB connection string |
