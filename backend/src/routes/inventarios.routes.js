import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import {
  activar,
  actualizarMaestro,
  comparativo,
  convertirStock,
  eliminar,
  impacto,
  importar,
  listar,
  reiniciarEscaneos,
  reporteCsv,
  reporteExcel,
} from "../controllers/inventarios.controller.js";

const router = Router();
router.use(autenticar);

router.get("/", listar);
router.get("/comparativo", soloAdministradora, comparativo);
router.post("/importar", soloAdministradora, importar);
router.post("/:id/actualizar-maestro", soloAdministradora, actualizarMaestro);

router.post("/convertir-stock", soloAdministradora, convertirStock);
router.patch("/:id/activar", soloAdministradora, activar);
router.post("/:id/reiniciar-escaneos", soloAdministradora, reiniciarEscaneos);
router.get("/:id/impacto", soloAdministradora, impacto);
router.delete("/:id", soloAdministradora, eliminar);
router.get("/:id/reporte.csv", soloAdministradora, reporteCsv);
router.get("/:id/reporte.xlsx", soloAdministradora, reporteExcel);

export default router;
