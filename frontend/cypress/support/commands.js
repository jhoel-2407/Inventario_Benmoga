import { LOCAL_PRUEBAS, PASSWORD, ADMIN } from './datos';

// Autenticación sin pasar por el formulario: se pide el token al API y se
// guarda la sesión en localStorage, igual que hace la aplicación. cy.session
// reutiliza la sesión entre pruebas del mismo archivo.
Cypress.Commands.add('login', (correo = ADMIN, password = PASSWORD) => {
  cy.session(
    ['login', correo],
    () => {
      cy.visit('/login');
      cy.request({
        method: 'POST',
        url: '/api/auth/login',
        body: { correo, password },
      }).then(({ body }) => {
        cy.window().then((win) => {
          win.localStorage.setItem('levis_token', body.token);
          win.localStorage.setItem('levis_user', JSON.stringify(body.usuario));
          win.localStorage.removeItem('levis_local');
          win.localStorage.removeItem('levis_zone');
        });
      });
    },
  );
});

// Entra a la tienda de pruebas. Siempre pasa por el selector de local para que
// cada prueba arranque en el mismo estado (sin depender de lo que dejó la anterior).
Cypress.Commands.add('entrarLocal', (nombre = LOCAL_PRUEBAS) => {
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.removeItem('levis_local');
      win.localStorage.removeItem('levis_zone');
    },
  });
  cy.get(`[data-testid="local-card"][data-local="${nombre}"]`, { timeout: 20000 }).click();
  cy.get('[data-testid="usuario-nombre"]').should('be.visible');
  cy.get('[data-testid="cambiar-local"]').should('contain.text', nombre);
});

// Contexto del local de pruebas leído del API con el token de la sesión.
// Sirve para no escribir ids a mano en las pruebas.
Cypress.Commands.add('contextoPruebas', () => {
  cy.window().then((win) => {
    const token = win.localStorage.getItem('levis_token');
    const headers = { Authorization: `Bearer ${token}` };
    return cy.request({ url: '/api/locales', headers }).then(({ body }) => {
      const local = body.locales.find((l) => l.nombre === LOCAL_PRUEBAS);
      expect(local, `local ${LOCAL_PRUEBAS}`).to.exist;
      return cy
        .request({ url: `/api/zonas?localId=${local.id}`, headers })
        .then(({ body: z }) =>
          cy
            .request({ url: `/api/inventarios?localId=${local.id}`, headers })
            .then(({ body: i }) => ({
              local,
              zonas: z.zonas || [],
              inventarios: i.inventarios || [],
              inventarioActivo: (i.inventarios || []).find((x) => x.estado === 'ACTIVO'),
            })),
        );
    });
  });
});

// Elige una zona por su número (901, 902…). Espera a que el selector tenga las
// zonas cargadas desde el API antes de buscar la opción.
Cypress.Commands.add('seleccionarZona', (numero, selector = '[data-testid="zona-select"]', confirmar = true) => {
  cy.get(`${selector} option`)
    .should(($opciones) => {
      const existe = [...$opciones].some((o) => o.textContent.trim().startsWith(String(numero)));
      expect(existe, `opción de la zona ${numero}`).to.be.true;
    })
    .then(($opciones) => {
      const opcion = [...$opciones].find((o) => o.textContent.trim().startsWith(String(numero)));
      cy.get(selector).select(opcion.value);
    });
  if (confirmar) cy.get('[data-testid="zona-seleccionada"]').should('be.visible');
});

// Escanea un código desde la caja de texto (equivale al lector físico).
Cypress.Commands.add('escanear', (codigo) => {
  cy.get('[data-testid="barcode-input"]').clear().type(`${codigo}{enter}`);
});
