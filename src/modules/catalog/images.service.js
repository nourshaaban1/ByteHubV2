import fs from 'node:fs';
import path from 'node:path';
import env from '../../config/env.js';
import { similarity, normalizeKey } from '../../shared/utils/text.js';
import { notFound, badRequest } from '../../shared/errors/AppError.js';
import Product from '../product/product.model.js';
import { IMAGE_FOLDER_HINTS } from './config/taxonomy.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.gif', '.avif']);

export const DEFAULT_THRESHOLD = 0.55;

const projectRoot = () => process.cwd();

const resolveRoot = (root = env.ingestion.imageRoot) =>
  path.isAbsolute(root) ? root : path.join(projectRoot(), root);

const toPosix = (value) => value.replace(/\\/g, '/');

/** Every image under `dir`, as paths relative to the catalog root. */
function collectImages(dir, absoluteRoot) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  const nested = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nested.push(...collectImages(full, absoluteRoot));
      continue;
    }
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(toPosix(path.relative(absoluteRoot, full)));
  }

  return [...files, ...nested];
}

/**
 * Walks `Catalog/<Category>/<Product>/` into one entry per product folder.
 * The folder tree is a second, independent source of product identity: it
 * names products the spreadsheets spell differently.
 */
export function scanImageFolders(root = env.ingestion.imageRoot) {
  const absoluteRoot = resolveRoot(root);
  if (!fs.existsSync(absoluteRoot)) return [];

  const folders = [];

  for (const categoryEntry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (!categoryEntry.isDirectory()) continue;
    const categoryPath = path.join(absoluteRoot, categoryEntry.name);

    for (const productEntry of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (!productEntry.isDirectory()) continue;
      const productPath = path.join(categoryPath, productEntry.name);

      // Descends into colour sub-folders. Liberty 5 keeps its photos under
      // Black/, Blue/, Golden/ and White/, and a flat read found none of them —
      // the product looked photoless and never appeared in this list at all.
      const images = collectImages(productPath, absoluteRoot);

      if (images.length === 0) continue;

      const hint = IMAGE_FOLDER_HINTS[categoryEntry.name] ?? { category: categoryEntry.name };

      folders.push({
        id: `${categoryEntry.name}/${productEntry.name}`,
        folder: productEntry.name,
        category_folder: categoryEntry.name,
        category: hint.category,
        subcategory: hint.subcategory ?? null,
        images,
      });
    }
  }

  return folders;
}

/** True when every token of the shorter name appears in the longer one. */
function isTokenSubset(a, b) {
  const shortTokens = a.split(' ').filter(Boolean);
  const longTokens = new Set(b.split(' ').filter(Boolean));
  if (shortTokens.length === 0) return false;
  return shortTokens.every((token) => longTokens.has(token));
}

/**
 * Scores a folder against a product. Compared with both the product name and
 * its SKU — folders like "Anker Cable 322 USB-A to USB-C 3ft" carry the model
 * number inside the name.
 */
