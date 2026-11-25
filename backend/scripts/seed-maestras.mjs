import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizarNombre(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

// Extrae el "nombre de tienda" del archivo de maestra: "MAESTRA LEVIS 13 DE..." -> "levis"
function nombreTiendaDesdeArchivo(nombreArchivo) {
  let n = nombreArchivo.replace(/^MAESTRA\s+/i, "");
  // quitar fecha al final: "LEVIS 13 DE OCTUBRE DEL 2026" -> "LEVIS"
  n = n.replace(/\s+\d{1,2}\s+DE\s+.*/i, "");
  // quitar "ACC", "CAMP", "CENTRO", "CAMPANARIO" se conservan como parte del nombre
  return normalizarNombre(n);
}

// Mapa manual de nombres de archivo -> nombre de local (cuando el automático falla)
const MAPEO_MANUAL = {
  "americanino campanario": "americanino campanario",
  "americanino centro": "americanino centro",
  "mic camp": "mic campanario",
  "mic centro": "mic centro",
  "tennis campanario": "tennis campanario",
  "tennis centro": "tennis centro",
  "pilatos acc": "pilatos accesorios",
  "pilatos camp": "pilatos",
};

async function main() {
  const dir = process.argv[2] || path.join(process.cwd(), "templates", "maestras");
  console.log("Leyendo plantillas desde:", dir);
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx")).sort();
  console.log("Archivos encontrados:", files.length);

  const locales = await prisma.local.findMany({ select: { id: true, nombre: true, perfilColumnas: true } });
  const porNombre = new Map();
  for (const l of locales) porNombre.set(normalizarNombre(l.nombre), l);

  // Mapa de plantilla por localId
  const plantillaPorLocal = new Map();

  for (const file of files) {
    const tiendaNorm = nombreTiendaDesdeArchivo(file);
    const tiendaKey = MAPEO_MANUAL[tiendaNorm] || tiendaNorm;
    let local = porNombre.get(tiendaKey);
    // fallback: buscar local cuyo nombre normalizado contenga o esté contenido
    if (!local) {
      for (const [k, v] of porNombre) {
        if (k.includes(tiendaKey) || tiendaKey.includes(k)) { local = v; break; }
      }
    }
    if (!local) {
      console.warn("  [WARN] No se encontró local para:", file, "->", tiendaKey);
      continue;
    }
    const contenido = fs.readFileSync(path.join(dir, file));
    await prisma.maestraPlantilla.upsert({
      where: { localId: local.id },
      create: { localId: local.id, nombreArchivo: file, contenido },
      update: { nombreArchivo: file, contenido },
    });
    plantillaPorLocal.set(local.id, file);
    console.log(`  [OK] ${file} -> local "${local.nombre}" (id ${local.id})`);
  }

  // Clonar plantilla para locales sin archivo pero con perfil idéntico a otro local que sí tiene
  const localesSinPlantilla = locales.filter((l) => !plantillaPorLocal.has(l.id));
  for (const l of localesSinPlantilla) {
    // buscar un local con perfilColumnas idéntico que sí tenga plantilla
    const perfilStr = JSON.stringify(l.perfilColumnas);
    const donante = locales.find((other) => {
      if (other.id === l.id) return false;
      if (!plantillaPorLocal.has(other.id)) return false;
      return JSON.stringify(other.perfilColumnas) === perfilStr;
    });
    if (donante) {
      const plantillaDonante = await prisma.maestraPlantilla.findUnique({ where: { localId: donante.id } });
      if (plantillaDonante) {
        await prisma.maestraPlantilla.upsert({
          where: { localId: l.id },
          create: {
            localId: l.id,
            nombreArchivo: `CLONADO de ${plantillaDonante.nombreArchivo}`,
            contenido: plantillaDonante.contenido,
          },
          update: {
            nombreArchivo: `CLONADO de ${plantillaDonante.nombreArchivo}`,
            contenido: plantillaDonante.contenido,
          },
        });
        console.log(`  [CLON] ${l.nombre} (id ${l.id}) <- plantilla de ${donante.nombre}`);
      }
    } else {
      console.warn(`  [WARN] Sin plantilla ni clon posible para: ${l.nombre} (id ${l.id})`);
    }
  }

  const total = await prisma.maestraPlantilla.count();
  console.log("\nTotal plantillas en BD:", total);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
