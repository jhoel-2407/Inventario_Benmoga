import { ADMIN } from '../support/datos';

describe('CP-38 a CP-42 · Monitoreo de zonas', () => {
  beforeEach(() => {
    cy.login(ADMIN);
    cy.entrarLocal();
    cy.visit('/monitoreo');
    cy.get('[data-testid="tab-avance"]').should('have.class', 'active');
  });

  it('CP-38 muestra el avance: terminadas, faltantes y en conteo', () => {
    cy.contains('.stat', 'Zonas del local').find('.stat-value').should('have.text', '6');

    // La zona 901 quedó terminada en los datos de prueba: muestra ambos códigos.
    cy.get('[data-testid="zona-terminada"][data-numero="901"]')
      .should('be.visible')
      .and('contain.text', 'PDV')
      .and('contain.text', '7990000000011')
      .and('contain.text', '7990000000012');

    // La bodega 906 todavía no tiene lecturas y se identifica como BODEGA.
    cy.get('[data-testid="zona-faltante"][data-numero="906"]')
      .should('be.visible')
      .and('contain.text', 'BODEGA');
  });

  it('CP-39 indica qué empleado está escaneando ahora', () => {
    cy.get('[data-testid="sesion-fila"]')
      .should('have.length', 1)
      .and('contain.text', '902')
      .and('contain.text', 'Operario Pruebas 3');
    cy.get('[data-testid="sesion-fila"] .nombre-color').should('be.visible');
  });

  it('CP-40 el vivo de una zona muestra usuario, unidades y primer código', () => {
    cy.get('[data-testid="tab-vivo"]').click();
    cy.seleccionarZona(902, '[data-testid="zona-vivo-select"]', false);

    cy.contains('.stat', 'Usuario escaneando').find('.nombre-color').should('contain.text', 'Operario Pruebas 3');
    cy.contains('.stat', 'Escaneados en zona').find('.stat-value').should('have.text', '5');
    cy.contains('.stat', 'Primer código').find('.stat-value').should('contain.text', '7990000000013');
  });

  it('CP-41 busca una referencia y ve en qué zonas se escaneó', () => {
    cy.get('[data-testid="tab-buscar"]').click();
    cy.get('[data-testid="buscar-referencia"]').clear().type('R-101');

    cy.get('[data-testid="ref-zona-fila"]')
      .should('have.length', 1)
      .and('contain.text', 'R-101')
      .and('contain.text', 'Z901')
      .and('contain.text', 'Z902');
  });

  it('CP-42 el buscador de referencias filtra por descripción', () => {
    cy.get('[data-testid="tab-buscar"]').click();
    cy.get('[data-testid="buscar-referencia"]').clear().type('jean');

    cy.get('[data-testid="ref-zona-fila"]').should('have.length', 1).and('contain.text', 'R-102');
  });
});
