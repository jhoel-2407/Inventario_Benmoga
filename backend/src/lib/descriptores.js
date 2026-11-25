// Descriptores visibles de un producto dentro de un inventario.
//
// Cada InventarioProducto guarda una copia exacta de los campos del maestro de
// su tienda. Si la fila es anterior a esa copia (o es una fila de prueba), se
// usan los descriptores del catálogo global Producto como respaldo.
export function descriptoresDeInventarioProducto(inventarioProducto) {
  const producto = inventarioProducto?.producto || {};
  const fuente = inventarioProducto?.descriptoresCargados
    ? inventarioProducto
    : producto;

  return {
    id: producto.id,
    codigoBarras: producto.codigoBarras,
    item: fuente.item ?? null,
    descripcion: fuente.descripcion ?? null,
    detalle1: fuente.detalle1 ?? null,
    detalle2: fuente.detalle2 ?? null,
    genero: fuente.genero ?? null,
    estilo: fuente.estilo ?? null,
    referencia: fuente.referencia ?? null,
    subGrupo: fuente.subGrupo ?? null,
  };
}
