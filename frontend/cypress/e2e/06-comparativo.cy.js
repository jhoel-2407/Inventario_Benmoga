import { ADMIN, CODIGOS, REFERENCIAS } from '../support/datos';

const HOJAS = [
  'Resumen',
  'Resumen por zona',
  'Comparativo',
  'Comparativo por Referencia',
  'Detalle Ref + Código de Barras',
  'Referencias x Zona',
  'Referencias por Zona',
];

describe('CP-43 a CP-50 · Comparativo consolidado y reportes', () => {
  beforeEach(() => {
    cy.login(ADMIN);
    cy.entrarLocal();
    cy.visit('/comparativo');
    cy.contains('h1', 'Comparativo consolidado').should('be.visible');
    cy.get('[data-testid="fila-producto"]').should('have.length.at.least', 1);
  });

  it('CP-43 el comparativo resume maestro, conteo y diferencia', () => {
    cy.contains('.stat', 'Productos en maestro')
      .find('.stat-value')
      .invoke('text')
      .then((texto) => expect(Number(texto)).to.be.at.least(12));
    cy.contains('.stat', 'Unidades contadas').find('.stat-value').should('not.have.text', '0');
    cy.contains('.stat', 'Diferencia de unidades').should('be.visible');
  });

  it('CP-44 filtra solo los productos con faltante', () => {
    cy.get('[data-testid="filtro-faltante"]').click();

    cy.get('[data-testid="fila-producto"]').should('have.length.at.least', 1);
    cy.get('[data-testid="fila-producto"]').each(($fila) => {
      expect($fila.text()).to.contain('FALTANTE');
    });
  });

  it('CP-45 filtra solo los productos con sobrante', () => {
    cy.get('[data-testid="filtro-sobrante"]').click();

    cy.get('[data-testid="fila-producto"]').should('have.length.at.least', 1);
    cy.get('[data-testid="fila-producto"]').each(($fila) => {
      expect($fila.text()).to.contain('SOBRANTE');
    });
    cy.get('[data-testid="fila-producto"]').contains(CODIGOS.chaquetaXL).should('exist');
  });

  it('CP-46 busca un código puntual dentro del comparativo', () => {
    cy.get('[data-testid="buscar-producto"]').clear().type(CODIGOS.jeanS);

    cy.get('[data-testid="fila-producto"]').should('have.length', 1).and('contain.text', CODIGOS.jeanS);
  });

  it('CP-47 agrupa por referencia y despliega tallas y códigos', () => {
    cy.get('[data-testid="vista-referencia"]').click();
    cy.get('[data-testid="fila-referencia"]').should('have.length.at.least', 1);

    cy.contains('[data-testid="fila-referencia"]', REFERENCIAS.jean).click();
    cy.contains('tr', CODIGOS.jeanS).should('be.visible').and('contain.text', 'S · NEGRO');
    cy.contains('tr', CODIGOS.jeanM).should('be.visible').and('contain.text', 'M · NEGRO');
  });

  it('CP-48 el detalle por referencia muestra cuántos códigos la componen', () => {
    cy.get('[data-testid="vista-referencia"]').click();
    cy.contains('[data-testid="fila-referencia"]', REFERENCIAS.camisa)
      .find('.table-sub')
      .should('contain.text', '2 código(s)');
  });

  it('CP-49 descarga el Excel de 7 hojas con el comparativo', () => {
    cy.intercept('GET', '**/api/inventarios/*/reporte.xlsx').as('reporte');

    cy.get('[data-testid="descargar-excel"]').click();
    cy.wait('@reporte').its('response.statusCode').should('eq', 200);

    cy.contextoPruebas().then(({ inventarioActivo }) => {
      expect(inventarioActivo, 'inventario activo').to.exist;
      cy.window().then((win) => {
        const headers = { Authorization: `Bearer ${win.localStorage.getItem('levis_token')}` };
        cy.request({
          url: `/api/inventarios/${inventarioActivo.id}/reporte.xlsx`,
          headers,
          encoding: 'binary',
        }).then((respuesta) => {
          expect(respuesta.status).to.eq(200);
          expect(respuesta.headers['content-type']).to.contain('spreadsheetml');
          const base64 = Cypress.Buffer.from(respuesta.body, 'binary').toString('base64');
          cy.task('hojasExcel', base64).then((hojas) => {
            expect(hojas, 'hojas del reporte').to.have.length(7);
            expect(hojas).to.include.members(HOJAS);
          });
        });
      });
    });
  });

  it('CP-50 entrega también el comparativo en CSV', () => {
    cy.contextoPruebas().then(({ inventarioActivo }) => {
      cy.window().then((win) => {
        const headers = { Authorization: `Bearer ${win.localStorage.getItem('levis_token')}` };
        cy.request({
          url: `/api/inventarios/${inventarioActivo.id}/reporte.csv`,
          headers,
          encoding: 'binary',
        }).then((respuesta) => {
          expect(respuesta.status).to.eq(200);
          expect(respuesta.headers['content-type']).to.contain('text/csv');
          expect(respuesta.body).to.contain(CODIGOS.camisaS);
        });
      });
    });
  });
});
