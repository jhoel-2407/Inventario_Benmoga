import { ADMIN } from '../support/datos';

const NOMBRE = 'Inventario Cypress';
const ARCHIVO = 'cypress/fixtures/maestro-pruebas.xlsx';

// Sube el Excel de prueba y espera el aviso de importación.
function importar() {
  cy.get('[data-testid="archivo-excel"]').selectFile(ARCHIVO, { force: true });
  cy.get('[data-testid="nombre-inventario"]').type(NOMBRE);
  cy.get('[data-testid="importar-excel"]').click();
  cy.get('[data-testid="notice"]', { timeout: 30000 }).should('contain.text', 'productos importados');
}

describe('CP-19 a CP-25 · Importación del Excel maestro', () => {
  beforeEach(() => {
    cy.login(ADMIN);
    cy.entrarLocal();
    cy.visit('/inventarios');
    cy.contains('h1', 'Inventarios').should('be.visible');
  });

  // Borra por API los borradores que deje cada prueba, para que el historial
  // quede limpio aunque una prueba falle a mitad de camino.
  afterEach(() => {
    cy.window().then((win) => {
      const headers = { Authorization: `Bearer ${win.localStorage.getItem('levis_token')}` };
      cy.request({ url: '/api/inventarios', headers }).then(({ body }) => {
        for (const inv of body.inventarios.filter((i) => i.nombre === NOMBRE)) {
          cy.request({ method: 'DELETE', url: `/api/inventarios/${inv.id}?confirmar=SI`, headers });
        }
      });
    });
  });

  it('CP-19 importa el Excel, agrupa códigos y reporta filas omitidas', () => {
    importar();

    cy.get('[data-testid="notice"]')
      .should('contain.text', '3 productos importados')
      .and('contain.text', '1 filas omitidas');

    cy.contains('h2', 'Filas omitidas').should('be.visible');
    cy.contains('td', 'ABC123').should('be.visible');
    cy.contains('td', 'Código no válido').should('be.visible');
  });

  it('CP-20 el inventario importado queda en BORRADOR con sus productos', () => {
    importar();

    cy.contains('[data-testid="inventario-fila"]', NOMBRE)
      .should('contain.text', 'BORRADOR')
      .and('contain.text', '3');
  });

  it('CP-22 el borrador se puede exportar antes de activarlo', () => {
    importar();

    cy.intercept('GET', '**/api/inventarios/*/reporte.xlsx').as('reporte');
    cy.contains('[data-testid="inventario-fila"]', NOMBRE)
      .find('[data-testid="reporte-inventario"]')
      .click();
    cy.wait('@reporte').its('response.statusCode').should('eq', 200);
  });

  it('CP-25 muestra el impacto y elimina un inventario sin lecturas', () => {
    importar();

    cy.contains('[data-testid="inventario-fila"]', NOMBRE)
      .find('[data-testid="eliminar-inventario"]')
      .click();

    cy.get('[role="dialog"]').should('contain.text', 'Eliminar inventario');
    cy.contains('tr', 'Lecturas registradas').should('contain.text', '0');
    cy.get('[data-testid="confirmar-eliminar-inventario"]').click();

    cy.get('[data-testid="notice"]').should('contain.text', 'eliminado');
    cy.contains('[data-testid="inventario-fila"]', NOMBRE).should('not.exist');
  });
});