export function scoreMatch(folder, product) {
  const folderKey = normalizeKey(folder.folder);
  const nameKey = normalizeKey(product.name);
  const productSkuKey = normalizeKey(product.sku ?? '');

  let score = Math.max(
    similarity(folder.folder, product.name),
    product.sku ? similarity(folder.folder, product.sku) : 0,
  );

  // A folder whose text contains the SKU outright is a near-certain match.
  if (productSkuKey.length >= 4 && folderKey.includes(productSkuKey)) {
    score = Math.max(score, 0.95);
  }

  // A short folder name ("VGA", "HDMI 4K") shares few tokens with a full
  // product title, so plain similarity under-rates it badly. Full containment
  // in either direction is strong evidence on its own.
  const shorter = folderKey.length <= nameKey.length ? folderKey : nameKey;
  const longer = shorter === folderKey ? nameKey : folderKey;
  if (isTokenSubset(shorter, longer)) score = Math.max(score, 0.78);

  // Category and subcategory corroborate; they never carry a match alone.
  if (product.category && folder.category === product.category) score += 0.08;
  if (folder.subcategory && product.subcategory === folder.subcategory) score += 0.06;
  if (folder.subcategory && product.subcategory && product.subcategory !== folder.subcategory) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Greedy one-to-one assignment, best score first.
 *
 * A plain per-folder argmax lets two folders claim the same product, and the
 * second silently overwrites the first — which is how a product ends up
 * showing another product's photos.
 */
export function assignFolders(folders, products, threshold = DEFAULT_THRESHOLD) {
  const candidates = [];
  for (const folder of folders) {
    for (const product of products) {
      const score = scoreMatch(folder, product);
      if (score >= threshold) candidates.push({ score, folder, product });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const claimedFolders = new Set();
  const claimedProducts = new Set();
  const matches = [];

  for (const candidate of candidates) {
    const productId = String(candidate.product._id);
    if (claimedFolders.has(candidate.folder.id) || claimedProducts.has(productId)) continue;
    claimedFolders.add(candidate.folder.id);
    claimedProducts.add(productId);
    matches.push(candidate);
  }

  const unmatched = folders.filter((folder) => !claimedFolders.has(folder.id));

  return { matches, unmatched };
}

/**
 * Image records as stored on a product.
 *
 * The URL uses the configured public prefix rather than the directory name:
 * the catalog folder has been renamed once already, and a URL built from it
 * would have broken every stored image. Segments are percent-encoded because
 * these folder names contain spaces and commas.
 */
const imagePayload = (folder) =>
  folder.images.map((imagePath, index) => ({
    path: imagePath,
    url: `${env.ingestion.imagePublicPath}/${imagePath.split('/').map(encodeURIComponent).join('/')}`,
    is_primary: index === 0,
    source: folder.id,
  }));

const productProjection = 'name sku brand category subcategory images status.is_active';

/**
 * The image-management view: every folder, whether it is already linked, and
 * ranked suggestions for the ones that are not.
 *
 * Suggestions are surfaced, never applied. Linking is always a human decision.
 */
export async function overview({ threshold = DEFAULT_THRESHOLD, suggestions = 3 } = {}) {
  const folders = scanImageFolders();
  const products = await Product.find().select(productProjection).lean();

  // Existing links are recorded on the product's images[].source.
  const linkedByFolder = new Map();
  for (const product of products) {
    const source = product.images?.[0]?.source;
    if (source) linkedByFolder.set(source, product);
  }

  // Archived products are not a gap to chase — they are deliberately retired.
  const unlinkedProducts = products.filter(
    (product) => !product.images?.length && product.status?.is_active !== false,
  );

  const rows = folders.map((folder) => {
    const linked = linkedByFolder.get(folder.id) ?? null;

    const ranked = linked
      ? []
      : products
          .map((product) => ({ product, score: scoreMatch(folder, product) }))
          .filter((entry) => entry.score > 0.2)
          .sort((a, b) => b.score - a.score)
          .slice(0, suggestions)
          .map((entry) => ({
            _id: entry.product._id,
            name: entry.product.name,
            sku: entry.product.sku,
            brand: entry.product.brand,
            category: entry.product.category,
            score: Number(entry.score.toFixed(3)),
            above_threshold: entry.score >= threshold,
          }));

    return {
      ...folder,
      image_count: folder.images.length,
      linked_product: linked
        ? { _id: linked._id, name: linked.name, sku: linked.sku, brand: linked.brand }
        : null,
      suggestions: ranked,
    };
  });

  return {
    threshold,
    totals: {
      folders: folders.length,
      images: folders.reduce((sum, folder) => sum + folder.images.length, 0),
      linked: rows.filter((row) => row.linked_product).length,
      unlinked: rows.filter((row) => !row.linked_product).length,
      products_without_images: unlinkedProducts.length,
    },
    folders: rows,
    products_without_images: unlinkedProducts.map((product) => ({
      _id: product._id,
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      category: product.category,
    })),
  };
}

/** Attaches one folder's images to one product, replacing whatever was there. */
export async function linkFolder(folderId, productId) {
  const folder = scanImageFolders().find((entry) => entry.id === folderId);
  if (!folder) throw notFound('Image folder', folderId);

  const product = await Product.findById(productId);
  if (!product) throw notFound('Product', productId);

  // One folder, one product: release any other product holding this folder.
  await Product.updateMany(
    { 'images.source': folderId, _id: { $ne: product._id } },
    { $set: { images: [] } },
  );

  product.set('images', imagePayload(folder));
  await product.save();

  return {
    folder: folderId,
    product: { _id: product._id, name: product.name, sku: product.sku },
    images_linked: folder.images.length,
  };
}

export async function unlinkProduct(productId) {
  const product = await Product.findById(productId);
  if (!product) throw notFound('Product', productId);

  const removed = product.images?.length ?? 0;
  product.set('images', []);
  await product.save();

  return { product: productId, images_removed: removed };
}

/**
 * Runs the automatic matcher. `dryRun` reports what it would do without
 * writing — the UI always previews before committing.
 */
export async function autoLink({ threshold = DEFAULT_THRESHOLD, dryRun = true } = {}) {
  if (threshold < 0.3) {
    throw badRequest('Threshold below 0.3 would attach images to unrelated products', { threshold });
  }

  const folders = scanImageFolders();
  const products = await Product.find().select(productProjection).lean();
  const { matches, unmatched } = assignFolders(folders, products, threshold);

  if (!dryRun && matches.length > 0) {
    await Product.bulkWrite(
      matches.map(({ folder, product }) => ({
        updateOne: { filter: { _id: product._id }, update: { $set: { images: imagePayload(folder) } } },
      })),
      { ordered: false },
    );
  }

  return {
    dry_run: dryRun,
    threshold,
    linked: matches.length,
    images: matches.reduce((sum, match) => sum + match.folder.images.length, 0),
    matches: matches.map(({ score, folder, product }) => ({
      score: Number(score.toFixed(3)),
      folder: folder.id,
      images: folder.images.length,
      product: { _id: product._id, name: product.name, sku: product.sku },
    })),
    unmatched: unmatched.map((folder) => ({
      folder: folder.id,
      images: folder.images.length,
      best_score: Number(
        products.reduce((top, product) => Math.max(top, scoreMatch(folder, product)), 0).toFixed(3),
      ),
    })),
  };
}

export default { overview, linkFolder, unlinkProduct, autoLink, scanImageFolders, scoreMatch, assignFolders };
