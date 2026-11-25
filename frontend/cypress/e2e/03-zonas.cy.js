import { ADMIN } from '../support/datos';

// Crea una zona desde el formulario de la izquierda y comprueba el aviso.
function crear(numero, nombre, tipo = 'PDV') {
  cy.get('[data-testid="zona-numero"]').clear().type(String(numero));
  cy.get('[data-testid="zona-nombre"]').clear().type(nombre);
  cy.get('[data-testid="zona-tipo"]').select(tipo);
  cy.get('[data-testid="crear-zona"]').click();
  cy.get('[data-testid="notice"]').should('contain.text', `Zona ${numero} creada`);
}

function eliminar(numero) {
  cy.get(`[data-testid="zona-card"][data-numero="${numero}"]`)
    .find('[data-testid="eliminar-zona"]')
    .click();
  cy.get('[data-testid="notice"]').should('contain.text', `Zona ${numero} eliminada`);
}

describe('CP-11 a CP-18 · Zonas del local', () => {
  beforeEach(() => {
    cy.login(ADMIN);
    cy.entrarLocal();
    // Las pruebas confirman los diálogos del navegador automáticamente.
    cy.on('window:confirm', () => true);
    cy.visit('/zonas');
    cy.contains('h1', 'Zonas').should('be.visible');
  });

  it('CP-11 crea una zona de punto de venta (PDV)', () => {
    crear(920, 'Zona Cypress PDV', 'PDV');

    cy.get('[data-testid="zona-card"][data-numero="920"]')
      .should('be.visible')
      .and('have.attr', 'data-tipo', 'PDV')
      .and('contain.text', 'Zona Cypress PDV')
      .and('contain.text', 'PDV');

    eliminar(920);
    cy.get('[data-testid="zona-card"][data-numero="920"]').should('not.exist');
  });

  it('CP-12 crea una zona de bodega y se distingue de las PDV', () => {
    crear(921, 'Bodega Cypress', 'BODEGA');

    cy.get('[data-testid="zona-card"][data-numero="921"]')
      .should('be.visible')
      .and('have.attr', 'data-tipo', 'BODEGA')
      .and('contain.text', 'BODEGA');

    eliminar(921);
    cy.get('[data-testid="zona-card"][data-numero="921"]').should('not.exist');
  });

  it('CP-13 no permite repetir el número de zona', () => {
    cy.get('[data-testid="zona-numero"]').clear().type('901');
    cy.get('[data-testid="zona-nombre"]').clear().type('Duplicada');
    cy.get('[data-testid="crear-zona"]').click();

    cy.get('[data-testid="notice"]')
      .should('have.attr', 'data-type', 'error')
      .and('contain.text', 'Ya existe un registro con esos datos');
  });

  it('CP-14 crea varias zonas por rango y las elimina', () => {
    cy.get('[data-testid="rango-desde"]').clear().type('930');
    cy.get('[data-testid="rango-hasta"]').clear().type('932');
    cy.get('[data-testid="rango-tipo"]').select('PDV');
    cy.get('[data-testid="crear-rango"]').click();

    cy.get('[data-testid="notice"]').should('contain.text', '3 zonas creadas');
    for (const numero of [930, 931, 932]) {
      cy.get(`[data-testid="zona-card"][data-numero="${numero}"]`).should('be.visible');
    }
    for (const numero of [930, 931, 932]) eliminar(numero);
  });

  it('CP-15 rechaza un rango inválido (hasta menor que desde)', () => {
    cy.get('[data-testid="rango-desde"]').clear().type('10');
    cy.get('[data-testid="rango-hasta"]').clear().type('5');
    cy.get('[data-testid="crear-rango"]').click();

    cy.get('[data-testid="notice"]')
      .should('have.attr', 'data-type', 'error')
      .and('contain.text', 'Rango inválido');
  });

  it('CP-17 no deja eliminar una zona que ya tiene lecturas', () => {
    cy.get('[data-testid="zona-card"][data-numero="902"]')
      .find('[data-testid="eliminar-zona"]')
      .click();

    cy.get('[data-testid="notice"]')
      .should('have.attr', 'data-type', 'error')
      .and('contain.text', 'No se puede eliminar la zona');
    cy.get('[data-testid="zona-card"][data-numero="902"]').should('exist');
  });

  it('CP-18 el selector de conteo separa PDV de BODEGA', () => {
    cy.visit('/conteo');
    cy.get('[data-testid="zona-select"] optgroup').should('have.length', 2);
    cy.get('optgroup[label="PUNTO DE VENTA (PDV)"]').should('exist');
    cy.get('optgroup[label="BODEGA / ALMACÉN"]').should('exist');
  });
});
