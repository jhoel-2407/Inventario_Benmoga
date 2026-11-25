// Rellenos de compatibilidad para WebView antiguos (por ejemplo los lectores
// Zebra TC21 sin actualizar). Vite transpila la SINTAXIS moderna, pero no los
// MÉTODOS nuevos; estos se agregan aquí solo si faltan.

/* global globalThis */
if (typeof globalThis === 'undefined') {
  // eslint-disable-next-line no-global-assign
  window.globalThis = window;
}

if (typeof Promise !== 'undefined' && !Promise.allSettled) {
  Promise.allSettled = function allSettled(iterable) {
    return Promise.all(
      Array.from(iterable, function (element) {
        return Promise.resolve(element).then(
          function (value) {
            return { status: 'fulfilled', value: value };
          },
          function (reason) {
            return { status: 'rejected', reason: reason };
          }
        );
      })
    );
  };
}

if (typeof Promise !== 'undefined' && !Promise.any) {
  Promise.any = function any(iterable) {
    return new Promise(function (resolve, reject) {
      let pendientes = 0;
      let ultimoError = new Error('Todas las promesas fueron rechazadas');
      Array.from(iterable).forEach(function (element) {
        pendientes += 1;
        Promise.resolve(element).then(resolve, function (error) {
          ultimoError = error;
          pendientes -= 1;
          if (pendientes === 0) reject(ultimoError);
        });
      });
      if (pendientes === 0) reject(ultimoError);
    });
  };
}

if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', {
    value: function flat(profundidad) {
      const nivel = profundidad === undefined ? 1 : Number(profundidad);
      if (!(nivel > 0)) return this.slice();
      return this.reduce(function (acumulado, valor) {
        return acumulado.concat(Array.isArray(valor) ? valor.flat(nivel - 1) : valor);
      }, []);
    },
    configurable: true,
    writable: true,
  });
}

if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', {
    value: function flatMap(callback) {
      return this.map(callback).flat();
    },
    configurable: true,
    writable: true,
  });
}

if (!Object.fromEntries) {
  Object.fromEntries = function fromEntries(entradas) {
    const resultado = {};
    for (const par of entradas) {
      resultado[par[0]] = par[1];
    }
    return resultado;
  };
}

if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function replaceAll(buscar, reemplazo) {
      if (buscar instanceof RegExp) return this.replace(buscar, reemplazo);
      return this.split(buscar).join(reemplazo);
    },
    configurable: true,
    writable: true,
  });
}

if (typeof queueMicrotask === 'undefined') {
  window.queueMicrotask = function queueMicrotask(callback) {
    Promise.resolve().then(callback);
  };
}
