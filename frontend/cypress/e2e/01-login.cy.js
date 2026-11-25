import { ADMIN, EMPLEADO1, INACTIVO, PASSWORD, LOCAL_PRUEBAS } from '../support/datos';

describe('CP-01 a CP-06 · Inicio de sesión y permisos', () => {
  beforeEach(() => {
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.clear();
      },
    });
  });

  it('CP-01 inicia sesión con credenciales válidas', () => {
    cy.get('[data-testid="login-correo"]').type(ADMIN);
    cy.get('[data-testid="login-password"]').type(PASSWORD);
    cy.get('[data-testid="login-submit"]').click();

    cy.contains('¿En qué local vas a trabajar?').should('be.visible');
    cy.get('[data-testid="local-card"]').should('have.length.at.least', 2);
  });

  it('CP-02 rechaza la contraseña incorrecta sin revelar si el correo existe', () => {
    cy.get('[data-testid="login-correo"]').type(ADMIN);
    cy.get('[data-testid="login-password"]').type('clave-equivocada');
    cy.get('[data-testid="login-submit"]').click();

    cy.get('[data-testid="notice"]').should('contain.text', 'Correo o contraseña incorrectos');
    cy.location('pathname').should('eq', '/login');
  });

  it('CP-03 no permite el acceso de un usuario inactivo', () => {
    cy.get('[data-testid="login-correo"]').type(INACTIVO);
    cy.get('[data-testid="login-password"]').type(PASSWORD);
    cy.get('[data-testid="login-submit"]').click();

    cy.get('[data-testid="notice"]').should('contain.text', 'Correo o contraseña incorrectos');
    cy.location('pathname').should('eq', '/login');
  });

  it('CP-04 un empleado no puede entrar al monitoreo', () => {
    cy.login(EMPLEADO1);
    cy.entrarLocal();
    cy.visit('/monitoreo');

    cy.location('pathname').should('eq', '/conteo');
    cy.get('[data-testid="titulo-pagina"]').should('contain.text', 'Escanear productos');
  });

  it('CP-06 cierra la sesión y vuelve al inicio', () => {
    cy.get('[data-testid="login-correo"]').type(ADMIN);
    cy.get('[data-testid="login-password"]').type(PASSWORD);
    cy.get('[data-testid="login-submit"]').click();
    cy.get(`[data-testid="local-card"][data-local="${LOCAL_PRUEBAS}"]`).click();
    cy.get('[data-testid="usuario-nombre"]').should('be.visible');

    cy.get('[data-testid="cerrar-sesion"]').click();

    cy.location('pathname').should('eq', '/login');
    cy.get('[data-testid="login-form"]').should('be.visible');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('levis_token')).to.be.null;
    });
  });
});
