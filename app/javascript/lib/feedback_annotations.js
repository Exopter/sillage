/** @typedef {{x: number, y: number}} Point */

/** @param {CanvasRenderingContext2D} context @param {Point[][]} strokes @param {string} color */
export function paintAnnotations(context, strokes, color) {
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 3
  context.lineCap = "round"
  context.lineJoin = "round"
  for (const points of strokes) {
    if (!points.length) continue
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
    if (points.length === 1) {
      context.beginPath()
      context.arc(points[0].x, points[0].y, 1.5, 0, Math.PI * 2)
      context.fill()
    }
  }
}
