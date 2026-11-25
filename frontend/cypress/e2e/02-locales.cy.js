import { ADMIN, LOCAL_PRUEBAS } from '../support/datos';

describe('CP-08 a CP-10 · Selección de local', () => {
  beforeEach(() => {
    cy.login(ADMIN);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('levis_local');
      },
    });
  });

  it('CP-08 lista los locales registrados', () => {
    cy.contains('¿En qué local vas a trabajar?').should('be.visible');
    cy.get('[data-testid="local-card"]').should('have.length.at.least', 2);
    cy.get(`[data-testid="local-card"][data-local="${LOCAL_PRUEBAS}"]`).should('exist');
  });

  it('filtra los locales por nombre', () => {
    cy.get('[data-testid="buscar-local"]').type('PRUEBAS');
    cy.get('[data-testid="local-card"]').should('have.length', 1);
    cy.get('[data-testid="local-card"]').should('contain.text', LOCAL_PRUEBAS);
  });

  it('CP-10 al elegir un local cambia el contexto de trabajo', () => {
    cy.get(`[data-testid="local-card"][data-local="${LOCAL_PRUEBAS}"]`).click();

    cy.get('[data-testid="cambiar-local"]').should('contain.text', LOCAL_PRUEBAS);
    cy.get('[data-testid="titulo-pagina"]').should('contain.text', 'Resumen');
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('levis_local')).nombre).to.eq(LOCAL_PRUEBAS);
    });
  });

  it('CP-10b el botón cambiar local vuelve a la selección', () => {
    cy.get(`[data-testid="local-card"][data-local="${LOCAL_PRUEBAS}"]`).click();
    cy.get('[data-testid="cambiar-local"]').click();

    cy.contains('¿En qué local vas a trabajar?').should('be.visible');
    cy.get('[data-testid="local-card"]').should('have.length.at.least', 2);
  });
});
