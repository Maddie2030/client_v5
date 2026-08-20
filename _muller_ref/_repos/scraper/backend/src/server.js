import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import scrapeRoutes from './routes/scrape.js';
import historyRoutes from './routes/history.js';
import downloadRoutes from './routes/download.js';

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapper';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'scrapper-hybrid-backend' });
});

app.use('/api/scrape', scrapeRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/download', downloadRoutes);

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB:', MONGO_URI);
    app.listen(PORT, () => {
      console.log(`Scrapper backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
