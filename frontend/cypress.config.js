import { defineConfig } from 'cypress';

// Las pruebas corren contra el backend sirviendo la web compilada (frontend/dist)
// en el puerto 3100. Así se prueba el mismo paquete que se entrega, sin depender
// del servidor de desarrollo ni del certificado HTTPS.
const baseUrl = process.env.CYPRESS_BASE_URL || 'http://localhost:3100';

export default defineConfig({
  e2e: {
    baseUrl,
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    viewportWidth: 1440,
    viewportHeight: 900,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 12000,
    requestTimeout: 20000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    // Un reintento solo cuando se corre sin interfaz: absorbe fallos de red
    // puntuales sin ocultar errores reales.
    retries: { runMode: 1, openMode: 0 },
    reporter: 'junit',
    reporterOptions: {
      mochaFile: 'cypress/results/junit-[hash].xml',
      toConsole: false,
    },
    setupNodeEvents(on) {
      on('task', {
        // Lee un .xlsx recibido en base64 y devuelve los nombres de sus hojas.
        // Se usa para verificar el reporte Excel de 7 hojas.
        async hojasExcel(base64) {
          const ExcelJS = (await import('exceljs')).default;
          const libro = new ExcelJS.Workbook();
          await libro.xlsx.load(Buffer.from(base64, 'base64'));
          return libro.worksheets.map((h) => h.name);
        },
      });
    },
  },
});
