/**
 * @param {number} colCount - cantidad de columnas de la tabla real
 *   (debe coincidir con el <thead>, o el shimmer no se va a alinear).
 * @param {number} [rowCount=5] - cuántas filas fantasma mostrar.
 * @returns {string} HTML de <tr> con celdas shimmer.
 */

export function renderTableSkeleton(colCount, rowCount = 5) {
  const row = `
    <tr class="skeleton-row" aria-hidden="true">
      ${Array.from({ length: colCount }, () => '<td><span class="skeleton-block"></span></td>').join('')}
    </tr>
  `;
  return Array.from({ length: rowCount }, () => row).join('');
}

/**
 * @param {string} text - mensaje junto al spinner (ej. "Cargando historial...").
 * @param {number} colspan - colspan de la celda (cantidad de columnas de la tabla).
 * @returns {string} HTML de una única <tr> con spinner centrado.
 */
export function renderInlineSpinner(text, colspan) {
  return `
    <tr>
      <td colspan="${colspan}" class="table-loading">
        <span class="spinner" aria-hidden="true"></span>
        <span>${text}</span>
      </td>
    </tr>
  `;
}
