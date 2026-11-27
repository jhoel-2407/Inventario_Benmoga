import { CODIGOS, EMPLEADO1, ZONAS } from '../support/datos';

const avisoExito = () => cy.get('[data-testid="notice"][data-type="success"]');

describe('TMP cp52 replica 11', () => {
  beforeEach(() => {
    cy.login(EMPLEADO1);
    cy.entrarLocal();
    cy.visit('/conteo', { onBeforeLoad(win) { win.localStorage.removeItem('levis_zone'); } });
    cy.get('[data-testid="barcode-input"]').should('be.visible');
  });

  it('CP-52 replica', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.camisaS);
    avisoExito().should('contain.text', 'Unidad registrada correctamente');
    cy.wait(8000);
    cy.get('[data-testid="lista-lecturas"]').should(($el) => {
      expect($el).to.have.length(1);
    });
  });
});
