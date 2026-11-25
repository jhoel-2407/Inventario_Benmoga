// Datos compartidos por las pruebas. Deben coincidir con
// backend/scripts/seed-pruebas.js
export const LOCAL_PRUEBAS = 'TIENDA PRUEBAS CYPRESS';

export const PASSWORD = 'Pruebas123*';
export const ADMIN = 'admin.pruebas@benmoga.test';
export const EMPLEADO1 = 'operario1@benmoga.test';
export const EMPLEADO2 = 'operario2@benmoga.test';
export const EMPLEADO3 = 'operario3@benmoga.test';
export const INACTIVO = 'inactivo@benmoga.test';

export const ZONAS = {
  entrada: 901,
  pasillo: 902,
  estanteria: 903,
  probador: 904,
  mostrador: 905,
  bodega: 906,
};

export const CODIGOS = {
  camisaS: '7990000000011',
  camisaM: '7990000000012',
  jeanS: '7990000000013',
  jeanM: '7990000000014',
  chaquetaL: '7990000000015',
  chaquetaXL: '7990000000016',
  inexistente: '7999999999999',
  soloDigitoExtra: '79900000000110',
  digitoAlInicio: '97990000000011',
};

export const REFERENCIAS = {
  camisa: 'R-101',
  jean: 'R-102',
};

// Zonas que crea y borra la prueba de zonas (no deben existir en el seed).
export const ZONAS_TEMPORALES = [920, 921, 930, 931, 932];
