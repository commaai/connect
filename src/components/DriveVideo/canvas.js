export function strokeRoundedRect(ctx, left, top, width, height, radius, strokeWidth, strokeStyle) {
  roundedRectPath(ctx, left, top, width, height, radius);

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
  ctx.closePath();
}

export function fillRoundedRect(ctx, left, top, width, height, radius, fillStyle) {
  roundedRectPath(ctx, left, top, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.closePath();
}

function roundedRectPath(ctx, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  const K = 4 * (Math.SQRT2 - 1) / 3;

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.bezierCurveTo(right + radius * (K - 1), top, right, top + radius * (1 - K), right, top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.bezierCurveTo(right, bottom + radius * (K - 1), right + radius * (K - 1), bottom, right - radius, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.bezierCurveTo(left + radius * (1 - K), bottom, left, bottom + radius * (K - 1), left, bottom - radius);
  ctx.lineTo(left, top + radius);
  ctx.bezierCurveTo(left, top + radius * (1 - K), left + radius * (1 - K), top, left + radius, top);
}
