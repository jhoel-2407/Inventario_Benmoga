import './commands';

// La app usa WebSocket para el monitoreo. Cuando el servidor de pruebas se
// reinicia, el navegador puede reportar un error de conexión que no tiene que
// ver con la prueba que se está ejecutando.
Cypress.on('uncaught:exception', (error) => {
  if (/WebSocket|ResizeObserver|Network Error/i.test(error.message)) return false;
  return true;
});
