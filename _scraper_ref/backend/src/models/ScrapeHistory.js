import mongoose from 'mongoose';

const scrapeHistorySchema = new mongoose.Schema(
  {
    url: { type: String, required: true, index: true },
    mode: { type: String, required: true, enum: ['article', 'text', 'links', 'images', 'metadata', 'pdf', 'full'] },
    title: { type: String, default: null },
    summary: { type: String, default: null },
    status: { type: String, required: true, enum: ['success', 'error'], default: 'success' },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    position: { type: Number, default: null },
    editedImages: { type: mongoose.Schema.Types.Mixed, default: null },
    editedText: { type: mongoose.Schema.Types.Mixed, default: null },
    saved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

scrapeHistorySchema.index({ createdAt: -1 });
scrapeHistorySchema.index({ parentId: 1, position: 1 });

export default mongoose.model('ScrapeHistory', scrapeHistorySchema);
