import { CODIGOS, EMPLEADO1, ZONAS } from '../support/datos';

const avisoExito = () => cy.get('[data-testid="notice"][data-type="success"]');
const avisoError = () => cy.get('[data-testid="notice"][data-type="error"]');

describe('CP-26 a CP-35 · Conteo con lector de código de barras', () => {
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

  it('CP-26 pide seleccionar la zona antes de escanear', () => {
    cy.escanear(CODIGOS.camisaS);

    avisoError().should('contain.text', 'Selecciona una zona antes de escanear');
  });

  it('CP-27 registra una unidad en la zona seleccionada', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    avisoExito().should('contain.text', 'Zona seleccionada');

    cy.escanear(CODIGOS.camisaS);
    avisoExito().should('contain.text', 'Unidad registrada correctamente').and('contain.text', 'Camisa manga larga');

    cy.get('[data-testid="zona-seleccionada"]').should('contain.text', 'Estantería A');
  });

  it('CP-28 cada lectura válida suma una unidad al resumen', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.get('[data-testid="resumen-unidades"]')
      .invoke('text')
      .then((texto) => {
        const antes = Number(texto.replace(/[^\d]/g, ''));
        cy.escanear(CODIGOS.camisaS);
        avisoExito().should('contain.text', 'Unidad registrada');
        cy.get('[data-testid="resumen-unidades"]').should('have.text', String(antes + 1));

        cy.escanear(CODIGOS.camisaS);
        cy.get('[data-testid="resumen-unidades"]').should('have.text', String(antes + 2));
      });
  });

  it('CP-30 ignora un QR o código no numérico', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear('https://ejemplo.com/producto/123');

    avisoError().should('contain.text', 'Solo se aceptan códigos de barras numéricos');
  });

  it('CP-31 ignora un código demasiado corto', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear('12345');

    avisoError().should('contain.text', 'Solo se aceptan códigos de barras numéricos');
  });

  it('CP-32 corrige el dígito extra del final del código', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.soloDigitoExtra);

    avisoExito().should('contain.text', 'Unidad registrada correctamente');
    avisoExito().should('contain.text', 'corrección automática');
  });

  it('CP-29 informa cuando el código no está en el maestro', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.inexistente);

    avisoExito().should('contain.text', 'N/A');
  });

  it('CP-33 no recorta el primer dígito para adivinar el producto', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.escanear(CODIGOS.digitoAlInicio);

    avisoExito().should('contain.text', 'N/A');
  });

  it('CP-35 finalizar la zona deja el conteo listo para otra zona', () => {
    cy.seleccionarZona(ZONAS.estanteria);
    cy.get('[data-testid="finalizar-zona"]').click();

    avisoExito().should('contain.text', 'Turno de zona finalizado');
    cy.get('[data-testid="zona-seleccionada"]').should('not.exist');
    cy.get('[data-testid="zona-select"]').should('have.value', '');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('levis_zone')).to.be.null;
    });
  });
});
