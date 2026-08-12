export const ok = (res, data, meta) =>
  res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = (res, data, meta) =>
  res.status(201).json({ success: true, data, ...(meta ? { meta } : {}) });

export const accepted = (res, data, meta) =>
  res.status(202).json({ success: true, data, ...(meta ? { meta } : {}) });

export const noContent = (res) => res.status(204).send();

export const paginated = (res, { items, total, page, limit }) =>
  res.status(200).json({
    success: true,
    data: items,
    meta: {
      total,
      page,
      limit,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });

export default { ok, created, accepted, noContent, paginated };
