import mongoose from 'mongoose';
import { IMPORT_STATUS, SOURCE_TYPES } from '../../shared/constants/enums.js';

const { Schema } = mongoose;

const SheetReportSchema = new Schema(
  {
    name: String,
    processed: { type: Boolean, default: false },
    skip_reason: { type: String, default: null },
    header_row: { type: Number, default: null },
    currency: { type: String, default: null },
    mapping_confidence: { type: Number, default: null },
    mapped_columns: [
      new Schema(
        { header: String, field: String, confidence: Number, strategy: String, currency: String },
        { _id: false },
      ),
    ],
    unmapped_columns: { type: [String], default: [] },
    rows_total: { type: Number, default: 0 },
    rows_data: { type: Number, default: 0 },
    rows_skipped: { type: Number, default: 0 },
    products_created: { type: Number, default: 0 },
    products_updated: { type: Number, default: 0 },
    products_unchanged: { type: Number, default: 0 },
  },
  { _id: false },
);

const ImportRunSchema = new Schema(
  {
    source_catalog: { type: String, required: true },
    source_file: { type: String, default: null },
    source_type: { type: String, enum: SOURCE_TYPES, default: 'xlsx' },
    status: { type: String, enum: IMPORT_STATUS, default: 'pending' },
    dry_run: { type: Boolean, default: false },

    started_at: { type: Date, default: Date.now },
    finished_at: { type: Date, default: null },
    duration_ms: { type: Number, default: null },

    totals: {
      sheets: { type: Number, default: 0 },
      sheets_processed: { type: Number, default: 0 },
      rows_read: { type: Number, default: 0 },
      rows_data: { type: Number, default: 0 },
      rows_skipped: { type: Number, default: 0 },
      products_created: { type: Number, default: 0 },
      products_updated: { type: Number, default: 0 },
      products_unchanged: { type: Number, default: 0 },
      duplicates_in_file: { type: Number, default: 0 },
      locked_fields_preserved: { type: Number, default: 0 },
    },

    quality: {
      average_score: { type: Number, default: null },
      issues_by_code: { type: Schema.Types.Mixed, default: {} },
      issues_by_severity: { type: Schema.Types.Mixed, default: {} },
    },

    sheets: { type: [SheetReportSchema], default: [] },
    skipped_rows: {
      type: [new Schema({ sheet: String, row: Number, reason: String }, { _id: false })],
      default: [],
    },
    // Not named `errors`: that is a reserved Mongoose document path.
    failures: {
      type: [new Schema({ sheet: String, row: Number, message: String }, { _id: false })],
      default: [],
    },
    triggered_by: { type: String, default: 'cli' },
  },
  { timestamps: true, versionKey: false },
);

ImportRunSchema.index({ createdAt: -1 });
ImportRunSchema.index({ source_catalog: 1, createdAt: -1 });

export const ImportRun = mongoose.models.ImportRun ?? mongoose.model('ImportRun', ImportRunSchema);

export default ImportRun;
