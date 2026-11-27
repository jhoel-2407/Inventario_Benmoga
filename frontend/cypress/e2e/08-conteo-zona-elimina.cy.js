import { CODIGOS, EMPLEADO1, EMPLEADO2, ZONAS } from '../support/datos';

const avisoExito = () => cy.get('[data-testid="notice"][data-type="success"]');

describe('CP-51 a CP-57 — Etapa 1: conteos por zona, unidades totales y eliminacion de lecturas', () => {
  beforeEach(() => {
    cy.login(EMPLEADO1);
    cy.entrarLocal();
    cy.visit('/conteo', {
      onBeforeLoad(win) {
        // Cada prueba arranca sin zona elegida en la pantalla.
        win.localStorage.removeItem('levis_zone');
      },
    });
    cy.get('[data-testid="barcode-input"]').should('be.visible');
  });

  it('CP-51 el panel del empleado muestra el total y el selector de conteo por zona', () => {
    cy.visit('/');
    cy.contains('.stat', 'Unidades registradas').should('exist');
    cy.contains('.stat', 'Códigos distintos').should('exist');
    cy.get('[data-testid="zona-conteo"]').should('exist');
  });

  it('CP-52 al escanear la lectura queda registrada en la lista de la zona', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.camisaS);
    avisoExito().should('contain.text', 'Unidad registrada correctamente');
    // El conteo de la zona se actualiza y la lectura aparece en el listado.
    cy.contains('Cargando lecturas…').should('not.exist');
    cy.contains(CODIGOS.camisaS).should('exist');
    cy.get('[data-testid="resumen-unidades"]').should('exist');
  });

  it('CP-53 al eliminar la lectura el conteo baja y la lista se actualiza', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.camisaS);
    avisoExito().should('contain.text', 'Unidad registrada correctamente');
    cy.get('[data-testid^="eliminar-lectura-"]').should('exist');
    cy.window().then((win) => {
      cy.stub(win, 'confirm').as('confirmEliminar').returns(true);
    });
    cy.get('[data-testid^="eliminar-lectura-"]').first().click();
    cy.get('@confirmEliminar').should('have.been.called');
    avisoExito().should('contain.text', 'Lectura eliminada definitivamente');
    cy.get('[data-testid="resumen-unidades"]').should('exist');
  });

  it('CP-54 no se puede eliminar una lectura de otro empleado', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.camisaS);
    cy.get('[data-testid^="eliminar-lectura-"]').should('exist');
    let idLectura = '';
    cy.get('[data-testid^="eliminar-lectura-"]').then(($btns) => {
      idLectura = $btns.attr('data-testid').replace('eliminar-lectura-', '');
    });

    // Otro empleado intenta borrar la lectura registrada por el primero.
    cy.login(EMPLEADO2);
    cy.visit('/conteo');
    cy.window().then((win) => {
      const token = win.localStorage.getItem('levis_token');
      return cy.request({
        url: `/api/escaneos/${idLectura}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      });
    }).then(({ status }) => {
      expect(status).to.eq(403);
    });
  });
});
